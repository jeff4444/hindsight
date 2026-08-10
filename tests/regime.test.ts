import { describe, expect, it } from 'vitest';
import {
  ER_RANDOM_WALK_BASELINE,
  REGIME_CELLS,
  closesStrictlyBefore,
  efficiencyRatio,
  erBucket,
  regimeCell,
  regimeOf,
  volBucket,
  volatilityPercentile,
} from '@/core/regime';
import { mulberry32 } from '@/core/random';

describe('Kaufman efficiency ratio', () => {
  it('is 1 for a straight line — every step went somewhere', () => {
    expect(efficiencyRatio([100, 101, 102, 103, 104])).toBeCloseTo(1, 12);
    expect(efficiencyRatio([104, 103, 102, 101, 100])).toBeCloseTo(1, 12);
  });

  it('is 0 for a round trip — all that walking, nowhere to show for it', () => {
    expect(efficiencyRatio([100, 105, 100])).toBeCloseTo(0, 12);
  });

  it('is 0 for a flatline rather than dividing by zero', () => {
    expect(efficiencyRatio([100, 100, 100])).toBe(0);
    expect(efficiencyRatio([100])).toBe(0);
    expect(efficiencyRatio([])).toBe(0);
  });

  it('is bounded in [0, 1] on real-looking series', () => {
    const rng = mulberry32(4);
    for (let trial = 0; trial < 40; trial++) {
      const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 7) * 5 + rng() * 3);
      const ratio = efficiencyRatio(closes);
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
    }
  });

  it('lands near 1/√n on a random walk, which is where the thresholds come from', () => {
    // The bucket edges are anchored to this rather than chosen: over 80 bars a driftless walk
    // averages ≈ 0.11, so "chop" is defined as less directional than noise.
    const ratios: number[] = [];
    for (let seed = 0; seed < 60; seed++) {
      const rng = mulberry32(seed + 1);
      let price = 100;
      const closes = [price];
      for (let i = 0; i < 79; i++) {
        price *= 1 + (rng() - 0.5) * 0.02;
        closes.push(price);
      }
      ratios.push(efficiencyRatio(closes));
    }
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    expect(ER_RANDOM_WALK_BASELINE).toBeCloseTo(0.1118, 3);
    expect(mean).toBeGreaterThan(0.04);
    expect(mean).toBeLessThan(0.25);
  });

  it('buckets on the published edges', () => {
    expect(erBucket(0.05)).toBe('chop');
    expect(erBucket(0.1)).toBe('noise');
    expect(erBucket(0.19)).toBe('noise');
    expect(erBucket(0.2)).toBe('directional');
    expect(erBucket(0.34)).toBe('directional');
    expect(erBucket(0.35)).toBe('trend');
    expect(erBucket(1)).toBe('trend');
  });
});

describe('realised-volatility percentile', () => {
  /** Daily closes whose volatility can be dialled up or down over time. */
  function closes(count: number, volAt: (i: number) => number, seed = 9): number[] {
    const rng = mulberry32(seed);
    let price = 100;
    const out = [price];
    for (let i = 0; i < count; i++) {
      price *= 1 + (rng() - 0.5) * volAt(i);
      out.push(price);
    }
    return out;
  }

  it('refuses to answer without a trailing year (§4.9)', () => {
    // A full year of 7-day windows needs 365 + 7 returns, so 373 closes. One short is null
    // rather than a percentile computed against a partial year — the point of §4.9 is not to
    // produce a number the sample does not support.
    expect(volatilityPercentile(closes(100, () => 0.02))).toBeNull();
    expect(volatilityPercentile(closes(371, () => 0.02))).toBeNull(); // 372 closes
    expect(volatilityPercentile(closes(372, () => 0.02))).not.toBeNull(); // 373 closes
  });

  it('is bounded in [0, 1]', () => {
    const value = volatilityPercentile(closes(500, () => 0.02));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });

  it('reads high when the instrument has just become volatile', () => {
    // Quiet for a year, violent for the last week: the percentile should be near the top.
    const value = volatilityPercentile(closes(500, (i) => (i >= 493 ? 0.14 : 0.01)));
    expect(value).toBeGreaterThan(0.9);
  });

  it('reads low when it has just gone quiet', () => {
    const value = volatilityPercentile(closes(500, (i) => (i >= 493 ? 0.002 : 0.05)));
    expect(value).toBeLessThan(0.1);
  });

  it('is a percentile against the instrument itself, not an absolute level', () => {
    // The same shape scaled up tenfold is the same regime — that is the point of a percentile,
    // and it is what lets a 4-hour altcoin and BTC share one grid.
    const quiet = volatilityPercentile(closes(500, (i) => (i >= 493 ? 0.06 : 0.01), 3));
    const loud = volatilityPercentile(closes(500, (i) => (i >= 493 ? 0.6 : 0.1), 3));
    expect(quiet).toBeCloseTo(loud!, 6);
  });

  it('buckets into quartiles', () => {
    expect(volBucket(0.1)).toBe('quiet');
    expect(volBucket(0.25)).toBe('subdued');
    expect(volBucket(0.5)).toBe('active');
    expect(volBucket(0.99)).toBe('violent');
  });
});

describe('the slice that feeds it', () => {
  const daily = Array.from({ length: 20 }, (_, i) => ({ t: i * 86_400_000, c: 100 + i }));

  it('excludes the decision day itself', () => {
    expect(closesStrictlyBefore(daily, 5 * 86_400_000)).toEqual([100, 101, 102, 103, 104]);
  });

  it('returns nothing when there is no history', () => {
    expect(closesStrictlyBefore(daily, 0)).toEqual([]);
  });
});

describe('the regime grid', () => {
  it('is four by four', () => {
    expect(REGIME_CELLS).toHaveLength(16);
    expect(REGIME_CELLS[0]).toBe('chop/quiet');
    expect(REGIME_CELLS[15]).toBe('trend/violent');
  });

  it('tags a window with both axes', () => {
    const rng = mulberry32(12);
    const daily = Array.from({ length: 500 }, () => 0).reduce<number[]>((acc) => {
      const last = acc[acc.length - 1] ?? 100;
      acc.push(last * (1 + (rng() - 0.5) * 0.03));
      return acc;
    }, [100]);

    const regime = regimeOf(
      Array.from({ length: 80 }, (_, i) => 100 + i),
      daily,
    );
    expect(regime.erBucket).toBe('trend');
    expect(regime.volatilityPercentile).not.toBeNull();
    expect(regimeCell(regime)).toMatch(/^trend\//);
  });

  it('has no cell for a window whose instrument lacks a trailing year', () => {
    const regime = regimeOf([100, 101, 102], [100, 101]);
    expect(regime.volatilityPercentile).toBeNull();
    expect(regimeCell(regime)).toBeNull();
  });
});
