import { describe, expect, it } from 'vitest';
import { LocalDriver } from '@/lib/trading/driver';
import { LEASE_MS } from '@/core/trading/clock';
import type { SessionDelta } from '@/lib/trading/types';

/**
 * The session core, driven through the in-browser driver with a hand-cranked clock. The server
 * runs the same functions around its storage, so these are the rules a real session obeys too.
 */

function harness(seed = 5) {
  let now = 1_700_000_000_000;
  const driver = new LocalDriver(seed, () => now);
  return {
    driver,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const revealedOf = (delta: SessionDelta) => delta.bars.from + delta.bars.data.length;

describe('a trading session', () => {
  it('opens paused with nothing of the tape revealed, and the date withheld', async () => {
    const { driver } = harness();
    const open = await driver.open();
    expect(open.clock).toMatchObject({ revealed: 0, paused: true, total: 3600 });
    expect(open.bars.data).toHaveLength(0);
    expect(open.time.kind).toBe('relative');
    const json = JSON.stringify(open);
    expect(json).not.toMatch(/startMs|windowStart|decisionAt|20\d\d-\d\d-\d\d/);
    expect(open.account.equity).toBe(100_000);
  });

  it('never sends a minute the clock has not reached, and never resends one the client holds', async () => {
    const { driver, advance } = harness();
    const open = await driver.open();
    let held = 0;
    let delta = await driver.act(open.sessionId, held, { op: 'step', minutes: 60 });
    expect(delta.clock.revealed).toBe(60);
    expect(revealedOf(delta)).toBe(60);
    held = revealedOf(delta);

    delta = await driver.act(open.sessionId, held, { op: 'play' });
    advance(2_000);
    delta = await driver.act(open.sessionId, held, { op: 'tick' });
    expect(delta.bars.from).toBe(held);
    expect(revealedOf(delta)).toBe(delta.clock.revealed);
    expect(delta.clock.revealed).toBe(60 + 2 * 15);
  });

  it('does not move while paused, however long the trader is away', async () => {
    const { driver, advance } = harness();
    const open = await driver.open();
    advance(10 * 60_000);
    const delta = await driver.act(open.sessionId, 0, { op: 'tick' });
    expect(delta.clock.revealed).toBe(0);
  });

  it('stops at the lease when nobody asks, and comes back paused', async () => {
    const { driver, advance } = harness();
    const open = await driver.open();
    await driver.act(open.sessionId, 0, { op: 'speed', speed: 1 });
    await driver.act(open.sessionId, 0, { op: 'play' });
    advance(10 * 60_000);
    const delta = await driver.act(open.sessionId, 0, { op: 'tick' });
    expect(delta.away).toBe(true);
    expect(delta.clock.paused).toBe(true);
    expect(delta.clock.revealed).toBe(LEASE_MS / 1000);
  });

  it('fills a market order and says why it refuses one', async () => {
    const { driver } = harness();
    const open = await driver.open();
    const bought = await driver.act(open.sessionId, 0, {
      op: 'place',
      clientOrderId: 'first',
      side: 'buy',
      type: 'market',
      notional: 20_000,
      stopLoss: (open.chart.refClose * open.instrument.tickSize) * 0.97,
    });
    expect(bought.rejected).toBeNull();
    expect(bought.position?.side).toBe('long');
    expect(bought.fills).toHaveLength(1);
    expect(bought.orders.map((o) => o.role)).toEqual(['stop-loss']);

    const tooBig = await driver.act(open.sessionId, 0, {
      op: 'place',
      clientOrderId: 'second',
      side: 'buy',
      type: 'market',
      notional: 1_000_000,
    });
    expect(tooBig.rejected?.reason).toBe('insufficient-buying-power');
    expect(tooBig.rejected?.text).toMatch(/buying power/i);
  });

  it('ends on request, refuses orders after, and carries the result into the next session', async () => {
    const { driver } = harness();
    const open = await driver.open();
    await driver.act(open.sessionId, 0, { op: 'step', minutes: 30 });
    await driver.act(open.sessionId, 30, { op: 'place', clientOrderId: 'a', side: 'sell', type: 'market', notional: 50_000 });
    await driver.act(open.sessionId, 30, { op: 'step', minutes: 600 });
    const ended = await driver.act(open.sessionId, 630, { op: 'end' });
    expect(ended.status).toBe('closed');
    expect(ended.position).toBeNull();

    const after = await driver.act(open.sessionId, 630, { op: 'place', clientOrderId: 'b', side: 'buy', type: 'market', notional: 100 });
    expect(after.rejected?.reason).toBe('session-closed');

    const review = await driver.review(open.sessionId);
    expect(review.summary.endingEquity).toBeCloseTo(ended.account.equity, 6);
    expect(review.tape).toHaveLength(3600);
    expect(review.panel).toHaveLength(8);
    expect(review.identity.synthetic).toBe(true);

    const next = await driver.open();
    expect(next.account.equity).toBeCloseTo(ended.account.equity, 6);
  });

  it('refuses a review while the session is open', async () => {
    const { driver } = harness();
    const open = await driver.open();
    await expect(driver.review(open.sessionId)).rejects.toThrow(/still open/);
  });

  it('closes itself at the end of the tape', async () => {
    const { driver } = harness();
    const open = await driver.open();
    await driver.act(open.sessionId, 0, { op: 'place', clientOrderId: 'a', side: 'buy', type: 'market', notional: 10_000 });
    const done = await driver.act(open.sessionId, 0, { op: 'step', minutes: 1440 });
    expect(done.status).toBe('open');
    const last = await driver.act(open.sessionId, 1440, { op: 'step', minutes: 1440 * 3 });
    expect(last.status).toBe('closed');
    expect(last.clock.revealed).toBe(3600);
    expect(last.fills.at(-1)?.role).toBe('flatten');
  });
});
