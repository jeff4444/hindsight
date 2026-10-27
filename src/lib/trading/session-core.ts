/**
 * A trading session's rules, in one place, for the server and the browser alike.
 *
 * The API route and the in-browser demo both run every request through these functions, so the
 * demo on the landing page and `/lab/terminal` exercise exactly the logic the server does — only
 * the storage differs. Nothing here does I/O.
 *
 * A request is handled in four steps:
 *
 * 1. **The clock.** Touch the lease, apply a play / pause / speed / step, and read how many minutes
 *    are revealed — from the server's time, never from anything the client says.
 * 2. **The event.** Turn an order request into an `OrderEvent` in ticks and steps, stamped at the
 *    close of the last revealed minute.
 * 3. **The account.** Replay the whole log over the revealed tape (`simulate`).
 * 4. **The view.** Convert to dollars and send only the minutes the client does not have yet.
 */

import { closeAt, type Market } from '@/core/trading/market';
import { simulate, type SimulateResult } from '@/core/trading/simulator';
import {
  pause,
  play,
  revealedAt,
  setSpeed,
  step,
  touch,
  type SessionClock,
} from '@/core/trading/clock';
import { FEE_SCHEDULE, MARGIN, halfSpread } from '@/core/trading/costs';
import { MICROS, pow10, toSteps, toTicks } from '@/core/trading/instrument';
import { bestRoundTrip, buyAndHold, maxDrawdown, profitFactor, winRate } from '@/core/trading/metrics';
import type { AccountState, Fill, OrderEvent, OrderState, RejectReason, RoundTrip } from '@/core/trading/types';
import { BOTS, runBot } from '@/core/bots';
import { personaFor } from '@/lib/panel';
import type { SessionOp } from './schemas';
import type {
  AccountView,
  FillView,
  InstrumentView,
  OrderView,
  PanelRun,
  PositionView,
  SessionDelta,
  SessionOpen,
  SessionReview,
  SessionTime,
  TripView,
  WireBar,
} from './types';

export interface SessionRecord {
  id: string;
  purpose: 'main' | 'practice';
  ranked: boolean;
  datesVisible: boolean;
  source: string;
  scenario: { slug: string; name: string } | null;
  /** Equity when the session opened, micro-USDT. */
  starting: number;
  status: 'open' | 'closed';
  clock: SessionClock;
  /** The latest minute an event has been stamped at. Events never go back in time. */
  highWater: number;
  events: OrderEvent[];
}

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

/* ------------------------------------------------------------------ clock */

const CLOCK_OPS = new Set(['play', 'pause', 'speed', 'step']);

export interface ClockStep {
  clock: SessionClock;
  changed: boolean;
  away: boolean;
  revealed: number;
}

/** Step 1: the clock after this request. */
export function advanceClock(record: SessionRecord, op: SessionOp, now: number): ClockStep {
  if (record.status === 'closed') {
    return { clock: record.clock, changed: false, away: false, revealed: record.clock.total };
  }
  const touched = touch(record.clock, now);
  let clock = touched.clock;
  if (CLOCK_OPS.has(op.op)) {
    if (op.op === 'play') clock = play(clock, now);
    else if (op.op === 'pause') clock = pause(clock, now);
    else if (op.op === 'speed') clock = setSpeed(clock, now, op.speed);
    else if (op.op === 'step') clock = step(clock, now, op.minutes);
  }
  return {
    clock,
    changed: clock.version !== record.clock.version || touched.away,
    away: touched.away,
    revealed: revealedAt(clock, now),
  };
}

/* ------------------------------------------------------------------ events */

export type EventDraft = Omit<OrderEvent, 'seq'>;

/**
 * Step 2: an order request as an event, stamped at the close of the last revealed minute. Returns
 * null for a request that is not an order (a tick or a clock control).
 */
export function eventFor(op: SessionOp, market: Market, at: number): { event: EventDraft | null; error?: string } {
  const instrument = market.instrument;
  const ticks = (value: number) => toTicks(value, instrument);
  switch (op.op) {
    case 'place': {
      const side = op.side;
      const mark = closeAt(market, at);
      const reference =
        op.type === 'limit'
          ? ticks(op.price as number)
          : op.type === 'stop'
            ? ticks(op.stopPrice as number)
            : side === 'buy'
              ? mark + halfSpread(mark, FEE_SCHEDULE)
              : mark - halfSpread(mark, FEE_SCHEDULE);
      const qty =
        op.qty !== undefined
          ? toSteps(op.qty, instrument)
          : Math.floor(((op.notional as number) * MICROS) / Math.max(1, reference));
      if (!(qty > 0)) return { event: null, error: 'That quantity rounds to nothing at this market’s lot size.' };
      return {
        event: {
          kind: 'place',
          at,
          order: {
            id: op.clientOrderId,
            side,
            type: op.type,
            qty,
            price: op.type === 'limit' ? ticks(op.price as number) : undefined,
            stopPrice: op.type === 'stop' ? ticks(op.stopPrice as number) : undefined,
            reduceOnly: op.reduceOnly ?? false,
            role: op.reduceOnly ? 'close' : 'entry',
          },
          takeProfit: op.takeProfit !== undefined ? ticks(op.takeProfit) : undefined,
          stopLoss: op.stopLoss !== undefined ? ticks(op.stopLoss) : undefined,
        } as EventDraft,
      };
    }
    case 'modify':
      return {
        event: {
          kind: 'modify',
          at,
          orderId: op.orderId,
          price: op.price !== undefined ? ticks(op.price) : undefined,
          stopPrice: op.stopPrice !== undefined ? ticks(op.stopPrice) : undefined,
          qty: op.qty !== undefined ? toSteps(op.qty, instrument) : undefined,
        } as EventDraft,
      };
    case 'cancel':
      return { event: { kind: 'cancel', at, orderId: op.orderId } as EventDraft };
    case 'cancel-all':
      return { event: { kind: 'cancel-all', at } as EventDraft };
    case 'close-position':
      return { event: { kind: 'close-position', at, fraction: op.fraction } as EventDraft };
    case 'end':
      return { event: { kind: 'end', at } as EventDraft };
    default:
      return { event: null };
  }
}

/** The minute an event made now is stamped at: the last revealed close, never earlier than before. */
export function stampAt(record: SessionRecord, revealed: number): number {
  return Math.max(revealed - 1, record.highWater);
}

/* ------------------------------------------------------------------ account */

/** Step 3: the account, replayed from the log over what is revealed. */
export function project(record: SessionRecord, market: Market, revealed: number): SimulateResult {
  return simulate(market, record.events, { starting: record.starting, upTo: revealed });
}

/* ------------------------------------------------------------------ views */

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

function converters(market: Market) {
  const { tickExp, qtyExp, priceDecimals, qtyDecimals } = market.instrument;
  return {
    price: (ticks: number) => Number((ticks * pow10(tickExp)).toFixed(priceDecimals + 2)),
    qty: (steps: number) => Number((steps * pow10(qtyExp)).toFixed(qtyDecimals)),
    usd: (micros: number) => micros / MICROS,
  };
}

export function wireBars(bars: readonly { o: number; h: number; l: number; c: number; v: number }[]): WireBar[] {
  return bars.map((b) => [b.o, b.h, b.l, b.c, b.v > 0 ? Number(b.v.toPrecision(6)) : 0]);
}

export function orderView(order: OrderState, market: Market): OrderView {
  const c = converters(market);
  return {
    id: order.id,
    side: order.side,
    type: order.type,
    qty: c.qty(order.qty),
    price: order.price !== undefined ? c.price(order.price) : null,
    stopPrice: order.stopPrice !== undefined ? c.price(order.stopPrice) : null,
    role: order.role,
    reduceOnly: order.reduceOnly,
    status: order.status,
    parentId: order.parentId ?? null,
    placedAt: order.placedAt,
    filledAt: order.filledAt ?? null,
    fillPrice: order.fillPrice !== undefined ? c.price(order.fillPrice) : null,
    filledQty: order.filledQty !== undefined ? c.qty(order.filledQty) : null,
    reason: order.cancelReason ?? order.rejectReason ?? null,
    closedAt: order.closedAt ?? order.filledAt ?? null,
  };
}

export function fillView(fill: Fill, market: Market): FillView {
  const c = converters(market);
  return {
    n: fill.n,
    orderId: fill.orderId,
    at: fill.at,
    side: fill.side,
    qty: c.qty(fill.qty),
    price: c.price(fill.price),
    notional: c.usd(fill.notional),
    fee: c.usd(fill.fee),
    liquidity: fill.liquidity,
    role: fill.role,
    realized: c.usd(fill.realized),
    gap: fill.gap,
    ambiguous: fill.ambiguous,
  };
}

export function tripView(trip: RoundTrip, market: Market): TripView {
  const c = converters(market);
  const unit = pow10(market.instrument.tickExp);
  return {
    side: trip.side,
    openedAt: trip.openedAt,
    closedAt: trip.closedAt,
    maxQty: c.qty(trip.maxQty),
    entryAvg: trip.entryAvg * unit,
    exitAvg: trip.exitAvg * unit,
    gross: c.usd(trip.gross),
    fees: c.usd(trip.fees),
    net: c.usd(trip.net),
    mfe: c.usd(trip.mfe),
    mae: c.usd(trip.mae),
  };
}

export function accountView(state: AccountState, starting: number): AccountView {
  const usd = (micros: number) => micros / MICROS;
  const cap = MARGIN.maxGrossLeverage * state.equity;
  return {
    equity: usd(state.equity),
    cash: usd(state.cash),
    unrealizedPnl: usd(state.unrealized),
    realizedPnl: usd(state.realized),
    fees: usd(state.fees),
    buyingPower: usd(state.buyingPower),
    grossExposure: usd(state.gross),
    marginUsed: cap > 0 ? Math.min(1, (state.gross + state.reserved) / cap) : 1,
    startingEquity: usd(starting),
    sessionPnl: usd(state.equity - starting),
    sessionReturn: starting > 0 ? state.equity / starting - 1 : 0,
    bankrupt: state.bankrupt,
  };
}

export function positionView(state: AccountState, market: Market): PositionView | null {
  const { qty, basis } = state.position;
  if (qty === 0) return null;
  const c = converters(market);
  const unit = pow10(market.instrument.tickExp);
  return {
    side: qty > 0 ? 'long' : 'short',
    qty: c.qty(Math.abs(qty)),
    avgPrice: (basis / qty) * unit,
    markPrice: c.price(state.mark),
    unrealizedPnl: c.usd(state.unrealized),
    unrealizedPct: basis !== 0 ? state.unrealized / Math.abs(basis) : 0,
    notional: c.usd(Math.abs(qty) * state.mark),
    liquidationPrice: state.liquidationPrice !== null ? state.liquidationPrice * unit : null,
    openedAt: state.openTrip?.openedAt ?? null,
  };
}

export interface DeltaExtras {
  since: number;
  away?: boolean;
  rejected?: { orderId: string | null; reason: string; text: string } | null;
}

/** Step 4: what the client needs, and not one minute more. */
export function toDelta(record: SessionRecord, market: Market, sim: SimulateResult, revealed: number, extras: DeltaExtras): SessionDelta {
  const state = sim.state;
  const from = Math.min(extras.since, revealed);
  return {
    sessionId: record.id,
    status: state.closed ? 'closed' : record.status,
    clock: {
      revealed,
      total: record.clock.total,
      paused: record.clock.paused || state.closed,
      speed: record.clock.speed,
    },
    bars: { from, data: wireBars(market.tape.slice(from, revealed)) },
    account: accountView(state, record.starting),
    position: positionView(state, market),
    orders: state.open.map((order) => orderView(order, market)),
    history: state.done.slice(-100).reverse().map((order) => orderView(order, market)),
    fills: state.fills.map((fill) => fillView(fill, market)),
    trips: state.trips.map((trip) => tripView(trip, market)),
    rejected: extras.rejected ?? null,
    away: extras.away ?? false,
  };
}

export function sessionTime(record: SessionRecord, market: Market): SessionTime {
  return record.datesVisible
    ? { kind: 'absolute', startMs: market.startMs }
    : { kind: 'relative', weekday: market.start.weekday, minuteOfDay: market.start.minuteOfDay };
}

export function toOpen(record: SessionRecord, market: Market, sim: SimulateResult, revealed: number): SessionOpen {
  return {
    ...toDelta(record, market, sim, revealed, { since: 0 }),
    instrument: instrumentView(market),
    chart: {
      hours: wireBars(market.historyHours),
      minutes: wireBars(market.historyMinutes),
      refClose: market.refClose,
    },
    time: sessionTime(record, market),
    purpose: record.purpose,
    ranked: record.ranked,
    source: record.source,
    scenario: record.scenario,
  };
}

/** The rejection, if any, of the event with this sequence number. */
export function rejectionOf(sim: SimulateResult, seq: number): DeltaExtras['rejected'] {
  const result = sim.results.get(seq);
  if (!result?.rejected) return null;
  return { orderId: result.orderId ?? null, reason: result.rejected, text: REJECT_TEXT[result.rejected] };
}

/* ------------------------------------------------------------------ in-memory apply */

export interface ApplyOutcome {
  record: SessionRecord;
  delta: SessionDelta;
  sim: SimulateResult;
  revealed: number;
}

/**
 * The whole request against a record held in memory: what the browser-only driver does, and what
 * the server does around its storage calls.
 */
export function applyOp(record: SessionRecord, market: Market, op: SessionOp, now: number, since: number): ApplyOutcome {
  const clockStep = advanceClock(record, op, now);
  let next: SessionRecord = { ...record, clock: clockStep.clock };
  let revealed = clockStep.revealed;

  let rejected: DeltaExtras['rejected'] = null;
  let appended: OrderEvent | null = null;
  if (record.status === 'open') {
    const at = stampAt(next, revealed);
    const { event, error } = eventFor(op, market, at);
    if (error) rejected = { orderId: null, reason: 'invalid', text: error };
    if (event) {
      appended = { ...event, seq: next.events.length + 1 } as OrderEvent;
      next = { ...next, events: [...next.events, appended], highWater: at };
    }
  } else if (op.op !== 'tick') {
    rejected = { orderId: null, reason: 'session-closed', text: REJECT_TEXT['session-closed'] };
  }

  const sim = project(next, market, revealed);
  if (appended) rejected = rejectionOf(sim, appended.seq) ?? rejected;
  if (sim.state.closed && next.status === 'open') {
    next = { ...next, status: 'closed', clock: { ...next.clock, paused: true } };
    revealed = sim.state.closeReason === 'end' ? next.clock.total : revealed;
  }
  return {
    record: next,
    sim,
    revealed,
    delta: toDelta(next, market, sim, revealed, { since, away: clockStep.away, rejected }),
  };
}

/* ------------------------------------------------------------------ review */

/** Each school's run on this market, with the trader's own starting equity. */
export function panelFor(market: Market, starting: number): PanelRun[] {
  return BOTS.map((spec) => {
    const run = runBot(spec, market, starting);
    const state = run.state;
    return {
      code: spec.code,
      name: personaFor(spec.code)?.name ?? spec.code,
      returnPct: starting > 0 ? state.cash / starting - 1 : 0,
      pnl: (state.cash - starting) / MICROS,
      trades: state.trips.length,
      wins: state.trips.filter((trip) => trip.net > 0).length,
      fills: state.fills.map((fill) => fillView(fill, market)),
      trips: state.trips.map((trip) => tripView(trip, market)),
      decisions: run.decisions.map((d) => ({ at: d.at, action: d.action, direction: d.direction, rules: d.rules })),
    };
  });
}

/** The largest notional held at any moment, which is what "your size" means for a benchmark. */
export function sizeBasis(fills: readonly Fill[], starting: number): number {
  let largest = 0;
  for (const fill of fills) largest = Math.max(largest, Math.abs(fill.positionAfter) * fill.price);
  return largest > 0 ? largest : starting;
}

export interface ReviewOptions {
  /** Real dates may be shown. False while a daily's embargo runs. */
  showDates: boolean;
  embargoedUntil?: string | null;
  synthetic?: boolean;
  panel?: PanelRun[];
}

export function buildReview(record: SessionRecord, market: Market, state: AccountState, options: ReviewOptions): SessionReview {
  const usd = (micros: number) => micros / MICROS;
  const basis = sizeBasis(state.fills, record.starting);
  const bench = (b: ReturnType<typeof buyAndHold> | null) =>
    b === null
      ? null
      : {
          ...b,
          entryPrice: b.entryPrice * pow10(market.instrument.tickExp),
          exitPrice: b.exitPrice * pow10(market.instrument.tickExp),
          pnl: usd(b.pnl),
        };
  const ending = state.cash;
  return {
    sessionId: record.id,
    instrument: instrumentView(market),
    identity: {
      symbol: market.instrument.display,
      venue: market.instrument.venue,
      startMs: options.showDates ? market.startMs : null,
      endMs: options.showDates ? market.startMs + market.tape.length * 60_000 : null,
      embargoedUntil: options.embargoedUntil ?? null,
      synthetic: options.synthetic ?? false,
    },
    time: options.showDates
      ? { kind: 'absolute', startMs: market.startMs }
      : { kind: 'relative', weekday: market.start.weekday, minuteOfDay: market.start.minuteOfDay },
    chart: {
      hours: wireBars(market.historyHours),
      minutes: wireBars(market.historyMinutes),
      refClose: market.refClose,
    },
    tape: wireBars(market.tape),
    summary: {
      startingEquity: usd(record.starting),
      endingEquity: usd(ending),
      pnl: usd(ending - record.starting),
      returnPct: record.starting > 0 ? ending / record.starting - 1 : 0,
      fees: usd(state.fees),
      trades: state.trips.length,
      winRate: winRate(state.trips),
      profitFactor: profitFactor(state.trips),
      maxDrawdown: maxDrawdown([record.starting, ...state.hourlyEquity, ending]).fraction,
      ambiguousFills: state.ambiguousFills,
      closeReason: state.closeReason ?? 'end',
      bankrupt: state.bankrupt,
    },
    equityCurve: [record.starting, ...state.hourlyEquity].map(usd),
    fills: state.fills.map((fill) => fillView(fill, market)),
    trips: state.trips.map((trip) => tripView(trip, market)),
    orders: state.done.map((order) => orderView(order, market)),
    benchmarks: {
      sizeBasis: usd(basis),
      buyAndHold: bench(buyAndHold(market.refClose, market.tape, basis, FEE_SCHEDULE))!,
      bestLong: bench(bestRoundTrip('long', market.refClose, market.tape, basis, FEE_SCHEDULE)),
      bestShort: bench(bestRoundTrip('short', market.refClose, market.tape, basis, FEE_SCHEDULE)),
    },
    panel: options.panel ?? panelFor(market, record.starting),
  };
}
