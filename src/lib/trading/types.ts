/**
 * What a trading session looks like from the browser.
 *
 * Money and prices here are plain numbers in USDT and quote units, converted at the edge from the
 * simulator's integer ticks, steps and micro-USDT. Candles are the exception: they travel as ticks,
 * because integers are smaller on the wire and the chart converts them with the instrument anyway.
 *
 * Nothing in this file can name a minute the trader has not reached, a calendar date while the
 * session is open, or how the chart was stored (§22.9).
 */

import type { CancelReason, OrderRole, OrderStatus, OrderType, RejectReason, Side } from '@/core/trading/types';

export type { Side, OrderType, OrderRole, OrderStatus, CancelReason, RejectReason };

/** [open, high, low, close, volume]: prices in ticks, volume in base units. */
export type WireBar = [number, number, number, number, number];

export interface InstrumentView {
  symbol: string;
  display: string;
  base: string;
  quote: string;
  venue: string;
  tickExp: number;
  tickSize: number;
  priceDecimals: number;
  qtyExp: number;
  qtyStep: number;
  qtyDecimals: number;
  /** USDT. */
  minNotional: number;
}

export interface ClockView {
  /** Tape minutes revealed. */
  revealed: number;
  total: number;
  paused: boolean;
  /** Tape minutes per second. */
  speed: number;
}

export interface AccountView {
  equity: number;
  cash: number;
  unrealizedPnl: number;
  realizedPnl: number;
  fees: number;
  buyingPower: number;
  grossExposure: number;
  /** Exposure as a share of what the leverage cap allows. */
  marginUsed: number;
  /** Equity when this session opened. */
  startingEquity: number;
  sessionPnl: number;
  sessionReturn: number;
  bankrupt: boolean;
}

export interface PositionView {
  side: 'long' | 'short';
  qty: number;
  avgPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  /** Unrealised P&L over the position's cost. */
  unrealizedPct: number;
  notional: number;
  liquidationPrice: number | null;
  openedAt: number | null;
}

export interface OrderView {
  id: string;
  side: Side;
  type: OrderType;
  qty: number;
  price: number | null;
  stopPrice: number | null;
  role: OrderRole;
  reduceOnly: boolean;
  status: OrderStatus;
  parentId: string | null;
  placedAt: number;
  filledAt: number | null;
  fillPrice: number | null;
  filledQty: number | null;
  reason: CancelReason | RejectReason | null;
  closedAt: number | null;
}

export interface FillView {
  n: number;
  orderId: string;
  at: number;
  side: Side;
  qty: number;
  price: number;
  notional: number;
  fee: number;
  liquidity: 'maker' | 'taker';
  role: string;
  realized: number;
  gap: boolean;
  ambiguous: boolean;
}

export interface TripView {
  side: 'long' | 'short';
  openedAt: number;
  closedAt: number;
  maxQty: number;
  entryAvg: number;
  exitAvg: number;
  gross: number;
  fees: number;
  net: number;
  mfe: number;
  mae: number;
}

export type SessionTime =
  | { kind: 'relative'; weekday: number; minuteOfDay: number }
  | { kind: 'absolute'; startMs: number };

export interface SessionDelta {
  sessionId: string;
  status: 'open' | 'closed';
  clock: ClockView;
  /** Tape minutes from `from` up to what is revealed, and never beyond. */
  bars: { from: number; data: WireBar[] };
  account: AccountView;
  position: PositionView | null;
  /** Working and waiting orders. */
  orders: OrderView[];
  /** Filled, cancelled and rejected orders, newest first. */
  history: OrderView[];
  fills: FillView[];
  trips: TripView[];
  /** What the request did, when it was an order and it was refused. */
  rejected: { orderId: string | null; reason: string; text: string } | null;
  /** The clock had stopped because nobody was watching. */
  away: boolean;
}

export interface SessionOpen extends SessionDelta {
  instrument: InstrumentView;
  chart: {
    /** Hourly candles before the tape. */
    hours: WireBar[];
    /** One-minute candles under the last hours of history. */
    minutes: WireBar[];
    /** Close of the last history hour, in ticks: the price before the tape starts. */
    refClose: number;
  };
  time: SessionTime;
  purpose: 'main' | 'practice';
  ranked: boolean;
  source: string;
  scenario: { slug: string; name: string } | null;
}

export interface Benchmark {
  side: 'long' | 'short';
  entryAt: number;
  exitAt: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  pnl: number;
}

export interface PanelRun {
  code: string;
  name: string;
  /** Return on the session, as a fraction. */
  returnPct: number;
  /** P&L had it traded your starting equity. */
  pnl: number;
  trades: number;
  wins: number;
  fills: FillView[];
  trips: TripView[];
  decisions: { at: number; action: string; direction: string; rules: string[] }[];
}

export interface SessionReview {
  sessionId: string;
  /** The daily's number when this was today's market, so its card can be compared. */
  daily: number | null;
  instrument: InstrumentView;
  identity: {
    symbol: string;
    venue: string;
    /** Real epoch ms of the first and last tape minute. Null while the dates are embargoed. */
    startMs: number | null;
    endMs: number | null;
    embargoedUntil: string | null;
    synthetic: boolean;
  };
  time: SessionTime;
  chart: SessionOpen['chart'];
  tape: WireBar[];
  summary: {
    startingEquity: number;
    endingEquity: number;
    pnl: number;
    returnPct: number;
    fees: number;
    trades: number;
    winRate: number | null;
    profitFactor: number | null;
    maxDrawdown: number;
    ambiguousFills: number;
    closeReason: string;
    bankrupt: boolean;
  };
  /** Equity at each tape-hour close. */
  equityCurve: number[];
  fills: FillView[];
  trips: TripView[];
  orders: OrderView[];
  benchmarks: {
    /** The notional the benchmarks are priced at, USDT. */
    sizeBasis: number;
    buyAndHold: Benchmark;
    bestLong: Benchmark | null;
    bestShort: Benchmark | null;
  };
  panel: PanelRun[];
}
