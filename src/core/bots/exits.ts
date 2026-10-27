/**
 * How each school leaves a trade.
 *
 * Moved here from `scripts/engines.ts`, where it lived as a measurement helper, and corrected on
 * the way. Two of its rules read the wrong bars:
 *
 * - **The Turtle exit compared a close to a window that included its own bar.** "Exit on the
 *   opposite 10-bar extreme" means the low of the ten bars *before* the one being traded. The old
 *   window ended at the current bar, and a close can never sit below its own bar's low, so the
 *   exit almost never fired: what `baseRates.ts` publishes as Channel's native exit is mostly "2N
 *   stop or the end of the window". Here the extreme is the prior bars', and it is used the way the
 *   Turtles used it, as a stop that trails — broken intrabar, on the minute path.
 * - **Connors' 5-bar average was taken over the reveal only**, so it ignored the closes before the
 *   entry and could not exit at all in the first four bars. Here it is taken over the full history.
 *
 * Both rules read only bars that have closed, which `tests/bots.test.ts` checks against a mutated
 * future.
 */

import type { Bar } from '../bars';
import type { ConditionalExit, Verdict } from '../engines/contract';
import { TAPE } from '../engines/tape';

/**
 * The trailing level for an `opposite-extreme` exit after the last bar in `bars` has closed: the
 * lowest low (for a long) of the last `n` closed bars. A break of it on the next bar is the exit.
 */
export function trailingExtreme(bars: readonly Bar[], n: number, long: boolean): number | null {
  if (bars.length < n) return null;
  const window = bars.slice(bars.length - n);
  return long ? Math.min(...window.map((b) => b.l)) : Math.max(...window.map((b) => b.h));
}

/** Simple average of the last `period` closes, or null without enough of them. */
export function closingAverage(bars: readonly Bar[], period: number): number | null {
  if (bars.length < period) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) sum += bars[i].c;
  return sum / period;
}

/** Connors: leave a long when the close is above the short average (and a short below it). */
export function closedBeyondAverage(bars: readonly Bar[], period: number, long: boolean): boolean {
  const average = closingAverage(bars, period);
  if (average === null) return false;
  const close = bars[bars.length - 1].c;
  return long ? close > average : close < average;
}

/** Williams: leave when the tape prints a signal against the position. */
export function opposingSignal(bars: Bar[], atr: number, long: boolean): boolean {
  const verdict = TAPE.read({ bars, entry: bars[bars.length - 1].c, atr, seed: 0 });
  return verdict.direction !== null && verdict.direction !== (long ? 'long' : 'short');
}

export interface NativeOutcome {
  r: number;
  won: boolean;
  /** Index into `reveal` of the bar the trade left on. */
  exitBar: number;
  reason: 'stop' | 'exit' | 'timeout';
}

/**
 * A verdict's native exit walked over hourly bars, for the offline base-rate measurement. The
 * live bots do this on the minute path instead (`runner.ts`); this keeps the script's hourly
 * approximation but with the corrected windows.
 *
 * The stop is checked first on every bar, the pessimistic reading §12.3.2 uses. For the Turtle
 * exit the stop trails up to the prior bars' extreme, never down.
 */
export function walkNativeExit(verdict: Verdict, entry: number, history: readonly Bar[], reveal: readonly Bar[]): NativeOutcome | null {
  const exit: ConditionalExit | null = verdict.exit;
  if (!exit || !verdict.bracket || verdict.direction === null) return null;
  const long = verdict.direction === 'long';
  const risk = Math.abs(entry - verdict.bracket.stop);
  if (!(risk > 0)) return null;

  let stop = verdict.bracket.stop;
  const seen: Bar[] = [...history];
  const rOf = (price: number) => (long ? price - entry : entry - price) / risk;

  for (let i = 0; i < reveal.length; i++) {
    const bar = reveal[i];
    if (exit.kind === 'opposite-extreme') {
      const trail = trailingExtreme(seen, exit.bars, long);
      if (trail !== null) stop = long ? Math.max(stop, trail) : Math.min(stop, trail);
    }
    if (long ? bar.l <= stop : bar.h >= stop) {
      const fill = long ? Math.min(bar.o, stop) : Math.max(bar.o, stop);
      const r = rOf(fill);
      return { r, won: r > 0, exitBar: i, reason: 'stop' };
    }
    seen.push(bar);
    if (exit.kind === 'close-beyond-ma' && closedBeyondAverage(seen, exit.period, long)) {
      const r = rOf(bar.c);
      return { r, won: r > 0, exitBar: i, reason: 'exit' };
    }
  }
  const last = reveal[reveal.length - 1];
  const r = rOf(last.c);
  return { r, won: r > 0, exitBar: reveal.length - 1, reason: 'timeout' };
}
