/**
 * Enumerate every USDT spot pair that ever traded on Binance.
 *
 *   npm run universe
 *
 * §6 Layer 0 is blunt about why this cannot be built from the obvious source: "If charts are
 * sampled from currently listed instruments, every chart is a survivor, charts drift upward,
 * longs are systematically rewarded, and the leaderboard develops a long bias."
 *
 * `api.binance.com/exchangeInfo` returns currently listed pairs. A universe built from it is,
 * by construction, a universe of instruments that did not die — which is exactly the bias.
 * The public data archive still has directories for pairs that were delisted years ago, so the
 * archive's own index is the only survivorship-free source available.
 *
 * Nothing here downloads price data. Listing a symbol's `1m/` prefix returns the names of its
 * monthly archives, and that alone gives first month, last month, and how long the pair
 * survived — one request per symbol rather than one per file.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BUCKET = 'https://s3-ap-northeast-1.amazonaws.com/data.binance.vision';
const KLINES_PREFIX = 'data/spot/monthly/klines/';
const CONCURRENCY = 16;

const DATA_DIR = path.resolve(process.cwd(), '.data');
export const UNIVERSE_FILE = path.join(DATA_DIR, 'universe.json');

/* ------------------------------------------------------------- published rule */

/** The corpus range. Windows are only ever drawn from months inside it. */
export const RANGE_START = '2020-01';
export const RANGE_END = '2025-12';

/**
 * Minimum monthly 1-minute archives inside the range for a pair to be eligible.
 *
 * The floor is set by what the volatility axis needs rather than by taste: a percentile against
 * the instrument's own trailing year (§6 Layer 2) cannot exist for a pair that did not trade for
 * a year. Eighteen months leaves room for the trailing year plus windows drawn after it.
 */
export const MIN_MONTHS_IN_RANGE = 18;

/**
 * A pair whose archive stops more than this many months before the frontier is treated as
 * delisted. Two months of slack absorbs the lag between the last day of trading and the last
 * monthly file being published.
 */
export const DELISTED_SLACK_MONTHS = 2;

/* --------------------------------------------------------------------- types */

/** One monthly 1-minute archive, and how big it is. */
export interface MonthArchive {
  month: string;
  /**
   * Compressed bytes.
   *
   * A free liquidity proxy: the archive holds one row per minute that actually traded, and
   * Binance omits minutes with no trades entirely. A pair trading every minute compresses to
   * ~2 MB a month; a barely-traded one to a few tens of kilobytes. Reading it off the listing
   * costs nothing and predicts, before any download, whether the contiguity filter in §13.3
   * would throw the window away for gaps.
   */
  bytes: number;
}

export interface SymbolRecord {
  symbol: string;
  /** Months with a 1m archive, sorted, restricted to the corpus range. */
  monthsInRange: MonthArchive[];
  /** First and last month across the pair's entire archive, range or not. */
  firstMonth: string;
  lastMonth: string;
  /** Stopped trading before the archive frontier — the survivorship correction (§13.3). */
  delisted: boolean;
  eligible: boolean;
}

export interface Universe {
  generatedFrom: string;
  rangeStart: string;
  rangeEnd: string;
  minMonthsInRange: number;
  /** Latest month seen anywhere in the archive; delisting is judged against this. */
  frontierMonth: string;
  symbols: SymbolRecord[];
}

/* ------------------------------------------------------------------ listing */

async function listPage(prefix: string, marker: string | null, delimiter: boolean) {
  const url = new URL(BUCKET);
  url.searchParams.set('prefix', prefix);
  url.searchParams.set('max-keys', '1000');
  if (delimiter) url.searchParams.set('delimiter', '/');
  if (marker) url.searchParams.set('marker', marker);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`listing ${prefix} failed: HTTP ${response.status}`);
  const xml = await response.text();

  const prefixes = [...xml.matchAll(/<Prefix>([^<]*)<\/Prefix>/g)]
    .map((match) => match[1])
    .filter((value) => value !== prefix);
  // <Contents> pairs each key with its size; both are needed and they must stay aligned.
  const entries = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => ({
    key: /<Key>([^<]*)<\/Key>/.exec(match[1])?.[1] ?? '',
    bytes: Number(/<Size>(\d+)<\/Size>/.exec(match[1])?.[1] ?? 0),
  }));
  const truncated = xml.includes('<IsTruncated>true</IsTruncated>');
  const next = /<NextMarker>([^<]*)<\/NextMarker>/.exec(xml)?.[1] ?? null;

  return { prefixes, entries, truncated, next };
}

/** Every symbol directory in the spot klines archive, delisted ones included. */
async function listAllSymbols(): Promise<string[]> {
  const symbols: string[] = [];
  let marker: string | null = null;

  for (;;) {
    const page = await listPage(KLINES_PREFIX, marker, true);
    for (const value of page.prefixes) {
      const name = value.slice(KLINES_PREFIX.length).replace(/\/$/, '');
      if (name) symbols.push(name);
    }
    if (!page.truncated) break;
    // S3 pages by the last key returned; without a NextMarker, resume from the last prefix.
    marker = page.next ?? `${KLINES_PREFIX}${symbols[symbols.length - 1]}/`;
  }

  return symbols;
}

/** Months with a 1m archive for one symbol, with sizes. One request; no price data fetched. */
async function listMonths(symbol: string): Promise<MonthArchive[]> {
  const prefix = `${KLINES_PREFIX}${symbol}/1m/`;
  const months: MonthArchive[] = [];
  let marker: string | null = null;

  for (;;) {
    const page = await listPage(prefix, marker, false);
    for (const entry of page.entries) {
      const month = /-1m-(\d{4}-\d{2})\.zip$/.exec(entry.key)?.[1];
      if (month) months.push({ month, bytes: entry.bytes });
    }
    if (!page.truncated) break;
    marker = page.next ?? page.entries[page.entries.length - 1]?.key ?? null;
    if (!marker) break;
  }

  months.sort((a, b) => a.month.localeCompare(b.month));
  return months;
}

/* -------------------------------------------------------------------- main */

const inRange = (month: string) => month >= RANGE_START && month <= RANGE_END;

/** Whole months between two YYYY-MM strings. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

async function run() {
  await mkdir(DATA_DIR, { recursive: true });

  if (existsSync(UNIVERSE_FILE) && !process.argv.includes('--refresh')) {
    const cached = JSON.parse(await readFile(UNIVERSE_FILE, 'utf8')) as Universe;
    console.log(
      `cached universe: ${cached.symbols.length} USDT pairs, ` +
        `${cached.symbols.filter((s) => s.eligible).length} eligible. --refresh to rebuild.`,
    );
    return;
  }

  console.log('listing every symbol directory in the archive…');
  const all = await listAllSymbols();
  const usdt = all.filter((symbol) => symbol.endsWith('USDT'));
  console.log(`  ${all.length} symbols ever archived, ${usdt.length} of them USDT pairs`);

  console.log('reading each pair’s available months (no price data downloaded)…');
  const records: SymbolRecord[] = [];
  const queue = [...usdt];
  let done = 0;

  const worker = async () => {
    for (;;) {
      const symbol = queue.shift();
      if (!symbol) return;

      try {
        const months = await listMonths(symbol);
        if (months.length > 0) {
          records.push({
            symbol,
            monthsInRange: months.filter((m) => inRange(m.month)),
            firstMonth: months[0].month,
            lastMonth: months[months.length - 1].month,
            delisted: false, // decided below, once the frontier is known
            eligible: false,
          });
        }
      } catch (error) {
        console.warn(`  ${symbol}: ${(error as Error).message}`);
      }

      done += 1;
      if (done % 100 === 0) console.log(`  ${done}/${usdt.length}`);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // The frontier is the newest month anywhere in the archive; a pair that stops well short of it
  // stopped trading rather than merely not having been published yet.
  const frontierMonth = records.reduce((max, r) => (r.lastMonth > max ? r.lastMonth : max), '');

  for (const record of records) {
    record.delisted = monthsBetween(record.lastMonth, frontierMonth) > DELISTED_SLACK_MONTHS;
    record.eligible = record.monthsInRange.length >= MIN_MONTHS_IN_RANGE;
  }

  records.sort((a, b) => a.symbol.localeCompare(b.symbol));

  const universe: Universe = {
    generatedFrom: BUCKET,
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END,
    minMonthsInRange: MIN_MONTHS_IN_RANGE,
    frontierMonth,
    symbols: records,
  };
  await writeFile(UNIVERSE_FILE, JSON.stringify(universe));

  const eligible = records.filter((r) => r.eligible);
  const eligibleDelisted = eligible.filter((r) => r.delisted);

  console.log('');
  console.log(`frontier month     ${frontierMonth}`);
  console.log(`USDT pairs found   ${records.length}`);
  console.log(`eligible           ${eligible.length} (>= ${MIN_MONTHS_IN_RANGE} months in range)`);
  console.log(
    `  of which delisted ${eligibleDelisted.length} ` +
      `(${((eligibleDelisted.length / Math.max(eligible.length, 1)) * 100).toFixed(0)}%)`,
  );
  console.log(`symbol-months      ${eligible.reduce((n, r) => n + r.monthsInRange.length, 0)}`);
  console.log(`written to         ${path.relative(process.cwd(), UNIVERSE_FILE)}`);
}

/** Load the cached universe. Throws if it has not been built. */
export async function loadUniverse(): Promise<Universe> {
  if (!existsSync(UNIVERSE_FILE)) {
    throw new Error('universe not enumerated — run `npm run universe` first');
  }
  return JSON.parse(await readFile(UNIVERSE_FILE, 'utf8')) as Universe;
}

if (process.argv[1] && process.argv[1].endsWith('universe.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
