import { describe, expect, it } from 'vitest';
import { Simulator, simulate } from '@/core/trading/simulator';
import { FEE_SCHEDULE } from '@/core/trading/costs';
import type { OrderEvent } from '@/core/trading/types';
import { mulberry32 } from '@/core/random';
import { K, m, place, testMarket } from './trading/fixtures';

function wave(count: number, seed = 1) {
  const rng = mulberry32(seed);
  let price = 10_000;
  return Array.from({ length: count }, () => {
    const o = price;
    const c = Math.max(500, o + Math.round((rng() - 0.5) * 80));
    price = c;
    return m(o, Math.max(o, c) + Math.round(rng() * 30), Math.min(o, c) - Math.round(rng() * 30), c);
  });
}

const EVENTS: OrderEvent[] = [
  place(-1, { side: 'buy', type: 'market', qty: 2_000_000 }, { takeProfit: 10_400, stopLoss: 9_700, seq: 1 }),
  place(40, { side: 'sell', type: 'limit', qty: 1_000_000, price: 10_300 }, { seq: 2 }),
  place(80, { side: 'buy', type: 'stop', qty: 500_000, stopPrice: 10_600 }, { seq: 3 }),
  { kind: 'close-position', seq: 4, at: 150, fraction: 0.5 },
  place(200, { side: 'sell', type: 'market', qty: 3_000_000 }, { stopLoss: 11_500, seq: 5 }),
];

describe('replaying a log', () => {
  const tape = wave(360);
  const market = testMarket(tape, 10_000);
  const options = { starting: 100 * K, fees: FEE_SCHEDULE };

  it('is deterministic', () => {
    const a = simulate(market, EVENTS, { ...options, upTo: 300 }).state;
    const b = simulate(market, EVENTS, { ...options, upTo: 300 }).state;
    expect(a).toEqual(b);
  });

  it('gives the same account stepping incrementally as folding the log in one go', () => {
    const sim = new Simulator({ ...options, market });
    const sorted = [...EVENTS].sort((x, y) => x.at - y.at || x.seq - y.seq);
    for (const event of sorted) {
      sim.advance(event.at);
      sim.apply(event);
    }
    sim.advance(299);
    expect(sim.snapshot()).toEqual(simulate(market, EVENTS, { ...options, upTo: 300 }).state);
  });

  it('never reads a minute it has not reached', () => {
    // Rewrite the future after minute 250. Anything computed up to 250 must not move.
    const upTo = 251;
    const changed = [...tape.slice(0, upTo), ...wave(tape.length - upTo, 99)];
    const before = simulate(market, EVENTS, { ...options, upTo }).state;
    const after = simulate(testMarket(changed, 10_000), EVENTS, { ...options, upTo }).state;
    expect(after).toEqual(before);
  });

  it('ignores events stamped beyond what has been revealed', () => {
    const late: OrderEvent = place(320, { side: 'buy', type: 'market', qty: 1_000_000 }, { seq: 6 });
    const a = simulate(market, EVENTS, { ...options, upTo: 300 }).state;
    const b = simulate(market, [...EVENTS, late], { ...options, upTo: 300 }).state;
    expect(b).toEqual(a);
  });
});
