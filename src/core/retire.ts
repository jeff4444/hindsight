/**
 * §8.3 — automatic retirement of coin flips.
 *
 * > **The mechanism** — Once a chart's deviation is low, compute the correlation between player
 * > rating and achieved percentile across the population. A chart on which strong and weak players
 * > score identically is a coin flip and is automatically retired from ranked play.
 * >
 * > …In trading terms the retired set will be dominated by gap-driven news events, halts and
 * > resumptions, and low-liquidity noise — charts where the visible information genuinely does not
 * > determine the answer.
 *
 * The document gives the mechanism and no statistics. Three things have to be decided, and the
 * second one is the difference between a working filter and one that quietly destroys the corpus.
 *
 * ## 1. Spearman, not Pearson
 *
 * Three reasons, in order of force. It is **invariant to the score map**, so a `SCORE_MAP_VERSION`
 * bump does not force every retirement verdict to be re-adjudicated. The percentile is **clumped** —
 * roughly half the 98-cell grid stops out at exactly −1R, so a stop-out lands near the same
 * percentile on nearly every chart and Pearson would be dominated by that point mass and by the
 * thin 8R tail. And the relationship is **monotone but not linear**: skill to percentile is
 * logistic-shaped and compressive at both ends.
 *
 * ## 2. It is an equivalence test, not a significance test
 *
 * "This chart is a coin flip" is the **null**, and a null cannot be accepted. A naive
 * `|rho| < threshold ⇒ retire` inverts the burden of proof and retires charts for the crime of
 * having a small sample: at n = 60, a genuinely discriminating chart at rho = 0.38 falls inside a
 * 0.10 band about 1.7% of the time, which over a 1000-chart corpus is ~17 good charts destroyed by
 * chance alone.
 *
 * So: retire only when the confidence interval lies **entirely inside** the equivalence region
 * (TOST). The failure mode is then the correct one — too little data means keep the chart. The
 * asymmetry demands it: retiring a good chart destroys content permanently, while keeping a coin
 * flip merely adds noise the rating system already absorbs.
 *
 * ## 3. Range restriction is real and unequal
 *
 * §8.5's matchmaking serves each chart a narrow slice of the rating distribution, and a chart at
 * the edge of the difficulty range sees a narrower slice than one in the middle. That attenuates
 * rho unequally across the corpus, which would retire hard and easy charts preferentially. Corrected
 * with Thorndike Case II, and refused outright when the served range is too narrow to judge.
 *
 * Pure and I/O-free.
 */

/** The effect size below which a chart is considered not to discriminate. */
export const RETIRE_RHO_MIN = 0.2;
/** Below this the equivalence test can never conclude, so it is not attempted. */
export const RETIRE_MIN_N = 400;
/** One-sided each way, giving a 90% interval. */
export const RETIRE_ALPHA = 0.05;
/** Refuse to judge a chart whose served rating spread is under half the population's. */
export const RETIRE_MIN_SPREAD_RATIO = 0.5;

export interface Attempt {
  /** The player's rating **at the time of the attempt**, never their current one. */
  rating: number;
  percentile: number;
}

export type Verdict = 'keep' | 'retire' | 'defer' | 'review';

export interface RetirementAssessment {
  verdict: Verdict;
  n: number;
  /** Observed Spearman rho. */
  rho: number;
  /** Corrected for range restriction, when a correction was possible. */
  rhoCorrected: number;
  ci: { low: number; high: number };
  reason: string;
}

/** Mid-ranks, so ties do not bias the correlation. */
export function rank(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const mid = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k].index] = mid;
    i = j + 1;
  }
  return ranks;
}

export function pearson(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

export function spearman(xs: readonly number[], ys: readonly number[]): number {
  return pearson(rank(xs), rank(ys));
}

const atanh = (r: number) => 0.5 * Math.log((1 + r) / (1 - r));
const tanh = (z: number) => (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1);

/**
 * Fisher-z interval for Spearman's rho.
 *
 * The standard error carries Bonett–Wright's 1.06 factor: Spearman's sampling variance exceeds
 * Pearson's, and using Pearson's `1/sqrt(n-3)` would make the interval too narrow and retire more
 * charts than the stated alpha.
 */
export function rhoInterval(rho: number, n: number, alpha = RETIRE_ALPHA): { low: number; high: number } {
  if (n < 4) return { low: -1, high: 1 };
  const clamped = Math.min(0.999999, Math.max(-0.999999, rho));
  const se = 1.06 / Math.sqrt(n - 3);
  const z = zCritical(alpha);
  return { low: tanh(atanh(clamped) - z * se), high: tanh(atanh(clamped) + z * se) };
}

/** One-sided normal critical value. Only the handful of alphas anyone actually uses. */
function zCritical(alpha: number): number {
  if (alpha <= 0.005) return 2.576;
  if (alpha <= 0.01) return 2.326;
  if (alpha <= 0.025) return 1.96;
  if (alpha <= 0.05) return 1.645;
  return 1.282;
}

/**
 * Thorndike Case II: what the correlation would have been over the full population.
 *
 * `served` is the sd of the ratings this chart actually saw; `population` is the sd of the whole
 * pool. Without this, matchmaking makes edge-of-the-range charts look like coin flips because
 * nobody diverse ever played them.
 */
export function correctForRestriction(rho: number, served: number, population: number): number {
  if (served <= 0 || population <= 0) return rho;
  const ratio = population / served;
  const numerator = rho * ratio;
  const denominator = Math.sqrt(1 + rho * rho * (ratio * ratio - 1));
  return Math.min(0.999, Math.max(-0.999, numerator / denominator));
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * The verdict on one chart.
 *
 * `populationSd` is the rating spread of the whole player pool, used only to detect and correct
 * range restriction.
 */
export function assess(
  attempts: readonly Attempt[],
  populationSd: number,
  options: { rhoMin?: number; minN?: number; alpha?: number } = {},
): RetirementAssessment {
  const rhoMin = options.rhoMin ?? RETIRE_RHO_MIN;
  const minN = options.minN ?? RETIRE_MIN_N;
  const alpha = options.alpha ?? RETIRE_ALPHA;
  const n = attempts.length;

  const ratings = attempts.map((a) => a.rating);
  const percentiles = attempts.map((a) => a.percentile);
  const rho = n >= 2 ? spearman(ratings, percentiles) : 0;

  const served = standardDeviation(ratings);
  const restricted = populationSd > 0 && served > 0 && served < populationSd * RETIRE_MIN_SPREAD_RATIO;
  const rhoCorrected = restricted ? rho : correctForRestriction(rho, served, populationSd);
  const ci = rhoInterval(rho, n, alpha);

  if (n < minN) {
    return {
      verdict: 'keep',
      n,
      rho,
      rhoCorrected,
      ci,
      reason: `only ${n} attempts; the equivalence test cannot conclude below ${minN}, and the safe direction is to keep the chart`,
    };
  }

  if (restricted) {
    return {
      verdict: 'defer',
      n,
      rho,
      rhoCorrected,
      ci,
      reason: 'the served rating range is too narrow to judge — a chart nobody diverse has played cannot be assessed',
    };
  }

  // A chart on which weak players do better still discriminates; it just inverts. That is far more
  // likely a defect — a mis-signed mirror, a mislabelled regime — than a real phenomenon, and
  // auto-retiring it would hide the bug rather than surface it.
  if (ci.high < -rhoMin) {
    return {
      verdict: 'review',
      n,
      rho,
      rhoCorrected,
      ci,
      reason: 'weak players reliably outscore strong ones here, which is more likely a defect than a chart',
    };
  }

  if (ci.low > -rhoMin && ci.high < rhoMin) {
    return {
      verdict: 'retire',
      n,
      rho,
      rhoCorrected,
      ci,
      reason: `the 90% interval for rho lies entirely inside ±${rhoMin}: strong and weak players score alike`,
    };
  }

  return {
    verdict: 'keep',
    n,
    rho,
    rhoCorrected,
    ci,
    reason: 'the interval reaches outside the equivalence region, so the chart is not shown to be a coin flip',
  };
}
