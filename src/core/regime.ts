/**
 * The two regime axes, and only those two.
 *
 * §6 Layer 2 fixes the roster and rejects the alternatives by name: "Two axes only: Kaufman
 * efficiency ratio for trendiness, realised volatility percentile against the instrument's
 * trailing year for volatility. Both are causal, bounded, zero-fit and explainable in one
 * sentence. ADX is double-smoothed and its thresholds have no derivation. The Hurst exponent
 * should not ship at all... A two-state hidden Markov model on returns almost always recovers a
 * volatility regime you can get free from the percentile."
 *
 * They live here rather than in Layer 2 because §6 Layer 0 makes chart selection depend on them:
 * "Charts are sampled by a published rule over the regime tags." Selection is Phase 0.5, so the
 * tags have to be too.
 *
 * Both functions are causal by interface — they are handed the past and cannot reach anything
 * else. tests/lookahead.test.ts holds them to that anyway.
 */

/* --------------------------------------------------------------- trendiness */

/**
 * Kaufman efficiency ratio: net distance travelled over total distance walked.
 *
 * One sentence: how much of the movement went somewhere. Bounded [0, 1], zero-fit, and computed
 * on the visible closes alone.
 */
export function efficiencyRatio(closes: readonly number[]): number {
  if (closes.length < 2) return 0;

  let walked = 0;
  for (let i = 1; i < closes.length; i++) walked += Math.abs(closes[i] - closes[i - 1]);
  if (walked === 0) return 0; // a flatline goes nowhere by walking nowhere

  return Math.abs(closes[closes.length - 1] - closes[0]) / walked;
}

/**
 * Efficiency-ratio buckets.
 *
 * The thresholds are anchored to a derivation rather than to taste. Over `n` bars a driftless
 * random walk has an expected efficiency ratio of about `1/√n`, which for the 80-candle lead-in
 * is ≈ 0.11. So 0.10 is "less directional than noise", and the bands above it are multiples of
 * that baseline rather than round numbers someone liked.
 *
 * §11.1 independently fixes the bottom of the range — "Chop — efficiency ratio below 0.2" — for
 * the official tape of that name, which spans the first two buckets here.
 */
export const ER_BUCKETS = ['chop', 'noise', 'directional', 'trend'] as const;
export type ErBucket = (typeof ER_BUCKETS)[number];

/** Random-walk expectation for the 80-bar lead-in, which is where the thresholds come from. */
export const ER_RANDOM_WALK_BASELINE = 1 / Math.sqrt(80);

export function erBucket(ratio: number): ErBucket {
  if (ratio < 0.1) return 'chop';
  if (ratio < 0.2) return 'noise';
  if (ratio < 0.35) return 'directional';
  return 'trend';
}

/* --------------------------------------------------------------- volatility */

/** Days in the realised-volatility estimate. */
export const VOL_WINDOW_DAYS = 7;

/** Days of history the percentile is ranked against — "the instrument's trailing year". */
export const VOL_LOOKBACK_DAYS = 365;

/** Standard deviation of the log returns across one window. */
function realisedVol(logReturns: readonly number[], from: number, to: number): number {
  const n = to - from;
  if (n < 2) return 0;

  let mean = 0;
  for (let i = from; i < to; i++) mean += logReturns[i];
  mean /= n;

  let sum = 0;
  for (let i = from; i < to; i++) {
    const d = logReturns[i] - mean;
    sum += d * d;
  }
  return Math.sqrt(sum / (n - 1));
}

/**
 * Where this instrument's current volatility sits within its own trailing year.
 *
 * `dailyCloses` must end at the last daily close **strictly before** the decision bar, and
 * nothing after it may be included — that is the whole causality claim, and it is why the caller
 * slices rather than this function taking an index into a longer series.
 *
 * Both sides of the comparison are the same statistic on the same timeframe: a 7-day realised
 * volatility, ranked against every 7-day realised volatility over the preceding 365 days. Mixing
 * an hourly measurement into a daily distribution would produce a number that looks like a
 * percentile and is not one.
 *
 * Returns null when the instrument has not traded long enough to have a trailing year, which is
 * §4.9's rule applied to the corpus: do not produce a number the sample does not support.
 */
export function volatilityPercentile(
  dailyCloses: readonly number[],
  windowDays: number = VOL_WINDOW_DAYS,
  lookbackDays: number = VOL_LOOKBACK_DAYS,
): number | null {
  const needed = lookbackDays + windowDays + 1;
  if (dailyCloses.length < needed) return null;

  const logReturns: number[] = [];
  for (let i = 1; i < dailyCloses.length; i++) {
    const prev = dailyCloses[i - 1];
    const curr = dailyCloses[i];
    if (!(prev > 0) || !(curr > 0)) return null;
    logReturns.push(Math.log(curr / prev));
  }

  const current = realisedVol(logReturns, logReturns.length - windowDays, logReturns.length);
  if (!Number.isFinite(current)) return null;

  // Every 7-day realised volatility observable in the trailing year, current one excluded so the
  // rank is against history rather than partly against itself.
  const history: number[] = [];
  const oldest = Math.max(0, logReturns.length - lookbackDays - windowDays);
  for (let end = oldest + windowDays; end < logReturns.length; end++) {
    history.push(realisedVol(logReturns, end - windowDays, end));
  }
  if (history.length === 0) return null;

  let below = 0;
  for (const value of history) if (value < current) below += 1;
  return below / history.length;
}

/**
 * Daily closes strictly before a moment.
 *
 * `volatilityPercentile` is causal by interface — it can only see what it is handed — which
 * moves the entire risk to the call site. A `<=` here instead of a `<` would feed the percentile
 * the decision bar's own day and nothing about the output would look wrong. So the slice lives
 * next to the function that consumes it, and the look-ahead suite tests it directly.
 */
export function closesStrictlyBefore(
  daily: readonly { t: number; c: number }[],
  timestampMs: number,
): number[] {
  const closes: number[] = [];
  for (const bar of daily) {
    if (bar.t >= timestampMs) break;
    closes.push(bar.c);
  }
  return closes;
}

export const VOL_BUCKETS = ['quiet', 'subdued', 'active', 'violent'] as const;
export type VolBucket = (typeof VOL_BUCKETS)[number];

/** Quartiles. Uniform per instrument by construction, which is what makes the grid fillable. */
export function volBucket(percentile: number): VolBucket {
  if (percentile < 0.25) return 'quiet';
  if (percentile < 0.5) return 'subdued';
  if (percentile < 0.75) return 'active';
  return 'violent';
}

/* -------------------------------------------------------------------- tags */

export interface Regime {
  efficiencyRatio: number;
  erBucket: ErBucket;
  /** Null when the instrument lacks a trailing year; such windows are not selectable. */
  volatilityPercentile: number | null;
  volBucket: VolBucket | null;
}

export function regimeOf(leadInCloses: readonly number[], dailyCloses: readonly number[]): Regime {
  const ratio = efficiencyRatio(leadInCloses);
  const percentile = volatilityPercentile(dailyCloses);

  return {
    efficiencyRatio: ratio,
    erBucket: erBucket(ratio),
    volatilityPercentile: percentile,
    volBucket: percentile === null ? null : volBucket(percentile),
  };
}

/** The 4 × 4 grid the corpus is stratified over. */
export function regimeCell(regime: Regime): string | null {
  return regime.volBucket === null ? null : `${regime.erBucket}/${regime.volBucket}`;
}

export const REGIME_CELLS: string[] = ER_BUCKETS.flatMap((er) =>
  VOL_BUCKETS.map((vol) => `${er}/${vol}`),
);
