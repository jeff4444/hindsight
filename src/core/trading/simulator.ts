/**
 * The exchange: orders in, fills out, against the one-minute tape.
 *
 * This generalises `src/core/resolve.ts` from one bracket to an order book. The published rules
 * are docs/rules.md §22.4 and must be kept in sync with this file. In short:
 *
 * 1. **Time.** An event stamped `at = i` happens at the close of minute `i`, after that minute's
 *    intrabar fills. A resting order placed at `i` is live from minute `i + 1`.
 * 2. **Market orders** fill at once at the last trade price, buying the ask and selling the bid.
 * 3. **Limits** fill when the ask (for a buy) trades down to the limit, at the limit or at a
 *    better open. A limit that is already marketable fills at once, as a taker.
 * 4. **Stops** trigger on the wick and fill at the trigger or a worse open, plus slippage. A stop
 *    that would trigger the moment it is placed is rejected.
 * 5. **Inside one minute** the path is open → low → high → close or open → high → low → close and
 *    the bar cannot say which. Both are simulated; when they disagree, the one that leaves the
 *    account poorer at the close is taken and its fills are flagged `ambiguous`. For a single
 *    stop-and-target bracket that is exactly the resolver's stop-first rule (§12.3.2).
 * 6. **Take-profit and stop-loss** attach to an entry as a one-cancels-other pair and wake up
 *    when it fills. They are reduce-only: they shrink to the position, and when the position is
 *    flat they are cancelled.
 * 7. **Margin.** Exposure may not exceed 2× equity. Below 25% equity-to-exposure the position is
 *    liquidated at market, with a fee, and every order is cancelled.
 * 8. **The end of the tape** cancels everything and flattens at the last close.
 *
 * Everything is integer arithmetic in ticks, steps and micro-USDT, so a replay of the same log
 * over the same tape produces the same account to the micro, forever.
 */

import { closeAt, type Market } from './market';
import {
  FEE_SCHEDULE,
  MARGIN,
  commission,
  halfSpread,
  slippage,
  type FeeSchedule,
  type MarginRules,
} from './costs';
import type {
  AccountState,
  CancelReason,
  Fill,
  FillRole,
  OrderEvent,
  OrderSpec,
  OrderState,
  RejectReason,
  RoundTrip,
  Side,
} from './types';
import { pow10 } from './instrument';

export interface SimulatorOptions {
  market: Market;
  /** Starting cash, micro-USDT. */
  starting: number;
  fees?: FeeSchedule;
  margin?: MarginRules;
  /**
   * An order may not exceed this share of the trailing 24 hours' traded value (ours, §22.4).
   * Zero disables the guard.
   */
  liquidityShare?: number;
}

export const LIQUIDITY_SHARE = 0.05;

export interface ApplyResult {
  rejected?: RejectReason;
  /** The order the event created or touched, if any. */
  orderId?: string;
}

/* ------------------------------------------------------------------ internal state */

interface Trip {
  side: 'long' | 'short';
  openedAt: number;
  maxQty: number;
  entryQty: number;
  entryNotional: number;
  exitQty: number;
  exitNotional: number;
  gross: number;
  fees: number;
  mfe: number;
  mae: number;
  fills: number;
}

interface Book {
  cash: number;
  realized: number;
  fees: number;
  qty: number;
  basis: number;
  open: OrderState[];
  trip: Trip | null;
  bankrupt: boolean;
}

/** One possible history of a minute: the book after it, and what happened along the way. */
interface Run {
  book: Book;
  fills: Fill[];
  done: OrderState[];
  trips: RoundTrip[];
}

interface Trigger {
  /** The price at which the condition starts to hold. Real-valued for liquidation. */
  level: number;
  /** 'down': fires when price ≤ level. 'up': fires when price ≥ level. */
  dir: 'up' | 'down';
  /** Lower fires first among equal distances: liquidation, then stops, then limits. */
  rank: number;
}

const sign = (value: number) => (value > 0 ? 1 : value < 0 ? -1 : 0);

function cloneBook(book: Book): Book {
  return {
    ...book,
    open: book.open.map((order) => ({ ...order })),
    trip: book.trip ? { ...book.trip } : null,
  };
}

function tripView(trip: Trip, closedAt: number): RoundTrip {
  const net = trip.gross - trip.fees;
  return {
    side: trip.side,
    openedAt: trip.openedAt,
    closedAt,
    maxQty: trip.maxQty,
    entryAvg: trip.entryQty > 0 ? trip.entryNotional / trip.entryQty : 0,
    exitAvg: trip.exitQty > 0 ? trip.exitNotional / trip.exitQty : 0,
    gross: trip.gross,
    fees: trip.fees,
    net,
    mfe: trip.mfe,
    mae: trip.mae,
    fills: trip.fills,
  };
}

/* ---------------------------------------------------------------------- simulator */

export class Simulator {
  readonly market: Market;
  readonly fees: FeeSchedule;
  readonly margin: MarginRules;
  readonly starting: number;
  readonly total: number;

  private book: Book;
  private done: OrderState[] = [];
  private fills: Fill[] = [];
  private trips: RoundTrip[] = [];
  private hourlyEquity: number[] = [];
  private ids = new Set<string>();
  private current = -1;
  private closed = false;
  private closeReason: 'end' | 'user' | null = null;
  private ambiguousFills = 0;

  private readonly liquidityShare: number;
  private readonly quotePrefix: number[];
  private readonly historyQuote: number[];

  constructor(options: SimulatorOptions) {
    this.market = options.market;
    this.fees = options.fees ?? FEE_SCHEDULE;
    this.margin = options.margin ?? MARGIN;
    this.starting = options.starting;
    this.total = options.market.tape.length;
    this.liquidityShare = options.liquidityShare ?? LIQUIDITY_SHARE;
    this.book = {
      cash: options.starting,
      realized: 0,
      fees: 0,
      qty: 0,
      basis: 0,
      open: [],
      trip: null,
      bankrupt: false,
    };

    // Traded value per minute and per history hour, in micro-USDT: base units over the step is
    // steps, and steps × ticks is micros.
    const perStep = pow10(-this.market.instrument.qtyExp);
    this.quotePrefix = [0];
    for (const bar of this.market.tape) {
      this.quotePrefix.push(this.quotePrefix[this.quotePrefix.length - 1] + bar.v * perStep * bar.c);
    }
    this.historyQuote = this.market.historyHours.map((bar) => bar.v * perStep * bar.c);
  }

  /** The last minute processed. −1 before the tape starts. */
  get at(): number {
    return this.current;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** The trade price now. */
  get mark(): number {
    return closeAt(this.market, this.current);
  }

  /**
   * Process every minute up to and including `toMinute`. Does nothing once the session is closed.
   * Reaching the last minute does not close the session by itself — call `finish()` after
   * applying that minute's events, which is what `simulate` does.
   */
  advance(toMinute: number): void {
    const target = Math.min(toMinute, this.total - 1);
    while (!this.closed && this.current < target) {
      this.processMinute(this.current + 1);
    }
  }

  /** Close the session at the end of the tape: cancel everything and flatten at the last close. */
  finish(): void {
    if (this.closed) return;
    this.advance(this.total - 1);
    this.flatten('end');
  }

  /** Apply one event at the close of the current minute. Events must arrive in `at` order. */
  apply(event: OrderEvent): ApplyResult {
    if (event.at !== this.current) {
      throw new Error(`event at ${event.at} applied at minute ${this.current}`);
    }
    if (this.closed) {
      if (event.kind === 'place') {
        this.recordRejected(event, 'session-closed');
        return { rejected: 'session-closed', orderId: event.order.id };
      }
      return { rejected: 'session-closed' };
    }

    switch (event.kind) {
      case 'place':
        return this.place(event);
      case 'modify':
        return this.modify(event);
      case 'cancel': {
        const order = this.book.open.find((o) => o.id === event.orderId);
        if (!order) return { rejected: 'unknown-order', orderId: event.orderId };
        const run = this.mainRun();
        this.cancelWithChildren(run, order, 'user');
        this.commit(run);
        return { orderId: order.id };
      }
      case 'cancel-all': {
        const run = this.mainRun();
        for (const order of [...run.book.open]) this.cancel(run, order, 'user');
        this.commit(run);
        return {};
      }
      case 'close-position':
        return this.closePosition(event.seq, event.fraction);
      case 'end':
        this.flatten('user');
        return {};
    }
  }

  /** Everything a screen needs, derived. */
  snapshot(): AccountState {
    const book = this.book;
    const mark = this.mark;
    const unrealized = book.qty * mark - book.basis;
    const equity = book.cash + unrealized;
    const gross = Math.abs(book.qty) * mark;
    const reserved = this.reserved(book);
    return {
      at: this.current,
      cash: book.cash,
      starting: this.starting,
      realized: book.realized,
      fees: book.fees,
      position: { qty: book.qty, basis: book.basis },
      mark,
      unrealized,
      equity,
      gross,
      reserved,
      buyingPower: Math.max(0, Math.floor(this.margin.maxGrossLeverage * equity - gross - reserved)),
      liquidationPrice: this.liquidationLevel(book),
      open: book.open.map((order) => ({ ...order })),
      done: this.done.map((order) => ({ ...order })),
      fills: [...this.fills],
      trips: [...this.trips],
      openTrip: book.trip ? tripView(book.trip, this.current) : null,
      hourlyEquity: [...this.hourlyEquity],
      bankrupt: book.bankrupt,
      closed: this.closed,
      closeReason: this.closeReason,
      ambiguousFills: this.ambiguousFills,
    };
  }

  /**
   * The largest quantity, in steps, that an order on `side` at `price` could have and still pass
   * the buying-power check right now. What a ticket's "100%" means.
   */
  maxQty(side: Side, price: number): number {
    if (!(price > 0)) return 0;
    const book = this.book;
    const equity = book.cash + book.qty * this.mark - book.basis;
    const room = this.margin.maxGrossLeverage * equity - this.reserved(book);
    if (room <= 0) return side === 'buy' ? Math.max(0, -book.qty) : Math.max(0, book.qty);
    // |q + s| × price ≤ room, with s signed by side.
    const s = side === 'buy' ? 1 : -1;
    const limit = Math.floor(room / price);
    return Math.max(0, s * -book.qty + limit);
  }

  /** Trailing 24-hour traded value at the current minute, micro-USDT. Zero when unknown. */
  trailingValue(): number {
    const end = this.current + 1; // minutes revealed
    if (!this.market.tapeHasVolume) {
      return this.historyQuote.slice(-24).reduce((sum, v) => sum + v, 0);
    }
    const from = Math.max(0, end - 1440);
    let value = this.quotePrefix[end] - this.quotePrefix[from];
    const missingMinutes = 1440 - (end - from);
    if (missingMinutes > 0) {
      const hours = Math.ceil(missingMinutes / 60);
      value += this.historyQuote.slice(-hours).reduce((sum, v) => sum + v, 0);
    }
    return value;
  }

  /* ------------------------------------------------------------------ events */

  private place(event: Extract<OrderEvent, { kind: 'place' }>): ApplyResult {
    const spec = event.order;
    const at = event.at;
    const reject = (reason: RejectReason): ApplyResult => {
      this.recordRejected(event, reason);
      return { rejected: reason, orderId: spec.id };
    };

    if (this.book.bankrupt) return reject('account-bankrupt');
    if (this.ids.has(spec.id)) return reject('invalid');
    if (!Number.isSafeInteger(spec.qty) || spec.qty <= 0) return reject('invalid');
    if (spec.type === 'limit' && !(Number.isSafeInteger(spec.price) && (spec.price as number) > 0)) {
      return reject('invalid');
    }
    if (spec.type === 'stop' && !(Number.isSafeInteger(spec.stopPrice) && (spec.stopPrice as number) > 0)) {
      return reject('invalid');
    }

    const close = this.mark;
    const up = spec.side === 'buy';
    const hs = halfSpread(close, this.fees);
    // Where the order expects to trade: the ask or bid for a market order, its own price otherwise.
    const reference =
      spec.type === 'limit'
        ? (spec.price as number)
        : spec.type === 'stop'
          ? (spec.stopPrice as number)
          : up
            ? close + hs
            : close - hs;
    const book = this.book;

    if (spec.reduceOnly) {
      const reduces = up ? book.qty < 0 : book.qty > 0;
      if (!reduces) return reject('reduce-only-no-position');
      if (event.takeProfit !== undefined || event.stopLoss !== undefined) return reject('bad-bracket');
    } else if (spec.qty * reference < this.market.instrument.minNotional) {
      return reject('min-notional');
    }

    // The bracket must sit on the right sides of where the entry will fill.
    if (event.takeProfit !== undefined) {
      if (!Number.isSafeInteger(event.takeProfit) || event.takeProfit <= 0) return reject('bad-bracket');
      if (up ? event.takeProfit <= reference : event.takeProfit >= reference) return reject('bad-bracket');
    }
    if (event.stopLoss !== undefined) {
      if (!Number.isSafeInteger(event.stopLoss) || event.stopLoss <= 0) return reject('bad-bracket');
      if (up ? event.stopLoss >= reference : event.stopLoss <= reference) return reject('bad-bracket');
    }

    if (spec.type === 'stop') {
      const stop = spec.stopPrice as number;
      if (up ? stop <= close : stop >= close) return reject('would-trigger-immediately');
    }

    if (!spec.reduceOnly) {
      const cap = this.liquidityShare > 0 ? this.liquidityShare * this.trailingValue() : 0;
      if (cap > 0 && spec.qty * reference > cap) return reject('liquidity');
      if (!this.withinMargin(book, spec.side, spec.qty, reference, close)) {
        return reject('insufficient-buying-power');
      }
    }

    const order: OrderState = {
      ...spec,
      status: 'working',
      seq: event.seq,
      placedAt: at,
      liveFrom: at + 1,
    };
    this.ids.add(spec.id);
    const children = this.childrenFor(order, event.takeProfit, event.stopLoss);

    const run = this.mainRun();
    run.book.open.push(order, ...children);

    const marketable =
      spec.type === 'market' ||
      (spec.type === 'limit' && (up ? (spec.price as number) >= close + hs : (spec.price as number) <= close - hs));

    if (marketable) {
      const price = up ? close + hs : close - hs;
      this.fillOrder(run, order, price, 'taker', at, false, at + 1);
    }

    this.cleanupReduceOnly(run, at);
    this.commit(run);
    return { orderId: spec.id };
  }

  private modify(event: Extract<OrderEvent, { kind: 'modify' }>): ApplyResult {
    const book = this.book;
    const order = book.open.find((o) => o.id === event.orderId);
    if (!order) return { rejected: 'unknown-order', orderId: event.orderId };

    const next = { ...order };
    if (event.qty !== undefined) next.qty = event.qty;
    if (event.price !== undefined) next.price = event.price;
    if (event.stopPrice !== undefined) next.stopPrice = event.stopPrice;

    if (!Number.isSafeInteger(next.qty) || next.qty <= 0) return { rejected: 'invalid', orderId: order.id };
    if (next.type === 'limit' && !(Number.isSafeInteger(next.price) && (next.price as number) > 0)) {
      return { rejected: 'invalid', orderId: order.id };
    }
    if (next.type === 'stop' && !(Number.isSafeInteger(next.stopPrice) && (next.stopPrice as number) > 0)) {
      return { rejected: 'invalid', orderId: order.id };
    }
    if (next.type === 'market') return { rejected: 'invalid', orderId: order.id };

    const close = this.mark;
    const up = next.side === 'buy';
    if (order.status === 'working' && next.type === 'stop') {
      const stop = next.stopPrice as number;
      if (up ? stop <= close : stop >= close) {
        return { rejected: 'would-trigger-immediately', orderId: order.id };
      }
    }
    const reference = next.type === 'limit' ? (next.price as number) : (next.stopPrice as number);
    if (!next.reduceOnly) {
      if (next.qty * reference < this.market.instrument.minNotional) {
        return { rejected: 'min-notional', orderId: order.id };
      }
      const others = { ...book, open: book.open.filter((o) => o.id !== order.id) };
      if (!this.withinMargin(others, next.side, next.qty, reference, close)) {
        return { rejected: 'insufficient-buying-power', orderId: order.id };
      }
    }

    const run = this.mainRun();
    const target = run.book.open.find((o) => o.id === order.id) as OrderState;
    target.qty = next.qty;
    target.price = next.price;
    target.stopPrice = next.stopPrice;
    target.liveFrom = event.at + 1;
    // An entry's resized quantity carries to its waiting take-profit and stop-loss.
    if (event.qty !== undefined) {
      for (const child of run.book.open) {
        if (child.parentId === target.id && child.status === 'pending') child.qty = next.qty;
      }
    }

    if (target.status === 'working' && target.type === 'limit') {
      const hs = halfSpread(close, this.fees);
      const marketable = up ? (target.price as number) >= close + hs : (target.price as number) <= close - hs;
      if (marketable) {
        this.fillOrder(run, target, up ? close + hs : close - hs, 'taker', event.at, false, event.at + 1);
      }
    }
    this.cleanupReduceOnly(run, event.at);
    this.commit(run);
    return { orderId: order.id };
  }

  private closePosition(seq: number, fraction: number): ApplyResult {
    const book = this.book;
    if (book.qty === 0) return { rejected: 'reduce-only-no-position' };
    const size = Math.abs(book.qty);
    const qty = fraction >= 1 ? size : Math.min(size, Math.max(1, Math.round(size * fraction)));
    const side: Side = book.qty > 0 ? 'sell' : 'buy';
    const id = `close-${seq}`;
    const order: OrderState = {
      id,
      side,
      type: 'market',
      qty,
      reduceOnly: true,
      role: 'close',
      status: 'working',
      seq,
      placedAt: this.current,
      liveFrom: this.current + 1,
    };
    this.ids.add(id);
    const run = this.mainRun();
    run.book.open.push(order);
    const close = this.mark;
    const hs = halfSpread(close, this.fees);
    this.fillOrder(run, order, side === 'buy' ? close + hs : close - hs, 'taker', this.current, false, this.current + 1);
    this.cleanupReduceOnly(run, this.current);
    this.commit(run);
    return { orderId: id };
  }

  /** Cancel everything and close the position at the last trade price. */
  private flatten(reason: 'end' | 'user'): void {
    const run = this.mainRun();
    for (const order of [...run.book.open]) this.cancel(run, order, 'session-end');
    if (run.book.qty !== 0) {
      const close = this.mark;
      const hs = halfSpread(close, this.fees);
      const side: Side = run.book.qty > 0 ? 'sell' : 'buy';
      const qty = Math.abs(run.book.qty);
      this.executeFill(run, `flatten-${this.current}`, side, qty, side === 'buy' ? close + hs : close - hs, 'taker', 'flatten', this.current, false, 0);
    }
    this.commit(run);
    this.closed = true;
    this.closeReason = reason;
  }

  /* ------------------------------------------------------------------ minutes */

  private processMinute(m: number): void {
    const bar = this.market.tape[m];
    const prevClose = closeAt(this.market, m - 1);

    if (this.mightTrigger(bar.h, bar.l, prevClose, m)) {
      const lowFirst = this.walk(m, false);
      const highFirst = this.walk(m, true);
      const signature = (run: Run) =>
        run.fills.map((f) => `${f.orderId}:${f.qty}:${f.price}:${f.role}`).join('|') +
        '#' +
        run.done.map((o) => `${o.id}:${o.status}`).join('|');

      let chosen = lowFirst;
      if (signature(lowFirst) !== signature(highFirst)) {
        const equity = (run: Run) => run.book.cash + run.book.qty * bar.c - run.book.basis;
        chosen = equity(highFirst) < equity(lowFirst) ? highFirst : lowFirst;
        for (const fill of chosen.fills) fill.ambiguous = true;
        this.ambiguousFills += chosen.fills.length;
      }
      this.commit(chosen);
    }

    this.current = m;
    this.markMinute(bar.h, bar.l);
    if (m % 60 === 59) {
      this.hourlyEquity.push(this.book.cash + this.book.qty * bar.c - this.book.basis);
    }
  }

  /** Could anything fill or liquidate in this minute? The fast path skips the walk when not. */
  private mightTrigger(high: number, low: number, prevClose: number, m: number): boolean {
    const top = Math.max(high, prevClose);
    const bottom = Math.min(low, prevClose);
    const liquidation = this.liquidationTrigger(this.book);
    if (liquidation && (liquidation.dir === 'down' ? bottom <= liquidation.level : top >= liquidation.level)) {
      return true;
    }
    for (const order of this.book.open) {
      if (order.status !== 'working' || order.liveFrom > m) continue;
      const trigger = this.triggerOf(order);
      if (!trigger) continue;
      if (trigger.dir === 'down' ? bottom <= trigger.level : top >= trigger.level) return true;
    }
    return false;
  }

  /** One possible intrabar history of minute `m`, on a copy of the book. */
  private walk(m: number, highFirst: boolean): Run {
    const bar = this.market.tape[m];
    const run: Run = { book: cloneBook(this.book), fills: [], done: [], trips: [] };
    const prevClose = closeAt(this.market, m - 1);
    const points = highFirst ? [bar.o, bar.h, bar.l, bar.c] : [bar.o, bar.l, bar.h, bar.c];

    // The jump from the last close to this open is a gap: anything it crosses fills at the open.
    this.segment(run, prevClose, bar.o, m, bar.o);
    for (let k = 0; k < points.length - 1; k++) this.segment(run, points[k], points[k + 1], m, null);
    return run;
  }

  /**
   * Walk price from `from` to `to`, firing whatever it reaches in the order it reaches it. Each
   * fill can wake or cancel other orders and move the liquidation price, so the next trigger is
   * found afresh after every one.
   */
  private segment(run: Run, from: number, to: number, m: number, gapOpen: number | null): void {
    let position = from;
    for (let guard = 0; guard < 1000; guard++) {
      let best: { order: OrderState | null; trigger: Trigger; distance: number } | null = null;

      const consider = (order: OrderState | null, trigger: Trigger) => {
        const distance = this.distance(position, to, trigger);
        if (distance === null) return;
        if (
          best === null ||
          distance < best.distance ||
          (distance === best.distance &&
            (trigger.rank < best.trigger.rank ||
              (trigger.rank === best.trigger.rank && (order?.seq ?? -1) < (best.order?.seq ?? -1))))
        ) {
          best = { order, trigger, distance };
        }
      };

      const liquidation = this.liquidationTrigger(run.book);
      if (liquidation) consider(null, liquidation);
      for (const order of run.book.open) {
        if (order.status !== 'working' || order.liveFrom > m) continue;
        const trigger = this.triggerOf(order);
        if (trigger) consider(order, trigger);
      }
      if (best === null) return;
      const chosen = best as { order: OrderState | null; trigger: Trigger; distance: number };

      // Where the condition first held: the open after a gap, the current price if it already
      // held, otherwise the level itself.
      const at =
        gapOpen !== null
          ? gapOpen
          : chosen.distance === 0
            ? position
            : chosen.trigger.level;
      const gap =
        gapOpen !== null &&
        (chosen.trigger.dir === 'down' ? gapOpen < chosen.trigger.level : gapOpen > chosen.trigger.level);

      if (chosen.order === null) {
        this.liquidate(run, at, m, gap);
      } else {
        const order = chosen.order;
        const price = this.fillPriceFor(order, at);
        const liquidity = order.type === 'limit' ? 'maker' : 'taker';
        this.fillOrder(run, order, price, liquidity, m, gap, m);
      }
      this.cleanupReduceOnly(run, m);
      if (gapOpen === null) position = at;
    }
  }

  /**
   * How far price must travel from `position` toward `to` before `trigger` holds. Zero when it
   * already holds; null when it never does on this segment.
   */
  private distance(position: number, to: number, trigger: Trigger): number | null {
    if (trigger.dir === 'down') {
      if (position <= trigger.level) return 0;
      return to <= trigger.level ? position - trigger.level : null;
    }
    if (position >= trigger.level) return 0;
    return to >= trigger.level ? trigger.level - position : null;
  }

  private triggerOf(order: OrderState): Trigger | null {
    if (order.type === 'stop') {
      const stop = order.stopPrice as number;
      return order.side === 'buy' ? { level: stop, dir: 'up', rank: 1 } : { level: stop, dir: 'down', rank: 1 };
    }
    if (order.type === 'limit') {
      const limit = order.price as number;
      const hs = halfSpread(limit, this.fees);
      // A buy fills when the ask reaches the limit: the trade price is half a spread lower.
      return order.side === 'buy'
        ? { level: limit - hs, dir: 'down', rank: 2 }
        : { level: limit + hs, dir: 'up', rank: 2 };
    }
    return null;
  }

  /** The fill for an order whose condition first held at trade price `at`. */
  private fillPriceFor(order: OrderState, at: number): number {
    const p = Math.round(at);
    const hs = halfSpread(p, this.fees);
    if (order.type === 'limit') {
      const limit = order.price as number;
      return order.side === 'buy' ? Math.min(limit, p + hs) : Math.max(limit, p - hs);
    }
    const slip = slippage(p, this.fees);
    return order.side === 'buy' ? p + hs + slip : Math.max(1, p - hs - slip);
  }

  /** Track the open trip's best and worst moments across this minute. */
  private markMinute(high: number, low: number): void {
    const book = this.book;
    if (!book.trip || book.qty === 0) return;
    const open = (price: number) => book.trip!.gross + book.qty * price - book.basis;
    const a = open(high);
    const b = open(low);
    book.trip.mfe = Math.max(book.trip.mfe, a, b);
    book.trip.mae = Math.min(book.trip.mae, a, b);
  }

  /* ------------------------------------------------------------------ margin */

  /** Notional held back by resting orders that would add exposure. */
  private reserved(book: Book): number {
    let total = 0;
    for (const order of book.open) {
      if (order.reduceOnly || order.status !== 'working') continue;
      const price = order.type === 'limit' ? (order.price as number) : (order.stopPrice as number);
      if (!price) continue;
      const opposes = order.side === 'buy' ? book.qty < 0 : book.qty > 0;
      const adds = opposes ? Math.max(0, order.qty - Math.abs(book.qty)) : order.qty;
      total += adds * price;
    }
    return total;
  }

  /** Would exposure after an order of this size still be inside the leverage cap? */
  private withinMargin(book: Book, side: Side, qty: number, price: number, mark: number): boolean {
    const signed = side === 'buy' ? qty : -qty;
    const equity = book.cash + book.qty * mark - book.basis;
    const exposureAfter = Math.abs(book.qty + signed) * price;
    const exposureNow = Math.abs(book.qty) * price;
    // Reducing exposure is always allowed.
    if (exposureAfter <= exposureNow) return true;
    return exposureAfter + this.reserved(book) <= this.margin.maxGrossLeverage * equity;
  }

  /**
   * The trade price at which equity falls to the maintenance share of exposure.
   *
   * Long: cash + qP − B < m·qP  ⇔  P < (B − cash) / (q(1 − m)).
   * Short (q, B negative): cash + qP − B < m·|q|P  ⇔  P > (cash − B) / (|q|(1 + m)).
   */
  private liquidationLevel(book: Book): number | null {
    if (book.qty === 0) return null;
    const m = this.margin.maintenanceRatio;
    if (book.qty > 0) {
      const level = (book.basis - book.cash) / (book.qty * (1 - m));
      return level > 0 ? level : null;
    }
    return (book.cash - book.basis) / (-book.qty * (1 + m));
  }

  private liquidationTrigger(book: Book): Trigger | null {
    const level = this.liquidationLevel(book);
    if (level === null) return null;
    return book.qty > 0 ? { level, dir: 'down', rank: 0 } : { level, dir: 'up', rank: 0 };
  }

  private liquidate(run: Run, at: number, m: number, gap: boolean): void {
    const book = run.book;
    for (const order of [...book.open]) this.cancel(run, order, 'liquidation');
    const side: Side = book.qty > 0 ? 'sell' : 'buy';
    const p = side === 'sell' ? Math.floor(at) : Math.ceil(at);
    const hs = halfSpread(p, this.fees);
    const slip = slippage(p, this.fees);
    const price = side === 'sell' ? Math.max(1, p - hs - slip) : p + hs + slip;
    const qty = Math.abs(book.qty);
    const extra = commission(qty * price, this.margin.liquidationFeeBps);
    this.executeFill(run, `liquidation-${m}`, side, qty, price, 'taker', 'liquidation', m, gap, extra);
    if (book.cash <= 0) {
      book.cash = 0;
      book.bankrupt = true;
    }
  }

  /* ------------------------------------------------------------------ fills */

  /**
   * Fill an order (subject to reduce-only clipping and the margin check), then do everything a
   * fill sets off: one-cancels-other, waking its take-profit and stop-loss.
   */
  private fillOrder(
    run: Run,
    order: OrderState,
    price: number,
    liquidity: 'maker' | 'taker',
    m: number,
    gap: boolean,
    childrenLiveFrom: number,
  ): void {
    const book = run.book;
    let qty = order.qty;

    if (order.reduceOnly) {
      const reduces = order.side === 'buy' ? book.qty < 0 : book.qty > 0;
      if (!reduces) {
        this.cancel(run, order, 'position-closed', m);
        return;
      }
      qty = Math.min(qty, Math.abs(book.qty));
    } else if (!this.fillWithinMargin(book, order, qty, price)) {
      this.cancelWithChildren(run, order, 'margin', m);
      return;
    }

    this.executeFill(run, order.id, order.side, qty, price, liquidity, order.role, m, gap, 0);

    order.status = 'filled';
    order.filledAt = m;
    order.fillPrice = price;
    order.filledQty = qty;
    book.open = book.open.filter((o) => o !== order);
    run.done.push(order);

    if (order.ocoGroup) {
      for (const sibling of [...book.open]) {
        if (sibling.ocoGroup === order.ocoGroup && sibling.id !== order.id) {
          this.cancel(run, sibling, 'oco', m);
        }
      }
    }
    for (const child of book.open) {
      if (child.parentId === order.id && child.status === 'pending') {
        child.status = 'working';
        child.liveFrom = childrenLiveFrom;
      }
    }
  }

  /** The margin check at the moment of filling, at the fill price, net of the order itself. */
  private fillWithinMargin(book: Book, order: OrderState, qty: number, price: number): boolean {
    const signed = order.side === 'buy' ? qty : -qty;
    const after = Math.abs(book.qty + signed) * price;
    if (after <= Math.abs(book.qty) * price) return true;
    const equity = book.cash + book.qty * price - book.basis;
    const others = this.reserved({ ...book, open: book.open.filter((o) => o !== order) });
    return after + others <= this.margin.maxGrossLeverage * equity;
  }

  /** Move the position and the cash. `extraFee` is the liquidation fee, when there is one. */
  private executeFill(
    run: Run,
    orderId: string,
    side: Side,
    qty: number,
    price: number,
    liquidity: 'maker' | 'taker',
    role: FillRole,
    m: number,
    gap: boolean,
    extraFee: number,
  ): void {
    const book = run.book;
    const notional = qty * price;
    const fee =
      commission(notional, liquidity === 'maker' ? this.fees.makerBps : this.fees.takerBps) + extraFee;
    const signed = side === 'buy' ? qty : -qty;
    const q = book.qty;

    let closing = 0;
    let realized = 0;
    if (q !== 0 && sign(q) !== sign(signed)) {
      closing = Math.min(qty, Math.abs(q));
      const released = closing === Math.abs(q) ? book.basis : Math.round((book.basis * closing) / Math.abs(q));
      realized = sign(q) * closing * price - released;
      book.basis -= released;
      book.qty = q + sign(signed) * closing;
    }
    const opening = qty - closing;
    if (opening > 0) {
      book.qty += sign(signed) * opening;
      book.basis += sign(signed) * opening * price;
    }

    book.cash += realized - fee;
    book.realized += realized;
    book.fees += fee;

    const closingFee = qty > 0 ? Math.round((fee * closing) / qty) : 0;
    const openingFee = fee - closingFee;

    if (closing > 0 && book.trip) {
      const trip = book.trip;
      trip.exitQty += closing;
      trip.exitNotional += closing * price;
      trip.gross += realized;
      trip.fees += closingFee;
      trip.fills += 1;
      if (book.qty === 0 || opening > 0) {
        run.trips.push(tripView(trip, m));
        book.trip = null;
      }
    }
    if (opening > 0) {
      if (!book.trip) {
        book.trip = {
          side: signed > 0 ? 'long' : 'short',
          openedAt: m,
          maxQty: 0,
          entryQty: 0,
          entryNotional: 0,
          exitQty: 0,
          exitNotional: 0,
          gross: 0,
          fees: 0,
          mfe: 0,
          mae: 0,
          fills: 0,
        };
      }
      const trip = book.trip;
      trip.entryQty += opening;
      trip.entryNotional += opening * price;
      trip.fees += openingFee;
      trip.fills += 1;
    }
    if (book.trip) {
      book.trip.maxQty = Math.max(book.trip.maxQty, Math.abs(book.qty));
      const open = book.trip.gross + book.qty * price - book.basis;
      book.trip.mfe = Math.max(book.trip.mfe, open);
      book.trip.mae = Math.min(book.trip.mae, open);
    }

    run.fills.push({
      n: 0,
      orderId,
      at: m,
      side,
      qty,
      price,
      notional,
      fee,
      liquidity,
      role,
      gap,
      ambiguous: false,
      realized,
      positionAfter: book.qty,
    });
  }

  /* ------------------------------------------------------------------ bookkeeping */

  private childrenFor(order: OrderState, takeProfit?: number, stopLoss?: number): OrderState[] {
    const children: OrderState[] = [];
    const exit: Side = order.side === 'buy' ? 'sell' : 'buy';
    const base = {
      side: exit,
      qty: order.qty,
      reduceOnly: true,
      parentId: order.id,
      ocoGroup: order.id,
      status: 'pending' as const,
      seq: order.seq,
      placedAt: order.placedAt,
      liveFrom: order.liveFrom,
    };
    if (takeProfit !== undefined) {
      const id = `${order.id}:tp`;
      this.ids.add(id);
      children.push({ ...base, id, type: 'limit', price: takeProfit, role: 'take-profit' });
    }
    if (stopLoss !== undefined) {
      const id = `${order.id}:sl`;
      this.ids.add(id);
      children.push({ ...base, id, type: 'stop', stopPrice: stopLoss, role: 'stop-loss' });
    }
    return children;
  }

  /** Reduce-only orders that can no longer reduce anything are cancelled. */
  private cleanupReduceOnly(run: Run, m: number): void {
    const book = run.book;
    for (const order of [...book.open]) {
      if (!order.reduceOnly || order.status !== 'working') continue;
      const reduces = order.side === 'buy' ? book.qty < 0 : book.qty > 0;
      if (!reduces) this.cancel(run, order, 'position-closed', m);
    }
  }

  private cancel(run: Run, order: OrderState, reason: CancelReason, m: number = this.current): void {
    run.book.open = run.book.open.filter((o) => o !== order);
    order.status = 'canceled';
    order.cancelReason = reason;
    order.closedAt = m;
    run.done.push(order);
  }

  /** Cancel an order and the take-profit and stop-loss waiting on it. */
  private cancelWithChildren(run: Run, order: OrderState, reason: CancelReason, m: number = this.current): void {
    this.cancel(run, order, reason, m);
    for (const child of [...run.book.open]) {
      if (child.parentId === order.id && child.status === 'pending') {
        this.cancel(run, child, 'parent-canceled', m);
      }
    }
  }

  private recordRejected(event: Extract<OrderEvent, { kind: 'place' }>, reason: RejectReason): void {
    const spec: OrderSpec = event.order;
    this.done.push({
      ...spec,
      status: 'rejected',
      seq: event.seq,
      placedAt: event.at,
      liveFrom: event.at + 1,
      rejectReason: reason,
      closedAt: event.at,
    });
  }

  /** A run over the live book, for changes made at a minute's close rather than inside it. */
  private mainRun(): Run {
    return { book: this.book, fills: [], done: [], trips: [] };
  }

  /** Make a run the account's history. */
  private commit(run: Run): void {
    this.book = run.book;
    for (const fill of run.fills) {
      fill.n = this.fills.length + 1;
      this.fills.push(fill);
    }
    this.done.push(...run.done);
    this.trips.push(...run.trips);
    run.fills = [];
    run.done = [];
    run.trips = [];
  }
}

/* ---------------------------------------------------------------------- fold */

export interface SimulateOptions extends Omit<SimulatorOptions, 'market'> {
  /** Minutes revealed: the replay is processed through minute `upTo − 1` and no further. */
  upTo: number;
}

export interface SimulateResult {
  state: AccountState;
  /** What each event did, by sequence number. */
  results: Map<number, ApplyResult>;
}

/**
 * Replay a log. The account is whatever this returns: there is no stored running balance.
 *
 * Reads `market.tape` only below `upTo`, so a response built from it cannot contain a minute the
 * trader has not reached. When `upTo` is the whole tape the session is finished and flattened.
 */
export function simulate(market: Market, events: OrderEvent[], options: SimulateOptions): SimulateResult {
  const sim = new Simulator({ ...options, market });
  const ordered = [...events].sort((a, b) => a.at - b.at || a.seq - b.seq);
  const results = new Map<number, ApplyResult>();
  const last = Math.min(options.upTo, market.tape.length) - 1;

  for (const event of ordered) {
    if (event.at > last) break;
    if (sim.isClosed) {
      results.set(event.seq, sim.apply({ ...event, at: sim.at } as OrderEvent));
      continue;
    }
    sim.advance(event.at);
    results.set(event.seq, sim.apply(event));
  }
  sim.advance(last);
  if (options.upTo >= market.tape.length) sim.finish();
  return { state: sim.snapshot(), results };
}
