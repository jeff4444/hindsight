/**
 * Download Binance monthly 1-minute kline archives into a local cache.
 *
 * Resumable and idempotent: anything already in `.data/klines` is skipped, and a symbol-month
 * that 404s is recorded as unavailable so the run does not retry it every time. A 404 is the
 * normal signal that a symbol was not listed yet, or had already been delisted — which is
 * exactly the information the corpus wants, so it is not an error.
 *
 *   npm run fetch
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MONTHS, SYMBOL_NAMES } from './symbols';
import { klineUrl } from './klines';

const CACHE_DIR = path.resolve(process.cwd(), '.data/klines');
const MISSING_FILE = path.resolve(process.cwd(), '.data/unavailable.json');
const CONCURRENCY = 6;

interface Job {
  symbol: string;
  month: string;
}

export function cachePath(symbol: string, month: string): string {
  return path.join(CACHE_DIR, `${symbol}-1m-${month}.zip`);
}

async function loadMissing(): Promise<Set<string>> {
  if (!existsSync(MISSING_FILE)) return new Set();
  try {
    return new Set(JSON.parse(await readFile(MISSING_FILE, 'utf8')) as string[]);
  } catch {
    return new Set();
  }
}

async function run() {
  await mkdir(CACHE_DIR, { recursive: true });
  const missing = await loadMissing();

  const jobs: Job[] = [];
  for (const symbol of SYMBOL_NAMES) {
    for (const month of MONTHS) {
      const key = `${symbol}:${month}`;
      if (missing.has(key)) continue;
      if (existsSync(cachePath(symbol, month))) continue;
      jobs.push({ symbol, month });
    }
  }

  console.log(
    `${SYMBOL_NAMES.length} symbols x ${MONTHS.length} months — ${jobs.length} to download, ` +
      `${SYMBOL_NAMES.length * MONTHS.length - jobs.length - missing.size} cached, ` +
      `${missing.size} known unavailable`,
  );

  let done = 0;
  let bytes = 0;
  let newlyMissing = 0;

  const worker = async () => {
    for (;;) {
      const job = jobs.shift();
      if (!job) return;

      const response = await fetch(klineUrl(job.symbol, job.month));

      if (response.status === 404) {
        missing.add(`${job.symbol}:${job.month}`);
        newlyMissing += 1;
      } else if (!response.ok) {
        console.warn(`  ${job.symbol} ${job.month}: HTTP ${response.status}, will retry next run`);
      } else {
        const body = new Uint8Array(await response.arrayBuffer());
        await writeFile(cachePath(job.symbol, job.month), body);
        bytes += body.byteLength;
      }

      done += 1;
      if (done % 25 === 0) {
        console.log(`  ${done}/${done + jobs.length}  ${(bytes / 1e6).toFixed(0)} MB`);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await writeFile(MISSING_FILE, JSON.stringify([...missing].sort(), null, 0));

  console.log(
    `done — ${(bytes / 1e6).toFixed(0)} MB downloaded, ${newlyMissing} symbol-months unavailable ` +
      `(not listed or already delisted)`,
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
