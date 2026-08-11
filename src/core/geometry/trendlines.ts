/**
 * Trendlines, read off the hull.
 *
 * The candidate set is exact and cheap — `hull.ts` explains why. What no literature settles is
 * *selection*: which of the h−1 hull edges is "the trendline". This is the honest gap in Layer 2
 * and it is stated rather than papered over.
 *
 * > There is no peer-reviewed formulation of hull-edge selection. The best-known open
 * > implementation does not even use a hull — it runs gradient descent on the slope, which
 * > generically selects a line touching exactly one vertex.
 *
 * So the rule here is **defended on determinism, not on evidence**: the most recent hull edge, ties
 * broken by span. Zero parameters, O(1) to read off the stack, always defined. The full candidate
 * set is returned alongside it, because 2b's published spec and the engine council may well want a
 * different rule and should be able to state one without re-deriving the candidates.
 *
 * **R² is rejected outright.** A supporting line has all its residuals on one side, so R² of a
 * one-sided envelope is not a goodness-of-fit measure at all; it can and does go negative. Fitting
 * quality is the wrong question about a line whose defining property is that nothing crosses it.
 *
 * The known cost of a zero-parameter rule, stated plainly: the most recent edge can be short, since
 * the final bar is always a hull vertex. The alternative is a minimum-span filter, which is a
 * parameter, and §6's whole argument for the hull was to stop choosing parameters. Callers that
 * want a longer line have the candidate set.
 */

import type { Bar } from '../bars';
import { causal, type Causal } from '../causal';
import { hull, type HullSide, type Vertex } from './hull';
import { fromTicks, toTicks } from './space';

/**
 * A line anchored on two hull vertices.
 *
 * Anchored on *prices at approximate times*, which is the design consequence §6 draws from the
 * stability correction: "lines anchored on pivot prices with approximate times are provably stable;
 * lines anchored on exact bar indices are not."
 */
export interface Trendline {
  side: HullSide;
  from: { index: number; price: number };
  to: { index: number; price: number };
  /** Price change per bar. Negative for a falling line. */
  slope: number;
  /** Bars between the anchors. The tiebreak, and a rough proxy for how much the line has been tested. */
  span: number;
  /** How many bars sit on the line, anchors included. Always at least two. */
  touches: number;
}

/**
 * How close a bar has to come to count as touching.
 *
 * One tick. This is the resolution price is quoted in, not a fitted tolerance — a bar either
 * reached the line to the nearest quotable price or it did not. Being explicit matters because a
 * touch count is the one strength weight with direct empirical support behind it (Chung & Bellotti
 * 2021), and a fudged tolerance would quietly inflate it.
 */
export const TOUCH_TOLERANCE_TICKS = 1;

/** Value of the line through two vertices at an arbitrary bar index, in ticks. */
function lineAt(a: Vertex, b: Vertex, index: number): number {
  return a.ticks + ((b.ticks - a.ticks) * (index - a.index)) / (b.index - a.index);
}

/**
 * Every hull edge, as a trendline, oldest first.
 *
 * Exhaustive by construction: any non-crossing line touching two or more points *is* a hull edge,
 * so this is the complete candidate set and not a sample of it.
 */
export function candidates(bars: readonly Bar[], side: HullSide): Causal<Trendline>[] {
  const vertices = hull(bars, side);
  const out: Causal<Trendline>[] = [];

  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1];
    const b = vertices[i];
    const span = b.index - a.index;

    let touches = 0;
    for (let k = 0; k < bars.length; k++) {
      const price = side === 'upper' ? bars[k].h : bars[k].l;
      const distance = Math.abs(toTicks(price) - lineAt(a, b, k));
      if (distance <= TOUCH_TOLERANCE_TICKS) touches += 1;
    }

    // A hull edge is knowable exactly when its second anchor prints — the hull is computed on the
    // prefix, so there is no confirmation lag and none is invented. That a later bar may pop the
    // edge is not repainting; it is the line breaking.
    out.push(
      causal<Trendline>(
        {
          side,
          from: { index: a.index, price: fromTicks(a.ticks) },
          to: { index: b.index, price: fromTicks(b.ticks) },
          slope: fromTicks(b.ticks - a.ticks) / span,
          span,
          touches,
        },
        b.index,
        b.index,
      ),
    );
  }

  return out;
}

/**
 * The selected trendline: most recent edge, ties broken by span.
 *
 * Returns null for a series too short to have an edge, in keeping with §4.9's habit of declining to
 * produce a number the data does not support.
 */
export function selected(bars: readonly Bar[], side: HullSide): Causal<Trendline> | null {
  const all = candidates(bars, side);
  if (all.length === 0) return null;

  let best = all[0];
  for (const line of all) {
    if (line.value.to.index > best.value.to.index) best = line;
    else if (line.value.to.index === best.value.to.index && line.value.span > best.value.span) {
      best = line;
    }
  }
  return best;
}
