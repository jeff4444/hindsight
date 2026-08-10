/**
 * Reading Binance monthly kline archives.
 *
 * Two format quirks that will silently corrupt a corpus if missed:
 *
 *  1. **The timestamp unit changed.** Files up to the end of 2024 stamp in milliseconds; from
 *     2025 they stamp in microseconds. Both are unlabelled. Mixing them puts 2025 windows a
 *     thousand times further into the future than they belong, and every aggregation quietly
 *     produces one-bar buckets.
 *  2. **Minutes with no trades are omitted**, not emitted as flat bars. That is useful — it is
 *     how the contiguity check in §13.3 detects illiquid windows — but it means row count is
 *     not a proxy for elapsed time.
 */

import { unzipSync } from 'fflate';
import type { TimedBar } from '../src/core/bars';

/** Anything above this is microseconds, not milliseconds. */
const MICROSECOND_THRESHOLD = 1e14;

export function normalizeTimestamp(raw: number): number {
  return raw > MICROSECOND_THRESHOLD ? Math.floor(raw / 1000) : raw;
}

export function klineUrl(symbol: string, month: string, interval = '1m'): string {
  return `https://data.binance.vision/data/spot/monthly/klines/${symbol}/${interval}/${symbol}-${interval}-${month}.zip`;
}

/**
 * Parse the CSV inside a monthly kline zip into sorted minute bars.
 *
 * Columns are: open time, open, high, low, close, volume, close time, quote volume, trade
 * count, taker buy volume, taker buy quote volume, ignore. Some months carry a header row and
 * some do not, so the header is detected rather than assumed.
 */
export function parseKlineZip(zipped: Uint8Array): TimedBar[] {
  const files = unzipSync(zipped);
  const name = Object.keys(files).find((key) => key.endsWith('.csv'));
  if (!name) throw new Error('archive contains no csv');

  const text = new TextDecoder().decode(files[name]);
  const bars: TimedBar[] = [];

  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    const cols = line.split(',');
    if (cols.length < 6) continue;

    const t = Number(cols[0]);
    if (!Number.isFinite(t)) continue; // header row

    const bar: TimedBar = {
      t: normalizeTimestamp(t),
      o: Number(cols[1]),
      h: Number(cols[2]),
      l: Number(cols[3]),
      c: Number(cols[4]),
      v: Number(cols[5]),
    };

    if (!Number.isFinite(bar.o) || !Number.isFinite(bar.c)) continue;
    bars.push(bar);
  }

  bars.sort((a, b) => a.t - b.t);
  return bars;
}
