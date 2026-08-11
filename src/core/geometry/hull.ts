/**
 * Convex hulls over the price series, in exact integer arithmetic.
 *
 * The verified claim §6 rests on: **a point lies on the upper hull iff there is a supporting line
 * through it with every other point on or below it, and a supporting line containing two or more
 * points is a hull edge.** So for *h* upper-hull vertices there are exactly *h−1* candidate
 * resistance trendlines and no others — not a cubic search over pairs, not even a quadratic one.
 *
 * Two properties make this the right primitive rather than merely a fast one.
 *
 * **It is online.** Bars arrive in strictly increasing x, which is the condition Andrew's monotone
 * chain needs, so the hull is maintained at O(1) amortised per bar and the hull of the first *t*
 * bars is exactly what a viewer at bar *t* would compute. Causality is structural here, not
 * enforced.
 *
 * **It is exact.** Working in tick space makes the orientation predicate an integer computation
 * with eight orders of magnitude of headroom in float64 (see `space.ts`). No epsilon appears in the
 * turn test — which matters, because a tolerance there would smuggle back the free parameter the
 * hull existed to remove, and it is precisely where RANSAC and Hough go wrong: Hough quantises
 * votes into an accumulator, so a quarter-tick perturbation that moves one vote across a bin edge
 * changes the argmax discontinuously.
 *
 * One property to state rather than test: hull output is causal but **not monotone in time**. A new
 * high pops vertices that anchored yesterday's line. That is not a bug — a new high invalidates the
 * old resistance line by definition, which is what "the trendline broke" means.
 */

import type { Bar } from '../bars';
import { cross, toTicks } from './space';

/** A hull vertex: a bar index and its extreme price, in ticks. */
export interface Vertex {
  index: number;
  /** Price in integer ticks, so downstream predicates stay exact. */
  ticks: number;
}

export type HullSide = 'upper' | 'lower';

/**
 * The hull of one side of the series.
 *
 * Both sides run through this one body with the sign flipped rather than through two mirrored
 * copies — the same anti-asymmetry discipline as `swings.ts`, and for the same reason: the
 * invertive metamorphic test asserts that reflecting the input swaps the two outputs exactly, and
 * that assertion is only informative if there is one implementation to be wrong.
 *
 * Collinear middle points are dropped, so the hull is minimal. Touch counting is a separate concern
 * and lives in `trendlines.ts`, where a line's supporters are found by testing every bar against
 * the chosen line rather than by hoping the hull retained them.
 */
export function hull(bars: readonly Bar[], side: HullSide): Vertex[] {
  const sign = side === 'upper' ? 1 : -1;
  const stack: Vertex[] = [];

  for (let i = 0; i < bars.length; i++) {
    const ticks = sign * toTicks(side === 'upper' ? bars[i].h : bars[i].l);

    // Pop while the last turn is not clockwise. `>= 0` rather than `> 0` drops collinear points,
    // which keeps the vertex list minimal and the edge count at exactly h−1.
    while (
      stack.length >= 2 &&
      cross(
        stack[stack.length - 2].index,
        stack[stack.length - 2].ticks,
        stack[stack.length - 1].index,
        stack[stack.length - 1].ticks,
        i,
        ticks,
      ) >= 0
    ) {
      stack.pop();
    }

    stack.push({ index: i, ticks });
  }

  // Unsign, so callers see real tick counts on both sides.
  return stack.map((vertex) => ({ index: vertex.index, ticks: sign * vertex.ticks }));
}

/** The upper hull — the candidate set for resistance lines. */
export function upperHull(bars: readonly Bar[]): Vertex[] {
  return hull(bars, 'upper');
}

/** The lower hull — the candidate set for support lines. */
export function lowerHull(bars: readonly Bar[]): Vertex[] {
  return hull(bars, 'lower');
}
