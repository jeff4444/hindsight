/**
 * The exchange's shapes as the browser sees them.
 *
 * Money and prices are plain numbers in USDT and quote units, converted at the edge from the
 * simulator's integer ticks, steps and micro-USDT. Candles are the exception: they travel as ticks,
 * because integers are smaller on the wire and the chart converts them with the instrument anyway.
 * The game's own wire types (`src/lib/game/types.ts`) are built from these.
 */

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

/**
 * When the tape starts: a weekday and a time of day while the date is withheld, the real instant
 * once it may be shown (§22.9).
 */
export type SessionTime =
  | { kind: 'relative'; weekday: number; minuteOfDay: number }
  | { kind: 'absolute'; startMs: number };
