/**
 * Channels: Theil–Sen slope with a residual-quantile width.
 *
 * §6 keeps the L∞ linear programme as an idea and does not ship it as the default, and the reason
 * is worth restating because "parameter-free" reads like an unalloyed virtue:
 *
 * > The LP is the Chebyshev formulation — three variables, 2n constraints, O(n) expected, provably
 * > tightest, parameter-free. But parameter-free hides a trap: an LP optimum sits at a vertex, so
 * > the channel is determined by **exactly three bars** and its breakdown point is **zero** — one
 * > bad print sets it. Worse, with four or more residuals tied at ±t, which is routine on
 * > tick-quantised data, the optimum is not unique and **the answer depends on the solver's
 * > pivoting rule**; two clients could return different channels for identical input, which is a
 * > determinism bug in a shared-state game.
 *
 * Theil–Sen has a 29.3% breakdown point, is pure order statistics so it is bit-reproducible with no
 * solver at all, and has one interpretable parameter. The L∞ channel is deferred; `docs/rules.md`
 * records it as deferred rather than rejected, because "tightest containing channel" is a genuinely
 * different object that some engine may want later.
 *
 * **The width is vertical, never perpendicular.** The classic computational-geometry width of a
 * point set is Euclidean, but a chart's axes are incommensurate — x in bars, y in ticks. Rescale
 * the price unit and the width-minimising slab *rotates*, so the answer would depend on the aspect
 * ratio of the user's window. A channel that changes when you resize the browser is not a fact
 * about the market.
 *
 * Every order statistic used here has its tie rule and its interpolation rule written down. That is
 * not pedantry: three different things ship under the name "Silverman's rule" and differ by up to
 * 18%, and R alone offers nine definitions of a quantile. A named rule from a library is a
 * determinism bug waiting for a dependency bump.
 */

import type { Bar } from '../bars';
import { causal, type Causal } from '../causal';

export interface Channel {
  /** Price change per bar. */
  slope: number;
  /** Fitted value at bar 0. */
  intercept: number;
  /** Vertical offset from the fit to the upper rail. */
  upperOffset: number;
  /** Vertical offset from the fit to the lower rail. Negative. */
  lowerOffset: number;
  /** Bars the fit was computed over. */
  bars: number;
}

/**
 * The share of bars the rails contain.
 *
 * The one parameter this module admits to having. 0.9 leaves a decile outside on each tail
 * combined, which is what a reader means by "the channel" — a band the price mostly lives in, not
 * an envelope stretched by its single worst print. Published rather than tuned.
 */
export const CHANNEL_CONTAINMENT = 0.9;

/**
 * Median with the tie rule stated: an even-length sample takes the mean of its two central order
 * statistics. Does not mutate the input.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Quantile by linear interpolation between order statistics — R's type 7, numpy's default.
 *
 * Pinned explicitly, because it is exactly the kind of thing that is silently different between two
 * implementations of the same published rule.
 */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const position = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * Theil–Sen slope: the median of every pairwise slope.
 *
 * The naive O(n²) enumeration, deliberately. The longest series any tier serves is 360 bars, which
 * is 64,620 pairs — microseconds — and the O(n log n) algorithms buy nothing here while costing the
 * property that matters most, which is that this function is obviously the definition.
 */
export function theilSenSlope(values: readonly number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      slopes.push((values[j] - values[i]) / (j - i));
    }
  }
  return median(slopes);
}

/**
 * Fit a channel over `bars`.
 *
 * The trend is fitted on closes, because a close is the price the market agreed on and a wick is
 * the price it rejected. The rails are then set from highs and lows, so the band contains the
 * candles rather than merely their bodies — a channel drawn round closes leaves half the wicks
 * outside it and no reader would accept it.
 *
 * Returns null below three bars, where a slope is not a slope.
 */
export function fitChannel(
  bars: readonly Bar[],
  containment: number = CHANNEL_CONTAINMENT,
): Causal<Channel> | null {
  if (bars.length < 3) return null;

  const closes = bars.map((bar) => bar.c);
  const slope = theilSenSlope(closes);

  // The Theil–Sen intercept is the median of the residuals about the slope — the standard
  // completion of the estimator, and again pure order statistics.
  const intercept = median(closes.map((close, i) => close - slope * i));

  const fitted = (i: number) => intercept + slope * i;
  const upperResiduals = bars.map((bar, i) => bar.h - fitted(i));
  const lowerResiduals = bars.map((bar, i) => bar.l - fitted(i));

  // Containment is split evenly between the tails, so the rails are symmetric in *coverage* even
  // when the residuals are not symmetric in size.
  const tail = (1 - Math.min(1, Math.max(0, containment))) / 2;

  return causal<Channel>(
    {
      slope,
      intercept,
      upperOffset: quantile(upperResiduals, 1 - tail),
      lowerOffset: quantile(lowerResiduals, tail),
      bars: bars.length,
    },
    bars.length - 1,
    bars.length - 1,
  );
}

/** The three rail prices at a given bar index. */
export function railsAt(channel: Channel, index: number): {
  upper: number;
  mid: number;
  lower: number;
} {
  const mid = channel.intercept + channel.slope * index;
  return { upper: mid + channel.upperOffset, mid, lower: mid + channel.lowerOffset };
}
