/**
 * The coordinate systems Layer 2 computes in, and why each one.
 *
 * Three different spaces appear in §6's geometry table and they are not interchangeable. Getting
 * this wrong is not a rounding error — it changes which line the detector draws — so the choice is
 * made once, here, with the reason attached.
 *
 * **Linear tick space** — hull, trendlines, channels.
 *
 * > **Correction to v0.2 as first drafted:** §6 specifies "convex hull for the candidate set, then
 * > constrained slope optimisation *in log space*". That is wrong for this product.
 *
 * Two independent reasons. First, the rendered price axis is linear — `Chart.tsx` builds a linear
 * `rightPriceScale`, and the log toggle is an unbuilt Standard-tier tool — so a line that is
 * straight in log space is a *curve* on the chart the player is looking at. Over a lead-in running
 * 100 → 115 the log-space line sits about 26 ticks below the linear one at the midpoint, which is
 * a quarter of a percent and plainly visible. A trader draws on what they see.
 *
 * Second, exactness. Bar indices are integers and prices are quantised to `TICK_SIZE`, so in tick
 * space the hull's orientation determinant is an integer computation — see `EXACT_CROSS_BOUND`
 * below for the proof that it fits. A hull with a tolerance in its turn predicate has smuggled back
 * the free parameter the hull existed to remove. Log prices are not quantised and give that up.
 *
 * **Log space** — kernel bandwidths, and anything that must be scale-free.
 *
 * §6 asks for "kernel density on log price with ATR-scaled bandwidth" because a bandwidth has to
 * mean the same thing on a $60,000 instrument and a $1.08 one. That is a statement about *widths*,
 * not about straight lines, and it survives the correction above intact.
 *
 * **Real linear price** — round numbers only. See `roundNumbers.ts`; the Osler clustering result is
 * a property of the actual price lattice and normalising destroys it.
 */

import { INDEX_BASE, TICK_SIZE } from '../normalize';

/* ------------------------------------------------------------------ log space */

/** log of the index base — the axis of symmetry of the product's mirror. See below. */
export const LOG_BASE = Math.log(INDEX_BASE);

export function toLog(price: number): number {
  return Math.log(price);
}

export function fromLog(value: number): number {
  return Math.exp(value);
}

/**
 * The mirror is an exact affine reflection in log space, and that is a testable gift.
 *
 * `mirrorPrice(p) = INDEX_BASE² / p`, so `log(mirrorPrice(p)) = 2·log(INDEX_BASE) − log(p)`. The
 * identity-hiding transform §12.2 already applies to every chart *is* the classic invertive
 * metamorphic relation `x ← 2m − x`, exactly, with `m = LOG_BASE`.
 *
 * So the strongest test available to Layer 2 — every support becomes a resistance, every ascending
 * channel a descending one, identical indices, mirrored prices — can be written against real
 * product code (`mirrorBar`) rather than against a reflection invented for the test. It exercises
 * the high-side and low-side paths in one relation, which is where the copy-paste asymmetry bug
 * lives.
 */
export function reflectLog(value: number): number {
  return 2 * LOG_BASE - value;
}

/* ----------------------------------------------------------------- tick space */

/**
 * Price as an exact integer count of ticks.
 *
 * `Math.round` rather than a floor: inputs are already on the tick grid to within float noise, and
 * rounding maps them back onto it rather than shaving a tick off half of them.
 */
export function toTicks(price: number): number {
  return Math.round(price / TICK_SIZE);
}

export function fromTicks(ticks: number): number {
  return ticks * TICK_SIZE;
}

/**
 * The largest orientation determinant this codebase can produce, against float64's exact-integer
 * ceiling.
 *
 * The predicate is `(bx−ax)(cy−ay) − (by−ay)(cx−ax)` with x a bar index and y a tick count. Index
 * differences are bounded by the longest series any tier serves — `EXTENDED_LEAD_IN_BARS +
 * REVEAL_BARS = 360` bars. Tick differences are bounded by how far a chart can travel: prices are
 * indexed to 100 with a 0.01 tick, so the opening bar sits at 10⁴ ticks and a chart would have to
 * reach ten times its opening price before passing 10⁵. The corpus filter rejects windows nothing
 * like that violent, so 10⁵ is generous.
 *
 * Each product is then at most 360 · 10⁵ = 3.6 × 10⁷, and their difference at most 7.2 × 10⁷ —
 * against `Number.MAX_SAFE_INTEGER` ≈ 9 × 10¹⁵. Eight orders of magnitude of headroom, so the
 * predicate is exact in plain float64 with no BigInt and no epsilon. Asserted in the tests rather
 * than trusted.
 */
export const MAX_BAR_SPAN = 360;
export const MAX_TICK_SPAN = 1e5;
export const EXACT_CROSS_BOUND = 2 * MAX_BAR_SPAN * MAX_TICK_SPAN;

/**
 * Orientation of the turn a → b → c.
 *
 * Positive is a left turn (counter-clockwise), negative a right turn, zero collinear. Exact for
 * integer inputs, which is the entire reason `hull.ts` works in ticks.
 */
export function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/* -------------------------------------------------------------- perturbations */

/**
 * The perturbation the stability suite applies, and the unit hysteresis and snapping are sized in.
 *
 * §6: "Perturb every close by a quarter of a tick, re-run, and measure the overlap of the pivot
 * sets in price space." Everything downstream that needs a tolerance is expressed as a multiple of
 * this rather than as a number someone picked.
 */
export const EPSILON = TICK_SIZE / 4;

/**
 * Quantise an emitted level onto a grid coarser than `2·EPSILON`.
 *
 * Kumabe & Yoshida (2023) prove no deterministic algorithm with boolean output can be
 * Lipschitz-continuous — bounded sensitivity provably requires randomisation, which is off the
 * table for shared game state. Grading the output is one of the two moves that leaves; snapping is
 * what makes the other one (hysteresis) checkable, because it turns "the level moved 0.3 ticks"
 * into "the level did not move" and lets the tests assert exact equality instead of a tolerance.
 *
 * The grid is one tick: comfortably coarser than 2ε = half a tick, and it is the resolution the
 * price is quoted in anyway, so nothing legible is lost.
 */
export const SNAP_GRID = TICK_SIZE;

export function snap(price: number): number {
  return Math.round(price / SNAP_GRID) * SNAP_GRID;
}

/**
 * Hysteresis band: emit a feature at `high`, retract it only below `low`.
 *
 * §6 requires `τ_high − τ_low ≥ 4ε` so that only features sitting inside a 4ε band can ever flip,
 * which makes the emitted set provably invariant once established. This returns the pair for a
 * given nominal threshold, centred on it, and refuses to return a band too narrow to be worth
 * anything.
 */
export function hysteresisBand(threshold: number, width: number): { high: number; low: number } {
  const minimum = 4 * EPSILON;
  const span = Math.max(width, minimum);
  return { high: threshold + span / 2, low: threshold - span / 2 };
}
