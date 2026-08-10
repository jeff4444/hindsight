/**
 * Build the chart corpus from cached Binance klines and insert it into Supabase.
 *
 *   npm run corpus -- --dry-run     report what would be generated, touch no database
 *   npm run corpus                  generate and insert
 *
 * Nothing here looks at whether a window is interesting. §13.3 is explicit that hand-curation
 * "changes the difficulty distribution non-randomly and invalidates every population statistic
 * computed on it", so every step is mechanical: the window is resolvable or it is not, and it
 * falls in a regime cell or it does not.
 *
 * Four passes, because the data does not fit in memory twice:
 *
 *   1  daily closes per sampled pair — small, and needed to tag anything
 *   2  locate usable windows and tag each with its regime; keeps a few bytes per candidate
 *   3  select 1000 by equal allocation across the regime grid
 *   4  re-read only the archives the selection needs, materialise, insert
 */

import { readFile, writeFile } from 'node:fs/promises';
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
import {
  closesStrictlyBefore,
  efficiencyRatio,
  erBucket,
  REGIME_CELLS,
  volatilityPercentile,
  volBucket,
  type ErBucket,
  type VolBucket,
} from '../src/core/regime';
import {
  NORMALIZATION_VERSION,
  PIPELINE_VERSION,
  SELECTION_VERSION,
} from '../src/core/versions';
import {
  CORPUS_TARGET,
  MASTER_SEED,
  dailyMonthsFor,
  delistedShare,
  sampleCells,
  symbolCount,
  windowRank,
  withinDelistingCliff,
  type Cell,
} from './selection';
import { parseKlineZip } from './klines';
import { cachePath } from './fetch-binance';
import { loadUniverse } from './universe';

const DRY_RUN = process.argv.includes('--dry-run');
/**
 * Write the selected window identities to a file.
 *
 * §14's exit condition asks that the pipeline be deterministic over the *whole* selection, not
 * just the resolver. Comparing a fresh run's manifest against what is actually in the database
 * checks that and the insert at once.
 */
const MANIFEST = (() => {
  const flag = process.argv.indexOf('--manifest');
  return flag >= 0 ? process.argv[flag + 1] : null;
})();
const EXPECTED_MINUTES_PER_HOUR = DISPLAY_TF_MS / RESOLUTION_TF_MS;

/* ------------------------------------------------------------------ filters */

type RejectionReason =
  | 'gappedHours'
  | 'gappedMinutes'
  | 'flatline'
  | 'badPrint'
  | 'degenerate'
  | 'delistingCliff'
  | 'noTrailingYear';

type Rejections = Record<RejectionReason, number>;

const emptyRejections = (): Rejections => ({
  gappedHours: 0,
  gappedMinutes: 0,
  flatline: 0,
  badPrint: 0,
  degenerate: 0,
  delistingCliff: 0,
  noTrailingYear: 0,
});

const MIN_ATR_FRACTION = 0.001;
const MAX_MINUTE_RANGE_FRACTION = 0.15;

function isSane(bar: TimedBar): boolean {
  if (!(bar.o > 0 && bar.h > 0 && bar.l > 0 && bar.c > 0)) return false;
  if (bar.h < bar.l) return false;
  if (bar.h < bar.o || bar.h < bar.c) return false;
  if (bar.l > bar.o || bar.l > bar.c) return false;
  return true;
}

function screen(
  leadInRaw: TimedBar[],
  revealRaw: TimedBar[],
  pathRaw: TimedBar[],
): RejectionReason | null {
  const atrValue = atr(leadInRaw, ATR_PERIOD);
  if (atrValue === null) return 'degenerate';

  const entry = leadInRaw[leadInRaw.length - 1].c;
  if (!(entry > 0)) return 'degenerate';
  if (atrValue / entry < MIN_ATR_FRACTION) return 'flatline';

  let revealHigh = -Infinity;
  let revealLow = Infinity;
  for (const bar of revealRaw) {
    revealHigh = Math.max(revealHigh, bar.h);
    revealLow = Math.min(revealLow, bar.l);
  }
  if (revealHigh === revealLow) return 'flatline';

  for (const bar of leadInRaw) if (!isSane(bar)) return 'badPrint';
  for (const bar of revealRaw) if (!isSane(bar)) return 'badPrint';
  for (const bar of pathRaw) {
    if (!isSane(bar)) return 'badPrint';
    if ((bar.h - bar.l) / bar.l > MAX_MINUTE_RANGE_FRACTION) return 'badPrint';
  }

  return null;
}

/* --------------------------------------------------------------- windowing */

interface Candidate {
  symbol: string;
  month: string;
  start: number;
  delisted: boolean;
  efficiencyRatio: number;
  erBucket: ErBucket;
  volatilityPercentile: number;
  volBucket: VolBucket;
  cell: string;
  rank: number;
}

interface Window {
  leadInRaw: TimedBar[];
  revealRaw: TimedBar[];
  pathRaw: TimedBar[];
  detailRaw: TimedBar[];
}

function isMirrored(symbol: string, month: string, start: number): boolean {
  return mulberry32((hashString(`${symbol}|${month}|${start}`) ^ MASTER_SEED) >>> 0)() < 0.5;
}

function extract(
  hours: AggregatedBar[],
  minuteIndex: Map<number, TimedBar>,
  start: number,
): Window | RejectionReason {
  const window = hours.slice(start, start + WINDOW_BARS);
  if (!isContiguous(window, DISPLAY_TF_MS, EXPECTED_MINUTES_PER_HOUR)) return 'gappedHours';

  const leadInRaw = window.slice(0, LEAD_IN_BARS);
  const revealRaw = window.slice(LEAD_IN_BARS);

  const pathStart = revealRaw[0].t;
  const pathRaw: TimedBar[] = new Array(PATH_BARS);
  for (let i = 0; i < PATH_BARS; i++) {
    const bar = minuteIndex.get(pathStart + i * RESOLUTION_TF_MS);
    if (!bar) return 'gappedMinutes';
    pathRaw[i] = bar;
  }

  const reason = screen(leadInRaw, revealRaw, pathRaw);
  if (reason) return reason;

  const leadInStart = leadInRaw[0].t;
  const leadInMinutes = LEAD_IN_BARS * EXPECTED_MINUTES_PER_HOUR;
  const leadInDetail: TimedBar[] = new Array(leadInMinutes);
  for (let i = 0; i < leadInMinutes; i++) {
    const bar = minuteIndex.get(leadInStart + i * RESOLUTION_TF_MS);
    if (!bar) return 'gappedMinutes';
    leadInDetail[i] = bar;
  }

  return { leadInRaw, revealRaw, pathRaw, detailRaw: [...leadInDetail, ...pathRaw] };
}

async function loadMonth(symbol: string, month: string) {
  const file = cachePath(symbol, month, '1m');
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

/** Daily closes for a pair across the trailing year of a sampled month, oldest first. */
async function loadDaily(symbol: string, month: string): Promise<TimedBar[]> {
  const bars: TimedBar[] = [];
  for (const dailyMonth of dailyMonthsFor(month)) {
    const file = cachePath(symbol, dailyMonth, '1d');
    if (!existsSync(file)) continue;
    try {
      bars.push(...parseKlineZip(new Uint8Array(await readFile(file))));
    } catch {
      // A single unreadable daily archive just shortens the history; the trailing-year guard
      // in volatilityPercentile decides whether what is left is enough.
    }
  }
  bars.sort((a, b) => a.t - b.t);
  return bars;
}

function windowStarts(hourCount: number): number[] {
  const starts: number[] = [];
  for (let start = 0; start + WINDOW_BARS <= hourCount; start += WINDOW_BARS) starts.push(start);
  return starts;
}

/* ------------------------------------------------------------------- passes */

async function locate(cells: Cell[], rejections: Rejections): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  let processed = 0;

  for (const cell of cells) {
    processed += 1;
    const loaded = await loadMonth(cell.symbol, cell.month);
    if (!loaded) continue;

    const daily = await loadDaily(cell.symbol, cell.month);

    for (const start of windowStarts(loaded.hours.length)) {
      const window = extract(loaded.hours, loaded.minuteIndex, start);
      if (typeof window === 'string') {
        rejections[window] += 1;
        continue;
      }

      const revealEnd = window.revealRaw[window.revealRaw.length - 1].t;
      if (withinDelistingCliff(revealEnd, cell.lastMonth)) {
        rejections.delistingCliff += 1;
        continue;
      }

      const decisionAt = window.leadInRaw[LEAD_IN_BARS - 1].t;
      const percentile = volatilityPercentile(closesStrictlyBefore(daily, decisionAt));
      if (percentile === null) {
        rejections.noTrailingYear += 1;
        continue;
      }

      const ratio = efficiencyRatio(window.leadInRaw.map((bar) => bar.c));
      const er = erBucket(ratio);
      const vol = volBucket(percentile);

      candidates.push({
        symbol: cell.symbol,
        month: cell.month,
        start,
        delisted: cell.delisted,
        efficiencyRatio: ratio,
        erBucket: er,
        volatilityPercentile: percentile,
        volBucket: vol,
        cell: `${er}/${vol}`,
        rank: windowRank(cell.symbol, cell.month, start),
      });
    }

    if (processed % 100 === 0) console.log(`  ${processed}/${cells.length} symbol-months`);
  }

  return candidates;
}

/**
 * Equal allocation across the 4 × 4 regime grid.
 *
 * §13.3: "Stratify the retained set across regime tags so the pool is not dominated by whichever
 * conditions were most common — but do the stratification by published rule, not by hand."
 *
 * Most windows are chop, because most of the time markets chop. Taking a random 1000 would
 * therefore produce a corpus about chop, and every population statistic computed on it would
 * describe chop while claiming to describe trading. Equal allocation fixes that at the cost of
 * the corpus not being representative of *frequency* — a deliberate trade, and the reason §12.4
 * insists engine performance is reported per regime rather than in aggregate.
 *
 * Sparse cells cannot always be filled. The shortfall is redistributed over the cells that still
 * have candidates, in the published order of REGIME_CELLS, until the target is met or the pool
 * is exhausted.
 */
function select(candidates: Candidate[], target = CORPUS_TARGET): Candidate[] {
  const byCell = new Map<string, Candidate[]>();
  for (const cell of REGIME_CELLS) byCell.set(cell, []);
  for (const candidate of candidates) byCell.get(candidate.cell)?.push(candidate);

  // Rank order is a hash of window identity: reproducible, and independent of the order the
  // windows happened to be discovered in.
  for (const list of byCell.values()) list.sort((a, b) => a.rank - b.rank || a.start - b.start);

  const taken = new Map<string, number>(REGIME_CELLS.map((cell) => [cell, 0]));
  const selected: Candidate[] = [];

  // Round-robin over the grid rather than a computed quota, so redistribution is automatic:
  // a cell that runs dry simply stops being offered and the others keep filling.
  for (;;) {
    let placed = 0;
    for (const cell of REGIME_CELLS) {
      if (selected.length >= target) return selected;
      const list = byCell.get(cell)!;
      const index = taken.get(cell)!;
      if (index >= list.length) continue;
      selected.push(list[index]);
      taken.set(cell, index + 1);
      placed += 1;
    }
    if (placed === 0) return selected;
  }
}

/* ------------------------------------------------------------ materialising */

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
  selection_version: string;
  efficiency_ratio: number;
  volatility_percentile: number;
  regime_er_bucket: string;
  regime_vol_bucket: string;
  delisted: boolean;
  symbol_last_month: string;
}

function toRow(candidate: Candidate, window: Window, lastMonth: string): ChartRow | null {
  const mirrored = isMirrored(candidate.symbol, candidate.month, candidate.start);
  const norm = normalizeWindow(window.leadInRaw, window.revealRaw, window.pathRaw, mirrored);
  const detail = normalizeWindow(window.leadInRaw, window.revealRaw, window.detailRaw, mirrored, {
    pathVolume: true,
  });

  const atrValue = atr(norm.leadIn, ATR_PERIOD);
  if (atrValue === null) return null;

  return {
    symbol: candidate.symbol,
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
    selection_seed: (hashString(`${candidate.symbol}|${candidate.month}|${candidate.start}`) ^
      MASTER_SEED) >>> 0,
    pipeline_version: PIPELINE_VERSION,
    normalization_version: NORMALIZATION_VERSION,
    selection_version: SELECTION_VERSION,
    efficiency_ratio: candidate.efficiencyRatio,
    volatility_percentile: candidate.volatilityPercentile,
    regime_er_bucket: candidate.erBucket,
    regime_vol_bucket: candidate.volBucket,
    delisted: candidate.delisted,
    symbol_last_month: lastMonth,
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

async function materialize(selected: Candidate[], lastMonths: Map<string, string>) {
  const byMonth = new Map<string, Candidate[]>();
  for (const candidate of selected) {
    const key = `${candidate.symbol}|${candidate.month}`;
    const list = byMonth.get(key);
    if (list) list.push(candidate);
    else byMonth.set(key, [candidate]);
  }

  const supabase = DRY_RUN ? null : supabaseClient();
  let written = 0;

  if (supabase) {
    // Replace rather than upsert: no chart selected under the old rule may survive into
    // population statistics computed under the new one. This cascades to rounds.
    //
    // Via TRUNCATE rather than DELETE — a thousand rows carrying ~144 MB of TOASTed price data
    // takes long enough to delete row by row that it trips the statement timeout.
    console.log('  clearing the previous corpus…');
    const { error } = await supabase.rpc('clear_corpus');
    if (error) throw new Error(`could not clear charts: ${error.message}`);
  }

  for (const [key, candidates] of byMonth) {
    const [symbol, month] = key.split('|');
    const loaded = await loadMonth(symbol, month);
    if (!loaded) continue;

    const rows: ChartRow[] = [];
    for (const candidate of candidates) {
      const window = extract(loaded.hours, loaded.minuteIndex, candidate.start);
      if (typeof window === 'string') continue;
      const row = toRow(candidate, window, lastMonths.get(symbol) ?? month);
      if (row) rows.push(row);
    }

    if (supabase && rows.length > 0) {
      const BATCH = 3;
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await supabase.from('charts').insert(rows.slice(i, i + BATCH));
        if (error) throw new Error(`insert failed (${symbol} ${month}): ${error.message}`);
      }
    }

    written += rows.length;
    if (written % 100 < rows.length) console.log(`  ${written}/${selected.length}`);
  }

  return written;
}

/* -------------------------------------------------------------------- main */

function report(label: string, selected: Candidate[]) {
  const counts = new Map<string, number>();
  for (const candidate of selected) {
    counts.set(candidate.cell, (counts.get(candidate.cell) ?? 0) + 1);
  }

  console.log(`\n${label}`);
  console.log('  regime grid (rows: efficiency, columns: volatility)');
  const vols = ['quiet', 'subdued', 'active', 'violent'];
  console.log(`    ${''.padEnd(12)}${vols.map((v) => v.padStart(9)).join('')}`);
  for (const er of ['chop', 'noise', 'directional', 'trend']) {
    const row = vols.map((vol) => String(counts.get(`${er}/${vol}`) ?? 0).padStart(9)).join('');
    console.log(`    ${er.padEnd(12)}${row}`);
  }
  console.log(`  symbols          ${symbolCount(selected)}`);
  console.log(`  delisted share   ${(delistedShare(selected) * 100).toFixed(0)}%`);
  console.log(`  mirrored         ${
    selected.filter((c) => isMirrored(c.symbol, c.month, c.start)).length
  }`);
}

async function run() {
  const universe = await loadUniverse();
  const cells = sampleCells(universe);
  const lastMonths = new Map(universe.symbols.map((s) => [s.symbol, s.lastMonth]));
  const rejections = emptyRejections();

  console.log(
    `pass 1-2 — ${cells.length} symbol-months, ` +
      `${symbolCount(cells)} pairs (${(delistedShare(cells) * 100).toFixed(0)}% delisted)\n`,
  );
  const candidates = await locate(cells, rejections);

  console.log('');
  console.log(`candidates       ${candidates.length}`);
  console.log(`rejected         ${JSON.stringify(rejections)}`);
  report('candidate pool', candidates);

  const selected = select(candidates);
  report(`selected ${selected.length} of ${CORPUS_TARGET}`, selected);

  if (MANIFEST) {
    const lines = selected
      .map((c) => `${c.symbol}|${c.month}|${c.start}|${c.erBucket}|${c.volBucket}`)
      .sort();
    await writeFile(MANIFEST, lines.join('\n') + '\n');
    console.log(`\nmanifest written to ${MANIFEST} (${lines.length} windows)`);
  }

  if (selected.length === 0) {
    console.log('\nnothing to build — run `npm run fetch` first');
    return;
  }
  if (DRY_RUN) {
    console.log('\ndry run — nothing written');
    return;
  }

  console.log('\npass 4 — materialising and inserting\n');
  const written = await materialize(selected, lastMonths);
  console.log(`\ncharts inserted  ${written}`);
  console.log('done');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
