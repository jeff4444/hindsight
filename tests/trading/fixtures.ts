import type { Bar } from '@/core/bars';
import type { Instrument } from '@/core/trading/instrument';
import type { Market } from '@/core/trading/market';
import type { FeeSchedule } from '@/core/trading/costs';
import type { OrderEvent, OrderSpec } from '@/core/trading/types';
import { INSTRUMENT_VERSION } from '@/core/versions';

/**
 * A test instrument with a 0.01 tick and a 0.0001 step, so a price of 10000 ticks is $100.00 and
 * one step at that price is a notional of 10000 micro-USDT — one cent.
 */
export const TEST_INSTRUMENT: Instrument = {
  symbol: 'TESTUSDT',
  base: 'TEST',
  quote: 'USDT',
  display: 'TEST/USDT',
  venue: 'Binance spot',
  tickExp: -2,
  tickSize: 0.01,
  qtyExp: -4,
  qtyStep: 0.0001,
  priceDecimals: 2,
  qtyDecimals: 4,
  minNotional: 5_000_000,
  version: INSTRUMENT_VERSION,
};

/** $1,000 in micro-USDT. */
export const K = 1_000_000_000;

/** A minute bar in ticks. */
export function m(o: number, h: number, l: number, c: number, v = 1_000_000): Bar {
  return { o, h, l, c, v };
}

export function flatMinutes(count: number, price: number, v = 1_000_000): Bar[] {
  return Array.from({ length: count }, () => m(price, price, price, price, v));
}

export function testMarket(tape: Bar[], refClose: number, overrides: Partial<Market> = {}): Market {
  return {
    chartId: 'test-chart',
    instrument: TEST_INSTRUMENT,
    historyHours: [m(refClose, refClose, refClose, refClose, 60_000_000)],
    historyMinutes: [],
    tape,
    tapeHasVolume: true,
    refClose,
    start: { weekday: 0, minuteOfDay: 0 },
    startMs: Date.UTC(2021, 0, 4),
    indexedHistory: [],
    indexedTape: [],
    indexFactor: 1,
    ...overrides,
  };
}

/** Commission only, no spread or slippage, so fill prices are the levels themselves. */
export const FLAT_10BPS: FeeSchedule = {
  version: 'test',
  makerBps: 10,
  takerBps: 10,
  halfSpreadBps: 0,
  stopSlippageBps: 0,
};

let counter = 0;

/** Build a place event. */
export function place(
  at: number,
  order: Partial<OrderSpec> & Pick<OrderSpec, 'side' | 'type' | 'qty'>,
  extra: { takeProfit?: number; stopLoss?: number; seq?: number } = {},
): OrderEvent {
  counter += 1;
  return {
    kind: 'place',
    seq: extra.seq ?? counter,
    at,
    order: { id: order.id ?? `o${counter}`, reduceOnly: false, role: 'entry', ...order },
    takeProfit: extra.takeProfit,
    stopLoss: extra.stopLoss,
  };
}

export function nextSeq(): number {
  counter += 1;
  return counter;
}
