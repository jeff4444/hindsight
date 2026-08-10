/**
 * Download the archives the published selection rule asks for.
 *
 *   npm run fetch
 *
 * Two intervals, for two different jobs:
 *
 *   **1m** for the sampled symbol-months — the display candles, the resolver's path and the
 *   client's zoom detail all come from these. Roughly 800 files at ~1.4 MB.
 *
 *   **1d** for the thirteen months preceding each sampled month — the volatility axis ranks
 *   against the instrument's trailing year (§6 Layer 2) and a year of daily closes is the
 *   cheapest honest way to have one. A few thousand files at ~2 KB.
 *
 * Resumable and idempotent: anything already cached is skipped, and a 404 is recorded so the run
 * does not retry it. A 404 is the normal signal that a pair was not listed yet or had already
 * been delisted, which is information rather than an error.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { klineUrl } from './klines';
import { dailyMonthsFor, sampleCells } from './selection';
import { loadUniverse } from './universe';

const CACHE_DIR = path.resolve(process.cwd(), '.data/klines');
const MISSING_FILE = path.resolve(process.cwd(), '.data/unavailable.json');
const CONCURRENCY = 12;

export function cachePath(symbol: string, month: string, interval = '1m'): string {
  return path.join(CACHE_DIR, `${symbol}-${interval}-${month}.zip`);
}

interface Job {
  symbol: string;
  month: string;
  interval: string;
}

async function loadMissing(): Promise<Set<string>> {
  if (!existsSync(MISSING_FILE)) return new Set();
  try {
    return new Set(JSON.parse(await readFile(MISSING_FILE, 'utf8')) as string[]);
  } catch {
    return new Set();
  }
}

async function download(jobs: Job[], missing: Set<string>, label: string) {
  if (jobs.length === 0) {
    console.log(`${label}: nothing to fetch`);
    return 0;
  }

  const queue = [...jobs];
  const total = jobs.length;
  let done = 0;
  let bytes = 0;
  let gone = 0;

  const worker = async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;

      const key = `${job.symbol}:${job.interval}:${job.month}`;
      try {
        const response = await fetch(klineUrl(job.symbol, job.month, job.interval));

        if (response.status === 404) {
          missing.add(key);
          gone += 1;
        } else if (!response.ok) {
          console.warn(`  ${key}: HTTP ${response.status}, will retry next run`);
        } else {
          const body = new Uint8Array(await response.arrayBuffer());
          await writeFile(cachePath(job.symbol, job.month, job.interval), body);
          bytes += body.byteLength;
        }
      } catch (error) {
        console.warn(`  ${key}: ${(error as Error).message}`);
      }

      done += 1;
      if (done % 200 === 0 || done === total) {
        console.log(`  ${label} ${done}/${total}  ${(bytes / 1e6).toFixed(0)} MB`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`${label}: ${(bytes / 1e6).toFixed(0)} MB, ${gone} unavailable`);
  return bytes;
}

async function run() {
  await mkdir(CACHE_DIR, { recursive: true });
  const missing = await loadMissing();
  const universe = await loadUniverse();
  const cells = sampleCells(universe);

  console.log(
    `selection: ${cells.length} symbol-months across ` +
      `${new Set(cells.map((c) => c.symbol)).size} pairs ` +
      `(${cells.filter((c) => c.delisted).length} from delisted pairs)\n`,
  );

  const wanted = (symbol: string, month: string, interval: string) =>
    !missing.has(`${symbol}:${interval}:${month}`) && !existsSync(cachePath(symbol, month, interval));

  const minuteJobs: Job[] = cells
    .filter((cell) => wanted(cell.symbol, cell.month, '1m'))
    .map((cell) => ({ symbol: cell.symbol, month: cell.month, interval: '1m' }));

  // The trailing year each sampled month needs, deduplicated — pairs sampled in adjacent
  // quarters share most of their history.
  const dailyKeys = new Set<string>();
  for (const cell of cells) {
    for (const month of dailyMonthsFor(cell.month)) dailyKeys.add(`${cell.symbol}|${month}`);
  }
  const dailyJobs: Job[] = [...dailyKeys]
    .map((key) => {
      const [symbol, month] = key.split('|');
      return { symbol, month, interval: '1d' };
    })
    .filter((job) => wanted(job.symbol, job.month, job.interval));

  console.log(`daily (trailing year, ~2 KB each): ${dailyJobs.length} to fetch`);
  await download(dailyJobs, missing, 'daily');
  await writeFile(MISSING_FILE, JSON.stringify([...missing].sort()));

  console.log(`\nminute (~1.4 MB each): ${minuteJobs.length} to fetch`);
  await download(minuteJobs, missing, 'minute');
  await writeFile(MISSING_FILE, JSON.stringify([...missing].sort()));

  console.log('\ndone');
}

if (process.argv[1] && process.argv[1].endsWith('fetch-binance.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
