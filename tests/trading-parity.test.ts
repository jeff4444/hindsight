import { describe, expect, it } from 'vitest';
import { resolve, NO_COSTS } from '@/core/resolve';
import { simulate } from '@/core/trading/simulator';
import { NO_FEES } from '@/core/trading/costs';
import { mulberry32 } from '@/core/random';
import type { Bar } from '@/core/bars';
import { m, place, testMarket, K } from './trading/fixtures';

/**
 * The simulator generalises the bracket resolver; on a bracket it must *be* the resolver.
 *
 * A market entry at the decision close with an attached stop-loss and take-profit, frictionless,
 * is exactly the trade `resolve()` was built for. The two must agree on every path: same exit
 * minute, same exit price, same outcome, same ambiguity flag — gaps and stop-first included.
 */

function randomPath(seed: number, count: number, start: number): Bar[] {
  const rng = mulberry32(seed);
  const bars: Bar[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    // Occasional gaps, so the open-beyond-the-level rules are exercised.
    const gap = rng() < 0.05 ? Math.round((rng() - 0.5) * 120) : 0;
    const o = Math.max(100, price + gap);
    const drift = Math.round((rng() - 0.5) * 60);
    const c = Math.max(100, o + drift);
    const h = Math.max(o, c) + Math.round(rng() * 40);
    const l = Math.max(1, Math.min(o, c) - Math.round(rng() * 40));
    bars.push(m(o, h, l, c));
    price = c;
  }
  return bars;
}

describe('parity with the bracket resolver', () => {
  const ENTRY = 10_000;
  const cases = Array.from({ length: 500 }, (_, i) => i);

  it.each(cases)('agrees on random path %i', (i) => {
    const rng = mulberry32(9_000 + i);
    const tape = randomPath(1_000 + i, 240, ENTRY);
    const long = rng() < 0.5;
    const risk = 20 + Math.round(rng() * 300);
    const reward = Math.round(risk * (0.5 + rng() * 3));
    const stop = long ? ENTRY - risk : ENTRY + risk;
    const target = long ? ENTRY + reward : ENTRY - reward;

    const bracket = resolve({ entry: ENTRY, stop, target }, tape, 60, NO_COSTS);

    const { state } = simulate(
      testMarket(tape, ENTRY),
      [place(-1, { side: long ? 'buy' : 'sell', type: 'market', qty: 1_000, id: 'e' }, { takeProfit: target, stopLoss: stop })],
      { starting: 100 * K, upTo: tape.length, fees: NO_FEES, liquidityShare: 0 },
    );

    const exit = state.fills.find((f) => f.orderId !== 'e')!;
    const outcome =
      exit.role === 'stop-loss' ? 'stop' : exit.role === 'take-profit' ? 'target' : 'timeout';

    expect(outcome).toBe(bracket.outcome);
    expect(exit.at).toBe(bracket.exitPathIndex);
    expect(exit.price).toBe(bracket.exitFill);
    expect(exit.ambiguous).toBe(bracket.ambiguous);
  });
});
