import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * §12.1 is the single most important integrity rule in the product, and §12.2 asks for
 * "auditing every response payload and variable name for leaks". A convention cannot be
 * audited; a test can.
 *
 * The mocked RPC below returns far more than `issue_round` actually returns — the symbol, the
 * window timestamps, the reveal bars and the resolution path. That is deliberate. If someone
 * later widens the function's return type, or swaps the RPC for a `select *`, this test fails
 * on the handler rather than on the database, which is where the mistake would actually be
 * made.
 */

const REVEAL_BARS = [{ o: 900, h: 950, l: 890, c: 940, v: 3 }];

// Four minute bars' worth of bytes. The route re-encodes whatever issue_round hands back, so
// this stands in for the lead-in prefix the function is supposed to have sliced.
const LEAD_IN_DETAIL_HEX = '\\x' + '11'.repeat(80);

const OVERSHARING_ROW = {
  round_id: '11111111-1111-4111-8111-111111111111',
  chart_id: '22222222-2222-4222-8222-222222222222',
  lead_in_bars: [{ o: 100, h: 101, l: 99, c: 100.5, v: 1 }],
  atr14: 2.4,
  tick_size: 0.01,
  entry_price: 100.5,
  start_dow: 1, // Tuesday
  start_hour: 14,
  expires_at: new Date(Date.now() + 90_000).toISOString(),
            lead_in_detail: LEAD_IN_DETAIL_HEX,
  // None of the following may appear in the response.
  symbol: 'BTCUSDT',
  window_start: '2021-04-13T00:00:00.000Z',
  decision_at: '2021-04-16T08:00:00.000Z',
  reveal_bars: REVEAL_BARS,
  resolution_path: '\\xdeadbeef',
  index_factor: 0.00167,
  achievable_r: '\\xcafebabe',
  oracle_r: 31.7,
  par_r: -1,
  pass_percentile: 0.62,
};

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));

vi.mock('@/lib/supabase/server', () => ({
  serviceClient: () => ({
    rpc: async () => ({ data: [OVERSHARING_ROW], error: null }),
  }),
}));

describe('POST /api/round leaks nothing about the future or the instrument', () => {
  let body: string;
  let parsed: Record<string, unknown>;

  beforeEach(async () => {
    const { POST } = await import('@/app/api/round/route');
    // The route now reads a tape from the query string, so it needs a Request. The assertion
    // below is unchanged: whatever the tape, the issuance payload carries no future.
    const response = await POST(new Request('http://localhost/api/round?tape=open', { method: 'POST' }));
    body = await response.text();
    parsed = JSON.parse(body);
  });

  it('returns only the documented fields', () => {
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'atr',
        'bars',
        'entry',
        'revealBarCount',
        'roundId',
        'detail',
        'startDayOfWeek',
        'startHourUtc',
        'tickSize',
        // The ruleset the round is played under. Every one of these describes what the *player*
        // may do, never anything about the chart — see the assertion below.
        'tier',
        'mods',
        'timeframes',
        'volume',
        'priceAxis',
        'mayPass',
        'clockMs',
      ].sort(),
    );
  });

  it('describes the ruleset without describing the chart', () => {
    // A tier field would be a leak if it varied with the instrument. It varies with what was asked
    // for, so the same request always yields the same affordances whatever chart came back.
    expect(parsed.tier).toBe('NTZ');
    expect(parsed.mods).toEqual([]);
    expect(parsed.timeframes).toEqual([60]);
    expect(parsed.volume).toBe(true);
    // §3.1: the price axis and the ATR badge survive every tier. Only an opt-in mod removes one.
    expect(parsed.priceAxis).toBe(true);
    expect(typeof parsed.atr).toBe('number');
  });

  it('sends the clock as a duration, never as a deadline', () => {
    // A wall-clock timestamp would let a client with a skewed clock decide whether its own commit
    // was late, and it would also disclose the server's notion of "now" to no purpose.
    expect(typeof parsed.clockMs).toBe('number');
    expect(parsed.clockMs).toBeGreaterThan(0);
    expect(parsed.clockMs).toBeLessThanOrEqual(90_000);
    expect(body).not.toMatch(/expires|deadline|\d{4}-\d{2}-\d{2}T/);
  });

  it('withholds the minute detail at every tier that does not grant it', () => {
    // The only enforceable timeframe restriction: a client holding the detail can render 1m
    // whatever the picker offers, so Naked must not receive it at all.
    expect(parsed.detail).toBe('');
  });

  it('releases a weekday and an hour, and nothing else about when it was', () => {
    // Three bits and a little under five. Enough to read session and weekend structure;
    // nowhere near enough to place the window in a year, a month or a day of the month.
    expect(parsed.startDayOfWeek).toBe(1);
    expect(parsed.startHourUtc).toBe(14);
    expect(parsed.startDayOfWeek).toBeGreaterThanOrEqual(0);
    expect(parsed.startDayOfWeek).toBeLessThanOrEqual(6);
    expect(parsed.startHourUtc).toBeGreaterThanOrEqual(0);
    expect(parsed.startHourUtc).toBeLessThanOrEqual(23);
  });

  it('carries no ticker', () => {
    expect(body).not.toContain('BTCUSDT');
    expect(body.toLowerCase()).not.toContain('symbol');
  });

  it('carries no date, in any form', () => {
    expect(body).not.toContain('2021');
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(body).not.toContain('window_start');
    expect(body).not.toContain('decision_at');
    expect(body).not.toContain('T08:00');
    // No bar carries a timestamp field either.
    for (const bar of parsed.bars as Record<string, unknown>[]) {
      expect(Object.keys(bar).sort()).toEqual(['c', 'h', 'l', 'o', 'v']);
    }
  });

  it('ships the lead-in detail as base64, not as raw Postgres hex, at the one tier that gets it', async () => {
    // Base64 costs a third; hex costs double. At 4800 minute bars that is the difference
    // between a 128 KB payload and a 192 KB one.
    //
    // Only the unrated Sandbox grants a sub-hour timeframe, so it is the only tier this can be
    // asserted against — which is itself the point of the assertion above it.
    const { POST } = await import('@/app/api/round/route');
    const sandbox = await POST(
      new Request('http://localhost/api/round?tape=open&tier=SBX', { method: 'POST' }),
    );
    const payload = JSON.parse(await sandbox.text());

    expect(typeof payload.detail).toBe('string');
    expect(payload.detail).not.toContain('\\x');
    expect(Buffer.from(payload.detail as string, 'base64')).toEqual(
      Buffer.from('11'.repeat(80), 'hex'),
    );
    // And the Sandbox is untimed, so there is no clock to count down.
    expect(payload.clockMs).toBeNull();
  });

  it('carries no future bar', () => {
    for (const value of [900, 950, 890, 940]) {
      expect(body).not.toContain(String(value));
    }
    expect(body).not.toContain('reveal_bars');
    expect(body).not.toContain('resolution_path');
    expect(body).not.toContain('deadbeef');
  });

  it('withholds the identity that the reveal is allowed to release', () => {
    // The whole point of the split. §12.2 hides the instrument and the moment so a chart cannot
    // be looked up *before* the decision; the reveal hands both over afterwards, once there is
    // nothing left to protect. If issuance ever carried them, the game would be over.
    expect(body).not.toContain('BTCUSDT');
    expect(body).not.toContain('Binance');
    expect(parsed).not.toHaveProperty('provenance');
    expect(parsed).not.toHaveProperty('symbol');
    expect(parsed).not.toHaveProperty('mirrored');
    // Nor the factor that would turn an indexed price back into a real one.
    expect(parsed).not.toHaveProperty('indexFactor');
  });

  it('carries no achievable set, which is future data by construction', () => {
    // The 98-cell grid is enumerated *against the reveal path*, so it encodes the future as
    // surely as the reveal bars do. Its oracle and its median are the same data compressed: an
    // oracle of 31.7R says the path moved a long way, and a negative median says most brackets
    // lost. Both belong to the reveal, and neither may be issued.
    expect(parsed).not.toHaveProperty('score');
    expect(parsed).not.toHaveProperty('distribution');
    expect(parsed).not.toHaveProperty('oracleR');
    expect(parsed).not.toHaveProperty('parR');
    expect(body).not.toContain('achievable');
    expect(body).not.toContain('cafebabe');
    expect(body).not.toContain('31.7');
    expect(body).not.toContain('0.62');
  });

  it('carries no chart id, so charts cannot be correlated across sessions', () => {
    expect(body).not.toContain('22222222-2222-4222-8222-222222222222');
  });

  it('carries no denormalisation factor, which would recover the real price level', () => {
    expect(body).not.toContain('index_factor');
    expect(body).not.toContain('0.00167');
  });

  it('does still carry the risk arithmetic §3.1 says must never be hidden', () => {
    expect(parsed.atr).toBe(2.4);
    expect(parsed.tickSize).toBe(0.01);
    expect(parsed.entry).toBe(100.5);
  });
});
