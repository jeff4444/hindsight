/**
 * What trading costs, and how much of it the account may borrow.
 *
 * Every number carries its provenance on the §14 pattern: published where Binance publishes it,
 * marked **ours** where it does not.
 *
 * | | value | source |
 * | --- | --- | --- |
 * | maker commission | 0.10% | **Binance spot VIP 0**, published |
 * | taker commission | 0.10% | **Binance spot VIP 0**, published |
 * | half spread | 1 bp, at least one tick | **ours** — the corpus has trades, not quotes |
 * | stop slippage | 5 bp | **ours** — a stop is a market order on a trigger |
 * | gross leverage | 2× equity | **ours**, in line with a cross-margin account |
 * | maintenance margin | 25% of exposure | **ours** |
 * | liquidation fee | 1% of what is closed | **ours** |
 *
 * ## Spread and commission are separate charges
 *
 * The bracket game's `SPOT_COSTS` folded the commission into a "spread" and charged half of it
 * each way, which made its round trip 10 bps and not the 20 its comment claimed. Here the two are
 * kept apart: the spread moves the fill price, the commission is a line on the statement.
 */

import { FEE_VERSION, MARGIN_VERSION } from '../versions';

export interface FeeSchedule {
  version: string;
  makerBps: number;
  takerBps: number;
  halfSpreadBps: number;
  stopSlippageBps: number;
}

export interface MarginRules {
  version: string;
  /** Exposure (|position| × price, plus resting orders) may not exceed this multiple of equity. */
  maxGrossLeverage: number;
  /** Below this share of exposure in equity, the position is liquidated. */
  maintenanceRatio: number;
  liquidationFeeBps: number;
}

export const FEE_SCHEDULE: FeeSchedule = {
  version: FEE_VERSION,
  makerBps: 10,
  takerBps: 10,
  halfSpreadBps: 1,
  stopSlippageBps: 5,
};

export const MARGIN: MarginRules = {
  version: MARGIN_VERSION,
  maxGrossLeverage: 2,
  maintenanceRatio: 0.25,
  liquidationFeeBps: 100,
};

/** Every account, player or school, starts here. */
export const STARTING_BALANCE_USDT = 100_000;

/** A frictionless schedule, for parity tests against the bracket resolver. */
export const NO_FEES: FeeSchedule = {
  version: 'none',
  makerBps: 0,
  takerBps: 0,
  halfSpreadBps: 0,
  stopSlippageBps: 0,
};

/** Commission on a notional, in micro-USDT, rounded against the trader. */
export function commission(notional: number, bps: number): number {
  return bps === 0 ? 0 : Math.ceil((notional * bps) / 10_000);
}

/** Half the spread at a price, in ticks. At least one tick whenever there is a spread at all. */
export function halfSpread(price: number, schedule: FeeSchedule): number {
  return schedule.halfSpreadBps === 0
    ? 0
    : Math.max(1, Math.ceil((price * schedule.halfSpreadBps) / 10_000));
}

/** Stop slippage at a price, in ticks. */
export function slippage(price: number, schedule: FeeSchedule): number {
  return schedule.stopSlippageBps === 0 ? 0 : Math.ceil((price * schedule.stopSlippageBps) / 10_000);
}
