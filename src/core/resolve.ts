/**
 * Trade resolution against the stored lower-timeframe path.
 *
 * Scope §12.3 is unambiguous about why this exists: "If a single candle's high reaches the
 * target and its low reaches the stop, standard OHLC data cannot establish which came first.
 * v0.1 proposed adopting the pessimistic convention. v0.2 solves it rather than conventions
 * around it, because Hindsight is a scored competition and ambiguity here is not inaccuracy,
 * it is unfairness."
 *
 * So every trade resolves by walking the 1-minute path bar by bar. The published rules are in
 * docs/rules.md and must be kept in sync with this file.
 */

import type { Bar } from './bars';
import { RESOLVER_VERSION } from './versions';

export type Direction = 'long' | 'short';
export type Outcome = 'target' | 'stop' | 'timeout' | 'pass';

export interface Order {
  /** Fixed at the decision bar close (scope §4.2). The player does not choose it. */
  entry: number;
  stop: number;
  target: number;
}

/**
 * Transaction costs, in basis points of price.
 *
 * Zero in Phase 0. The parameter exists now because §7.5 is emphatic that a frictionless game
 * trains players toward tight stops and marginal setups that lose money net of costs, and
 * because retrofitting a cost model into a resolver whose outputs are already stored means
 * invalidating every stored result. The seam is free; the retrofit is not.
 */
export interface Costs {
  /** Full spread. Half is charged at entry and half at exit. */
  spreadBps: number;
  /** Additional adverse slippage charged on stop fills only. */
  stopSlippageBps: number;
}

export const NO_COSTS: Costs = { spreadBps: 0, stopSlippageBps: 0 };

export interface Resolution {
  outcome: Exclude<Outcome, 'pass'>;
  direction: Direction;
  /** Price actually paid or received on entry, after half the spread. */
  entryFill: number;
  /** Price actually received or paid on exit, after costs. */
  exitFill: number;
  /** Index into the lower-timeframe path at which the trade closed. */
  exitPathIndex: number;
  /** Index into the display-timeframe reveal bars at which the trade closed. */
  exitBarIndex: number;
  /** Initial risk per unit: |entryFill - stop|. The denominator of every R figure below. */
  riskPerUnit: number;
  /** Outcome divided by initial risk, in Van Tharp's sense (scope §4.1). */
  rMultiple: number;
  /** Maximum favourable excursion over the life of the trade, in R. */
  mfeR: number;
  /** Maximum adverse excursion over the life of the trade, in R. */
  maeR: number;
  /**
   * Maximum favourable excursion over the whole reveal window, in R, whether or not the trade
   * was still open. §4.6 wants the player shown "the managed ceiling they left behind"; for a
   * trade stopped out early, the trade-life MFE does not show it and this does.
   */
  windowMfeR: number;
  /** Maximum adverse excursion over the whole reveal window, in R. */
  windowMaeR: number;
  /**
   * True when stop and target were both touched inside a single lower-timeframe bar, so even
   * the 1-minute path cannot order them. §12.3.2: fall back to stop-first and flag the fill.
   * Flagged rounds are excluded from ranked play once ranked exists.
   */
  ambiguous: boolean;
  resolverVersion: string;
}

export class InvalidOrderError extends Error {}

/**
 * Direction is implied by which side of the entry the stop sits on, so the player never picks
 * "long" or "short" — they place two rails and the trade follows. Scope §2.1: "Every
 * competitor asks up or down. Direction is the least valuable part of a trade."
 */
export function directionOf(order: Order): Direction {
  return order.stop < order.entry ? 'long' : 'short';
}

/** Throws InvalidOrderError if the bracket is not coherent. */
export function validateOrder(order: Order): Direction {
  const { entry, stop, target } = order;

  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) {
    throw new InvalidOrderError('entry, stop and target must all be finite');
  }
  if (stop === entry) throw new InvalidOrderError('stop must not sit on the entry');
  if (target === entry) throw new InvalidOrderError('target must not sit on the entry');

  const direction = directionOf(order);
  if (direction === 'long' && target <= entry) {
    throw new InvalidOrderError('a long needs its target above the entry');
  }
  if (direction === 'short' && target >= entry) {
    throw new InvalidOrderError('a short needs its target below the entry');
  }

  return direction;
}

const bps = (value: number) => value / 10_000;

/**
 * Resolve one order against one lower-timeframe path.
 *
 * `path` begins at the first lower-timeframe bar after the decision bar and covers the whole
 * reveal window. `pathBarsPerDisplayBar` is the ratio between the two timeframes (60 for a
 * 1-minute path under 1-hour display bars) and is used only to report which display bar the
 * exit landed on.
 */
export function resolve(
  order: Order,
  path: Bar[],
  pathBarsPerDisplayBar: number,
  costs: Costs = NO_COSTS,
): Resolution {
  const direction = validateOrder(order);
  if (path.length === 0) throw new InvalidOrderError('cannot resolve against an empty path');

  const isLong = direction === 'long';
  const halfSpread = bps(costs.spreadBps) / 2;
  const slip = bps(costs.stopSlippageBps);

  // Buy the ask, sell the bid.
  const entryFill = isLong ? order.entry * (1 + halfSpread) : order.entry * (1 - halfSpread);
  const riskPerUnit = Math.abs(entryFill - order.stop);
  if (riskPerUnit === 0) throw new InvalidOrderError('initial risk cannot be zero');

  /** Convert a raw exit price into a fill, charging the exit half-spread adversely. */
  const exitAt = (raw: number, slipped: boolean): number => {
    const afterSlip = slipped ? (isLong ? raw * (1 - slip) : raw * (1 + slip)) : raw;
    return isLong ? afterSlip * (1 - halfSpread) : afterSlip * (1 + halfSpread);
  };

  let outcome: Exclude<Outcome, 'pass'> = 'timeout';
  let exitRaw = path[path.length - 1].c;
  let exitPathIndex = path.length - 1;
  let slipped = false;
  let ambiguous = false;

  // Excursions are tracked twice: once bounded by the exit, once across the whole window. For
  // a long the favourable extreme is the highest high; for a short it is the lowest low.
  let bestSeen = isLong ? -Infinity : Infinity;
  let worstSeen = isLong ? Infinity : -Infinity;
  let bestAtExit = bestSeen;
  let worstAtExit = worstSeen;
  let closed = false;

  for (let i = 0; i < path.length; i++) {
    const bar = path[i];

    if (isLong) {
      bestSeen = Math.max(bestSeen, bar.h);
      worstSeen = Math.min(worstSeen, bar.l);
    } else {
      bestSeen = Math.min(bestSeen, bar.l);
      worstSeen = Math.max(worstSeen, bar.h);
    }

    if (closed) continue;

    bestAtExit = bestSeen;
    worstAtExit = worstSeen;

    // A gap through a level fills at the open, not at the level (§12.3.4). Checked before the
    // intrabar range, because an open beyond the level means the level was never traded.
    const gappedStop = isLong ? bar.o <= order.stop : bar.o >= order.stop;
    const gappedTarget = isLong ? bar.o >= order.target : bar.o <= order.target;

    if (gappedStop) {
      outcome = 'stop';
      exitRaw = bar.o;
      exitPathIndex = i;
      slipped = true;
      closed = true;
      continue;
    }
    if (gappedTarget) {
      outcome = 'target';
      exitRaw = bar.o;
      exitPathIndex = i;
      closed = true;
      continue;
    }

    // Stops and targets trigger on the wick, not the close.
    const touchedStop = isLong ? bar.l <= order.stop : bar.h >= order.stop;
    const touchedTarget = isLong ? bar.h >= order.target : bar.l <= order.target;

    if (touchedStop && touchedTarget) {
      // Residual ambiguity at 1-minute resolution. §12.3.2: stop-first, and flag it — never a
      // proximity heuristic, which §12.3.3 rejects for handing the trader the benefit of the
      // doubt on exactly the bars where it matters.
      outcome = 'stop';
      exitRaw = order.stop;
      exitPathIndex = i;
      slipped = true;
      ambiguous = true;
      closed = true;
      continue;
    }
    if (touchedStop) {
      outcome = 'stop';
      exitRaw = order.stop;
      exitPathIndex = i;
      slipped = true;
      closed = true;
      continue;
    }
    if (touchedTarget) {
      outcome = 'target';
      exitRaw = order.target;
      exitPathIndex = i;
      closed = true;
    }
  }

  const exitFill = exitAt(exitRaw, slipped);
  const gross = isLong ? exitFill - entryFill : entryFill - exitFill;

  const excursionR = (price: number) =>
    (isLong ? price - entryFill : entryFill - price) / riskPerUnit;

  return {
    outcome,
    direction,
    entryFill,
    exitFill,
    exitPathIndex,
    exitBarIndex: Math.floor(exitPathIndex / pathBarsPerDisplayBar),
    riskPerUnit,
    rMultiple: gross / riskPerUnit,
    mfeR: excursionR(bestAtExit),
    maeR: excursionR(worstAtExit),
    windowMfeR: excursionR(bestSeen),
    windowMaeR: excursionR(worstSeen),
    ambiguous,
    resolverVersion: RESOLVER_VERSION,
  };
}
