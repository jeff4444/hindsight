/**
 * The exchange's integer units as the browser is sent them (docs/rules.md §22), and what its
 * refusals mean in words.
 *
 * What is left of the trading platform's session core once its sessions were retired (§23.9): the
 * game sends its rounds in the same shapes, so the conversions live here, shared by the server and
 * the in-browser demo.
 */

import type { Market } from '@/core/trading/market';
import { MICROS } from '@/core/trading/instrument';
import type { RejectReason } from '@/core/trading/types';
import type { InstrumentView, WireBar } from './types';

/** Why the exchange refused an order, for the person who placed it. */
export const REJECT_TEXT: Record<RejectReason, string> = {
  invalid: 'That order is not valid.',
  'bad-bracket': 'Take-profit belongs on the winning side of the entry and stop-loss on the losing side.',
  'min-notional': 'Orders must be worth at least $5.',
  'insufficient-buying-power': 'Not enough buying power for that order.',
  'would-trigger-immediately': 'That stop is already through the market. Use a market or limit order.',
  'reduce-only-no-position': 'There is no position for that to reduce.',
  liquidity: 'Too large for this market: orders are capped at 5% of the last 24 hours’ volume.',
  'session-closed': 'This session has ended.',
  'account-bankrupt': 'This account was liquidated. Reset it to trade again.',
  'unknown-order': 'That order is no longer working.',
};

export function instrumentView(market: Market): InstrumentView {
  const i = market.instrument;
  return {
    symbol: i.symbol,
    display: i.display,
    base: i.base,
    quote: i.quote,
    venue: i.venue,
    tickExp: i.tickExp,
    tickSize: i.tickSize,
    priceDecimals: i.priceDecimals,
    qtyExp: i.qtyExp,
    qtyStep: i.qtyStep,
    qtyDecimals: i.qtyDecimals,
    minNotional: i.minNotional / MICROS,
  };
}

/** Bars as compact tuples in ticks; volume to six significant figures. */
export function wireBars(bars: readonly { o: number; h: number; l: number; c: number; v: number }[]): WireBar[] {
  return bars.map((b) => [b.o, b.h, b.l, b.c, b.v > 0 ? Number(b.v.toPrecision(6)) : 0]);
}
