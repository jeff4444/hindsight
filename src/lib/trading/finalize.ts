/**
 * A closed session as the database stores it.
 *
 * The order-event log is the source of truth; these rows are a projection of it, written once
 * when the session closes so that statements and leaderboards do not have to replay every log on
 * every read. They are re-derivable from the log under the session's `sim_version`, and the same
 * function produces them for a player's session and a school's.
 */

import type { Market } from '@/core/trading/market';
import type { AccountState } from '@/core/trading/types';
import { maxDrawdown } from '@/core/trading/metrics';

export interface SessionSummary {
  ending_micros: number;
  realized_micros: number;
  fees_micros: number;
  return_pct: number;
  max_drawdown: number;
  round_trips: number;
  wins: number;
  ambiguous_fills: number;
  close_reason: 'end' | 'user';
  bankrupt: boolean;
}

export interface FillRow {
  seq: number;
  order_id: string;
  at_index: number;
  side: string;
  qty_steps: number;
  price_ticks: number;
  notional_micros: number;
  fee_micros: number;
  liquidity: string;
  role: string;
  gap: boolean;
  ambiguous: boolean;
  realized_micros: number;
}

export interface TripRow {
  n: number;
  side: string;
  opened_at_index: number;
  closed_at_index: number;
  max_qty_steps: number;
  entry_avg_ticks: number;
  exit_avg_ticks: number;
  gross_micros: number;
  fees_micros: number;
  net_micros: number;
  mfe_micros: number;
  mae_micros: number;
}

export interface FinalizePayload {
  summary: SessionSummary;
  fills: FillRow[];
  trips: TripRow[];
  /** Equity at each tape-hour close, micro-USDT. */
  curve: number[];
}

export function finalizePayload(_market: Market, state: AccountState, starting: number): FinalizePayload {
  const ending = state.cash;
  return {
    summary: {
      ending_micros: ending,
      realized_micros: state.realized,
      fees_micros: state.fees,
      return_pct: starting > 0 ? ending / starting - 1 : 0,
      max_drawdown: maxDrawdown([starting, ...state.hourlyEquity, ending]).fraction,
      round_trips: state.trips.length,
      wins: state.trips.filter((trip) => trip.net > 0).length,
      ambiguous_fills: state.ambiguousFills,
      close_reason: state.closeReason ?? 'end',
      bankrupt: state.bankrupt,
    },
    fills: state.fills.map((fill) => ({
      seq: fill.n,
      order_id: fill.orderId,
      at_index: fill.at,
      side: fill.side,
      qty_steps: fill.qty,
      price_ticks: fill.price,
      notional_micros: fill.notional,
      fee_micros: fill.fee,
      liquidity: fill.liquidity,
      role: fill.role,
      gap: fill.gap,
      ambiguous: fill.ambiguous,
      realized_micros: fill.realized,
    })),
    trips: state.trips.map((trip, i) => ({
      n: i + 1,
      side: trip.side,
      opened_at_index: trip.openedAt,
      closed_at_index: trip.closedAt,
      max_qty_steps: trip.maxQty,
      entry_avg_ticks: trip.entryAvg,
      exit_avg_ticks: trip.exitAvg,
      gross_micros: trip.gross,
      fees_micros: trip.fees,
      net_micros: trip.net,
      mfe_micros: trip.mfe,
      mae_micros: trip.mae,
    })),
    curve: state.hourlyEquity,
  };
}
