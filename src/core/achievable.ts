/**
 * Layer 1 — the achievable set.
 *
 * §4 opens with the reason this exists: a single round's outcome is mostly luck, so any system
 * that rewards realised profit teaches the player that reckless trades work whenever they happen
 * to print. Every competitor in the category has that bug.
 *
 * The fix is to score against what the chart itself allowed. §4.2:
 *
 * > Because every player receives the identical future path, this is unnecessary: the achievable
 * > set is finite and can be enumerated exactly. [...] The result is the **exact empirical
 * > distribution of achievable outcomes**, not an estimate of it. No sampling error, perfectly
 * > reproducible, and defensible under scrutiny.
 *
 * Two consequences worth keeping in view. A percentile computed this way is meaningful with zero
 * other players, because the comparison is against the path rather than against a population. And
 * because it is enumeration rather than simulation, the same chart yields the same distribution
 * forever — which §6 notes "matters enormously when leaderboards are involved".
 *
 * Everything here is derived from the reveal path, so **the whole module is future data**. It is
 * as dangerous as the reveal bars themselves and travels under the same rule (§12.1): computed
 * offline, stored, and released only after an order is committed.
 */

import type { Bar } from './bars';
import { toTick } from './normalize';
import {
  NO_COSTS,
  resolve,
  type Costs,
  type Direction,
  type Outcome,
} from './resolve';

/* ------------------------------------------------------------------- the grid */

/** Stop distances, in ATR(14). §4.2's table, verbatim. */
export const STOP_ATR_MULTIPLES = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0] as const;

/** Targets, as a multiple of R — that is, of the initial risk the stop defines. */
export const TARGET_R_MULTIPLES = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 8.0] as const;

export const DIRECTIONS: Direction[] = ['long', 'short'];

/** 2 × 7 × 7. §4.2 calls it "roughly ninety-eight cells"; it is exactly 98. */
export const GRID_SIZE = DIRECTIONS.length * STOP_ATR_MULTIPLES.length * TARGET_R_MULTIPLES.length;

export interface AchievableCell {
  direction: Direction;
  stopAtr: number;
  targetR: number;
  rMultiple: number;
  outcome: Exclude<Outcome, 'pass'>;
  /** Stop and target both touched inside one minute; resolved stop-first (§12.3.2). */
  ambiguous: boolean;
}

/**
 * Every bracket a player could have placed on this path, resolved.
 *
 * Levels snap to the published tick, so no cell is a trade that could not actually have been
 * entered — a distribution containing unplaceable orders would not be an achievable set.
 *
 * The 98 resolutions are why `resolve()` was kept pure and I/O-free in Phase 0.
 */
export function enumerateAchievable(
  entry: number,
  atr: number,
  path: Bar[],
  pathBarsPerDisplayBar: number,
  costs: Costs = NO_COSTS,
): AchievableCell[] {
  const cells: AchievableCell[] = [];
  if (!(atr > 0) || path.length === 0) return cells;

  for (const direction of DIRECTIONS) {
    const sign = direction === 'long' ? 1 : -1;

    for (const stopAtr of STOP_ATR_MULTIPLES) {
      const stop = toTick(entry - sign * stopAtr * atr);
      // The tick grid can collapse a very tight stop onto the entry, which is not an order.
      const risk = Math.abs(entry - stop);
      if (risk === 0) continue;

      for (const targetR of TARGET_R_MULTIPLES) {
        const target = toTick(entry + sign * targetR * risk);
        if (target === entry) continue;

        const resolution = resolve({ entry, stop, target }, path, pathBarsPerDisplayBar, costs);
        cells.push({
          direction,
          stopAtr,
          targetR,
          rMultiple: resolution.rMultiple,
          outcome: resolution.outcome,
          ambiguous: resolution.ambiguous,
        });
      }
    }
  }

  return cells;
}

/**
 * Rebuild the grid from its stored form.
 *
 * The canonical order is direction-major, then stop, then target — the same order
 * `enumerateAchievable` emits, which is what lets the stored arrays carry only the numbers and
 * leave the coordinates implicit.
 */
export function decodeCells(
  rMultiples: readonly number[],
  outcomeCodes: Uint8Array,
): AchievableCell[] {
  const cells: AchievableCell[] = [];
  let i = 0;

  for (const direction of DIRECTIONS) {
    for (const stopAtr of STOP_ATR_MULTIPLES) {
      for (const targetR of TARGET_R_MULTIPLES) {
        if (i >= rMultiples.length) return cells;
        const code = outcomeCodes[i] ?? 0;
        cells.push({
          direction,
          stopAtr,
          targetR,
          rMultiple: rMultiples[i],
          outcome: code & 0x7f ? (code & 0x7f) === 1 ? 'target' : 'timeout' : 'stop',
          ambiguous: (code & 0x80) !== 0,
        });
        i += 1;
      }
    }
  }

  return cells;
}

/* ---------------------------------------------------------------- oracle bound */

/**
 * The best R any stop and target pair could have produced on this path.
 *
 * §4.2 calls this "computable in closed form from the maximum favourable and maximum adverse
 * excursion", and it is the headline number the reveal screen wants.
 *
 * The reasoning in one line: to still be alive at bar `t`, a long's stop must sit below every low
 * up to `t`, so the tightest surviving stop is one tick under the running minimum. Take the target
 * at that bar's high and the best R at `t` is `(high_t − entry) / (entry − runningMin_t + tick)`.
 * Sweep `t`, take the maximum, and do the mirror image for a short. One pass, no search.
 *
 * The running minimum includes bar `t` itself, which is the conservative choice: if that bar's low
 * came before its high, a stop above it would have fired first.
 *
 * This maximises over *all* stop and target pairs, not just the 98 on the grid, so it is always at
 * least the best grid cell. The tests hold it to that against a brute-force sweep.
 */
export function oracleBound(entry: number, path: Bar[], tick: number): number {
  if (path.length === 0) return 0;

  let best = 0;
  let runningLow = Infinity;
  let runningHigh = -Infinity;

  for (const bar of path) {
    runningLow = Math.min(runningLow, bar.l);
    runningHigh = Math.max(runningHigh, bar.h);

    // Long: stop one tick under the lowest low so far, target at this bar's high.
    const longRisk = entry - runningLow + tick;
    if (longRisk > 0) best = Math.max(best, (bar.h - entry) / longRisk);

    // Short: stop one tick above the highest high so far, target at this bar's low.
    const shortRisk = runningHigh - entry + tick;
    if (shortRisk > 0) best = Math.max(best, (entry - bar.l) / shortRisk);
  }

  return best;
}

/* ----------------------------------------------------------------- percentile */

/**
 * Where a result sits in the achievable distribution, in [0, 1].
 *
 * Mid-rank for ties, which is the convention that keeps a value scored against its own
 * distribution centred rather than biased by how many cells happen to land on it.
 *
 * §4.4 scores a pass as 0R against this same distribution. That is the whole mechanism behind
 * "on a chart whose distribution median is negative, passing legitimately beats most entries" —
 * no special case, just 0 evaluated where every other outcome is evaluated.
 */
export function percentileOf(value: number, distribution: readonly number[]): number | null {
  if (distribution.length === 0) return null;

  let below = 0;
  let equal = 0;
  for (const other of distribution) {
    if (other < value) below += 1;
    else if (other === value) equal += 1;
  }

  return (below + equal / 2) / distribution.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* ------------------------------------------------------- axis decomposition */

/**
 * §4.5's decomposition, read off the grid's marginals.
 *
 * Five of the six axes it lists. **Entry timing is absent on purpose**: §4.5 defines it as the
 * "cost in R of entering early or late relative to the structural trigger", and §4.2 fixes entry
 * at the decision bar, so there is nothing to be early or late *against* until Layer 2 defines a
 * structural trigger. Approximating it against an arbitrary offset would measure something the
 * scope does not ask for and would have to be replaced.
 *
 * Every field is nullable, and null means the grid could not support the number rather than zero.
 * §4.9: "Do not display a number until the sample supports it."
 */
export interface AxisScores {
  /** Share of the grid's winning cells that were on the player's side. */
  direction: number | null;
  /** Share of brackets at the player's stop distance that were stopped out. */
  stopSweptShare: number | null;
  /**
   * True when the stop was tighter than the adverse excursion the profitable brackets had to sit
   * through — the stop was inside the noise the winners survived.
   */
  stopInsideNoise: boolean | null;
  /** Worst drawdown, in the player's own R, that a profitable bracket had to endure. */
  profitableMaeR: number | null;
  /** Did the target print. */
  targetReached: boolean | null;
  /** Realised R over the favourable excursion that was there across the whole window. */
  captureShare: number | null;
  /** The percentile a pass would have scored — the value of doing nothing here. */
  restraint: number | null;
  /** Realised R over the oracle bound. §4.5 calls this the closest thing to trade quality. */
  efficiency: number | null;
}

export interface Scored {
  rMultiple: number;
  percentile: number | null;
  oracleR: number;
  /** The distribution's median — §8.1's `parR`. Negative means passing was the right play. */
  parR: number | null;
  axes: AxisScores;
}

export interface PlayerTrade {
  direction: Direction | null;
  /** Stop distance in ATR. Null for a pass. */
  stopAtr: number | null;
  rMultiple: number;
  outcome: Outcome;
  /** Favourable excursion across the whole window, in R (§4.6). Null for a pass. */
  windowMfeR: number | null;
}

/** Nearest enumerated stop distance to what the player actually placed. */
function nearestStopRow(stopAtr: number): number {
  let best: number = STOP_ATR_MULTIPLES[0];
  for (const candidate of STOP_ATR_MULTIPLES) {
    if (Math.abs(candidate - stopAtr) < Math.abs(best - stopAtr)) best = candidate;
  }
  return best;
}

export function scoreAgainst(
  trade: PlayerTrade,
  cells: readonly AchievableCell[],
  oracleR: number,
): Scored {
  const distribution = cells.map((cell) => cell.rMultiple);
  const passPercentile = percentileOf(0, distribution);

  if (cells.length === 0) {
    return {
      rMultiple: trade.rMultiple,
      percentile: null,
      oracleR,
      parR: null,
      axes: {
        direction: null,
        stopSweptShare: null,
        stopInsideNoise: null,
        profitableMaeR: null,
        targetReached: null,
        captureShare: null,
        restraint: null,
        efficiency: null,
      },
    };
  }

  const winners = cells.filter((cell) => cell.rMultiple > 0);

  // Direction: of everything that worked, how much of it was on the player's side.
  const direction =
    trade.direction === null || winners.length === 0
      ? null
      : winners.filter((cell) => cell.direction === trade.direction).length / winners.length;

  // Stop placement: how the player's stop distance fared across every target on their side.
  let stopSweptShare: number | null = null;
  if (trade.direction !== null && trade.stopAtr !== null) {
    // Hoisted: the narrowing above does not survive into the closure.
    const row = nearestStopRow(trade.stopAtr);
    const direction = trade.direction;
    const cellsInRow = cells.filter(
      (cell) => cell.direction === direction && cell.stopAtr === row,
    );
    if (cellsInRow.length > 0) {
      stopSweptShare =
        cellsInRow.filter((cell) => cell.outcome === 'stop').length / cellsInRow.length;
    }
  }

  // The drawdown the winners had to sit through, expressed in the player's own R. A stop tighter
  // than this was inside the noise the profitable brackets survived.
  const winnersOnSide =
    trade.direction === null
      ? []
      : winners.filter((cell) => cell.direction === trade.direction);
  const profitableMaeR =
    winnersOnSide.length === 0
      ? null
      : Math.max(...winnersOnSide.map((cell) => cell.stopAtr));
  const stopInsideNoise =
    profitableMaeR === null || trade.stopAtr === null ? null : trade.stopAtr < profitableMaeR;

  const captureShare =
    trade.windowMfeR === null || trade.windowMfeR <= 0
      ? null
      : trade.rMultiple / trade.windowMfeR;

  return {
    rMultiple: trade.rMultiple,
    percentile: percentileOf(trade.rMultiple, distribution),
    oracleR,
    parR: median(distribution),
    axes: {
      direction,
      stopSweptShare,
      stopInsideNoise,
      profitableMaeR,
      targetReached: trade.outcome === 'pass' ? null : trade.outcome === 'target',
      captureShare,
      restraint: passPercentile,
      efficiency: oracleR > 0 ? trade.rMultiple / oracleR : null,
    },
  };
}
