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
 * ## The cost was measured, and it is too high to draw
 *
 * §12.2's standard is that the identity-lookup exploit be **uneconomic**, not that it be
 * impossible. `scripts/round-number-leak.ts` put a number on it against the real corpus, and the
 * number settled the question:
 *
 * > **Drawing the grid names a single chart 94% of the time** — 890 of 944 distinct signatures
 * > across 1,000 charts identify exactly one, and the median chart is alone in its signature. The
 * > instruments still possible drop from 314 to **one**.
 *
 * The mechanism is worse than it first looks, and it is the *spacing* rather than any single
 * level's position that does the damage. Consecutive round levels are `0.25 · 10^m` apart in real
 * price, so displayed they are `S = 0.25 · 10^m · factor` apart. §12.2 indexes every first candle
 * to 100, which fixes `factor = 100 / firstOpen`, and rearranging gives
 *
 *     firstOpen = 25 · 10^m / S
 *
 * — the instrument's real opening price, exactly, up to an unknown power of ten. Not a range: the
 * whole mantissa, read straight off the chart with a ruler.
 *
 * Hiding the spacing by drawing only one level pins the mantissa to the 36-value grid instead of to
 * a point, which leaves 23 charts and 21 instruments indistinguishable at the median. Better by a
 * factor of twenty, and still a fifteen-fold narrowing of the instrument set from a single drawn
 * line. And the corpus is a few hundred windows; the real attacker searches every symbol-month of
 * public OHLCV, where the same mantissa is more identifying rather than less.
 *
 * ## So this module is analysis-only
 *
 * It keeps the evidence-faithful construction, because Osler's result is real and the levels are
 * genuinely where stops cluster. It does not reach a player. The uses that remain are the ones that
 * never expose a position: theme tagging (§8.4), engine logic (§5), and the permutation null in 2c.
 *
 * Two structural guards, neither relying on anyone remembering:
 *
 * - **It cannot run on the client.** It takes the real price as an argument, and the client is
 *   never given `index_factor` — `tests/api-leak.test.ts` pins the payload's key set.
 * - **`tests/geometry/roundNumbers.boundary.test.ts` fails if anything under `src/app` imports
 *   this file.** A future wiring-up has to delete a test that explains why it exists.
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
 * The measurement, pinned here so it travels with the code that caused it.
 *
 * Produced by `npm run leak` against a 1,000-chart, 314-instrument corpus. Re-run it after any
 * change to the corpus or to `SUBDIVISION`; if `gridNamesOneChart` ever falls below about 0.1 the
 * argument in this file's header needs revisiting rather than inheriting.
 */
export const LEAK_MEASUREMENT = {
  corpusCharts: 1000,
  corpusInstruments: 314,
  /** Share of grid signatures that identify exactly one chart. */
  gridNamesOneChart: 890 / 944,
  /** Median charts left indistinguishable when only one level is drawn. */
  singleLevelMedianCharts: 23,
  /** Median instruments left possible when only one level is drawn. */
  singleLevelMedianInstruments: 21,
} as const;

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
