/**
 * Where a session lives.
 *
 * The terminal talks to a `TradeDriver` and does not know which one. `RemoteDriver` is the real
 * thing: every request goes to `/api/trade`, and the server holds the clock and the log.
 * `LocalDriver` keeps one session in memory in the browser, on a synthetic market, running the very
 * same session core — it is what the landing page's demo and `/lab/terminal` use, and it is the
 * only way to see the terminal without a database.
 */

import { openClock } from '@/core/trading/clock';
import { demoMarket } from '@/core/trading/demo';
import { STARTING_BALANCE_USDT } from '@/core/trading/costs';
import { MICROS } from '@/core/trading/instrument';
import type { Market } from '@/core/trading/market';
import type { OpenRequest, SessionOp } from './schemas';
import type { SessionDelta, SessionOpen, SessionReview } from './types';
import { applyOp, buildReview, project, toOpen, type SessionRecord } from './session-core';

export interface TradeDriver {
  open(request: OpenRequest): Promise<SessionOpen>;
  resume(sessionId: string): Promise<SessionOpen>;
  act(sessionId: string, since: number, op: SessionOp): Promise<SessionDelta>;
  review(sessionId: string): Promise<SessionReview>;
}

export class DriverError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ remote */

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || body === null) {
    throw new DriverError(body?.error ?? `The request failed (${response.status}).`, response.status, body ?? undefined);
  }
  return body;
}

export const RemoteDriver: TradeDriver = {
  async open(request) {
    return json<SessionOpen>(
      await fetch('/api/trade/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      }),
    );
  },
  async resume(sessionId) {
    return json<SessionOpen>(await fetch(`/api/trade/session/${sessionId}`, { cache: 'no-store' }));
  },
  async act(sessionId, since, op) {
    return json<SessionDelta>(
      await fetch(`/api/trade/session/${sessionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ since, op }),
      }),
    );
  },
  async review(sessionId) {
    return json<SessionReview>(await fetch(`/api/trade/session/${sessionId}/review`, { cache: 'no-store' }));
  },
};

/* ------------------------------------------------------------------ local */

/**
 * A session in memory, on a synthetic market. The equity carries from one session to the next,
 * as an account's would, until the page is reloaded.
 */
export class LocalDriver implements TradeDriver {
  private records = new Map<string, SessionRecord>();
  private markets = new Map<string, Market>();
  private equity = STARTING_BALANCE_USDT * MICROS;
  private count = 0;

  constructor(
    private readonly seed: number = 7,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async open(): Promise<SessionOpen> {
    this.count += 1;
    const market = demoMarket(this.seed + this.count - 1);
    const id = `demo-${this.seed}-${this.count}`;
    const record: SessionRecord = {
      id,
      purpose: 'practice',
      ranked: false,
      datesVisible: false,
      source: 'demo',
      scenario: null,
      starting: this.equity,
      status: 'open',
      clock: openClock(market.tape.length, this.now()),
      highWater: -1,
      events: [],
    };
    this.records.set(id, record);
    this.markets.set(id, market);
    return toOpen(record, market, project(record, market, 0), 0);
  }

  async resume(sessionId: string): Promise<SessionOpen> {
    const { record, market } = this.get(sessionId);
    const outcome = applyOp(record, market, { op: 'tick' }, this.now(), 0);
    this.records.set(sessionId, outcome.record);
    return toOpen(outcome.record, market, outcome.sim, outcome.revealed);
  }

  async act(sessionId: string, since: number, op: SessionOp): Promise<SessionDelta> {
    const { record, market } = this.get(sessionId);
    const outcome = applyOp(record, market, op, this.now(), since);
    this.records.set(sessionId, outcome.record);
    if (outcome.record.status === 'closed' && record.status === 'open') this.equity = outcome.sim.state.cash;
    return outcome.delta;
  }

  async review(sessionId: string): Promise<SessionReview> {
    const { record, market } = this.get(sessionId);
    if (record.status !== 'closed') throw new DriverError('The session is still open.', 409);
    const state = project(record, market, market.tape.length).state;
    return buildReview(record, market, state, { showDates: false, synthetic: true });
  }

  private get(sessionId: string) {
    const record = this.records.get(sessionId);
    const market = this.markets.get(sessionId);
    if (!record || !market) throw new DriverError('No such session.', 404);
    return { record, market };
  }
}
