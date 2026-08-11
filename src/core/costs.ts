/**
 * What a trade costs, and why it is inside the scoring rather than beside it.
 *
 * §15 lists this as one of the project's named risks: *"Transaction costs erase the behaviour being
 * trained. The strongest negative result in the literature is that low costs alone eliminate
 * technical-rule profitability."* Bajgrowicz & Scaillet (JFE 2012) is that result — revisiting the
 * Sullivan–Timmermann–White rule universe on the Dow, they find **"the initial performance fully
 * disappears after the inclusion of transaction costs"** at one-way costs of 20 bps.
 *
 * ## The instruction that decided where these numbers are applied
 *
 * The same paper is explicit that applying costs afterwards is not good enough:
 *
 * > We explain why break-even transaction costs are not a satisfactory indicator, and why it is
 * > important to consider transaction costs already during the selection process.
 *
 * So costs go **inside `enumerateAchievable`**. The 98-cell grid a player is scored against is the
 * net grid, and the percentile is a net percentile. `docs/phase-4-research.md` §2.3 measures why
 * that distinction is not academic: with costs outside the enumeration, **the best cell on the chart
 * is a different cell on 22% of charts**, so the oracle a player is measured against is the best
 * bracket in a game nobody is playing.
 *
 * ## The gradient, which is the whole reason this file exists
 *
 * Cost in R is `round-trip bps ÷ (stop in ATR × ATR-as-a-share-of-price)`, so it is **inversely
 * proportional to stop distance**. Measured over the corpus, where ATR(14) is 1.505% of price at the
 * median:
 *
 * | stop | cost, median chart | cost, quietest 5% |
 * | --- | --- | --- |
 * | 0.5 ATR | **0.266R** | **0.571R** |
 * | 2 ATR | 0.066R | 0.143R |
 * | 4 ATR | 0.033R | 0.071R |
 *
 * And what that does to the grid, measured over 250 charts:
 *
 * | stop | mean R gross | mean R net |
 * | --- | --- | --- |
 * | 0.5 ATR | −0.026 | **−0.215** |
 * | 1.5 ATR | **+0.002** | −0.065 |
 * | 4 ATR | −0.012 | −0.035 |
 *
 * **Gross, stop distance does not matter — every row is within 0.03R of every other. Net, it is the
 * largest single determinant of expectancy in the grid, and it is monotone.** §15's stated risk is
 * that "percentile scoring rewards lottery tickets"; this is the mechanism, and gross scoring is
 * what makes tight stops look free. They are the most expensive choice on the board.
 *
 * ## Provenance, on the §14 pattern
 *
 * | | value | source |
 * | --- | --- | --- |
 * | spread / fee | 10 bps a side | **Binance spot VIP 0**, published: 0.1% maker and taker |
 * | stop slippage | 5 bps | **ours** — a market order on a trigger, and no published figure exists |
 *
 * The slippage figure is an invention and is labelled as one. It is the only number here without a
 * source, and the same discipline §14 applies to engine thresholds applies to it: publish it, mark
 * it ours, and let it be argued with.
 */

import type { Costs } from './resolve';

/**
 * The corpus is Binance spot, so these are Binance spot's numbers.
 *
 * Frozen deliberately. Moving either value changes every percentile, chart rating and retirement
 * verdict ever computed — §12.4's rule that population statistics do not survive a change of rule —
 * so a change here must bump `ACHIEVABLE_VERSION` and re-enumerate, exactly as a threshold change
 * bumps `ENGINE_VERSION` in §14.
 */
export const SPOT_COSTS: Costs = {
  /** Binance spot VIP 0: 0.1% maker and 0.1% taker. Published. */
  spreadBps: 10,
  /** Ours. A stop is a market order on a trigger and does not fill at the trigger. */
  stopSlippageBps: 5,
};

/** Round trip on notional, in basis points. What a flat trade actually costs. */
export const ROUND_TRIP_BPS = SPOT_COSTS.spreadBps * 2;

/**
 * What the round trip costs in R, given a stop distance.
 *
 * Published as a function rather than a constant because **there is no single answer** — it depends
 * on how wide the stop is and how volatile the instrument is, and that dependence is the finding.
 * The debrief uses it to say what the fees took, in the units the player is scored in.
 */
export function costInR(entry: number, stop: number): number | null {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || !(entry > 0)) return null;
  return (ROUND_TRIP_BPS / 10_000) * (entry / risk);
}
