/**
 * The trading vocabulary, in integer units.
 *
 * Prices are **ticks**, quantities are **steps** and money is **micro-USDT** (`instrument.ts`
 * explains why ticks × steps is exactly a micro). Conversion to dollars happens at the edge, in
 * the views the API sends, and nowhere in here.
 *
 * Time is a **minute index** into the tape. `at = i` means "at the close of minute i"; `at = −1`
 * is the decision close, before the tape starts.
 */

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderRole = 'entry' | 'take-profit' | 'stop-loss' | 'close';

export interface OrderSpec {
  /** Client order id. Stays the same across modifications. */
  id: string;
  side: Side;
  type: OrderType;
  /** Steps. A positive integer. */
  qty: number;
  /** Limit price, in ticks. Limit orders only. */
  price?: number;
  /** Trigger price, in ticks. Stop orders only. */
  stopPrice?: number;
  /** May only shrink the position, never open or grow one. */
  reduceOnly: boolean;
  role: OrderRole;
  /** Set on an attached take-profit or stop-loss: it activates when this order fills. */
  parentId?: string;
  /** Orders sharing a group cancel each other when one fills. */
  ocoGroup?: string;
}

/**
 * Everything a trader can do, as stamped by the server.
 *
 * The log of these is the source of truth for a session. The account is whatever replaying the
 * log over the tape produces, so there is no running balance to drift from it.
 */
export type OrderEvent =
  | {
      kind: 'place';
      seq: number;
      at: number;
      order: OrderSpec;
      /** Attach a take-profit at this price, in ticks. */
      takeProfit?: number;
      /** Attach a stop-loss at this price, in ticks. */
      stopLoss?: number;
    }
  | { kind: 'modify'; seq: number; at: number; orderId: string; qty?: number; price?: number; stopPrice?: number }
  | { kind: 'cancel'; seq: number; at: number; orderId: string }
  | { kind: 'cancel-all'; seq: number; at: number }
  | { kind: 'close-position'; seq: number; at: number; fraction: number }
  | { kind: 'end'; seq: number; at: number };

export type OrderStatus = 'pending' | 'working' | 'filled' | 'canceled' | 'rejected';

export type CancelReason =
  | 'user'
  | 'oco'
  | 'position-closed'
  | 'parent-canceled'
  | 'margin'
  | 'liquidation'
  | 'session-end';

export type RejectReason =
  | 'invalid'
  | 'bad-bracket'
  | 'min-notional'
  | 'insufficient-buying-power'
  | 'would-trigger-immediately'
  | 'reduce-only-no-position'
  | 'liquidity'
  | 'session-closed'
  | 'account-bankrupt'
  | 'unknown-order';

export interface OrderState extends OrderSpec {
  status: OrderStatus;
  /** Sequence of the event that placed it. */
  seq: number;
  placedAt: number;
  /** First minute in which it may fill intrabar. */
  liveFrom: number;
  filledAt?: number;
  fillPrice?: number;
  filledQty?: number;
  cancelReason?: CancelReason;
  rejectReason?: RejectReason;
  /** Minute at which it was cancelled or rejected. */
  closedAt?: number;
}

export type FillRole = OrderRole | 'liquidation' | 'flatten';

export interface Fill {
  /** Running fill number within the session. */
  n: number;
  orderId: string;
  at: number;
  side: Side;
  qty: number;
  /** Ticks. */
  price: number;
  /** Micro-USDT. */
  notional: number;
  fee: number;
  liquidity: 'maker' | 'taker';
  role: FillRole;
  /** Filled at an open that jumped past the order's price. */
  gap: boolean;
  /** The minute's two possible intrabar paths disagreed, and the worse one was taken (§22.4). */
  ambiguous: boolean;
  /** Realised P&L on the part of the position this fill closed, before its fee. */
  realized: number;
  /** Signed position after the fill, in steps. */
  positionAfter: number;
}

export interface Position {
  /** Signed steps: positive long, negative short. */
  qty: number;
  /** Signed micro-USDT cost of the open position. Average price is basis / qty ticks. */
  basis: number;
}

/** One trip from flat to flat (a flip ends one trip and starts the next). */
export interface RoundTrip {
  side: 'long' | 'short';
  openedAt: number;
  closedAt: number;
  /** Largest absolute position held, in steps. */
  maxQty: number;
  /** Volume-weighted entry and exit, in ticks. Fractional. */
  entryAvg: number;
  exitAvg: number;
  /** Realised P&L before fees, micro-USDT. */
  gross: number;
  fees: number;
  net: number;
  /** Best and worst open P&L while the trip was open, micro-USDT. */
  mfe: number;
  mae: number;
  fills: number;
}

export interface AccountState {
  /** Last minute processed. −1 before the tape starts. */
  at: number;
  /** Starting balance + realised − fees, micro-USDT. */
  cash: number;
  starting: number;
  realized: number;
  fees: number;
  position: Position;
  /** Last trade price, ticks. */
  mark: number;
  unrealized: number;
  equity: number;
  /** |position| × mark. */
  gross: number;
  /** Notional held back by resting orders that would add exposure. */
  reserved: number;
  buyingPower: number;
  liquidationPrice: number | null;
  /** Working and pending orders. */
  open: OrderState[];
  /** Filled, cancelled and rejected orders, in the order they closed. */
  done: OrderState[];
  fills: Fill[];
  trips: RoundTrip[];
  /** The trip in progress, if any. */
  openTrip: RoundTrip | null;
  /** Equity at the close of each tape hour processed so far. */
  hourlyEquity: number[];
  bankrupt: boolean;
  /** True once the session has been flattened, by the end of the tape or by the trader. */
  closed: boolean;
  closeReason: 'end' | 'user' | null;
  ambiguousFills: number;
}
