/**
 * Backfill the extra lead-in history the No Tools tier reads.
 *
 *   npm run extend            fill charts that do not have it
 *   npm run extend -- --force redo every chart
 *
 * §3.2 grants NT 300 candles; the corpus stores 80. This adds the 220 before them.
 *
 * **It is additive, and deliberately so.** The alternative — regenerating the corpus with a longer
 * lead-in — would move every window, change every ATR (and therefore every stop distance in the
 * 98-cell grid), and invalidate every stored percentile. It would also have to run through
 * `clear_corpus()`, which now refuses on a database with accounts because truncating `charts`
 * cascades into `rounds`. None of that is necessary once ATR is pinned to the final 80 bars, which
 * it must be anyway so that the same chart shows the same ATR at every tier.
 *
 * Only **hourly** candles are fetched. The extra history is never drawn below an hour — no shipping
 * tier outside the unrated Sandbox grants a sub-hour timeframe — so the 1-minute archives are not
 * needed and the download is about 30 KB per symbol-month instead of 2 MB.
 *
 * A window sitting in the first nine days of a month reaches back into the previous one, so both
 * months are loaded and concatenated before the search.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import type { Bar, TimedBar } from '../src/core/bars';
import { EXTRA_LEAD_IN_BARS } from '../src/core/config';
import { mirrorBar, rebaseVolume, scaleBar } from '../src/core/normalize';
import { klineUrl, parseKlineZip } from './klines';

const FORCE = process.argv.includes('--force');
const PAGE = 40;
const CACHE_DIR = path.resolve(process.cwd(), '.data/klines');
const HOUR_MS = 3_600_000;

interface ChartRow {
  id: string;
  symbol: string;
  window_start: string;
  index_factor: number;
  volume_base: number;
  mirrored: boolean;
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

const monthOf = (iso: string): string => iso.slice(0, 7);

function previousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const cachePath = (symbol: string, month: string) =>
  path.join(CACHE_DIR, `${symbol}-1h-${month}.zip`);

/** Fetch once, cache forever. A month of hourly klines is about 30 KB. */
async function hourArchive(symbol: string, month: string): Promise<TimedBar[]> {
  const file = cachePath(symbol, month);
  if (!existsSync(file)) {
    const response = await fetch(klineUrl(symbol, month, '1h'));
    if (!response.ok) return [];
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
  }
  try {
    return parseKlineZip(await readFile(file));
  } catch {
    return [];
  }
}

const cache = new Map<string, TimedBar[]>();
async function hoursFor(symbol: string, month: string): Promise<TimedBar[]> {
  const key = `${symbol}|${month}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const bars = await hourArchive(symbol, month);
  cache.set(key, bars);
  // The map is only ever a few months wide because charts are processed in id order and symbols
  // cluster; capping it stops a long run from holding every month it ever touched.
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  return bars;
}

/**
 * The 220 hours immediately before `windowStart`, normalised exactly as the stored lead-in was.
 *
 * Returns null when the instrument has no such history — a listing younger than nine days at that
 * point, or a gap in the archive. Those charts keep `lead_in_extra = null` and are not served at NT
 * rather than being served a short or discontiguous window.
 */
export function extraLeadIn(
  hours: readonly TimedBar[],
  windowStartMs: number,
  chart: { index_factor: number; volume_base: number; mirrored: boolean },
): Bar[] | null {
  const index = hours.findIndex((bar) => bar.t === windowStartMs);
  if (index < EXTRA_LEAD_IN_BARS) return null;

  const slice = hours.slice(index - EXTRA_LEAD_IN_BARS, index);
  if (slice.length !== EXTRA_LEAD_IN_BARS) return null;

  // Contiguity matters: a halt or a delisting gap would draw a straight line through hours that
  // did not happen, which is exactly the fabrication §13.3 rejects elsewhere.
  for (let i = 1; i < slice.length; i++) {
    if (slice[i].t - slice[i - 1].t !== HOUR_MS) return null;
  }

  return slice.map((bar) => {
    let out: Bar = scaleBar(bar, chart.index_factor);
    if (chart.mirrored) out = mirrorBar(out);
    out = rebaseVolume(out, chart.volume_base);
    return { o: out.o, h: out.h, l: out.l, c: out.c, v: out.v };
  });
}

async function run() {
  const supabase = supabaseClient();

  const { count } = await supabase.from('charts').select('id', { count: 'exact', head: true });
  console.log(`corpus: ${count} charts`);

  let done = 0;
  let filled = 0;
  let short = 0;
  let lastId = '';

  for (;;) {
    let query = supabase
      .from('charts')
      .select('id, symbol, window_start, index_factor, volume_base, mirrored')
      .order('id')
      .gt('id', lastId || '00000000-0000-0000-0000-000000000000')
      .limit(PAGE);
    if (!FORCE) query = query.is('lead_in_extra', null);

    const { data, error } = await query.returns<ChartRow[]>();
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      lastId = row.id;
      const month = monthOf(row.window_start);
      const [prior, own] = await Promise.all([
        hoursFor(row.symbol, previousMonth(month)),
        hoursFor(row.symbol, month),
      ]);
      const hours = [...prior, ...own].sort((a, b) => a.t - b.t);

      const extra = extraLeadIn(hours, Date.parse(row.window_start), row);
      const { error: updateError } = await supabase
        .from('charts')
        .update({
          lead_in_extra: extra,
          lead_in_extra_bars: extra ? extra.length : 0,
        })
        .eq('id', row.id);
      if (updateError) throw new Error(`${row.id}: ${updateError.message}`);

      if (extra) filled += 1;
      else short += 1;
      done += 1;
      if (done % 100 === 0) console.log(`  ${done} processed, ${filled} extended`);
    }

    // Without --force the filter itself advances the cursor, so paging by id would skip rows.
    if (!FORCE) lastId = '';
  }

  console.log('');
  console.log(`processed   ${done}`);
  console.log(`extended    ${filled}`);
  console.log(`too short   ${short}  (no 220 contiguous hours before the window; not served at NT)`);
  console.log('done');
}

if (process.argv[1] && process.argv[1].endsWith('extend-corpus.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
