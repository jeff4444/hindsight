import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/core/random';
import {
  EULER_MASCHERONI,
  clusterResample,
  expectedMaxSharpe,
  hansenSPA,
  inverseNormal,
  probabilityOfBacktestOverfitting,
  rankDistribution,
  romanoWolfStepM,
  type EngineSeries,
} from '@/core/engines/significance';

/**
 * The statistics, held to known answers.
 *
 * A significance test is the one piece of code where a silent bug is indistinguishable from a
 * discovery — it returns a number either way, and the number is the claim. So none of these tests
 * check that a procedure *runs*. Each one plants an answer that is known in advance and checks the
 * procedure recovers it:
 *
 * - StepM rejects at roughly its nominal rate on pure noise, and finds an effect Bonferroni misses.
 * - SPA is near-uniform on noise, tiny on a planted winner, and unmoved by a hopeless engine.
 * - PBO averages a half on noise and zero on a dominant strategy.
 * - Ranks are stable for a dominant engine and meaningless for noise.
 *
 * Every generator below is seeded, so these are fixed measurements rather than samples that pass
 * four times in five. A change to any procedure moves them.
 */

/** Box–Muller on the project's seeded PRNG. Half the pairs are discarded; simpler, and cheap. */
function normals(seed: number): () => number {
  const rng = mulberry32(seed);
  return () => {
    const u = Math.max(1e-12, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

const CHARTS = 300;
/** Three charts per symbol — the corpus shape, which runs 1,000 charts over 314 symbols. */
const CLUSTERS = Array.from({ length: CHARTS }, (_, i) => Math.floor(i / 3));

/**
 * A synthetic roster.
 *
 * Engines share a common factor because the real ones do — they read the same charts, so a chart
 * that is kind to one is usually kind to all. That correlation is the whole reason StepM is here
 * instead of Bonferroni, so the fixtures have to carry it.
 */
function roster(lifts: number[], seed: number, rho = 0.8) {
  const z = normals(seed);
  const common = Array.from({ length: CHARTS }, () => z());
  const benchmark: EngineSeries = {
    name: 'ZERO',
    returns: Array.from({ length: CHARTS }, () => z()),
  };
  const engines: EngineSeries[] = lifts.map((lift, k) => ({
    name: `E${k}`,
    returns: Array.from(
      { length: CHARTS },
      (_, i) => rho * common[i] + Math.sqrt(1 - rho * rho) * z() + lift,
    ),
  }));
  return { engines, benchmark };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Bonferroni, built from the *same* bootstrap so the comparison is like-for-like.
 *
 * Only the critical value differs: the per-engine 1−α/N quantile instead of StepM's quantile of the
 * maximum. Any power difference is therefore attributable to the correction alone.
 */
function bonferroniRejects(
  engines: EngineSeries[],
  benchmark: EngineSeries,
  alpha: number,
  seed: number,
  resamples: number,
): boolean[] {
  const rng = mulberry32(seed);
  const differences = engines.map((e) => e.returns.map((r, i) => r - benchmark.returns[i]));
  const se = (xs: number[]) => {
    const m = mean(xs);
    return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) / xs.length);
  };
  const observed = differences.map((d) => mean(d) / se(d));
  const distributions = differences.map(() => [] as number[]);

  for (let r = 0; r < resamples; r++) {
    const indices = clusterResample(CLUSTERS, rng);
    differences.forEach((d, k) => {
      const drawn = indices.map((i) => d[i]);
      distributions[k].push((mean(drawn) - mean(d)) / se(drawn));
    });
  }

  return observed.map((statistic, k) => {
    const sorted = distributions[k].sort((a, b) => a - b);
    return statistic > sorted[Math.ceil((1 - alpha / engines.length) * (sorted.length - 1))];
  });
}

describe('the bootstrap resamples symbols, not charts', () => {
  it('carries every chart of a drawn symbol, or none of it', () => {
    // A resample that splits a cluster is not a cluster bootstrap. Each symbol's charts must appear
    // in whole multiples of its size.
    const clusters = [0, 0, 0, 1, 1, 2, 3, 3, 3, 3];
    const sizes = new Map<number, number>();
    clusters.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));

    const drawn = clusterResample(clusters, mulberry32(9));
    const counts = new Map<number, number>();
    for (const index of drawn) {
      const cluster = clusters[index];
      counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
    }
    for (const [cluster, count] of counts) {
      expect(count % sizes.get(cluster)!).toBe(0);
    }
    expect(drawn.length).toBeGreaterThanOrEqual(clusters.length);
  });

  it('widens the interval when charts from one symbol move together', () => {
    // The claim the file's header makes, checked rather than asserted. Eight charts per symbol, all
    // carrying the same value: resampling charts would treat them as eight independent draws and
    // report an interval √8 too narrow.
    const values = Array.from({ length: 40 }, (_, s) => normals(s + 1)());
    const returns = values.flatMap((v) => Array.from({ length: 8 }, () => v));
    const clusters = returns.map((_, i) => Math.floor(i / 8));

    const spread = (resample: (rng: () => number) => number[]) => {
      const rng = mulberry32(4242);
      const means = Array.from({ length: 400 }, () => mean(resample(rng).map((i) => returns[i])));
      const m = mean(means);
      return Math.sqrt(mean(means.map((x) => (x - m) ** 2)));
    };

    const byChart = spread((rng) =>
      Array.from({ length: returns.length }, () => Math.floor(rng() * returns.length)),
    );
    const bySymbol = spread((rng) => clusterResample(clusters, rng));

    // Exactly √8 ≈ 2.83 in the limit; the bound is loose enough to be about the structure, not luck.
    expect(bySymbol / byChart).toBeGreaterThan(2.2);
  });
});

describe('Romano–Wolf StepM', () => {
  const RESAMPLES = 300;

  it('rejects on pure noise at about its nominal rate', () => {
    // Family-wise error: over 40 rosters where no engine has any edge, the procedure should claim a
    // winner about one time in twenty. Every seed is fixed, so this is a measurement, not a sample.
    let familiesWithARejection = 0;
    for (let trial = 0; trial < 40; trial++) {
      const { engines, benchmark } = roster([0, 0, 0, 0], 1000 + trial);
      const results = romanoWolfStepM(engines, benchmark, CLUSTERS, {
        resamples: RESAMPLES,
        seed: 7 + trial,
      });
      if (results.some((result) => result.rejected)) familiesWithARejection += 1;
    }
    // Measured: 3/40. The bound allows for bootstrap noise without allowing a broken procedure.
    expect(familiesWithARejection / 40).toBeLessThanOrEqual(0.15);
  });

  it('finds a planted effect that Bonferroni misses', () => {
    // The reason for choosing it. The engines are correlated, so the maximum statistic has a much
    // tighter distribution than Bonferroni's independence assumption implies, and StepM spends less
    // of the error budget for the same protection.
    let stepM = 0;
    let bonferroni = 0;
    for (let trial = 0; trial < 30; trial++) {
      const { engines, benchmark } = roster([0.15, 0, 0, 0], 5000 + trial);
      if (
        romanoWolfStepM(engines, benchmark, CLUSTERS, { resamples: RESAMPLES, seed: 11 + trial })[0]
          .rejected
      ) {
        stepM += 1;
      }
      if (bonferroniRejects(engines, benchmark, 0.05, 11 + trial, RESAMPLES)[0]) bonferroni += 1;
    }
    // Measured: 14/30 against 10/30 on the same data, same bootstrap, same α.
    expect(stepM).toBeGreaterThan(bonferroni);
  });

  it('is one-sided — an engine that loses to the benchmark is never a discovery', () => {
    const { engines, benchmark } = roster([-1, -1, -1, -1], 31);
    const results = romanoWolfStepM(engines, benchmark, CLUSTERS, { resamples: RESAMPLES, seed: 3 });
    for (const result of results) {
      expect(result.rejected).toBe(false);
      expect(result.step).toBeNull();
      expect(result.meanDifference).toBeLessThan(0);
    }
  });

  it('steps down, rejecting the strongest first', () => {
    // The stepdown is the source of the extra power: once the leader is removed the next round's
    // critical value is drawn from a smaller family. So a weaker engine may be rejected at a later
    // step, and never at an earlier one than a stronger.
    const { engines, benchmark } = roster([1.2, 0.7, 0, 0], 77);
    const results = romanoWolfStepM(engines, benchmark, CLUSTERS, { resamples: 600, seed: 5 });
    const rejected = results.filter((result) => result.rejected);

    expect(rejected.length).toBeGreaterThanOrEqual(2);
    for (const a of rejected) {
      for (const b of rejected) {
        if (a.statistic > b.statistic) expect(a.step!).toBeLessThanOrEqual(b.step!);
      }
    }
    expect(results[2].rejected).toBe(false);
    expect(results[3].rejected).toBe(false);
  });

  it('reports the mean difference it tested, not the raw mean', () => {
    const { engines, benchmark } = roster([0.5], 12);
    const [result] = romanoWolfStepM(engines, benchmark, CLUSTERS, { resamples: 100, seed: 1 });
    const expected = mean(engines[0].returns.map((r, i) => r - benchmark.returns[i]));
    expect(result.meanDifference).toBeCloseTo(expected, 12);
    expect(result.name).toBe('E0');
  });
});

describe('Hansen SPA', () => {
  it('is near-uniform when nothing beats the benchmark', () => {
    const pValues: number[] = [];
    for (let trial = 0; trial < 30; trial++) {
      const { engines, benchmark } = roster([0, 0, 0, 0], 9000 + trial);
      pValues.push(hansenSPA(engines, benchmark, CLUSTERS, { resamples: 300, seed: 3 + trial }).pValue);
    }
    pValues.sort((a, b) => a - b);

    // Measured: median 0.44, one p-value under 0.05 in thirty. A uniform distribution is what
    // "the test is calibrated" looks like; a pile-up near zero would mean it manufactures winners.
    expect(pValues.filter((p) => p < 0.05).length).toBeLessThanOrEqual(3);
    expect(pValues[15]).toBeGreaterThan(0.2);
    expect(pValues[15]).toBeLessThan(0.8);
  });

  it('finds a planted winner and names it', () => {
    const { engines, benchmark } = roster([0.4, 0, 0, 0], 4242);
    const result = hansenSPA(engines, benchmark, CLUSTERS, { resamples: 500, seed: 5 });
    expect(result.pValue).toBeLessThan(0.01);
    expect(result.best).toBe('E0');
    expect(result.statistic).toBeGreaterThan(2);
  });

  it('is unmoved by a hopeless engine, which is why it is not the Reality Check', () => {
    // White's Reality Check recentres every model on its own mean, so a bad model drags the null
    // distribution up and buries a real winner. Hansen's recentring discards models that cannot
    // win. Our roster deliberately contains a faithful engine that fires 22 times, so this
    // property is load-bearing rather than academic.
    for (const seed of [11, 22, 33]) {
      const clean = roster([0.2, 0, 0], seed);
      const withJunk = roster([0.2, 0, 0, -3], seed);
      const a = hansenSPA(clean.engines, clean.benchmark, CLUSTERS, { resamples: 400, seed: 5 });
      const b = hansenSPA(withJunk.engines, withJunk.benchmark, CLUSTERS, { resamples: 400, seed: 5 });
      expect(b.best).toBe(a.best);
      expect(b.pValue).toBeCloseTo(a.pValue, 6);
    }
  });
});

describe('the probability of backtest overfitting', () => {
  const iid = (count: number, seed: number): EngineSeries[] => {
    const z = normals(seed);
    return Array.from({ length: count }, (_, k) => ({
      name: `E${k}`,
      returns: Array.from({ length: 320 }, () => z()),
    }));
  };

  it('averages a half when no engine has an edge', () => {
    // The definition: how often the in-sample winner lands below median out of sample. With no real
    // edge the crown is a coin flip, so PBO → ½. It is *not* ½ on any single corpus — one
    // realisation can put it anywhere — which is why this averages over twelve.
    const pbos = Array.from({ length: 12 }, (_, s) =>
      probabilityOfBacktestOverfitting(iid(4, 100 + s * 17)).pbo,
    );
    // Measured: 0.516.
    expect(mean(pbos)).toBeGreaterThan(0.35);
    expect(mean(pbos)).toBeLessThan(0.65);
  });

  it('is zero when one engine really is best', () => {
    const { engines } = roster([1.5, 0, 0, 0], 78);
    const result = probabilityOfBacktestOverfitting(engines);
    expect(result.pbo).toBe(0);
    expect(result.medianRank).toBe(1);
    // Sixteen blocks, every balanced partition, no sampling — so the answer has no variance.
    expect(result.splits).toBe(12870);
  });

  it('refuses rather than guessing when there is not enough data to split', () => {
    const short: EngineSeries[] = [
      { name: 'a', returns: [1, 2, 3] },
      { name: 'b', returns: [3, 2, 1] },
    ];
    expect(probabilityOfBacktestOverfitting(short).splits).toBe(0);
    expect(probabilityOfBacktestOverfitting(short).pbo).toBeNaN();
    expect(probabilityOfBacktestOverfitting([iid(1, 1)[0]]).splits).toBe(0);
  });
});

describe('the deflation annotation', () => {
  it('inverts the normal CDF at the textbook points', () => {
    expect(inverseNormal(0.975)).toBeCloseTo(1.959963985, 8);
    expect(inverseNormal(0.025)).toBeCloseTo(-1.959963985, 8);
    expect(inverseNormal(0.5)).toBeCloseTo(0, 12);
    expect(inverseNormal(0.001)).toBeCloseTo(-3.090232306, 7);
    expect(inverseNormal(0.999)).toBeCloseTo(3.090232306, 7);
    expect(inverseNormal(0)).toBeNaN();
    expect(inverseNormal(1)).toBeNaN();
  });

  it('says how high the best of N noise engines is expected to reach', () => {
    // The number that belongs beside the top row: with four engines, the best of four *skill-free*
    // engines is expected to clear zero by about one cross-strategy standard deviation.
    expect(expectedMaxSharpe(4)).toBeCloseTo(1.0521, 4);
    expect(expectedMaxSharpe(2)).toBeCloseTo(0.5198, 4);
    expect(expectedMaxSharpe(1)).toBe(0);
    for (let n = 2; n < 40; n++) {
      expect(expectedMaxSharpe(n + 1)).toBeGreaterThan(expectedMaxSharpe(n));
    }
    expect(EULER_MASCHERONI).toBeCloseTo(0.5772156649, 10);
  });
});

describe('rank distributions', () => {
  it('is a distribution — every engine places somewhere, every place is taken', () => {
    const { engines } = roster([0.3, 0.1, 0, -0.2], 5);
    const table = rankDistribution(engines, CLUSTERS, { resamples: 400, seed: 2 });

    expect(table).toHaveLength(4);
    for (const row of table) expect(mean(row) * row.length).toBeCloseTo(1, 9);
    for (let place = 0; place < 4; place++) {
      expect(table.reduce((sum, row) => sum + row[place], 0)).toBeCloseTo(1, 9);
    }
  });

  it('is stable for a dominant engine', () => {
    const { engines } = roster([1.5, 0, 0, 0], 78);
    const table = rankDistribution(engines, CLUSTERS, { resamples: 400, seed: 2 });
    expect(table[0][0]).toBe(1);
  });

  it('gives noise engines no rank at all', () => {
    // The point of publishing this instead of an ordering. Four engines that differ by nothing
    // still produce an ordering on every resample — and no engine holds a place.
    const { engines } = roster([0, 0, 0, 0], 77);
    const table = rankDistribution(engines, CLUSTERS, { resamples: 400, seed: 2 });
    for (const row of table) expect(Math.max(...row)).toBeLessThan(0.9);
  });
});
