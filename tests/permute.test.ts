import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/bars';
import { decompose, permuteBars, returnAutocorrelation } from '@/core/permute';
import { mulberry32 } from '@/core/random';

/** A random walk: realistic candles, no serial structure to speak of. */
function walk(length: number, seed = 1): Bar[] {
  const rng = mulberry32(seed);
  const bars: Bar[] = [];
  let price = 100;

  for (let i = 0; i < length; i++) {
    const open = price;
    const close = Math.max(1, open * (1 + (rng() - 0.5) * 0.02));
    bars.push({
      o: open,
      h: Math.max(open, close) * (1 + rng() * 0.004),
      l: Math.min(open, close) * (1 - rng() * 0.004),
      c: close,
      v: 10 + rng() * 90,
    });
    price = close;
  }

  return bars;
}

/** A series with deliberate momentum, so there is real serial structure to destroy. */
function trending(length: number, seed = 2): Bar[] {
  const rng = mulberry32(seed);
  const bars: Bar[] = [];
  let price = 100;
  let momentum = 0;

  for (let i = 0; i < length; i++) {
    momentum = momentum * 0.85 + (rng() - 0.5) * 0.006;
    const open = price;
    const close = Math.max(1, open * (1 + momentum));
    bars.push({
      o: open,
      h: Math.max(open, close) * (1 + rng() * 0.003),
      l: Math.min(open, close) * (1 - rng() * 0.003),
      c: close,
      v: 10 + rng() * 90,
    });
    price = close;
  }

  return bars;
}

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

describe('candle realism survives the shuffle', () => {
  const bars = walk(400);
  const permuted = permuteBars(bars, 42);

  it('keeps every OHLC invariant', () => {
    for (const bar of permuted) {
      expect(bar.o).toBeGreaterThan(0);
      expect(bar.l).toBeGreaterThan(0);
      expect(bar.h).toBeGreaterThanOrEqual(Math.max(bar.o, bar.c) - 1e-9);
      expect(bar.l).toBeLessThanOrEqual(Math.min(bar.o, bar.c) + 1e-9);
    }
  });

  it('returns a series of the same length', () => {
    expect(permuted).toHaveLength(bars.length);
  });

  it('holds the invariants because each shape came from a real bar', () => {
    // Not incidental: the triple is stored relative to its own open, so reattaching it anywhere
    // reproduces a shape that was observed somewhere. There is no arithmetic that could produce
    // a high below the close.
    const shapes = decompose(bars).geometry;
    for (const shape of shapes) {
      expect(shape.high).toBeGreaterThanOrEqual(Math.max(0, shape.close) - 1e-12);
      expect(shape.low).toBeLessThanOrEqual(Math.min(0, shape.close) + 1e-12);
    }
  });
});

describe('what the permutation preserves', () => {
  const bars = walk(300, 5);
  const permuted = permuteBars(bars, 7);

  it('preserves the multiset of gaps', () => {
    expect(sorted(decompose(permuted).gaps).map((g) => g.toFixed(10))).toEqual(
      sorted(decompose(bars).gaps).map((g) => g.toFixed(10)),
    );
  });

  it('preserves the multiset of candle shapes and their volumes', () => {
    const shapeOf = (list: Bar[]) =>
      decompose(list)
        .geometry.map((g) => [g.high, g.low, g.close, g.volume].map((n) => n.toFixed(10)).join('|'))
        .sort();
    expect(shapeOf(permuted)).toEqual(shapeOf(bars));
  });

  it('preserves multiplicative scale — the series ends where it started out heading', () => {
    // log(c_n) is the anchor plus the sum of every gap and every close offset, and permutation
    // reorders those sums without changing them. §6 calls this "preserving multiplicative
    // scale"; concretely it means the null cannot drift somewhere the real series never went.
    expect(permuted[permuted.length - 1].c).toBeCloseTo(bars[bars.length - 1].c, 6);
  });

  it('is reproducible from the seed and different across seeds', () => {
    expect(permuteBars(bars, 7)).toEqual(permuted);
    expect(permuteBars(bars, 8)).not.toEqual(permuted);
  });

  it('leaves a one-bar series alone rather than throwing', () => {
    expect(permuteBars(bars.slice(0, 1), 3)).toHaveLength(1);
    expect(permuteBars([], 3)).toHaveLength(0);
  });
});

describe('what the permutation destroys', () => {
  it('removes the serial structure it was built to remove', () => {
    // The whole purpose: §6 Layer 2 wants a null where "a geometry layer that finds structure in
    // shuffled data at the same rate as in real data is telling you nothing".
    const bars = trending(600, 21);
    const before = Math.abs(returnAutocorrelation(bars));
    const after = Math.abs(returnAutocorrelation(permuteBars(bars, 99)));

    expect(before).toBeGreaterThan(0.25);
    expect(after).toBeLessThan(before / 3);
  });

  it('destroys it across seeds, not by luck of one', () => {
    const bars = trending(600, 33);
    const before = Math.abs(returnAutocorrelation(bars));
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(Math.abs(returnAutocorrelation(permuteBars(bars, seed)))).toBeLessThan(before / 2);
    }
  });

  it('shuffles gaps and shapes independently', () => {
    // Reusing one order for both would keep each gap attached to the candle that followed it,
    // preserving exactly the correlation the null exists to remove.
    const bars = trending(200, 44);
    const permuted = permuteBars(bars, 5);

    const pairing = (list: Bar[]) => {
      const { gaps, geometry } = decompose(list);
      return gaps.map((gap, i) => `${gap.toFixed(8)}|${geometry[i + 1].close.toFixed(8)}`).sort();
    };
    expect(pairing(permuted)).not.toEqual(pairing(bars));
  });
});
