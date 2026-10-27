/**
 * The numbers a trading statement prints, and the two benchmarks the review holds a session up
 * against.
 *
 * Money is micro-USDT throughout; returns are fractions.
 */

import type { Bar } from '../bars';
import { commission, halfSpread, type FeeSchedule } from './costs';
import type { RoundTrip } from './types';

export interface Drawdown {
  /** Largest peak-to-trough fall, as a fraction of the peak. */
  fraction: number;
  /** The same fall in micro-USDT. */
  amount: number;
}

/** Worst peak-to-trough fall over a sequence of equity values. */
export function maxDrawdown(points: readonly number[]): Drawdown {
  let peak = -Infinity;
  let fraction = 0;
  let amount = 0;
  for (const value of points) {
    peak = Math.max(peak, value);
    if (peak > 0) {
      const fall = peak - value;
      if (fall > amount) amount = fall;
      fraction = Math.max(fraction, fall / peak);
    }
  }
  return { fraction, amount };
}

/** Share of round trips that made money after fees. Null with no trips. */
export function winRate(trips: readonly RoundTrip[]): number | null {
  if (trips.length === 0) return null;
  return trips.filter((trip) => trip.net > 0).length / trips.length;
}

/** Gross profit over gross loss, after fees. Null when nothing lost (or nothing traded). */
export function profitFactor(trips: readonly RoundTrip[]): number | null {
  let won = 0;
  let lost = 0;
  for (const trip of trips) {
    if (trip.net > 0) won += trip.net;
    else lost -= trip.net;
  }
  if (lost === 0) return null;
  return won / lost;
}

export interface Benchmark {
  side: 'long' | 'short';
  /** Minute index of the entry close (−1 is the decision close) and of the exit close. */
  entryAt: number;
  exitAt: number;
  /** Ticks. */
  entryPrice: number;
  exitPrice: number;
  /** After spread and both commissions, as a fraction of the notional. */
  returnPct: number;
  /** P&L on `notional`, micro-USDT. */
  pnl: number;
}

/** Closes from the decision bar (index −1) through the tape. */
function closes(refClose: number, tape: readonly Bar[]): number[] {
  return [refClose, ...tape.map((bar) => bar.c)];
}

function priced(
  side: 'long' | 'short',
  entryIdx: number,
  exitIdx: number,
  entry: number,
  exit: number,
  notional: number,
  fees: FeeSchedule,
): Benchmark {
  const gross = side === 'long' ? exit / entry - 1 : 1 - exit / entry;
  const rate = (2 * fees.takerBps) / 10_000;
  const pnl = Math.round(notional * gross) - commission(notional, fees.takerBps) - commission(Math.round(notional * (exit / entry)), fees.takerBps);
  return {
    side,
    entryAt: entryIdx - 1,
    exitAt: exitIdx - 1,
    entryPrice: entry,
    exitPrice: exit,
    returnPct: gross - rate,
    pnl,
  };
}

/** Buy at the decision close, sell at the last close, both at market. */
export function buyAndHold(refClose: number, tape: readonly Bar[], notional: number, fees: FeeSchedule): Benchmark {
  const series = closes(refClose, tape);
  const first = series[0];
  const last = series[series.length - 1];
  return priced('long', 0, series.length - 1, first + halfSpread(first, fees), last - halfSpread(last, fees), notional, fees);
}

/**
 * The best single round trip anyone could have made with market orders at minute closes: the
 * "best in hindsight", in dollars. One pass, keeping the cheapest entry seen so far.
 *
 * It is achievable rather than theoretical — every price in it was a close, crossed at the spread
 * — and so it is a ceiling a trader can be measured against without being measured against a
 * fantasy.
 */
export function bestRoundTrip(
  side: 'long' | 'short',
  refClose: number,
  tape: readonly Bar[],
  notional: number,
  fees: FeeSchedule,
): Benchmark | null {
  const series = closes(refClose, tape);
  if (series.length < 2) return null;
  const ask = (p: number) => p + halfSpread(p, fees);
  const bid = (p: number) => p - halfSpread(p, fees);

  let bestRatio = -Infinity;
  let pick: [number, number] = [0, 1];
  // Long: maximise bid(exit) / ask(entry). Short: maximise bid(entry) / ask(exit).
  let anchorIdx = 0;
  let anchor = side === 'long' ? ask(series[0]) : bid(series[0]);
  for (let j = 1; j < series.length; j++) {
    const ratio = side === 'long' ? bid(series[j]) / anchor : anchor / ask(series[j]);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      pick = [anchorIdx, j];
    }
    const candidate = side === 'long' ? ask(series[j]) : bid(series[j]);
    if (side === 'long' ? candidate < anchor : candidate > anchor) {
      anchor = candidate;
      anchorIdx = j;
    }
  }
  const [i, j] = pick;
  const entry = side === 'long' ? ask(series[i]) : bid(series[i]);
  const exit = side === 'long' ? bid(series[j]) : ask(series[j]);
  return priced(side, i, j, entry, exit, notional, fees);
}
