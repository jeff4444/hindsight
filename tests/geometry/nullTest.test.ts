import { describe, expect, it } from 'vitest';
import { efficiencyRatio } from '@/core/regime';
import { mulberry32 } from '@/core/random';
import { atr } from '@/core/atr';
import { permuteBars } from '@/core/permute';
import { compareCounts, compareRates, gbmBars } from '@/core/geometry/nullTest';
import { walk } from './fixtures';

/**
 * The null, and the thing it is meant to be able to say.
 *
 * Lo, Mamaysky & Wang (2000) found head-and-shoulders 1,611 real against 577 random — a real
 * effect — and broadening tops **725 real against 1,227 random**, where noise produced nearly
 * twice as many. A comparison that cannot report the second outcome is not a comparison, it is a
 * confirmation, so `inverted` is tested as carefully as `discriminates`.
 */

const hits = (n: number, share: number): boolean[] =>
  Array.from({ length: n }, (_, i) => i / n < share);

const nullHits = (n: number, draws: number, share: number): boolean[][] =>
  Array.from({ length: n }, () => Array.from({ length: draws }, (_, d) => d / draws < share));

describe('the comparison can say all three things', () => {
  it('reports a detector that beats the null', () => {
    const result = compareRates(hits(400, 0.6), nullHits(400, 20, 0.2), { resamples: 400 });
    expect(result.realRate).toBeCloseTo(0.6, 2);
    expect(result.nullRate).toBeCloseTo(0.2, 2);
    expect(result.ratio).toBeCloseTo(3, 1);
    expect(result.verdict).toBe('discriminates');
    expect(result.ci.low).toBeGreaterThan(1);
  });

  it('reports a detector noise produces MORE of', () => {
    // The row that makes the whole exercise worth doing. A detector can be deterministic, causal
    // and stable under perturbation and still find a pattern noise produces more readily than
    // markets do — and nothing else in this repository would notice.
    const result = compareRates(hits(400, 0.2), nullHits(400, 20, 0.6), { resamples: 400 });
    expect(result.ratio).toBeLessThan(1);
    expect(result.verdict).toBe('inverted');
    expect(result.ci.high).toBeLessThan(1);
  });

  it('reports a detector that cannot tell markets from noise', () => {
    const result = compareRates(hits(400, 0.4), nullHits(400, 20, 0.4), { resamples: 400 });
    expect(result.ratio).toBeCloseTo(1, 1);
    expect(result.verdict).toBe('no better than chance');
    expect(result.ci.low).toBeLessThanOrEqual(1);
    expect(result.ci.high).toBeGreaterThanOrEqual(1);
  });

  it('treats a detector that never fires on noise as unbounded rather than broken', () => {
    const result = compareRates(hits(200, 0.5), nullHits(200, 10, 0), { resamples: 200 });
    expect(result.ratio).toBe(Infinity);
    expect(result.verdict).toBe('discriminates');
  });
});

describe('counts and rates are different questions', () => {
  it('compares means for a count', () => {
    const real = Array.from({ length: 300 }, () => 10);
    const nulls = Array.from({ length: 300 }, () => Array.from({ length: 10 }, () => 5));
    const result = compareCounts(real, nulls, { resamples: 300 });
    expect(result.realRate).toBe(10);
    expect(result.nullRate).toBe(5);
    expect(result.ratio).toBe(2);
  });

  it('declines rather than dividing by nothing', () => {
    expect(compareRates([], [], { resamples: 10 }).verdict).toBe('no better than chance');
    expect(Number.isNaN(compareCounts([], [], { resamples: 10 }).ratio)).toBe(true);
  });

  it('is reproducible, because a published table has to be', () => {
    const a = compareRates(hits(200, 0.5), nullHits(200, 10, 0.3), { resamples: 200 });
    const b = compareRates(hits(200, 0.5), nullHits(200, 10, 0.3), { resamples: 200 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('the bootstrap resamples charts, not observations', () => {
  it('does not narrow the interval by adding draws to the same charts', () => {
    // A chart's twenty permutations are twenty views of one object. Treating them as twenty
    // independent observations would shrink the interval by √20 for free and turn every row of the
    // published table into a discovery.
    const few = compareRates(hits(120, 0.5), nullHits(120, 2, 0.3), { resamples: 600 });
    const many = compareRates(hits(120, 0.5), nullHits(120, 40, 0.3), { resamples: 600 });
    const width = (c: typeof few) => c.ci.high - c.ci.low;
    // Twenty times the null draws must not buy a materially tighter interval, because the number
    // of independent units did not change.
    expect(width(many)).toBeGreaterThan(width(few) * 0.5);
  });
});

describe('the GBM null is the weaker one, and behaves like it', () => {
  const bars = walk(120, 41);

  it('matches the volatility it was calibrated to', () => {
    const fake = gbmBars(bars, 9);
    const real = atr(bars)!;
    const simulated = atr(fake)!;
    // Same order of magnitude by construction; not equal, because the candle shapes are drawn
    // rather than reused.
    expect(simulated).toBeGreaterThan(real * 0.3);
    expect(simulated).toBeLessThan(real * 3);
  });

  it('is deterministic in its seed', () => {
    expect(gbmBars(bars, 9)).toEqual(gbmBars(bars, 9));
    expect(gbmBars(bars, 9)).not.toEqual(gbmBars(bars, 10));
  });

  it('produces bars that are bars', () => {
    for (const bar of gbmBars(bars, 3)) {
      expect(bar.h).toBeGreaterThanOrEqual(Math.max(bar.o, bar.c));
      expect(bar.l).toBeLessThanOrEqual(Math.min(bar.o, bar.c));
      expect(bar.l).toBeGreaterThan(0);
    }
  });
});

describe('the efficiency ratio cannot see a shuffle at all', () => {
  it('is exactly invariant under permutation of returns', () => {
    // Found while checking whether the null table was an artefact, and it is worth a test of its
    // own because §6 uses this statistic as its **trendiness** axis.
    //
    //   ER = |c_n − c_0| / Σ|c_i − c_{i−1}|
    //
    // The numerator is |Σr| and the denominator is Σ|r|. Both are sums over the same multiset
    // whatever order the returns arrive in, so the ratio is order-independent — *exactly*, not
    // approximately. It measures the composition of a set of returns, never their arrangement.
    const rng = mulberry32(5);
    const returns = Array.from({ length: 200 }, () => (rng() - 0.5) * 2);
    const build = (rs: readonly number[]) => {
      let price = 100;
      return [price, ...rs.map((r) => (price += r))];
    };
    const shuffled = (xs: readonly number[], seed: number) => {
      const r = mulberry32(seed);
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const base = efficiencyRatio(build(returns));
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(efficiencyRatio(build(shuffled(returns, seed)))).toBe(base);
    }
  });

  it('so it can never be evidence that a chart is doing something noise would not', () => {
    // The consequence, stated as a test so it is not rediscovered as a surprise. A trendiness axis
    // that a shuffle cannot move is a description, not a discriminator — and any theme gating on it
    // gets no discriminating power from that gate.
    const bars = walk(120, 8, 0.15);
    const real = efficiencyRatio(bars.map((b) => b.c));
    const permuted = efficiencyRatio(permuteBars(bars, 77).map((b) => b.c));
    // Not exactly equal here only because `permuteBars` shuffles gaps and intrabar geometry
    // independently, so close-to-close returns are recombined rather than reordered.
    expect(Math.abs(permuted - real)).toBeLessThan(0.1);
  });
});
