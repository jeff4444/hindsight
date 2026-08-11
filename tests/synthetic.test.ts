import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/bars';
import { SYNTHETIC_SPEC, aggregate, blockBootstrap } from '@/core/synthetic';
import { permuteBars } from '@/core/permute';
import { walk } from './geometry/fixtures';

/**
 * The synthetic controls, held to the properties that make them usable as controls.
 *
 * Two things have to be true and neither is obvious from the code: the output must still look like
 * a market (candles whose highs and lows bracket their own bodies, prices that stay positive), and
 * it must actually destroy the structure it claims to destroy. The second is measured rather than
 * asserted — `docs/phase-4-research.md` §1.2 is where the numbers come from.
 */

const logReturns = (bars: readonly Bar[]) =>
  bars.slice(1).map((bar, i) => Math.log(bar.c / bars[i].c));

function acf(xs: number[], lag: number): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  let num = 0;
  let den = 0;
  for (const x of xs) den += (x - mean) ** 2;
  for (let i = 0; i < xs.length - lag; i++) num += (xs[i] - mean) * (xs[i + lag] - mean);
  return den > 0 ? num / den : 0;
}

/** A series with real volatility clustering, so "destroys clustering" is a testable claim. */
function clustered(n: number, seed: number): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  let vol = 0.004;
  const rng = (() => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());

  for (let i = 0; i < n; i++) {
    // A GARCH-ish variance that persists, which is what real tape does and permutation removes.
    const shock = normal();
    vol = Math.sqrt(0.000002 + 0.9 * vol ** 2 + 0.08 * (vol * shock) ** 2);
    const open = price;
    price = price * Math.exp(vol * shock);
    bars.push({
      o: open,
      h: Math.max(open, price) * (1 + Math.abs(normal()) * 0.0004),
      l: Math.min(open, price) * (1 - Math.abs(normal()) * 0.0004),
      c: price,
      v: 10 + rng() * 5,
    });
  }
  return bars;
}

describe('the block bootstrap still produces something that looks like a market', () => {
  const source = walk(600, 4);

  it('keeps every candle well-formed', () => {
    // The reason both generators work in log space off each bar's own open: a bar reattached
    // anywhere still has its high above its body and its low below it. Shuffling raw prices does
    // not have this property, and the result does not look like a chart.
    const out = blockBootstrap(source, 60, 7);
    expect(out).toHaveLength(source.length);
    for (const bar of out) {
      expect(bar.h).toBeGreaterThanOrEqual(Math.max(bar.o, bar.c) - 1e-9);
      expect(bar.l).toBeLessThanOrEqual(Math.min(bar.o, bar.c) + 1e-9);
      expect(bar.o).toBeGreaterThan(0);
      expect(bar.l).toBeGreaterThan(0);
    }
  });

  it('is reproducible from its seed, and different from another seed', () => {
    expect(blockBootstrap(source, 60, 11)).toEqual(blockBootstrap(source, 60, 11));
    expect(blockBootstrap(source, 60, 11)).not.toEqual(blockBootstrap(source, 60, 12));
  });

  it('produces the length asked for, whatever the source length', () => {
    // A synthetic chart needs a fixed number of minutes regardless of how much donor tape exists.
    expect(blockBootstrap(source, 60, 3, 5000)).toHaveLength(5000);
    expect(blockBootstrap(source, 60, 3, 120)).toHaveLength(120);
  });

  it('declines rather than guessing on a source too short to block', () => {
    expect(blockBootstrap([], 60, 1)).toEqual([]);
    expect(blockBootstrap(source, 0, 1)).toEqual([]);
  });
});

describe('the two generators destroy different amounts of structure', () => {
  const source = clustered(4000, 21);

  it('permutation removes volatility clustering, which is what makes it the clean null', () => {
    const real = acf(logReturns(source).map(Math.abs), 1);
    const permuted = acf(logReturns(permuteBars(source, 5)).map(Math.abs), 1);
    expect(real).toBeGreaterThan(0.1);
    expect(Math.abs(permuted)).toBeLessThan(0.05);
  });

  it('the block bootstrap keeps some of it, which is what makes it the weaker null', () => {
    // Measured on the corpus at 0.151 against a real 0.183. The claim under test is only that it
    // retains materially more than permutation does — the exact figure is data-dependent.
    const real = acf(logReturns(source).map(Math.abs), 1);
    const blocked = acf(logReturns(blockBootstrap(source, SYNTHETIC_SPEC.blockMinutes, 5)).map(Math.abs), 1);
    const permuted = Math.abs(acf(logReturns(permuteBars(source, 5)).map(Math.abs), 1));
    expect(blocked).toBeGreaterThan(permuted);
    expect(blocked).toBeLessThan(real * 1.5);
  });

  it('neither leaves predictable returns behind, which would make the control tradeable', () => {
    // A control that had exploitable serial correlation in *returns* would not be a null at all.
    for (const series of [permuteBars(source, 9), blockBootstrap(source, SYNTHETIC_SPEC.blockMinutes, 9)]) {
      expect(Math.abs(acf(logReturns(series), 1))).toBeLessThan(0.1);
    }
  });
});

describe('aggregation ties the minute path to the candles a player reads', () => {
  const minutes = walk(600, 8);

  it('builds each display bar from its own minutes', () => {
    const hourly = aggregate(minutes, 60);
    expect(hourly).toHaveLength(10);
    expect(hourly[0].o).toBe(minutes[0].o);
    expect(hourly[0].c).toBe(minutes[59].c);
    expect(hourly[0].h).toBe(Math.max(...minutes.slice(0, 60).map((b) => b.h)));
    expect(hourly[0].l).toBe(Math.min(...minutes.slice(0, 60).map((b) => b.l)));
  });

  it('sums volume rather than averaging it', () => {
    const hourly = aggregate(minutes, 60);
    const expected = minutes.slice(0, 60).reduce((sum, b) => sum + b.v, 0);
    expect(hourly[0].v).toBeCloseTo(expected, 9);
  });

  it('drops an incomplete trailing bar rather than emitting a short one', () => {
    // A partial final candle would be a bar the market never printed, and it would be the decision
    // bar — the one bar the whole product is about.
    expect(aggregate(minutes.slice(0, 599), 60)).toHaveLength(9);
  });
});

describe('the spec is pre-registered', () => {
  it('fixes the block length before any synthetic chart exists', () => {
    // Chosen from a measurement over the corpus, so under §14's discipline it is a specification
    // and not a knob. Sixteen hours, expressed in the resolution the generator runs at.
    expect(SYNTHETIC_SPEC.blockMinutes).toBe(960);
    expect(SYNTHETIC_SPEC.mixShare).toBeGreaterThan(0);
    expect(SYNTHETIC_SPEC.mixShare).toBeLessThan(0.5);
  });
});
