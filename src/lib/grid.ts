/**
 * The achievable grid's axes, for drawing.
 *
 * These are re-declared rather than imported from `@/core/achievable` on purpose. That module's
 * own header describes it as future data — it enumerates outcomes by walking the one-minute path —
 * and pulling it into a client bundle to read two constant arrays would ship the resolver to the
 * browser alongside them. The values themselves are public: §4.2 prints this table in the rules,
 * and `/rules` renders it.
 *
 * Nothing holds these against the core arrays, so they must be edited together: a change to
 * §4.2's table has to land in both this file and `core/achievable.ts` or the debrief will draw
 * the achievable set against the wrong axes.
 */

/** Stop distances, in ATR(14). */
export const STOP_ATR = [0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0] as const;

/** Targets, as a multiple of R — that is, of the initial risk the stop defines. */
export const TARGET_R = [0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 8.0] as const;

export const DIRECTIONS = ['long', 'short'] as const;

export const CELLS_PER_DIRECTION = STOP_ATR.length * TARGET_R.length; // 49
export const GRID_CELLS = DIRECTIONS.length * CELLS_PER_DIRECTION; // 98

/**
 * The canonical index of one cell.
 *
 * Direction-major, then stop, then target — the order `enumerateAchievable` emits and the order
 * the stored arrays assume, which is what lets them carry only numbers and leave the coordinates
 * implicit. That implicitness is exactly what the old histogram threw away.
 */
export function cellIndex(direction: number, stop: number, target: number): number {
  return direction * CELLS_PER_DIRECTION + stop * TARGET_R.length + target;
}

/**
 * Where a continuous bracket sits on the grid, in fractional cell coordinates.
 *
 * The player's stop and target are not on the grid — they are wherever they dragged them — so the
 * crosshair is placed by interpolating between the two axis stops it falls between. Returns null
 * outside the enumerated range, because extrapolating past 4 ATR would draw a marker in a region
 * the distribution says nothing about.
 */
export function axisPosition(value: number, axis: readonly number[]): number | null {
  if (!Number.isFinite(value)) return null;
  if (value <= axis[0]) return value < axis[0] * 0.5 ? null : 0;
  if (value >= axis[axis.length - 1]) return value > axis[axis.length - 1] * 1.5 ? null : axis.length - 1;
  for (let i = 0; i < axis.length - 1; i++) {
    if (value >= axis[i] && value <= axis[i + 1]) {
      const span = axis[i + 1] - axis[i];
      return i + (span === 0 ? 0 : (value - axis[i]) / span);
    }
  }
  return null;
}
