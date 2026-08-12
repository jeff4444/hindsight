/**
 * Calibration — the one thing this product trains that has evidence behind it.
 *
 * §4.7: *"Players stake a probability on each trade and are scored with a proper scoring rule,
 * producing a calibration curve over time."* It was a side meter in v0.1 and is promoted here for a
 * reason worth stating plainly:
 *
 * > In the Good Judgment Project a probabilistic-reasoning module that **lasted less than one hour**
 * > improved Brier scores by **6 to 11% over the control condition**, and the benefit persisted
 * > across multiple years of the tournament.
 *
 * Set that against everything else on offer. §14.7 could not separate a single trading school from a
 * coin flip on the charts it chose. §13.8 found nine geometric detectors of ten no better than a
 * shuffle. **Calibration is the only place in this product where "this is trainable" is a citation
 * rather than a hope**, which is why §4.7 says it converts the claim "learn to read price action"
 * — indefensible — into "get calibrated about uncertain outcomes, and see the curve".
 *
 * ## Which of the scope's two calibration modes this is
 *
 * §10.1 describes a different mechanic: draw a box, at a fixed 80%. `docs/phase-5-research.md` §2.2
 * establishes that **it cannot be scored by any proper rule as written** — it fixes the probability
 * and lets the player choose the *event*, so the widest box always wins and nothing charges for
 * width. Repairing it needs Winkler's interval score on a scalar outcome, which "stays inside the
 * box over N bars" is not.
 *
 * This file is §4.7's version: the **event is fixed and the player chooses the probability**, which
 * is the arrangement that makes honesty optimal. It rides the bracket the player already places.
 *
 * ## The event, and why it is "finishes in profit"
 *
 * Not "hits target before stop": a timeout is neither, and a scoring rule needs an event that always
 * resolves. The question asked is whether the trade ends above zero **net of costs** — the same
 * number §16.1 scores everything else on, so a player is forecasting the thing they are graded on
 * rather than a proxy for it.
 *
 * ## What a calibrated but unskilled forecaster looks like
 *
 * Measured over all 98,000 enumerated brackets in the corpus, net of costs: **a bracket finishes in
 * profit 39.2% of the time.** So someone with no view at all, saying 39% on every chart, scores a
 * Brier of **0.2384** — and that, not zero, is the number to beat. Saying 50% every time scores
 * 0.2500; saying 100% every time scores 0.6076.
 *
 * The base rate is not constant across charts — it runs from about 30% at the tenth percentile to
 * 50% at the ninetieth — so there is genuine chart-to-chart signal for a forecaster to resolve. A
 * flat 39% is the floor, not the ceiling.
 */

/** Frozen, on the §14 pattern: these choices decide what every curve ever shown looks like. */
export const CALIBRATION_SPEC = {
  /** Ten buckets of ten points. The convention in the forecasting literature. */
  bins: 10,
  /**
   * Forecasts before a curve is drawn at all.
   *
   * A calibration curve is ten proportions, and ten proportions over twenty forecasts is ten pieces
   * of noise arranged to look like a diagnosis. Same floor §16.3 uses for the regime cells and §17.4
   * for the style fingerprint, and the same refusal: below it, nothing is shown rather than
   * something hedged.
   */
  minForecasts: 30,
  /**
   * The share of brackets that finish in profit, over the whole corpus net of costs.
   *
   * The climatology a forecast is measured against. Published rather than computed per player,
   * because a player's own base rate moves as they get better and a reference that moves with the
   * thing it references is not a reference.
   */
  baseRate: 0.392,
} as const;

export interface Forecast {
  /** What the player said, in [0, 1]. */
  stated: number;
  /** What happened. True if the trade finished above zero, net of costs. */
  hit: boolean;
}

/**
 * The Brier score of one forecast: the squared error of a probability.
 *
 * Proper, which is the whole point — the expected score is minimised by stating your true belief, so
 * there is no way to game it by shading up or down. Lower is better; 0 is perfect, 1 is maximally
 * wrong, and 0.25 is what you get by saying 50% every time.
 */
export function brier(stated: number, hit: boolean): number {
  return (stated - (hit ? 1 : 0)) ** 2;
}

const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Mean Brier over a history. */
export function brierScore(forecasts: readonly Forecast[]): number {
  return mean(forecasts.map((f) => brier(f.stated, f.hit)));
}

/**
 * Skill against the base rate, not against zero.
 *
 * A Brier of 0.22 sounds poor and is in fact better than the climatology it is measured against. The
 * skill score says so directly: **positive means better than saying 39.2% every time**, zero means
 * exactly as good, negative means worse. Same shape as every other comparison in this project — a
 * number is meaningless until it is put beside the null that makes it interpretable.
 */
export function skillScore(forecasts: readonly Forecast[], base = CALIBRATION_SPEC.baseRate): number | null {
  if (forecasts.length === 0) return null;
  const reference = base * (1 - base);
  if (reference === 0) return null;
  return 1 - brierScore(forecasts) / reference;
}

export interface Bucket {
  /** Lower and upper edge of the bin, in probability. */
  from: number;
  to: number;
  count: number;
  /** Mean of what was said in this bin, and the share that actually happened. */
  stated: number;
  observed: number;
}

/**
 * The curve: what you said against what happened, in ten buckets.
 *
 * Empty buckets are returned rather than dropped. A player who never says anything below 50% has a
 * shape to their forecasting, and silently omitting the bins they avoid would hide it — the gaps are
 * part of the diagnosis.
 */
export function calibrationCurve(
  forecasts: readonly Forecast[],
  bins = CALIBRATION_SPEC.bins,
): Bucket[] {
  const buckets: Forecast[][] = Array.from({ length: bins }, () => []);
  for (const forecast of forecasts) {
    const clamped = Math.min(Math.max(forecast.stated, 0), 1);
    // The top edge belongs to the last bucket rather than opening an eleventh.
    const index = Math.min(bins - 1, Math.floor(clamped * bins));
    buckets[index].push(forecast);
  }

  return buckets.map((bucket, i) => ({
    from: i / bins,
    to: (i + 1) / bins,
    count: bucket.length,
    stated: mean(bucket.map((f) => f.stated)),
    observed: bucket.length === 0 ? 0 : bucket.filter((f) => f.hit).length / bucket.length,
  }));
}

export interface Decomposition {
  /** How far the curve sits from the diagonal. Lower is better; this is *calibration*. */
  reliability: number;
  /** How far predictions move away from the base rate and are right to. Higher is better. */
  resolution: number;
  /** The irreducible variance of the outcome itself. Nothing a forecaster does changes it. */
  uncertainty: number;
  /** reliability − resolution + uncertainty, which must equal the Brier score. */
  brier: number;
}

/**
 * Murphy's decomposition, which is what makes the curve diagnostic rather than decorative.
 *
 * `BS = reliability − resolution + uncertainty`, exactly. It separates two different ways of being
 * good, and a product that reports only the Brier cannot tell a player which one they lack:
 *
 * - **Reliability** is whether 70% means 70%. It is the thing an hour of training moves, and the
 *   thing the curve draws.
 * - **Resolution** is whether you say different numbers on different charts *and are right to*. A
 *   perfectly calibrated forecaster who says 39.2% on every chart has zero resolution and has
 *   learned nothing about any individual chart.
 * - **Uncertainty** is the outcome's own variance and belongs to the corpus, not the player.
 *
 * The identity is asserted in the tests, which is the strongest available check that the bucketing
 * and the score agree with each other.
 */
export function decompose(
  forecasts: readonly Forecast[],
  bins = CALIBRATION_SPEC.bins,
): Decomposition | null {
  if (forecasts.length === 0) return null;

  const n = forecasts.length;
  const observedOverall = forecasts.filter((f) => f.hit).length / n;
  const buckets = calibrationCurve(forecasts, bins).filter((bucket) => bucket.count > 0);

  const reliability = buckets.reduce(
    (sum, bucket) => sum + (bucket.count / n) * (bucket.stated - bucket.observed) ** 2,
    0,
  );
  const resolution = buckets.reduce(
    (sum, bucket) => sum + (bucket.count / n) * (bucket.observed - observedOverall) ** 2,
    0,
  );
  const uncertainty = observedOverall * (1 - observedOverall);

  return { reliability, resolution, uncertainty, brier: brierScore(forecasts) };
}

/**
 * The sentence, or null when the history cannot support one.
 *
 * Deliberately reports *both* halves of the decomposition, because they fail differently and the
 * advice differs. Over-confidence and no-opinion are opposite problems and a single Brier cannot
 * distinguish them.
 */
export function describe(forecasts: readonly Forecast[]): string | null {
  if (forecasts.length < CALIBRATION_SPEC.minForecasts) return null;
  const parts = decompose(forecasts);
  const skill = skillScore(forecasts);
  if (!parts || skill === null) return null;

  const said = mean(forecasts.map((f) => f.stated));
  const happened = forecasts.filter((f) => f.hit).length / forecasts.length;
  const gap = said - happened;

  const direction =
    Math.abs(gap) < 0.02
      ? 'your stated confidence matches what happened'
      : gap > 0
        ? `you are ${(gap * 100).toFixed(0)} points over-confident`
        : `you are ${(-gap * 100).toFixed(0)} points under-confident`;

  return (
    `Over ${forecasts.length} forecasts, ${direction}. ` +
    `Brier ${parts.brier.toFixed(3)} against ${(CALIBRATION_SPEC.baseRate * (1 - CALIBRATION_SPEC.baseRate)).toFixed(3)} ` +
    `for always saying the base rate — a skill score of ${skill >= 0 ? '+' : ''}${skill.toFixed(3)}.`
  );
}
