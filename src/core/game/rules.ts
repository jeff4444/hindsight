/**
 * The game's numbers, in one place (docs/rules.md §23).
 *
 * Every one of these is marked **ours** in the rulebook: a first setting, not a measurement.
 * Changing any of them changes what a stored grade or a stored duel means, so it bumps
 * `GAME_VERSION`.
 */

import { MICROS } from '../trading/instrument';
import type { MarginRules } from '../trading/costs';
import { GAME_VERSION } from '../versions';

/** A round's stake, in USDT. Fresh every round; nothing carries in or out (§23.1). */
export const ROUND_STAKE_USDT = 500;

/** The same, in micro-USDT. */
export const ROUND_STAKE = ROUND_STAKE_USDT * MICROS;

/**
 * Margin inside a round (§23.1). There is no leverage: the round layer caps an entry at the
 * stake. The simulator's leverage cap is left at 2× only so that a stop entry filling a little
 * above its trigger is not cancelled for want of buying power. Maintenance is zero, so a position
 * is closed only when its losses reach the stake — which only a short can do, by the price
 * doubling — and there is no liquidation fee. A round cannot end below $0.
 */
export const ROUND_MARGIN: MarginRules = {
  version: GAME_VERSION,
  maxGrossLeverage: 2,
  maintenanceRatio: 0,
  liquidationFeeBps: 0,
};

/**
 * The exchange's liquidity guard (§22.3) is off in a round. No $500 order comes near 5% of a real
 * pair's daily volume; the guard would only ever fire on a tape whose volume was badly recorded,
 * and there it would refuse every order — the best and the worst included.
 */
export const ROUND_LIQUIDITY_SHARE = 0;

/** A tape is dealt only if its biggest rise or fall is at least this share (§23.4). */
export const MIN_MOVE = 0.03;

/** The grade's scale (§23.3). */
export const GRADE_MAX = 1000;

/** A duel's health bar, per player (§23.6). */
export const DUEL_HEALTH = 1000;

/** A duel ends after this many tapes if nobody is knocked out (§23.6). */
export const DUEL_TAPES = 10;

/** The damage curve's steepness (§23.6). */
export const DAMAGE_K = 2;
