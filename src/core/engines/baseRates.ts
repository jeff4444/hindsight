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
export const MEASURED_OVER = { charts: 1000, thresholdHash: 'd034e8b2' } as const;

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

/** How often the council has anything to say at all. */
export const COUNCIL_COVERAGE = {
  /** No school took a position. Engine Zero is excluded — it always speaks, so it would mask this. */
  silent: 0.766,
  twoOrMoreSpoke: 0.067,
  disagreed: 0.052,
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
  /** The control: a strategy that never trades, tested in the same family as the schools. */
  abstain: { deltaVsZero: 0.0907, t: 2.199, beatsZero: true },
  /** Paired against a coin flip on the same charts. Negative for every engine on the roster. */
  paired: {
    CHANNEL: { delta: -0.007, t: -0.278, trades: 198 },
    REVERSION: { delta: -0.0006, t: -0.068, trades: 22 },
    REVERSION_H: { delta: -0.002, t: -0.13, trades: 88 },
  },
  /** One test for the whole roster, asked once. */
  spa: { pValue: 1.0, best: 'Reversion' },
  pbo: 0.473,
  /** Best of four skill-free engines is expected to reach this Sharpe. Observed best: 0.0177. */
  deflationFloor: 0.0429,
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
 */
export function convictionFor(engine: EngineCode): { value: number; source: string } | null {
  const rate = BRACKET[engine];
  if (!rate) return null;

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
