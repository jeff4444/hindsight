import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionClock } from '@/core/trading/clock';
import type { OrderEvent } from '@/core/trading/types';
import type { FinalizePayload } from '@/lib/trading/finalize';
import type { EventDraft, SessionRecord } from '@/lib/trading/session-core';

/**
 * A session as the database holds it, and the four writes a request can make: move the clock,
 * append an event, close the session, or open one. Each write is a single RPC (0031) that takes
 * the session's row lock, so the database — not the request — decides who won a race.
 */

export interface StoredSession {
  record: SessionRecord;
  chartId: string;
  accountId: string;
  owner: string;
  dailyDay: number | null;
  closeReason: string | null;
}

interface SessionRow {
  id: string;
  account_id: string;
  chart_id: string;
  source: string;
  scenario: string | null;
  daily_day: number | null;
  ranked: boolean;
  dates_visible: boolean;
  total_minutes: number;
  starting_micros: number;
  anchor_revealed: number;
  anchor_at: string;
  speed: number;
  paused: boolean;
  lease_until: string;
  clock_version: number;
  high_water: number;
  status: 'open' | 'closed';
  close_reason: string | null;
  trade_accounts: { owner: string; purpose: 'main' | 'practice' } | null;
}

const SESSION_COLUMNS =
  'id, account_id, chart_id, source, scenario, daily_day, ranked, dates_visible, total_minutes, starting_micros, ' +
  'anchor_revealed, anchor_at, speed, paused, lease_until, clock_version, high_water, status, close_reason, ' +
  'trade_accounts!inner(owner, purpose)';

export async function loadSession(supabase: SupabaseClient, sessionId: string): Promise<StoredSession | null> {
  const { data, error } = await supabase.from('trade_sessions').select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle();
  if (error) throw new Error(`session lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as SessionRow;
  if (!row.trade_accounts) return null;

  const { data: events, error: eventsError } = await supabase
    .from('trade_order_events')
    .select('seq, at_index, event')
    .eq('session_id', sessionId)
    .order('seq');
  if (eventsError) throw new Error(`events lookup failed: ${eventsError.message}`);

  const clock: SessionClock = {
    total: row.total_minutes,
    anchorRevealed: row.anchor_revealed,
    anchorAt: Date.parse(row.anchor_at),
    speed: row.speed,
    paused: row.paused,
    leaseUntil: Date.parse(row.lease_until),
    version: row.clock_version,
  };

  return {
    record: {
      id: row.id,
      purpose: row.trade_accounts.purpose,
      ranked: row.ranked,
      datesVisible: row.dates_visible,
      source: row.source,
      scenario: row.scenario ? { slug: row.scenario, name: row.scenario } : null,
      starting: Number(row.starting_micros),
      status: row.status,
      clock,
      highWater: row.high_water,
      events: (events ?? []).map(
        (e: { seq: number; at_index: number; event: Record<string, unknown> }) => ({ ...e.event, seq: e.seq, at: e.at_index }) as OrderEvent,
      ),
    },
    chartId: row.chart_id,
    accountId: row.account_id,
    owner: row.trade_accounts.owner,
    dailyDay: row.daily_day,
    closeReason: row.close_reason,
  };
}

/** Compare-and-swap the clock. False means someone else moved it first. */
export async function saveClock(supabase: SupabaseClient, sessionId: string, expected: number, clock: SessionClock): Promise<boolean> {
  const { data, error } = await supabase.rpc('trade_set_clock', {
    p_session: sessionId,
    p_expected_version: expected,
    p_anchor_revealed: clock.anchorRevealed,
    p_anchor_at: new Date(clock.anchorAt).toISOString(),
    p_speed: clock.speed,
    p_paused: clock.paused,
    p_lease_until: new Date(clock.leaseUntil).toISOString(),
    p_version: clock.version,
  });
  if (error) throw new Error(`clock update failed: ${error.message}`);
  return data === true;
}

/** Append an event; returns the sequence and minute the database gave it. */
export async function appendEvent(
  supabase: SupabaseClient,
  sessionId: string,
  owner: string,
  draft: EventDraft,
  clientKey: string | null,
): Promise<{ seq: number; at: number; duplicate: boolean }> {
  const { at, ...payload } = draft as EventDraft & { at: number };
  const { data, error } = await supabase.rpc('trade_append_event', {
    p_session: sessionId,
    p_owner: owner,
    p_at: at,
    p_client_key: clientKey,
    p_event: payload,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { seq: number; at_index: number; duplicate: boolean };
  return { seq: row.seq, at: row.at_index, duplicate: row.duplicate };
}

export async function finalizeSession(supabase: SupabaseClient, sessionId: string, payload: FinalizePayload): Promise<boolean> {
  const { data, error } = await supabase.rpc('trade_finalize_session', {
    p_session: sessionId,
    p_summary: payload.summary,
    p_fills: payload.fills,
    p_trips: payload.trips,
    p_curve: payload.curve,
  });
  if (error) throw new Error(`finalize failed: ${error.message}`);
  return data === true;
}
