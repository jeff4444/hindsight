/**
 * What every engine actually did, measured over the corpus.
 *
 * §5.6 refuses to let conviction be asserted — *"every other engine's conviction score would be
 * invented"* — and prescribes the remedy: *"replay every engine across the entire corpus and compute
 * its own base rates."* This file is that replay's output, committed as constants so it is
 * reviewable in a diff rather than buried in a table nobody reads.
 *
 * Regenerate with `npm run engines` after any change to `THRESHOLDS`, and bump `ENGINE_VERSION` with
 * it. A record measured under one set of numbers does not describe another (§12.4).
 *
 * ## The headline, put before the numbers rather than after
 *
 * **Every engine's mean R sits inside Engine Zero's band.** Nothing here beats a coin flip.
 *
 * That is not a disappointing result to be worked around; it is the same answer §13.9 already got
 * from the themes, arriving by an independent route, and it is what §2 promises the product will
 * demonstrate rather than assert: *"markets are noisy, edges are thin, and competent people
 * disagree."*
 *
 * ## Why the band is drawn at each engine's own sample size
 *
 * An engine that fires on 88 charts has **3.4×** the sampling error of a band computed over 1,000,
 * and one that fires on 22 has **6.7×**. The first version of this measurement printed n=88 point
 * estimates beside an n=1000 band, under which two engines appeared to beat the null. They do not.
 *
 * The band therefore resamples *n charts with replacement* and flips a coin on each — so it carries
 * both the coin's variance and the variance of **which charts an engine chose to fire on**. That
 * second part is deliberate: choosing where to trade is part of what an engine does, so the null it
 * is measured against has to be allowed to choose too.
 */

import type { EngineCode } from './contract';

export interface BaseRate {
  /** Charts on which the engine took a position. */
  n: number;
  /** Share of the corpus. */
  coverage: number;
  /** Share of its own trades that finished above zero. */
  winRate: number;
  /** Mean R over its own trades, on the static bracket. */
  meanR: number;
  /** Share reaching the take-profit. Zero for a conditional exit, which has no target. */
  targetRate: number;
  /** Engine Zero's 95% interval **at this engine's n**. */
  nullBand: { low: number; high: number };
}

/** The corpus this was measured on. A record does not transfer to a different one. */
export const MEASURED_OVER = { charts: 1000, thresholdHash: '1fc650fc' } as const;

/** The static bracket — the record comparable to a player's, and to the 98-cell achievable set. */
export const BRACKET: Record<EngineCode, BaseRate> = {
  CHANNEL: {
    n: 198,
    coverage: 0.198,
    winRate: 0.394,
    meanR: -0.027,
    targetRate: 0.374,
    nullBand: { low: -0.21, high: 0.165 },
  },
  REVERSION: {
    n: 22,
    coverage: 0.022,
    winRate: 0.5,
    meanR: 0.156,
    targetRate: 0.273,
    // The widest band on the roster, because 22 charts is the smallest sample. Connors' Rule 3 is
    // what reduces it to 22, and Rule 3 is also what makes the system work — so there is no version
    // of this engine that is both faithful and measurable on a corpus this size.
    nullBand: { low: -0.572, high: 0.492 },
  },
  REVERSION_H: {
    n: 88,
    coverage: 0.088,
    winRate: 0.42,
    meanR: 0.07,
    targetRate: 0.273,
    nullBand: { low: -0.29, high: 0.224 },
  },
  SWEEP: {
    n: 400,
    coverage: 0.4,
    // The busiest school on the roster by a distance, and the highest win rate — because its target
    // is the nearest opposing pool, which is often close. A 58% win rate at a sub-1R reward is what
    // that trade-off looks like, and the mean R says the two cancel almost exactly.
    winRate: 0.583,
    meanR: -0.008,
    targetRate: 0.583,
    nullBand: { low: -0.158, high: 0.106 },
  },
  PATTERN: {
    n: 32,
    coverage: 0.032,
    winRate: 0.469,
    meanR: -0.037,
    targetRate: 0.469,
    nullBand: { low: -0.429, high: 0.49 },
  },
  /**
   * **Zero.** Not a rounding, not a low number — the harmonics never completed.
   *
   * Carney's ratios at our published ±5% matched on **one** chart in 1,000, and that one was
   * rejected because its own AD retracement pointed the wrong way. The tolerance is not the cause: a
   * diagnostic sweep over the corpus found the median chart's best-fitting XABC misses by **82%**,
   * and even at ±20% — four times the published tolerance — only 17 charts in 1,000 would admit a
   * pattern at all.
   *
   * It stays on the roster and in the registered family. Dropping an engine because it returned an
   * unwelcome answer is the file-drawer problem, and the whole point of pre-registering the family
   * before the corpus was touched is that the family does not change afterwards. Its slot costs the
   * other engines a slightly more conservative correction, and that cost is part of having asked.
   */
  GEOMETRY: {
    n: 0,
    coverage: 0,
    winRate: 0,
    meanR: 0,
    targetRate: 0,
    nullBand: { low: 0, high: 0 },
  },
  TAPE: {
    n: 61,
    coverage: 0.061,
    winRate: 0.344,
    meanR: 0.048,
    targetRate: 0.344,
    nullBand: { low: -0.358, high: 0.327 },
  },
  ZERO: {
    n: 1000,
    coverage: 1,
    winRate: 0.327,
    meanR: -0.091,
    targetRate: 0.248,
    nullBand: { low: -0.103, high: 0.064 },
  },
};

/**
 * The school's own conditional exit, walked over the reveal.
 *
 * The number nobody else can produce, and the reason the corpus stores a one-minute path: the gap
 * between these rows and `BRACKET` is **the measured cost of forcing a school into a static
 * bracket**, rather than an assumption about it.
 *
 * It does not go the way intuition suggests. CHANNEL's trailing exit wins *less* often than our
 * fixed target (27.3% against 39.4%) and makes less (−0.074 against −0.027) — the Turtle exit is
 * built for a position held for months, and sixty candles is not months. Both REVERSION variants
 * invert: their native exit wins **more** often (54.5%) while making **less**, which is what taking
 * many small profits looks like when it is measured in R.
 */
export const NATIVE: Partial<Record<EngineCode, BaseRate>> = {
  CHANNEL: {
    n: 198,
    coverage: 0.198,
    winRate: 0.273,
    meanR: -0.074,
    targetRate: 0,
    nullBand: { low: -0.21, high: 0.165 },
  },
  REVERSION: {
    n: 22,
    coverage: 0.022,
    winRate: 0.545,
    meanR: -0.067,
    targetRate: 0,
    nullBand: { low: -0.572, high: 0.492 },
  },
  REVERSION_H: {
    n: 88,
    coverage: 0.088,
    winRate: 0.545,
    meanR: -0.026,
    targetRate: 0,
    nullBand: { low: -0.29, high: 0.224 },
  },
};

/**
 * How often the council has anything to say at all.
 *
 * Four more engines halved the silence — 76.6% to 39.7% — and **doubled the disagreement**, 5.2% to
 * 10.9%. That is the roster working as §5.5 intended: a spread of opinion needs opinions, and with
 * two engines there was usually only one on offer.
 *
 * Almost all of the new coverage is SWEEP, which takes a position on 40% of charts by itself. Read
 * the silence figure with that in mind: it fell because one engine is loose, not because six schools
 * suddenly agreed there was a trade.
 */
export const COUNCIL_COVERAGE = {
  /** No school took a position. Engine Zero is excluded — it always speaks, so it would mask this. */
  silent: 0.397,
  twoOrMoreSpoke: 0.168,
  disagreed: 0.109,
} as const;

/**
 * The corrected answer, from `npm run leaderboard` (§14.7).
 *
 * `BRACKET` above is a set of raw base rates, and raw base rates cannot say whether anything works.
 * These are the numbers that can, and they are committed here for the same reason as the rest of
 * this file: the UI must not be able to drift from the script that produced them.
 *
 * ## The result, which is not the one the roster was hoping for
 *
 * Measured two ways, because the two answer different questions and only one of them is about skill:
 *
 * - **Portfolio** — every engine against Engine Zero over all 1,000 charts, a pass scored as zero.
 *   All three schools clear the null. **So does a strategy that never trades**, by the same margin
 *   (+0.091R, t = 2.20), because Engine Zero loses money and anything trading less than it wins.
 * - **Paired** — every engine against Engine Zero's own outcome *on the charts the engine chose*.
 *   Coverage cancels; only selection is left. Every engine is **negative**, and Hansen's SPA over the
 *   whole roster returns p = 1.00.
 *
 * The ordering is noise too: PBO = 0.473 over all 12,870 balanced splits, and no engine holds any
 * rank in the bootstrap except Engine Zero holding last. So nothing here is ranked.
 */
export const EDGE = {
  charts: 1000,
  symbols: 314,
  resamples: 4000,
  trials: 8,
  /** The control: a strategy that never trades, tested in the same family as the schools. */
  abstain: { deltaVsZero: 0.0907, t: 2.199, beatsZero: true },
  /**
   * Paired against a coin flip on the same charts. No engine on the roster clears it.
   *
   * GEOMETRY's row is exactly zero because it never traded — it is, on this corpus, literally the
   * same object as the "never trade" control, and the two produce identical statistics everywhere.
   */
  paired: {
    CHANNEL: { delta: -0.007, t: -0.278, trades: 198 },
    REVERSION: { delta: -0.0006, t: -0.068, trades: 22 },
    REVERSION_H: { delta: -0.002, t: -0.13, trades: 88 },
    SWEEP: { delta: 0.034, t: 1.081, trades: 400 },
    PATTERN: { delta: 0.0026, t: 0.269, trades: 32 },
    GEOMETRY: { delta: 0, t: 0, trades: 0 },
    TAPE: { delta: -0.0166, t: -1.019, trades: 61 },
  },
  /** One test for the whole roster, asked once. */
  spa: { pValue: 0.561, best: 'Sweep' },
  /**
   * 0.826, and the number moved the wrong way when the roster grew.
   *
   * Above a half means the in-sample winner lands *below* median out of sample more often than
   * chance — picking the leader on past performance is worse than useless here, not merely
   * uninformative. Its median out-of-sample finish is 8th of 9.
   */
  pbo: 0.826,
  /** Best of eight skill-free engines is expected to reach this Sharpe. Observed best: 0.0177. */
  deflationFloor: 0.0403,
  observedBestSharpe: 0.0177,
} as const;

/**
 * Conviction, and the sentence that says where it came from.
 *
 * §5.5 requires "a conviction level, **and a statement of where that conviction number comes
 * from**". So this returns both, and the statement is never decoration — on this roster it is
 * usually the more informative half.
 *
 * The value is the engine's measured win rate. It is deliberately *not* rescaled, curved or
 * confidence-weighted into something that looks more decisive: a 39% win rate should read as 39%.
 *
 * An engine with no trades has no conviction to report and returns null rather than 0%, which would
 * read as "certain it loses" instead of "never fired". GEOMETRY is that engine.
 */
export function convictionFor(engine: EngineCode): { value: number; source: string } | null {
  const rate = BRACKET[engine];
  if (!rate || rate.n === 0) return null;

  const inside = rate.meanR >= rate.nullBand.low && rate.meanR <= rate.nullBand.high;
  return {
    value: rate.winRate,
    source:
      `${(rate.winRate * 100).toFixed(0)}% of ${rate.n} trades on this corpus` +
      (inside
        ? `, mean ${rate.meanR >= 0 ? '+' : ''}${rate.meanR.toFixed(3)}R — inside a coin flip's range at this sample size`
        : `, mean ${rate.meanR >= 0 ? '+' : ''}${rate.meanR.toFixed(3)}R — outside the null band`),
  };
}
