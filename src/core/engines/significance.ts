/**
 * Does any engine beat the null? The machinery that is allowed to answer.
 *
 * §5.6 promises a leaderboard and §7.3 promises to publish engine track records. 3a produced the
 * raw base rates. This file is what stands between those numbers and a *claim*, and it exists
 * because we have already watched the naive version fail: §13.9 ran twelve comparisons, found one
 * result significant at 95%, and watched it vanish under correction.
 *
 * Four procedures, each answering a different question, and none of them optional.
 *
 * ## The unit of observation, decided before anything else
 *
 * Engines abstain on different charts — the council is silent on 76.6% of them — so there is no
 * common set of trades to compare. **Every engine is therefore given a full-length vector over all
 * charts: its R where it traded, and zero where it passed.**
 *
 * That is the portfolio construction, and it is the one that answers "which of these would you
 * rather have been running". It is deliberately *not* the mean over an engine's own trades, which
 * answers "when it trades, how good is it" — a different and much easier question, and the one under
 * which a strategy that trades twice a decade looks superb. Abstention earns zero here, which is
 * exactly what abstention earns.
 *
 * ## Why the bootstrap resamples symbols rather than charts
 *
 * The corpus holds 1,000 windows drawn from 314 instruments, up to eight per instrument. Two
 * windows from the same symbol are not independent draws — they share a market, a tick regime and
 * often an era. Resampling charts would treat them as independent and shrink every interval.
 *
 * So the bootstrap resamples **whole symbols with replacement**, carrying all of a symbol's charts
 * together. It is the cluster bootstrap, and it is what the research meant by "block by
 * instrument/time if any windows overlap".
 */

import { mulberry32 } from '../random';

export interface EngineSeries {
  name: string;
  /** One entry per chart: the engine's R, or zero on a chart it passed. */
  returns: number[];
}

/** Which cluster each chart belongs to. Same length as every `returns` array. */
export type Clusters = number[];

const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function standardError(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(variance / n);
}

/**
 * Indices for one cluster-bootstrap resample.
 *
 * Symbols are drawn with replacement until the sample is at least as large as the original; a
 * drawn symbol contributes all of its charts. The resulting sample is not exactly n, which is
 * correct — cluster sizes vary, and forcing it to n would bias toward the smaller clusters.
 */
export function clusterResample(clusters: Clusters, rng: () => number): number[] {
  const groups = new Map<number, number[]>();
  clusters.forEach((cluster, index) => {
    const list = groups.get(cluster);
    if (list) list.push(index);
    else groups.set(cluster, [index]);
  });

  const keys = [...groups.keys()];
  const out: number[] = [];
  while (out.length < clusters.length) {
    out.push(...(groups.get(keys[Math.floor(rng() * keys.length)]) as number[]));
  }
  return out;
}

/* ------------------------------------------------------- Romano–Wolf StepM */

export interface StepMResult {
  name: string;
  /** Mean of the engine's returns minus the benchmark's, per chart. */
  meanDifference: number;
  statistic: number;
  /** Rejected at the family-wise level — i.e. this engine beats the benchmark. */
  rejected: boolean;
  /** The step at which it was rejected. Null if it never was. */
  step: number | null;
}

/**
 * Romano & Wolf's stepwise multiple test (2005).
 *
 * The primary per-engine test, and it is chosen over Bonferroni for a reason that matters here: the
 * engines read the *same charts*, so their results are strongly correlated, and Bonferroni assumes
 * they are not. Bonferroni therefore spends far more of the error budget than it needs to and is
 * strictly less powerful. StepM bootstraps the joint distribution of the maximum statistic, so the
 * correlation is used rather than ignored, while still controlling the family-wise error rate.
 *
 * One-sided throughout: the question is whether an engine *beats* the benchmark, and an engine that
 * loses to a coin flip is not a discovery in need of protection.
 */
export function romanoWolfStepM(
  engines: readonly EngineSeries[],
  benchmark: EngineSeries,
  clusters: Clusters,
  options: { resamples?: number; alpha?: number; seed?: number } = {},
): StepMResult[] {
  const resamples = options.resamples ?? 2000;
  const alpha = options.alpha ?? 0.05;
  const rng = mulberry32(options.seed ?? 0x5715e9);

  const differences = engines.map((engine) =>
    engine.returns.map((r, i) => r - benchmark.returns[i]),
  );
  const observed = differences.map((d) => {
    const se = standardError(d);
    return se > 0 ? mean(d) / se : 0;
  });

  // Bootstrap the *centred* statistics. Centring on the observed mean is what imposes the null:
  // under it, every engine's expected difference from the benchmark is zero.
  const samples: number[][] = [];
  for (let r = 0; r < resamples; r++) {
    const indices = clusterResample(clusters, rng);
    samples.push(
      differences.map((d) => {
        const drawn = indices.map((i) => d[i]);
        const se = standardError(drawn);
        return se > 0 ? (mean(drawn) - mean(d)) / se : 0;
      }),
    );
  }

  const results: StepMResult[] = engines.map((engine, k) => ({
    name: engine.name,
    meanDifference: mean(differences[k]),
    statistic: observed[k],
    rejected: false,
    step: null,
  }));

  // The stepdown. Each round takes the maximum statistic over the hypotheses still standing, gets
  // its critical value from the bootstrap maximum over the *same* set, and rejects everything above
  // it. Removing rejected hypotheses is what makes each subsequent round easier to pass — the gain
  // over a single-step procedure, and the reason this can find what Bonferroni cannot.
  let remaining = results.map((_, k) => k);
  let step = 1;

  while (remaining.length > 0) {
    const maxima = samples
      .map((sample) => Math.max(...remaining.map((k) => sample[k])))
      .sort((a, b) => a - b);
    const critical = maxima[Math.min(maxima.length - 1, Math.ceil((1 - alpha) * (maxima.length - 1)))];

    const knocked = remaining.filter((k) => observed[k] > critical);
    if (knocked.length === 0) break;

    for (const k of knocked) {
      results[k].rejected = true;
      results[k].step = step;
    }
    remaining = remaining.filter((k) => !knocked.includes(k));
    step += 1;
  }

  return results;
}

/* --------------------------------------------------------------- Hansen SPA */

export interface SpaResult {
  /** The best engine's studentised excess over the benchmark. */
  statistic: number;
  /** Probability of seeing a maximum this large when no engine beats the benchmark. */
  pValue: number;
  best: string;
}

/**
 * Hansen's test for Superior Predictive Ability (2005).
 *
 * The headline question, asked once: **does the best engine beat Engine Zero?** One test for the
 * whole roster, which is the right shape — asking it per engine and reporting the smallest p-value
 * is the data-snooping this file exists to prevent.
 *
 * Preferred over White's Reality Check because Reality Check loses power badly when poor models sit
 * in the pool, and ours are deliberately in it: a roster containing a faithful engine that fires 22
 * times is exactly the case Reality Check handles worst. Hansen's recentring discards models that
 * are hopelessly worse than the benchmark rather than letting them drag the null distribution.
 */
export function hansenSPA(
  engines: readonly EngineSeries[],
  benchmark: EngineSeries,
  clusters: Clusters,
  options: { resamples?: number; seed?: number } = {},
): SpaResult {
  const resamples = options.resamples ?? 2000;
  const rng = mulberry32(options.seed ?? 0x5a5a);
  const n = benchmark.returns.length;

  const differences = engines.map((engine) =>
    engine.returns.map((r, i) => r - benchmark.returns[i]),
  );
  const means = differences.map(mean);
  const sds = differences.map((d) => {
    const se = standardError(d);
    return se > 0 ? se * Math.sqrt(d.length) : 0;
  });

  const studentised = means.map((m, k) => (sds[k] > 0 ? (Math.sqrt(n) * m) / sds[k] : 0));
  const statistic = Math.max(0, ...studentised);
  const bestIndex = studentised.indexOf(Math.max(...studentised));

  // Hansen's recentring: a model whose mean is far enough below zero is treated as having no chance
  // and is recentred to zero rather than to its own mean. The threshold is his, and it is what
  // separates SPA from Reality Check.
  const threshold = means.map((m, k) => {
    const limit = -Math.sqrt((sds[k] ** 2 / n) * 2 * Math.log(Math.log(Math.max(3, n))));
    return m >= limit ? m : 0;
  });

  let atLeastAsLarge = 0;
  for (let r = 0; r < resamples; r++) {
    const indices = clusterResample(clusters, rng);
    const maxima = differences.map((d, k) => {
      const drawn = indices.map((i) => d[i]);
      const se = standardError(drawn);
      const sd = se > 0 ? se * Math.sqrt(drawn.length) : 0;
      return sd > 0 ? (Math.sqrt(drawn.length) * (mean(drawn) - threshold[k])) / sd : 0;
    });
    if (Math.max(0, ...maxima) >= statistic) atLeastAsLarge += 1;
  }

  return {
    statistic,
    pValue: atLeastAsLarge / resamples,
    best: engines[bestIndex]?.name ?? '—',
  };
}

/* ------------------------------------------------------------ PBO via CSCV */

export interface PboResult {
  /** Probability that the in-sample winner lands below median out of sample. */
  pbo: number;
  splits: number;
  /** Median out-of-sample rank of the in-sample winner, 1 = best. */
  medianRank: number;
}

/** Every way to choose `k` of `n` block indices. */
function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const current: number[] = [];
  const walk = (start: number) => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < n; i++) {
      current.push(i);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

/**
 * The probability of backtest overfitting, by combinatorially symmetric cross-validation.
 *
 * Bailey, Borwein, López de Prado & Zhu. The question none of the other tests ask: **does the crown
 * hold?** Split the corpus into blocks, take every balanced train/test partition, pick the winner
 * in-sample, and see where it lands out of sample. If the in-sample winner is below median out of
 * sample half the time, the leaderboard's ordering is noise however impressive its top row looks.
 *
 * With sixteen blocks that is 12,870 partitions, which is cheap and exhaustive — no sampling, so no
 * seed and no variance in the answer.
 */
export function probabilityOfBacktestOverfitting(
  engines: readonly EngineSeries[],
  options: { blocks?: number } = {},
): PboResult {
  const blocks = options.blocks ?? 16;
  const n = engines[0]?.returns.length ?? 0;
  if (engines.length < 2 || n < blocks * 2) {
    return { pbo: NaN, splits: 0, medianRank: NaN };
  }

  const size = Math.floor(n / blocks);
  const partitions = combinations(blocks, blocks / 2);
  const ranks: number[] = [];

  for (const train of partitions) {
    const inTrain = new Set(train);
    const scoreOver = (wanted: boolean) =>
      engines.map((engine) => {
        const values: number[] = [];
        for (let b = 0; b < blocks; b++) {
          if (inTrain.has(b) !== wanted) continue;
          values.push(...engine.returns.slice(b * size, (b + 1) * size));
        }
        return mean(values);
      });

    const inSample = scoreOver(true);
    const outSample = scoreOver(false);

    const winner = inSample.indexOf(Math.max(...inSample));
    // Rank of the in-sample winner among the out-of-sample scores, 1 = best.
    const rank = 1 + outSample.filter((score) => score > outSample[winner]).length;
    ranks.push(rank);
  }

  ranks.sort((a, b) => a - b);
  const median = (engines.length + 1) / 2;
  return {
    pbo: ranks.filter((rank) => rank > median).length / ranks.length,
    splits: ranks.length,
    medianRank: ranks[Math.floor(ranks.length / 2)],
  };
}

/* ------------------------------------------------- the deflation annotation */

/** Inverse standard normal CDF. Acklam's rational approximation; accurate to ~1e-9. */
export function inverseNormal(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  const a = [-39.696830286653757, 220.9460984245205, -275.92851044696869, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.476098798224058, 161.58583685804089, -155.69897985988661, 66.80131188771972, -13.280681552885721];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.32246712907003983, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;

  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - low) return -inverseNormal(1 - p);

  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * The expected maximum Sharpe ratio when **no** strategy has any skill, in units of the
 * cross-strategy standard deviation.
 *
 * Bailey & López de Prado. `E[max] ≈ (1−γ)·Z⁻¹(1−1/N) + γ·Z⁻¹(1−1/(Ne))` with γ the Euler–Mascheroni
 * constant. The number belongs on the leaderboard because it is the honest reading of a top row:
 * with four engines, the best of four *pure noise* engines is expected to clear zero by this much.
 */
export const EULER_MASCHERONI = 0.5772156649015329;

export function expectedMaxSharpe(trials: number): number {
  if (trials < 2) return 0;
  return (
    (1 - EULER_MASCHERONI) * inverseNormal(1 - 1 / trials) +
    EULER_MASCHERONI * inverseNormal(1 - 1 / (trials * Math.E))
  );
}

/* ------------------------------------------------------- rank distributions */

/**
 * How stable is the leaderboard's ordering?
 *
 * The research is blunt that this matters more than the ordering itself: *"Over six noisy engines
 * ranks are extremely unstable; a single ordering is the most misleading thing we could ship."*
 *
 * Returns, for each engine, the share of bootstrap resamples in which it finished in each place. An
 * engine that is first 30% of the time and last 25% of the time has no rank, and printing one for
 * it would be the misleading artefact.
 */
export function rankDistribution(
  engines: readonly EngineSeries[],
  clusters: Clusters,
  options: { resamples?: number; seed?: number } = {},
): number[][] {
  const resamples = options.resamples ?? 2000;
  const rng = mulberry32(options.seed ?? 0x4a4a);
  const counts = engines.map(() => new Array<number>(engines.length).fill(0));

  for (let r = 0; r < resamples; r++) {
    const indices = clusterResample(clusters, rng);
    const scores = engines.map((engine) => mean(indices.map((i) => engine.returns[i])));
    const order = scores
      .map((score, k) => ({ score, k }))
      .sort((a, b) => b.score - a.score);
    order.forEach((entry, place) => {
      counts[entry.k][place] += 1;
    });
  }

  return counts.map((row) => row.map((count) => count / resamples));
}
