/**
 * Numbers the way a trading screen prints them.
 *
 * Prices carry the instrument's own decimals and thousands separators; money is dollars with two
 * decimals (compact above a million); P&L always carries its sign, because a "+" is the cheapest
 * way to say which way it went.
 */

import { DAY_NAMES } from '@/lib/clock';
import type { InstrumentView, SessionTime } from './types';

const grouped = (decimals: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const cache = new Map<number, Intl.NumberFormat>();
function fixed(decimals: number): Intl.NumberFormat {
  let format = cache.get(decimals);
  if (!format) {
    format = grouped(decimals);
    cache.set(decimals, format);
  }
  return format;
}

export function formatPrice(value: number, instrument: Pick<InstrumentView, 'priceDecimals'>): string {
  return fixed(instrument.priceDecimals).format(value);
}

export function formatQty(value: number, instrument: Pick<InstrumentView, 'qtyDecimals'>): string {
  // Trailing zeros on a quantity are noise: 0.25000 BTC is 0.25 BTC.
  const text = value.toFixed(instrument.qtyDecimals);
  const trimmed = instrument.qtyDecimals > 0 ? text.replace(/\.?0+$/, '') : text;
  const [whole, fraction] = trimmed.split('.');
  return fraction ? `${fixed(0).format(Number(whole))}.${fraction}` : fixed(0).format(Number(whole));
}

export function formatUsd(value: number, options: { sign?: boolean; compact?: boolean; decimals?: number } = {}): string {
  const decimals = options.decimals ?? 2;
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : options.sign && value > 0 ? '+' : '';
  if (options.compact && abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (options.compact && abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${fixed(decimals).format(abs)}`;
}

export function formatPct(value: number, options: { sign?: boolean; decimals?: number } = {}): string {
  const decimals = options.decimals ?? 2;
  const pct = value * 100;
  const sign = pct < 0 ? '−' : options.sign && pct > 0 ? '+' : '';
  return `${sign}${Math.abs(pct).toFixed(decimals)}%`;
}

/** Tone for a signed amount. */
export function pnlTone(value: number): 'long' | 'short' | 'neutral' {
  return value > 0 ? 'long' : value < 0 ? 'short' : 'neutral';
}

/** Seconds of the open of tape minute `index`, on the chart's time axis. */
export function tapeSeconds(time: SessionTime, index: number): number {
  if (time.kind === 'absolute') return Math.floor(time.startMs / 1000) + index * 60;
  // The synthetic week of src/lib/clock.ts: Monday 5 January 1970.
  return 4 * 86_400 + time.weekday * 86_400 + time.minuteOfDay * 60 + index * 60;
}

/** "Tue 14:35", or "19 May 2021 14:35" when the date may be shown. At the close of minute `at`. */
export function formatReplayTime(time: SessionTime, at: number): string {
  const seconds = tapeSeconds(time, at + 1);
  const date = new Date(seconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  if (time.kind === 'absolute') {
    return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })} ${hh}:${mm}`;
  }
  const weekday = DAY_NAMES[(date.getUTCDay() + 6) % 7];
  return `${weekday} ${hh}:${mm}`;
}

/** "+34h 05m" into the session. */
export function formatElapsed(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `+${h}h ${String(m).padStart(2, '0')}m`;
}

/** A real price as the closest value on the instrument's tick grid, as a string for an input. */
export function priceInput(value: number, instrument: Pick<InstrumentView, 'priceDecimals'>): string {
  return value.toFixed(instrument.priceDecimals);
}

export function qtyInput(value: number, instrument: Pick<InstrumentView, 'qtyDecimals'>): string {
  return value.toFixed(instrument.qtyDecimals).replace(/\.?0+$/, '') || '0';
}
