import { describe, expect, it, vi } from 'vitest';

// The handler imports server-only modules; under vitest there is no React Server runtime to satisfy
// the guard, and the guard is not what is under test here.
vi.mock('server-only', () => ({}));

import { actOnSession, openSession, resumeSession, reviewSession, TradeError } from '@/lib/trading/server/handler';
import { fakeChart, fakeSupabase } from './trading/fakeSupabase';
import type { SessionDelta, SessionOpen } from '@/lib/trading/types';

/**
 * §22.9, at the boundary: what a trading response may never contain.
 *
 * 1. A tape minute the server's clock has not reached.
 * 2. While the session is open, anything that dates the market: a calendar date, a year, the
 *    stored decision or window timestamps — unless it is a practice session that asked for dates.
 * 3. How the chart was stored: its id, its index factor, whether it was mirrored, the raw paths.
 * 4. Someone else's session.
 */

const COOKIE = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const DECISION = '2021-05-18T07:00:00Z';

function setup() {
  let now = 1_800_000_000_000;
  const chart = fakeChart('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'BTCUSDT', 3, DECISION);
  const { client, state } = fakeSupabase([chart], () => now);
  return {
    client,
    state,
    chart,
    tick: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

const START_MS = Date.parse(DECISION) + 3_600_000;

const FORBIDDEN_WHILE_OPEN = [
  /\d{4}-\d{2}-\d{2}/, // any ISO date
  new RegExp(String(START_MS)), // the real start, in milliseconds
  new RegExp(String(START_MS / 1000)), // or in seconds
  /May 2021|2021-05/,
  /decision_?at|window_?start|startMs/i,
  /index_?factor|mirrored|resolution_path|detail_path/i,
  /cccccccc-cccc/, // the chart id
];

function assertClean(payload: SessionOpen | SessionDelta) {
  const json = JSON.stringify(payload);
  for (const pattern of FORBIDDEN_WHILE_OPEN) expect(json).not.toMatch(pattern);
}

describe('the trading API never leaks', () => {
  it('opens with no tape, no date, and nothing about how the chart was stored', async () => {
    const { client, now } = setup();
    const open = await openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'random' }, account: 'main' }, 'n', now());
    expect(open.bars.data).toHaveLength(0);
    expect(open.clock.revealed).toBe(0);
    expect(open.time.kind).toBe('relative');
    expect(open.instrument.display).toBe('BTC/USDT');
    assertClean(open);
  });

  it('streams exactly what the clock has reached and no further', async () => {
    const { client, now, tick, chart } = setup();
    const open = await openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'random' }, account: 'main' }, 'n', now());
    await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'play' } }, now());
    tick(4_000);
    const delta = await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'tick' } }, now());
    expect(delta.clock.revealed).toBe(60);
    expect(delta.bars.data).toHaveLength(60);
    // The last minute sent is the last one reached, in real prices; minute 60 is nowhere in it.
    const unit = Math.pow(10, open.instrument.tickExp);
    expect(delta.bars.data[59][3] * unit).toBeCloseTo(chart.tapeCloses[59], 0);
    const next = chart.tapeCloses[60];
    expect(delta.bars.data.some((bar) => Math.abs(bar[3] * unit - next) < unit / 2 && bar === delta.bars.data[60])).toBe(false);
    assertClean(delta);
  });

  it('stamps an order where the server says the replay is, whatever the client sends', async () => {
    const { client, now, state } = setup();
    const open = await openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'random' }, account: 'main' }, 'n', now());
    await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'step', minutes: 90 } }, now());
    const forged = { op: 'place', clientOrderId: 'a', side: 'buy', type: 'market', notional: 1_000, at: 3000 } as never;
    const delta = await actOnSession(client, open.sessionId, COOKIE, { since: 90, op: forged }, now());
    expect(delta.fills).toHaveLength(1);
    expect(delta.fills[0].at).toBe(89);
    expect(state.events[0].at_index).toBe(89);
  });

  it('answers a stranger with "no such session"', async () => {
    const { client, now } = setup();
    const open = await openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'random' }, account: 'main' }, 'n', now());
    await expect(actOnSession(client, open.sessionId, STRANGER, { since: 0, op: { op: 'tick' } }, now())).rejects.toMatchObject({ status: 404 });
    await expect(resumeSession(client, open.sessionId, STRANGER, now())).rejects.toBeInstanceOf(TradeError);
    await expect(reviewSession(client, open.sessionId, STRANGER, now())).rejects.toMatchObject({ status: 404 });
  });

  it('sends one open session back rather than opening a second', async () => {
    const { client, now } = setup();
    const first = await openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'random' }, account: 'main' }, 'n', now());
    await expect(
      openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'random' }, account: 'main' }, 'n2', now()),
    ).rejects.toMatchObject({ status: 409, detail: { openSessionId: first.sessionId } });
  });

  it('refuses the review while open, and gives the real dates once it is over', async () => {
    const { client, now, state } = setup();
    const open = await openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'random' }, account: 'main' }, 'n', now());
    await expect(reviewSession(client, open.sessionId, COOKIE, now())).rejects.toMatchObject({ status: 409 });
    await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'place', clientOrderId: 'x', side: 'sell', type: 'market', notional: 5_000 } }, now());
    const ended = await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'end' } }, now());
    expect(ended.status).toBe('closed');
    expect(state.finalized).toHaveLength(1);
    const review = await reviewSession(client, open.sessionId, COOKIE, now());
    expect(review.identity.startMs).toBe(Date.parse(DECISION) + 3_600_000);
    expect(review.time.kind).toBe('absolute');
    expect(review.panel).toHaveLength(8);
  });

  it('holds the daily’s dates until the day rolls over', async () => {
    const { client, now } = setup();
    const open = await openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'daily' }, account: 'main' }, 'n', now());
    await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'end' } }, now());
    const review = await reviewSession(client, open.sessionId, COOKIE, now());
    expect(review.identity.startMs).toBeNull();
    expect(review.identity.embargoedUntil).not.toBeNull();
    // Everything but the embargo's own end time, which is tomorrow's midnight and not the market's date.
    const withheld = JSON.stringify({ ...review, identity: { ...review.identity, embargoedUntil: null } });
    expect(withheld).not.toMatch(/\d{4}-\d{2}-\d{2}T|May 2021/);
    expect(withheld).not.toContain(String(START_MS));
    const tomorrow = await reviewSession(client, open.sessionId, COOKIE, now() + 2 * 86_400_000);
    expect(tomorrow.identity.startMs).not.toBeNull();
  });

  it('shows dates only in a practice session that asked for them, and never ranks it', async () => {
    const { client, now } = setup();
    const open = await openSession(
      client,
      { sessionCookie: COOKIE, userId: null },
      { market: { kind: 'random' }, account: 'practice', showDates: true },
      'n',
      now(),
    );
    expect(open.time.kind).toBe('absolute');
    expect(open.ranked).toBe(false);
  });

  it('books the end of the tape once', async () => {
    const { client, now, state } = setup();
    const open = await openSession(client, { sessionCookie: COOKIE, userId: null }, { market: { kind: 'random' }, account: 'main' }, 'n', now());
    await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'place', clientOrderId: 'y', side: 'buy', type: 'market', notional: 10_000 } }, now());
    const done = await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'step', minutes: 1440 } }, now());
    expect(done.status).toBe('open');
    await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'step', minutes: 1440 } }, now());
    const last = await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'step', minutes: 1440 } }, now());
    expect(last.status).toBe('closed');
    await actOnSession(client, open.sessionId, COOKIE, { since: 0, op: { op: 'tick' } }, now());
    expect(state.finalized).toHaveLength(1);
  });
});
