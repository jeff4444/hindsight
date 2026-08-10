/**
 * Build the chart corpus from cached Binance klines and insert it into Supabase.
 *
 *   npm run corpus -- --dry-run     report what would be generated, touch no database
 *   npm run corpus                  generate and insert
 *
 * The pipeline is deliberately boring. §13.3 warns that hand-curation "changes the difficulty
 * distribution non-randomly and invalidates every population statistic computed on it", so
 * nothing here looks at whether a window is interesting. It checks that the window is
 * resolvable and rejects it otherwise.
 *
 * It runs in two passes. The first walks every cached archive and records the *locations* of
 * windows that survive filtering — a few bytes each. The second re-reads only the archives
 * that the selection actually needs and materialises those windows one at a time. A
 * single-pass version that held every candidate's 3600-bar resolution path in memory needs
 * several gigabytes and dies; this one runs flat.
 *
 * Phase 0 scope note: §6 Layer 0 wants selection driven by a published rule over regime tags.
 * Regime tags are Layer 2 and do not exist yet, so selection here is a seeded round-robin over
 * symbols. That is reproducible but it is not yet the rule §6 asks for, and it should be
 * replaced — not merely re-seeded — when Phase 0.5 lands.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { aggregate, isContiguous, type AggregatedBar, type TimedBar } from '../src/core/bars';
import { atr, ATR_PERIOD } from '../src/core/atr';
import {
  DISPLAY_TF,
  DISPLAY_TF_MS,
  LEAD_IN_BARS,
  PATH_BARS,
  RESOLUTION_TF,
  RESOLUTION_TF_MS,
  WINDOW_BARS,
} from '../src/core/config';
import { normalizeWindow, TICK_SIZE } from '../src/core/normalize';
import { packDetail, packPath, toPgHex } from '../src/core/pack';
import { hashString, mulberry32 } from '../src/core/random';
import { NORMALIZATION_VERSION, PIPELINE_VERSION } from '../src/core/versions';
import { CORPUS_TARGET, MASTER_SEED, MONTHS, SYMBOL_NAMES } from './symbols';
import { parseKlineZip } from './klines';
import { cachePath } from './fetch-binance';

const DRY_RUN = process.argv.includes('--dry-run');

const EXPECTED_MINUTES_PER_HOUR = DISPLAY_TF_MS / RESOLUTION_TF_MS;

/* ------------------------------------------------------------------ filters */

type RejectionReason = 'gappedHours' | 'gappedMinutes' | 'flatline' | 'badPrint' | 'degenerate';

type Rejections = Record<RejectionReason, number>;

const emptyRejections = (): Rejections => ({
  gappedHours: 0,
  gappedMinutes: 0,
  flatline: 0,
  badPrint: 0,
  degenerate: 0,
});

/** Below this, the chart has no tradeable range and stop placement is meaningless. */
const MIN_ATR_FRACTION = 0.001; // 0.1% of price

/** A single minute moving more than this is a bad print or a halt artefact, not price action. */
const MAX_MINUTE_RANGE_FRACTION = 0.15;

/** §13.3, the cheap subset. Returns the reason for rejection, or null to keep the window. */
function screen(
  leadInRaw: TimedBar[],
  revealRaw: TimedBar[],
  pathRaw: TimedBar[],
): RejectionReason | null {
  const atrValue = atr(leadInRaw, ATR_PERIOD);
  if (atrValue === null) return 'degenerate';

  const entry = leadInRaw[leadInRaw.length - 1].c;
  if (!(entry > 0)) return 'degenerate';

  // Flatlines and near-zero volatility windows.
  if (atrValue / entry < MIN_ATR_FRACTION) return 'flatline';

  // A reveal that never moves at all is a data artefact, not a quiet market.
  let revealHigh = -Infinity;
  let revealLow = Infinity;
  for (const bar of revealRaw) {
    revealHigh = Math.max(revealHigh, bar.h);
    revealLow = Math.min(revealLow, bar.l);
  }
  if (revealHigh === revealLow) return 'flatline';

  for (const bar of leadInRaw) {
    if (!isSane(bar)) return 'badPrint';
  }
  for (const bar of revealRaw) {
    if (!isSane(bar)) return 'badPrint';
  }
  for (const bar of pathRaw) {
    if (!isSane(bar)) return 'badPrint';
    if ((bar.h - bar.l) / bar.l > MAX_MINUTE_RANGE_FRACTION) return 'badPrint';
  }

  return null;
}

function isSane(bar: TimedBar): boolean {
  if (!(bar.o > 0 && bar.h > 0 && bar.l > 0 && bar.c > 0)) return false;
  if (bar.h < bar.l) return false;
  if (bar.h < bar.o || bar.h < bar.c) return false;
  if (bar.l > bar.o || bar.l > bar.c) return false;
  return true;
}

/* --------------------------------------------------------------- windowing */

/** Where a window lives. Cheap enough to hold every candidate in the corpus. */
interface Location {
  symbol: string;
  month: string;
  /** Index of the window's first hour bar within the month's aggregated series. */
  start: number;
}

interface Window {
  leadInRaw: TimedBar[];
  revealRaw: TimedBar[];
  /** The reveal window's minutes — the resolver's input (§12.3). */
  pathRaw: TimedBar[];
  /** Every minute of the window, lead-in included — the client's zoom detail. */
  detailRaw: TimedBar[];
}

/**
 * Mirror is a pure function of window identity rather than of iteration order, so the same
 * window is mirrored the same way no matter which pass produced it or what else ran first.
 */
function isMirrored(location: Location): boolean {
  const key = `${location.symbol}|${location.month}|${location.start}`;
  return mulberry32((hashString(key) ^ MASTER_SEED) >>> 0)() < 0.5;
}

/** Slice one window out of a month, or return the reason it cannot be used. */
function extract(
  hours: AggregatedBar[],
  minuteIndex: Map<number, TimedBar>,
  start: number,
): Window | RejectionReason {
  const window = hours.slice(start, start + WINDOW_BARS);
  if (!isContiguous(window, DISPLAY_TF_MS, EXPECTED_MINUTES_PER_HOUR)) return 'gappedHours';

  const leadInRaw = window.slice(0, LEAD_IN_BARS);
  const revealRaw = window.slice(LEAD_IN_BARS);

  // The resolution path is every minute of the reveal window, in order, with none missing. A
  // missing minute is a minute in which a stop could have fired.
  const pathStart = revealRaw[0].t;
  const pathRaw: TimedBar[] = new Array(PATH_BARS);
  for (let i = 0; i < PATH_BARS; i++) {
    const bar = minuteIndex.get(pathStart + i * RESOLUTION_TF_MS);
    if (!bar) return 'gappedMinutes';
    pathRaw[i] = bar;
  }

  const reason = screen(leadInRaw, revealRaw, pathRaw);
  if (reason) return reason;

  // The lead-in's minutes, which the resolver never needs but the chart does. Contiguity is
  // already guaranteed: isContiguous above rejected the window unless every hour bar was built
  // from exactly 60 source minutes.
  const leadInStart = leadInRaw[0].t;
  const leadInMinuteCount = LEAD_IN_BARS * EXPECTED_MINUTES_PER_HOUR;
  const leadInDetail: TimedBar[] = new Array(leadInMinuteCount);
  for (let i = 0; i < leadInMinuteCount; i++) {
    const bar = minuteIndex.get(leadInStart + i * RESOLUTION_TF_MS);
    if (!bar) return 'gappedMinutes';
    leadInDetail[i] = bar;
  }

  return { leadInRaw, revealRaw, pathRaw, detailRaw: [...leadInDetail, ...pathRaw] };
}

/** Read one cached archive and prepare it for windowing. */
async function loadMonth(symbol: string, month: string) {
  const file = cachePath(symbol, month);
  if (!existsSync(file)) return null;

  let minutes: TimedBar[];
  try {
    minutes = parseKlineZip(new Uint8Array(await readFile(file)));
  } catch (error) {
    console.warn(`  ${symbol} ${month}: unreadable archive — ${(error as Error).message}`);
    return null;
  }

  const hours = aggregate(minutes, DISPLAY_TF_MS);
  const minuteIndex = new Map<number, TimedBar>();
  for (const bar of minutes) minuteIndex.set(bar.t, bar);

  return { hours, minuteIndex };
}

/** Every non-overlapping window start in a month. */
function windowStarts(hourCount: number): number[] {
  const starts: number[] = [];
  // Non-overlapping: two overlapping windows would share future bars, making two charts in
  // the corpus partly the same question.
  for (let start = 0; start + WINDOW_BARS <= hourCount; start += WINDOW_BARS) starts.push(start);
  return starts;
}

/* ------------------------------------------------------------------ passes */

async function locate(rejections: Rejections): Promise<Map<string, Location[]>> {
  const found = new Map<string, Location[]>();

  for (const symbol of SYMBOL_NAMES) {
    const locations: Location[] = [];
    let monthsSeen = 0;

    for (const month of MONTHS) {
      const loaded = await loadMonth(symbol, month);
      if (!loaded) continue;
      monthsSeen += 1;

      for (const start of windowStarts(loaded.hours.length)) {
        const result = extract(loaded.hours, loaded.minuteIndex, start);
        if (typeof result === 'string') {
          rejections[result] += 1;
          continue;
        }
        locations.push({ symbol, month, start });
      }
    }

    found.set(symbol, locations);
    console.log(
      `${symbol.padEnd(10)} ${String(monthsSeen).padStart(2)} months  ` +
        `${String(locations.length).padStart(4)} usable windows`,
    );
  }

  return found;
}

/**
 * Round-robin across symbols so no instrument dominates the corpus, with each symbol's own
 * windows shuffled under a per-symbol seed so the retained ones are not simply the earliest.
 */
function select(found: Map<string, Location[]>): Location[] {
  const queues = SYMBOL_NAMES.map((symbol) => {
    const queue = [...(found.get(symbol) ?? [])];
    const rng = mulberry32((hashString(symbol) ^ MASTER_SEED) >>> 0);
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  });

  const selected: Location[] = [];
  for (;;) {
    let placed = 0;
    for (const queue of queues) {
      if (selected.length >= CORPUS_TARGET) return selected;
      const next = queue.shift();
      if (next) {
        selected.push(next);
        placed += 1;
      }
    }
    if (placed === 0) return selected; // every queue exhausted
  }
}

interface ChartRow {
  symbol: string;
  window_start: string;
  decision_at: string;
  display_tf: string;
  resolution_tf: string;
  lead_in_bars: unknown;
  reveal_bars: unknown;
  resolution_path: string;
  detail_path: string;
  index_factor: number;
  volume_base: number;
  mirrored: boolean;
  atr14: number;
  tick_size: number;
  entry_price: number;
  selection_seed: number;
  pipeline_version: string;
  normalization_version: string;
}

function toRow(location: Location, window: Window): ChartRow | null {
  const mirrored = isMirrored(location);
  const norm = normalizeWindow(window.leadInRaw, window.revealRaw, window.pathRaw, mirrored);
  // The detail path goes through the identical transform, volume included, so a minute candle
  // sits exactly where the hour candle containing it says it should.
  const detail = normalizeWindow(window.leadInRaw, window.revealRaw, window.detailRaw, mirrored, {
    pathVolume: true,
  });

  // ATR is computed on the normalised lead-in, so the badge is in the units the player sees.
  const atrValue = atr(norm.leadIn, ATR_PERIOD);
  if (atrValue === null) return null;

  return {
    symbol: location.symbol,
    window_start: new Date(window.leadInRaw[0].t).toISOString(),
    decision_at: new Date(window.leadInRaw[LEAD_IN_BARS - 1].t).toISOString(),
    display_tf: DISPLAY_TF,
    resolution_tf: RESOLUTION_TF,
    lead_in_bars: norm.leadIn,
    reveal_bars: norm.reveal,
    resolution_path: toPgHex(packPath(norm.path)),
    detail_path: toPgHex(packDetail(detail.path)),
    index_factor: norm.indexFactor,
    volume_base: norm.volumeBase,
    mirrored,
    atr14: atrValue,
    tick_size: TICK_SIZE,
    entry_price: norm.leadIn[LEAD_IN_BARS - 1].c,
    selection_seed: (hashString(`${location.symbol}|${location.month}|${location.start}`) ^
      MASTER_SEED) >>> 0,
    pipeline_version: PIPELINE_VERSION,
    normalization_version: NORMALIZATION_VERSION,
  };
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — see .env.local.example',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Materialise and insert, one month at a time, so peak memory stays at roughly one archive
 * plus one batch of rows.
 */
async function materialize(selected: Location[]) {
  const byMonth = new Map<string, Location[]>();
  for (const location of selected) {
    const key = `${location.symbol}|${location.month}`;
    const list = byMonth.get(key);
    if (list) list.push(location);
    else byMonth.set(key, [location]);
  }

  const supabase = DRY_RUN ? null : supabaseClient();
  let written = 0;
  let mirroredCount = 0;
  let pathBytes = 0;
  let detailBytes = 0;

  for (const [key, locations] of byMonth) {
    const [symbol, month] = key.split('|');
    const loaded = await loadMonth(symbol, month);
    if (!loaded) continue;

    const rows: ChartRow[] = [];
    for (const location of locations) {
      const window = extract(loaded.hours, loaded.minuteIndex, location.start);
      if (typeof window === 'string') continue; // cannot happen; pass 1 already accepted it
      const row = toRow(location, window);
      if (!row) continue;
      rows.push(row);
      if (row.mirrored) mirroredCount += 1;
      pathBytes += (row.resolution_path.length - 2) / 2;
      detailBytes += (row.detail_path.length - 2) / 2;
    }

    if (supabase && rows.length > 0) {
      // Each row now carries ~336 KB of hex, so batches stay small or the request is huge.
      const BATCH = 3;
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await supabase
          .from('charts')
          .upsert(rows.slice(i, i + BATCH), {
            onConflict: 'symbol,window_start',
            // Update in place: a re-run must be able to backfill new columns onto the charts
            // it already generated, and the pipeline is deterministic so the rest is identical.
            ignoreDuplicates: false,
          });
        if (error) throw new Error(`insert failed (${symbol} ${month}): ${error.message}`);
      }
    }

    written += rows.length;
    if (written % 100 < rows.length) console.log(`  ${written}/${selected.length}`);
  }

  return { written, mirroredCount, pathBytes, detailBytes };
}

/* -------------------------------------------------------------------- main */

async function run() {
  const rejections = emptyRejections();

  console.log('pass 1 — locating usable windows\n');
  const found = await locate(rejections);

  const total = [...found.values()].reduce((sum, list) => sum + list.length, 0);
  const rejected = Object.values(rejections).reduce((a, b) => a + b, 0);
  const selected = select(found);

  console.log('');
  console.log(`usable windows   ${total}`);
  console.log(`rejected         ${rejected}  ${JSON.stringify(rejections)}`);
  console.log(`selected         ${selected.length} (target ${CORPUS_TARGET})`);

  if (selected.length === 0) {
    console.log('\nnothing to build — run `npm run fetch` first');
    return;
  }

  console.log(`\npass 2 — ${DRY_RUN ? 'materialising (dry run)' : 'materialising and inserting'}\n`);
  const { written, mirroredCount, pathBytes, detailBytes } = await materialize(selected);

  console.log('');
  console.log(`charts           ${written}`);
  console.log(
    `mirrored         ${mirroredCount} (${((mirroredCount / Math.max(written, 1)) * 100).toFixed(0)}%)`,
  );
  console.log(
    `resolution paths ${(pathBytes / 1e6).toFixed(1)} MB total, ` +
      `${Math.round(pathBytes / Math.max(written, 1))} bytes each`,
  );
  console.log(
    `detail paths     ${(detailBytes / 1e6).toFixed(1)} MB total, ` +
      `${Math.round(detailBytes / Math.max(written, 1))} bytes each`,
  );
  const perSymbol = SYMBOL_NAMES.map(
    (s) => `${s.replace('USDT', '')}:${selected.filter((l) => l.symbol === s).length}`,
  ).join(' ');
  console.log(`per symbol       ${perSymbol}`);
  console.log(DRY_RUN ? '\ndry run — nothing written' : '\ndone');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
