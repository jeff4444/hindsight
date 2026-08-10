/**
 * Average True Range, Wilder's smoothing.
 *
 * Scope §3.1 makes the ATR badge the one piece of information that is never hidden at any
 * tier: "A player who does not know the instrument's typical range cannot place a stop that
 * is neither noise-adjacent nor absurd. Hiding it does not test skill; it randomises the
 * result." So this number is displayed on every chart, and it must be causal — computed from
 * the lead-in window only, never touching a bar the player cannot see.
 */

import type { Bar } from './bars';

export const ATR_PERIOD = 14;

/**
 * True range of `bar` given the previous bar's close.
 *
 * `prevClose` is null for the first bar of a series, where true range degenerates to the
 * bar's own range.
 */
export function trueRange(bar: Bar, prevClose: number | null): number {
  const hl = bar.h - bar.l;
  if (prevClose === null) return hl;
  return Math.max(hl, Math.abs(bar.h - prevClose), Math.abs(bar.l - prevClose));
}

/**
 * ATR over `bars`, seeded with a simple mean of the first `period` true ranges and then
 * smoothed by Wilder's recursion. Returns the final value.
 *
 * Callers must pass only bars that were visible at the decision point. Returns null when the
 * series is too short to support the period, in keeping with §4.9: do not produce a number
 * the sample does not support.
 */
export function atr(bars: Bar[], period: number = ATR_PERIOD): number | null {
  if (bars.length < period + 1) return null;

  const ranges: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    ranges.push(trueRange(bars[i], i === 0 ? null : bars[i - 1].c));
  }

  // Seed on ranges[1..period]; ranges[0] has no previous close and is not comparable.
  let value = 0;
  for (let i = 1; i <= period; i++) value += ranges[i];
  value /= period;

  for (let i = period + 1; i < ranges.length; i++) {
    value = (value * (period - 1) + ranges[i]) / period;
  }

  return value;
}
