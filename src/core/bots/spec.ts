/**
 * The schools as traders.
 *
 * Each engine on the council (§14) reads a chart and says what its school would do. A bot is that
 * engine with an account: it asks the engine at every hourly close while it is flat, takes the
 * trade at market with the school's stop, sizes it so the stop costs a fixed share of equity, and
 * leaves the way the school leaves.
 *
 * **The engines are untouched.** `Engine.read` is called exactly as the council calls it, so the
 * threshold hash, the look-ahead suite and every published base rate still describe the same
 * rules. Everything a bot adds — sizing, exits, re-entry — lives here, under its own version and
 * its own hash, so that tuning how a school *trades* never silently rewrites what it *sees*.
 *
 * | school | exit | why |
 * | --- | --- | --- |
 * | Channel | the opposite 10-bar extreme, as a trailing stop | the Turtles' own exit |
 * | Reversion, Reversion (ours) | a close beyond the 5-bar average | Connors' own exit |
 * | Tape | an opposing VSA signal | Williams' own exit |
 * | Sweep, Pattern, Geometry | stop and target, resting | the target *is* the school's exit |
 * | Engine Zero | 2 ATR stop, 2R target | the null, unchanged |
 */

import type { Engine, EngineCode } from '../engines/contract';
import { CHANNEL } from '../engines/channel';
import { REVERSION, REVERSION_H } from '../engines/reversion';
import { SWEEP } from '../engines/sweep';
import { PATTERN } from '../engines/pattern';
import { GEOMETRY } from '../engines/geometry';
import { TAPE } from '../engines/tape';
import { ZERO } from '../engines/zero';
import { digest } from '../engines/manifest';
import { STARTING_BALANCE_USDT } from '../trading/costs';
import { BOT_VERSION, ENGINE_VERSION, FEE_VERSION, MARGIN_VERSION, SIM_VERSION } from '../versions';

export type BotExit = 'native' | 'opposing-signal' | 'bracket';

export interface BotSpec {
  code: EngineCode;
  engine: Engine;
  exit: BotExit;
  /** Rest the verdict's target as a take-profit. Off where the school exits on a condition. */
  takeProfit: boolean;
}

export const BOT_PARAMS = {
  /** Each trade is sized so that being stopped out costs this share of equity, before fees. */
  riskFraction: 0.01,
  startingBalanceUsdt: STARTING_BALANCE_USDT,
  /** A bot that has just left a trade waits for the next hourly close before reading again. */
  reentry: 'next-close',
  /** Hours between reads while flat. */
  readEveryHours: 1,
} as const;

export const BOTS: BotSpec[] = [
  { code: 'CHANNEL', engine: CHANNEL, exit: 'native', takeProfit: false },
  { code: 'REVERSION', engine: REVERSION, exit: 'native', takeProfit: false },
  { code: 'REVERSION_H', engine: REVERSION_H, exit: 'native', takeProfit: false },
  { code: 'SWEEP', engine: SWEEP, exit: 'bracket', takeProfit: true },
  { code: 'PATTERN', engine: PATTERN, exit: 'bracket', takeProfit: true },
  { code: 'GEOMETRY', engine: GEOMETRY, exit: 'bracket', takeProfit: true },
  { code: 'TAPE', engine: TAPE, exit: 'opposing-signal', takeProfit: false },
  { code: 'ZERO', engine: ZERO, exit: 'bracket', takeProfit: true },
];

export function botByCode(code: string): BotSpec | null {
  return BOTS.find((bot) => bot.code === code) ?? null;
}

/** What the hash covers: everything about how a school trades, plus the versions underneath it. */
export const BOT_SPEC = {
  params: BOT_PARAMS,
  exits: Object.fromEntries(BOTS.map((bot) => [bot.code, { exit: bot.exit, takeProfit: bot.takeProfit }])),
  versions: { BOT_VERSION, ENGINE_VERSION, SIM_VERSION, FEE_VERSION, MARGIN_VERSION },
};

/**
 * The recorded hash of `BOT_SPEC`, written out by hand for the reason `THRESHOLD_HASH` is: a
 * pre-registration computed at read time cannot fail. If a test says this no longer matches, bump
 * `BOT_VERSION` and update it in the same commit — every school then starts a fresh account.
 */
export const BOT_SPEC_HASH = 'dc1f64c9';

/** For the test that keeps the literal honest. */
export function botSpecDigest(): string {
  return digest(BOT_SPEC);
}
