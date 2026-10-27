/**
 * A tradable pair: how its prices and quantities are quantised, and how a stored chart becomes
 * one in real units.
 *
 * The corpus stores every chart indexed to 100 and, for about half of them, mirrored (§1). The
 * trading platform shows the real instrument, so both transforms are undone here and nowhere else
 * — the same order `denormalizePrice` uses, un-mirror first and unscale second, because the
 * pipeline scaled first and mirrored second.
 *
 * ## The tick and the step are derived, not looked up
 *
 * Binance publishes a tick size and a lot step per symbol, but the corpus never stored them, and
 * for delisted pairs they are not recoverable at all. So both are derived from the price at the
 * start of the replay:
 *
 *     e = floor(log10(price))
 *     tick = 10^(e − 5)       about six significant digits of price
 *     step = 10^(−1 − e)      so tick × step = 10^−6 exactly
 *
 * The second line is the point. A price in ticks times a quantity in steps is a notional in
 * **micro-USDT**, an integer, so the whole ledger — cash, fees, realised P&L — is kept in exact
 * integer arithmetic and never accumulates float dust. BTC at 43,000 gets a 0.1 tick and a 0.00001
 * step; a coin at 0.00001 gets a 1e−10 tick and a 10,000-unit step. Both are close to what Binance
 * actually uses.
 *
 * Stored prices are Float32, about seven significant digits. Six-digit ticks put the
 * representation error under a tenth of a tick, and it is relative, so a micro-cap is no worse
 * off than BTC.
 */

import type { Bar } from '../bars';
import { mirrorBar } from '../normalize';
import { INSTRUMENT_VERSION } from '../versions';

export interface Instrument {
  /** Exchange symbol, e.g. `BTCUSDT`. */
  symbol: string;
  base: string;
  quote: string;
  /** `BTC/USDT` */
  display: string;
  venue: string;
  /** Decimal exponent of the tick: tickSize = 10^tickExp. */
  tickExp: number;
  tickSize: number;
  /** Decimal exponent of the quantity step: qtyStep = 10^qtyExp. Always −6 − tickExp. */
  qtyExp: number;
  qtyStep: number;
  priceDecimals: number;
  qtyDecimals: number;
  /** Smallest order, in micro-USDT of notional. Binance's MIN_NOTIONAL filter, at $5. */
  minNotional: number;
  version: string;
}

/** Notional is ticks × steps micro-USDT. One USDT is a million of them. */
export const MICROS = 1_000_000;

/** Smallest order, in USDT. Binance spot's MIN_NOTIONAL for USDT pairs. */
export const MIN_NOTIONAL_USDT = 5;

/** 10^n as the closest double, by parsing rather than multiplying, so 10^−7 is exactly `1e-7`. */
export function pow10(n: number): number {
  return Number(`1e${n}`);
}

/** floor(log10(p)), computed so a price of exactly 1000 is 3 and not 2.9999…'s floor. */
export function decimalExponent(price: number): number {
  if (!(price > 0) || !Number.isFinite(price)) throw new Error(`no exponent for price ${price}`);
  let e = Math.floor(Math.log10(price));
  while (pow10(e + 1) <= price) e += 1;
  while (pow10(e) > price) e -= 1;
  return e;
}

/** Split `BTCUSDT` into its base and quote. The corpus is USDT pairs only. */
export function splitSymbol(symbol: string): { base: string; quote: string } {
  for (const quote of ['USDT', 'BUSD', 'USDC', 'FDUSD']) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return { base: symbol.slice(0, -quote.length), quote };
    }
  }
  return { base: symbol, quote: 'USDT' };
}

export function deriveInstrument(symbol: string, referencePrice: number): Instrument {
  const e = decimalExponent(referencePrice);
  const tickExp = e - 5;
  const qtyExp = -6 - tickExp;
  const { base, quote } = splitSymbol(symbol);
  return {
    symbol,
    base,
    quote,
    display: `${base}/${quote}`,
    venue: 'Binance spot',
    tickExp,
    tickSize: pow10(tickExp),
    qtyExp,
    qtyStep: pow10(qtyExp),
    priceDecimals: Math.max(0, -tickExp),
    qtyDecimals: Math.max(0, -qtyExp),
    minNotional: MIN_NOTIONAL_USDT * MICROS,
    version: INSTRUMENT_VERSION,
  };
}

/** A real price as an integer count of ticks. */
export function toTicks(price: number, instrument: Pick<Instrument, 'tickExp'>): number {
  return Math.round(price * pow10(-instrument.tickExp));
}

/** Ticks back to a real price. */
export function fromTicks(ticks: number, instrument: Pick<Instrument, 'tickExp'>): number {
  return ticks * pow10(instrument.tickExp);
}

/** A real quantity as an integer count of steps, rounded down — you cannot buy part of a step. */
export function toSteps(qty: number, instrument: Pick<Instrument, 'qtyExp'>): number {
  // The epsilon absorbs 0.3 / 0.1-style representation error so an exact multiple is not lost.
  return Math.floor(qty * pow10(-instrument.qtyExp) + 1e-9);
}

export function fromSteps(steps: number, instrument: Pick<Instrument, 'qtyExp'>): number {
  return steps * pow10(instrument.qtyExp);
}

/** Micro-USDT to USDT. */
export function toUsd(micros: number): number {
  return micros / MICROS;
}

/** USDT to micro-USDT, rounded to the nearest micro. */
export function toMicros(usd: number): number {
  return Math.round(usd * MICROS);
}

/**
 * A stored bar back in real units.
 *
 * Un-mirror first — `mirrorBar` is its own inverse and swaps high and low back — then divide by
 * the index factor. Volume is rebased against `volumeBase` (§1) and multiplied back, which makes
 * it base-asset units, the same column Binance publishes.
 */
export function toRealBar(bar: Bar, indexFactor: number, mirrored: boolean, volumeBase: number): Bar {
  const unmirrored = mirrored ? mirrorBar(bar) : bar;
  return {
    o: unmirrored.o / indexFactor,
    h: unmirrored.h / indexFactor,
    l: unmirrored.l / indexFactor,
    c: unmirrored.c / indexFactor,
    v: bar.v * volumeBase,
  };
}

/** A real bar quantised to the tick grid. Volume is left in base units. */
export function toTickBar(bar: Bar, instrument: Pick<Instrument, 'tickExp'>): Bar {
  const o = toTicks(bar.o, instrument);
  const c = toTicks(bar.c, instrument);
  // Rounding can push the open or close a tick outside the rounded range; the range wins.
  const h = Math.max(toTicks(bar.h, instrument), o, c);
  const l = Math.min(toTicks(bar.l, instrument), o, c);
  return { o, h, l, c, v: bar.v };
}
