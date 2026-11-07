/**
 * A round: one trade, or none, on one tape (docs/rules.md §23.1).
 *
 * A round is a single `place` event at the decision close, handed to the exchange
 * (`src/core/trading/simulator.ts`) with a $500 stake and the round's margin rules, and replayed
 * over the whole tape at once. Nothing can be modified, cancelled or closed after it, so the result
 * is decided the moment the round is locked in: the replay a player watches only shows it.
 *
 * Sizing is a dollar amount. The quantity is worked out at the price the entry expects to trade
 * at — the ask or bid for a market order, its own price for a limit or a stop — and rounded down to
 * the step, so a market or limit entry never costs more than the size. A stop that fills worse than
 * its trigger can carry a notional a little over it, by its slippage or by a gap.
 */

import { halfSpread, FEE_SCHEDULE } from '../trading/costs';
import type { Market } from '../trading/market';
import { simulate } from '../trading/simulator';
import type { Fill, OrderEvent, OrderType, RejectReason, RoundTrip, Side } from '../trading/types';
import { ROUND_LIQUIDITY_SHARE, ROUND_MARGIN, ROUND_STAKE } from './rules';

/** What a player locks in, in the exchange's units: ticks for prices, micro-USDT for the size. */
export interface RoundOrder {
  side: Side;
  type: OrderType;
  /** Micro-USDT of notional the entry is sized for. At most the stake. */
  size: number;
  /** Limit price, ticks. Limit entries only. */
  price?: number;
  /** Trigger, ticks. Stop entries only. */
  stopPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
}

export type RoundExit = 'take-profit' | 'stop-loss' | 'end' | 'liquidation';

export interface RoundOutcome {
  /** The round's value when the tape ends, micro-USDT. The stake when nothing was traded. */
  end: number;
  /** Net profit or loss, micro-USDT. */
  pnl: number;
  fees: number;
  /** False when the round sat out, or its entry never filled. */
  filled: boolean;
  fills: Fill[];
  /** The one trip, once the entry filled. */
  trip: RoundTrip | null;
  /** How the position closed. Null when there was none. */
  exit: RoundExit | null;
  /** Steps the entry was sized to. Zero for a sit-out. */
  qty: number;
  ambiguousFills: number;
}

export type RoundCheck = { ok: true; qty: number } | { ok: false; reason: RejectReason | 'size' };

/** The price an entry expects to trade at, in ticks: what its quantity is worked out against. */
export function referencePrice(market: Pick<Market, 'refClose'>, order: Pick<RoundOrder, 'side' | 'type' | 'price' | 'stopPrice'>): number {
  if (order.type === 'limit') return order.price ?? 0;
  if (order.type === 'stop') return order.stopPrice ?? 0;
  const hs = halfSpread(market.refClose, FEE_SCHEDULE);
  return order.side === 'buy' ? market.refClose + hs : market.refClose - hs;
}

/** The entry's quantity in steps: the size over the reference price, rounded down. */
export function roundQty(market: Pick<Market, 'refClose'>, order: RoundOrder): number {
  const reference = referencePrice(market, order);
  if (!(reference > 0) || !(order.size > 0)) return 0;
  return Math.floor(order.size / reference);
}

/** The one event a round is. Sequence zero, stamped at the decision close. */
export function roundEvent(market: Pick<Market, 'refClose'>, order: RoundOrder): OrderEvent {
  return {
    kind: 'place',
    seq: 0,
    at: -1,
    order: {
      id: 'entry',
      side: order.side,
      type: order.type,
      qty: roundQty(market, order),
      price: order.type === 'limit' ? order.price : undefined,
      stopPrice: order.type === 'stop' ? order.stopPrice : undefined,
      reduceOnly: false,
      role: 'entry',
    },
    takeProfit: order.takeProfit,
    stopLoss: order.stopLoss,
  };
}

/**
 * Would the exchange accept this order at the decision close? Runs the placement and nothing
 * after it, so no tape minute is read — safe to call before a round is locked in.
 */
export function checkRound(market: Market, order: RoundOrder): RoundCheck {
  if (!Number.isSafeInteger(order.size) || order.size <= 0 || order.size > ROUND_STAKE) {
    return { ok: false, reason: 'size' };
  }
  const qty = roundQty(market, order);
  if (qty <= 0) return { ok: false, reason: 'min-notional' };
  const { results } = simulate(market, [roundEvent(market, order)], {
    starting: ROUND_STAKE,
    margin: ROUND_MARGIN,
    liquidityShare: ROUND_LIQUIDITY_SHARE,
    upTo: 0,
  });
  const rejected = results.get(0)?.rejected;
  return rejected ? { ok: false, reason: rejected } : { ok: true, qty };
}

const SIT_OUT: RoundOutcome = {
  end: ROUND_STAKE,
  pnl: 0,
  fees: 0,
  filled: false,
  fills: [],
  trip: null,
  exit: null,
  qty: 0,
  ambiguousFills: 0,
};

/**
 * Play a round to the end of the tape. `null` sits out. An order the exchange rejects is played as
 * a sit-out with its reason — the caller should have checked it first (`checkRound`).
 */
export function resolveRound(market: Market, order: RoundOrder | null): RoundOutcome & { rejected?: RejectReason | 'size' } {
  if (order === null) return SIT_OUT;
  const check = checkRound(market, order);
  if (!check.ok) return { ...SIT_OUT, rejected: check.reason };

  const { state } = simulate(market, [roundEvent(market, order)], {
    starting: ROUND_STAKE,
    margin: ROUND_MARGIN,
    liquidityShare: ROUND_LIQUIDITY_SHARE,
    upTo: market.tape.length,
  });

  const trip = state.trips[0] ?? null;
  const closing = [...state.fills].reverse().find((fill) => fill.positionAfter === 0) ?? null;
  const exit: RoundExit | null =
    closing === null
      ? null
      : closing.role === 'take-profit'
        ? 'take-profit'
        : closing.role === 'stop-loss'
          ? 'stop-loss'
          : closing.role === 'liquidation'
            ? 'liquidation'
            : 'end';

  return {
    end: state.cash,
    pnl: state.cash - ROUND_STAKE,
    fees: state.fees,
    filled: state.fills.length > 0,
    fills: state.fills,
    trip,
    exit,
    qty: check.qty,
    ambiguousFills: state.ambiguousFills,
  };
}
