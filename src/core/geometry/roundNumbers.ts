/**
 * Round-number levels — the only part of Layer 2 that touches a real instrument price.
 *
 * This is the best-evidenced row in the whole geometry table. **Osler (2005, JIMF)**, using a major
 * FX dealing bank's complete order book — 9,655 orders, over $55bn — found **14.3% of executed
 * stop-loss buys sat at rates ending [01,10] against 6.9% at [91,00]**, with take-profit orders
 * clustering *at* round numbers and stops clustering *just past* them. **Harris (1991, RFS)** adds
 * that the clustering strengthens with volatility, which is an independent argument for a
 * volatility-scaled band rather than a fixed one.
 *
 * ## Why this module is awkward, and why it is built anyway
 *
 * The mechanism operates on the **real, linear** price lattice. Every chart in this corpus is
 * indexed to 100 and half of them are mirrored (§12.2), which destroys that lattice utterly. §6's
 * rule — step = 10^floor(log10 P), levels at 0.25, 0.5 and 1.0 multiples — applied to the
 * *displayed* price would put a "round number" at 100 on every chart in the corpus, which is not a
 * round number at all: it is where the chart opened, by construction. Shipping that would be
 * exactly the "plausible-looking invention that encodes nothing" §1.1 rejects for synthetic
 * volume-at-price.
 *
 * So the levels are computed on the true price and mapped forward through `index_factor` and the
 * mirror. That is honest, and it has a cost under §12.2 that is stated rather than waved at.
 *
 * ## The cost, and the standard it is held to
 *
 * A displayed level at, say, 103.47 tells a determined player that `realPrice = 103.47 / factor` is
 * a round number — which pins the *mantissa* of the chart's opening price to a small set, with the
 * decade still unknown. §12.2's standard is that the identity-lookup exploit be **uneconomic**, not
 * that it be impossible, and whether this crosses that line is a measurement, not an opinion:
 * `scripts/round-number-leak.ts` computes it against the real corpus and `docs/rules.md` carries
 * the number whichever way it came out.
 *
 * Two structural mitigations, neither of which relies on obscurity:
 *
 * - **This module cannot run on the client.** It takes the real price as an argument, and the
 *   client is never given `index_factor` — `tests/api-leak.test.ts` pins the payload's key set, so
 *   adding it would fail a test rather than slip through review.
 * - **Levels are emitted unlabelled.** A round-number level and a density level are both just
 *   levels. Knowing that *one* of the drawn levels is round is much weaker than knowing which.
 */

import { normalizePrice } from '../normalize';
import { snap } from './space';

export interface RoundLevel {
  /** The level in displayed price, snapped to the tick grid. */
  price: number;
  /**
   * 3 for a whole multiple of the decade step, 2 for a half, 1 for a quarter.
   *
   * Ordinal, not a probability. Osler's evidence is that round numbers matter and that
   * "rounder" ones matter more; it does not license a cardinal weight, so this is not one.
   */
  strength: 1 | 2 | 3;
}

/** Fractions of the decade step that carry a level. §6's published rule. */
export const SUBDIVISION = 0.25;

/**
 * The decade step for a price: 10^floor(log10 P).
 *
 * Scale-free and zero-parameter — 45,000 gets a step of 10,000 and levels every 2,500; 1.08 gets a
 * step of 1 and levels every 0.25. Works identically on any instrument, which is the property that
 * makes it publishable as a rule rather than a table.
 */
export function decadeStep(price: number): number {
  return Math.pow(10, Math.floor(Math.log10(price)));
}

/**
 * Round-number levels between two real prices, mapped into displayed space.
 *
 * `low` and `high` are the real price extremes of the window the player can see. The mirror is
 * order-reversing, so the returned list is sorted by displayed price rather than by real price —
 * a caller that assumed the two orders agreed would be right on half the corpus and silently wrong
 * on the other half.
 */
export function roundLevels(
  low: number,
  high: number,
  factor: number,
  mirrored: boolean,
): RoundLevel[] {
  if (!(low > 0) || !(high >= low) || !(factor > 0)) return [];

  // The step is taken from the bottom of the range, so a window straddling a decade boundary gets
  // the finer grid rather than the coarser one. Denser is the safe direction: an extra level is
  // visible and arguable, a missing one is invisible.
  const step = decadeStep(low) * SUBDIVISION;
  if (!(step > 0)) return [];

  const first = Math.ceil(low / step);
  const last = Math.floor(high / step);
  // A window spanning many decades would enumerate unboundedly; the corpus filter makes that
  // impossible, but a detector should not depend on a filter elsewhere for its termination.
  if (last - first > 10_000) return [];

  const levels: RoundLevel[] = [];
  for (let k = first; k <= last; k++) {
    const real = k * step;
    // Integer arithmetic on k decides the strength, so no float comparison is involved: every
    // fourth level is whole, every second is at least a half.
    const strength: 1 | 2 | 3 = k % 4 === 0 ? 3 : k % 2 === 0 ? 2 : 1;
    levels.push({ price: snap(normalizePrice(real, factor, mirrored)), strength });
  }

  levels.sort((a, b) => a.price - b.price || a.strength - b.strength);
  return levels;
}
