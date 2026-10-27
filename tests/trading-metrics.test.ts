import { describe, expect, it } from 'vitest';
import { bestRoundTrip, buyAndHold, maxDrawdown, profitFactor, winRate } from '@/core/trading/metrics';
import { FEE_SCHEDULE, halfSpread } from '@/core/trading/costs';
import type { RoundTrip } from '@/core/trading/types';
import { mulberry32 } from '@/core/random';
import { m } from './trading/fixtures';

const trip = (net: number): RoundTrip => ({
  side: 'long', openedAt: 0, closedAt: 1, maxQty: 1, entryAvg: 1, exitAvg: 1, gross: net, fees: 0, net, mfe: 0, mae: 0, fills: 2,
});

describe('statement numbers', () => {
  it('measure drawdown from the running peak', () => {
    expect(maxDrawdown([100, 120, 90, 130, 104])).toEqual({ fraction: 0.25, amount: 30 });
    expect(maxDrawdown([100, 110, 120]).fraction).toBe(0);
  });

  it('count wins after fees and divide profit by loss', () => {
    const trips = [trip(50), trip(-25), trip(30), trip(-25)];
    expect(winRate(trips)).toBe(0.5);
    expect(profitFactor(trips)).toBeCloseTo(80 / 50);
    expect(winRate([])).toBeNull();
    expect(profitFactor([trip(10)])).toBeNull();
  });
});

describe('the best round trip in hindsight', () => {
  const rng = mulberry32(5);
  let price = 10_000;
  const tape = Array.from({ length: 300 }, () => {
    const o = price;
    const c = Math.max(100, o + Math.round((rng() - 0.5) * 200));
    price = c;
    return m(o, Math.max(o, c), Math.min(o, c), c);
  });
  const closes = [10_000, ...tape.map((b) => b.c)];
  const ask = (p: number) => p + halfSpread(p, FEE_SCHEDULE);
  const bid = (p: number) => p - halfSpread(p, FEE_SCHEDULE);

  it('finds the same long as checking every pair of closes', () => {
    let best = -Infinity;
    for (let i = 0; i < closes.length; i++) {
      for (let j = i + 1; j < closes.length; j++) best = Math.max(best, bid(closes[j]) / ask(closes[i]));
    }
    const found = bestRoundTrip('long', 10_000, tape, 1e10, FEE_SCHEDULE)!;
    expect(found.exitPrice / found.entryPrice).toBeCloseTo(best, 12);
    expect(found.exitAt).toBeGreaterThan(found.entryAt);
  });

  it('finds the same short as checking every pair of closes', () => {
    let best = -Infinity;
    for (let i = 0; i < closes.length; i++) {
      for (let j = i + 1; j < closes.length; j++) best = Math.max(best, bid(closes[i]) / ask(closes[j]));
    }
    const found = bestRoundTrip('short', 10_000, tape, 1e10, FEE_SCHEDULE)!;
    expect(found.entryPrice / found.exitPrice).toBeCloseTo(best, 12);
  });

  it('prices buy-and-hold through the spread and both fees', () => {
    const flat = [m(10_000, 10_000, 10_000, 10_000)];
    const hold = buyAndHold(10_000, flat, 1e10, FEE_SCHEDULE);
    expect(hold.pnl).toBeLessThan(0);
    expect(hold.returnPct).toBeLessThan(0);
  });
});
