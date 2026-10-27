import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { STARTING_BALANCE_USDT } from '@/core/trading/costs';
import { DEFAULT_SPEED } from '@/core/trading/clock';
import { MICROS } from '@/core/trading/instrument';
import { dailyNumber, nextResetAt } from '@/lib/daily';
import { finalizePayload } from '@/lib/trading/finalize';
import type { OpenRequest, SessionRequest } from '@/lib/trading/schemas';
import {
  advanceClock,
  buildReview,
  eventFor,
  project,
  rejectionOf,
  stampAt,
  toDelta,
  toOpen,
  type SessionRecord,
} from '@/lib/trading/session-core';
import type { SessionDelta, SessionOpen, SessionReview } from '@/lib/trading/types';
import { FEE_VERSION, INSTRUMENT_VERSION, MARGIN_VERSION, SIM_VERSION } from '@/core/versions';
import { loadMarket } from './charts';
import { appendEvent, finalizeSession, loadSession, saveClock, type StoredSession } from './store';

/**
 * A trading request, end to end: load the session and its market, run the session core, write
 * what changed, answer with a delta. The rules are all in `session-core.ts`; this file is only the
 * storage around them, which is why the in-browser demo can run the same rules without it.
 */

export class TradeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const VERSIONS = {
  sim: SIM_VERSION,
  fee: FEE_VERSION,
  margin: MARGIN_VERSION,
  instrument: INSTRUMENT_VERSION,
};

/** What a database error from the open function means, for the person who caused it. */
function openError(message: string): TradeError {
  if (/already played/.test(message)) return new TradeError('You have already traded today’s market.', 409);
  if (/bankrupt/.test(message)) return new TradeError('This account was liquidated. Reset it from your portfolio to trade again.', 409);
  if (/no such scenario|private/.test(message)) return new TradeError('There is no such scenario.', 404);
  if (/no market matches/.test(message)) return new TradeError('No market matches that.', 404);
  return new TradeError('The market could not be opened.', 500);
}

async function requireSession(supabase: SupabaseClient, sessionId: string, owner: string): Promise<StoredSession> {
  const stored = await loadSession(supabase, sessionId);
  // A stranger's session is "no such session": its existence is not theirs to learn.
  if (!stored || stored.owner !== owner) throw new TradeError('No such session.', 404);
  return stored;
}

export async function openSession(
  supabase: SupabaseClient,
  identity: { sessionCookie: string; userId: string | null },
  request: OpenRequest,
  nonce: string,
  now: number = Date.now(),
): Promise<SessionOpen> {
  const market = request.market;
  const { data, error } = await supabase.rpc('trade_open_session', {
    p_session: identity.sessionCookie,
    p_user: identity.userId,
    p_purpose: request.account,
    p_source: market.kind,
    p_symbol: market.kind === 'pair' ? market.symbol : null,
    p_scenario: market.kind === 'scenario' ? market.slug : null,
    p_day: market.kind === 'daily' ? dailyNumber(now) : null,
    p_show_dates: request.showDates ?? false,
    p_starting_micros: STARTING_BALANCE_USDT * MICROS,
    p_speed: DEFAULT_SPEED,
    p_nonce: nonce,
    p_versions: VERSIONS,
  });
  if (error) throw openError(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { session_id: string; existing: boolean } | null;
  if (!row) throw new TradeError('The market could not be opened.', 500);
  if (row.existing) {
    throw new TradeError('You already have a session open.', 409, { openSessionId: row.session_id });
  }
  return resumeSession(supabase, row.session_id, identity.userId ?? identity.sessionCookie, now);
}

/** The whole session as it stands: what a reloaded terminal needs. */
export async function resumeSession(supabase: SupabaseClient, sessionId: string, owner: string, now: number = Date.now()): Promise<SessionOpen> {
  const stored = await requireSession(supabase, sessionId, owner);
  const { market } = await loadMarket(supabase, stored.chartId);
  const { record, revealed } = await settleClock(supabase, stored, { op: 'tick' }, now);
  const sim = project(record, market, revealed);
  await closeIfDone(supabase, record, market, sim);
  return toOpen(record, market, sim, revealed);
}

/** Touch the lease and apply a clock control, writing it back if it moved. */
async function settleClock(
  supabase: SupabaseClient,
  stored: StoredSession,
  op: SessionRequest['op'],
  now: number,
): Promise<{ record: SessionRecord; revealed: number; away: boolean }> {
  let record = stored.record;
  let step = advanceClock(record, op, now);
  if (step.changed && record.status === 'open') {
    const saved = await saveClock(supabase, record.id, record.clock.version, step.clock);
    if (!saved) {
      // Somebody moved the clock first (another tab). Read theirs and apply ours on top, once.
      const fresh = await loadSession(supabase, record.id);
      if (!fresh) throw new TradeError('No such session.', 404);
      record = fresh.record;
      step = advanceClock(record, op, now);
      if (step.changed && record.status === 'open') await saveClock(supabase, record.id, record.clock.version, step.clock);
    }
  }
  return { record: { ...record, clock: step.clock }, revealed: step.revealed, away: step.away };
}

async function closeIfDone(
  supabase: SupabaseClient,
  record: SessionRecord,
  market: Parameters<typeof finalizePayload>[0],
  sim: ReturnType<typeof project>,
): Promise<SessionRecord> {
  if (!sim.state.closed || record.status !== 'open') return record;
  await finalizeSession(supabase, record.id, finalizePayload(market, sim.state, record.starting));
  return { ...record, status: 'closed', clock: { ...record.clock, paused: true } };
}

export async function actOnSession(
  supabase: SupabaseClient,
  sessionId: string,
  owner: string,
  request: SessionRequest,
  now: number = Date.now(),
): Promise<SessionDelta> {
  const stored = await requireSession(supabase, sessionId, owner);
  const { market } = await loadMarket(supabase, stored.chartId);
  const op = request.op;

  const settled = await settleClock(supabase, stored, op, now);
  let record = settled.record;
  let revealed = settled.revealed;

  let rejected: { orderId: string | null; reason: string; text: string } | null = null;
  let appendedSeq: number | null = null;
  if (record.status === 'open') {
    const at = stampAt(record, revealed);
    const { event, error } = eventFor(op, market, at);
    if (error) rejected = { orderId: null, reason: 'invalid', text: error };
    if (event) {
      const clientKey = op.op === 'place' ? op.clientOrderId : null;
      const stamped = await appendEvent(supabase, record.id, owner, event, clientKey);
      appendedSeq = stamped.seq;
      if (!stamped.duplicate) {
        record = {
          ...record,
          events: [...record.events, { ...event, seq: stamped.seq, at: stamped.at } as SessionRecord['events'][number]],
          highWater: stamped.at,
        };
      }
    }
  } else if (op.op !== 'tick') {
    rejected = { orderId: null, reason: 'session-closed', text: 'This session has ended.' };
  }

  const sim = project(record, market, revealed);
  if (appendedSeq !== null) rejected = rejectionOf(sim, appendedSeq) ?? rejected;
  const wasOpen = record.status === 'open';
  record = await closeIfDone(supabase, record, market, sim);
  if (wasOpen && record.status === 'closed' && sim.state.closeReason === 'end') revealed = record.clock.total;

  return toDelta(record, market, sim, revealed, { since: request.since, away: settled.away, rejected });
}

/**
 * The review: only once the session is closed, and with the real dates — except for the daily,
 * whose dates are held until the day rolls over so a finished player cannot hand them to one who
 * has not started (§22.9).
 */
export async function reviewSession(supabase: SupabaseClient, sessionId: string, owner: string, now: number = Date.now()): Promise<SessionReview> {
  const stored = await requireSession(supabase, sessionId, owner);
  if (stored.record.status !== 'closed') throw new TradeError('The session is still open.', 409);
  const { market, meta } = await loadMarket(supabase, stored.chartId);
  const state = project(stored.record, market, market.tape.length).state;
  const embargoed = stored.dailyDay !== null && dailyNumber(now) <= stored.dailyDay;
  return buildReview(stored.record, market, state, {
    showDates: !embargoed,
    embargoedUntil: embargoed ? new Date(nextResetAt(now)).toISOString() : null,
    synthetic: meta.synthetic,
  });
}

export async function resetAccount(
  supabase: SupabaseClient,
  identity: { sessionCookie: string; userId: string | null },
  purpose: 'main' | 'practice',
): Promise<string> {
  const { data, error } = await supabase.rpc('trade_reset_account', {
    p_session: identity.sessionCookie,
    p_user: identity.userId,
    p_purpose: purpose,
    p_starting_micros: STARTING_BALANCE_USDT * MICROS,
    p_versions: VERSIONS,
  });
  if (error) {
    if (/close the open session/.test(error.message)) throw new TradeError('End your open session before resetting.', 409);
    throw new TradeError('The account could not be reset.', 500);
  }
  return data as string;
}
