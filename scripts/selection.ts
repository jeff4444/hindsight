/**
 * The published selection rule.
 *
 * §6 Layer 0: "Charts are sampled by a published rule over the regime tags, not hand-picked for
 * being interesting. Hand-curation changes the difficulty distribution non-randomly and
 * invalidates every population statistic computed on it."
 *
 * Phase 0's rule was reproducible but it was a round-robin over twenty symbols I chose by hand,
 * which is the same curation one level up. Everything here is mechanical: which pairs are
 * eligible, which of their months get downloaded, and which windows survive into the corpus. No
 * step looks at whether a chart is interesting.
 *
 * Published in docs/rules.md; this file is the implementation of that text.
 */

import { hashString, mulberry32 } from '../src/core/random';
import type { SymbolRecord, Universe } from './universe';

/** Master seed for every random choice in the pipeline. Published so the corpus is repeatable. */
export const MASTER_SEED = 0x48494e44; // 'HIND'

/** Charts retained in the corpus. */
export const CORPUS_TARGET = 1000;

/**
 * Symbol-months to download 1-minute data for.
 *
 * Sized from the observed yield: a liquid month gives about five non-overlapping 140-hour
 * windows, so 800 cells is roughly 3800 candidates for a stratified pick of 1000. The surplus
 * is what lets the sparse corners of the regime grid fill.
 */
export const TARGET_CELLS = 800;

/**
 * Most months any one pair may contribute.
 *
 * Bounds how far a single instrument can dominate the download, which matters more than it
 * sounds: BTC has a month in every quarter of the range and would otherwise crowd out the
 * delisted pairs that only ever had eighteen.
 */
export const PER_SYMBOL_CAP = 4;

/**
 * Minimum compressed size of a monthly 1-minute archive, in bytes.
 *
 * Binance omits minutes with no trades, so the archive's size is a direct count of minutes that
 * actually traded. A month of complete coverage compresses to 1.2–1.5 MB; below 0.9 MB a
 * material share of minutes are missing and §13.3's contiguity filter would reject most windows
 * in that month anyway. The floor saves download rather than shaping the corpus — it costs one
 * symbol out of 445 and leaves the delisted share untouched at 36%.
 */
export const MIN_ARCHIVE_BYTES = 900_000;

/**
 * Months of history a pair needs before a month is samplable.
 *
 * The volatility axis ranks against the instrument's trailing year (§6 Layer 2), so a window
 * whose instrument has not traded for a year cannot be tagged and could not be selected.
 * Thirteen rather than twelve leaves a month of slack for partial first months.
 */
export const TRAILING_MONTHS_REQUIRED = 13;

export interface Cell {
  symbol: string;
  month: string;
  delisted: boolean;
  /** Last month the pair has any archive for — used for the delisting-cliff filter. */
  lastMonth: string;
}

/** Whole months between two YYYY-MM strings. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Shift a YYYY-MM string by a whole number of months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split('-').map(Number);
  const total = year * 12 + (index - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Every symbol-month that passes the published preconditions, in canonical order. */
export function eligibleCells(universe: Universe): Cell[] {
  const cells: Cell[] = [];

  for (const record of universe.symbols) {
    if (!record.eligible) continue;

    for (const archive of record.monthsInRange) {
      if (archive.bytes < MIN_ARCHIVE_BYTES) continue;
      if (monthsBetween(record.firstMonth, archive.month) < TRAILING_MONTHS_REQUIRED) continue;

      cells.push({
        symbol: record.symbol,
        month: archive.month,
        delisted: record.delisted,
        lastMonth: record.lastMonth,
      });
    }
  }

  // Canonical order before any shuffle, so the seed alone decides the outcome and the listing's
  // own ordering cannot leak in.
  cells.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.month.localeCompare(b.month));
  return cells;
}

/**
 * The symbol-months to download, chosen by seed alone.
 *
 * Shuffled globally rather than per symbol, so a pair's chance of appearing is proportional to
 * how many eligible months it has — a pair that traded for six years is more of the market's
 * history than one that lasted eighteen months, and pretending otherwise would be its own
 * distortion. The per-symbol cap stops that proportionality becoming domination.
 */
export function sampleCells(universe: Universe, target = TARGET_CELLS): Cell[] {
  const pool = eligibleCells(universe);
  const rng = mulberry32(MASTER_SEED);

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const perSymbol = new Map<string, number>();
  const chosen: Cell[] = [];

  for (const cell of pool) {
    if (chosen.length >= target) break;
    const used = perSymbol.get(cell.symbol) ?? 0;
    if (used >= PER_SYMBOL_CAP) continue;
    perSymbol.set(cell.symbol, used + 1);
    chosen.push(cell);
  }

  return chosen;
}

/**
 * Days before a pair's archive ends within which windows are dropped.
 *
 * §13.3 asks for delisting cliffs to be rejected. The cliff is the flat artefact after trading
 * has effectively stopped — not the collapse before it, which is real price action and exactly
 * the kind of window the corpus should contain. LUNA and FTT keep their crashes.
 */
export const DELISTING_CLIFF_DAYS = 7;

/** First instant after a YYYY-MM month. */
export function endOfMonthMs(month: string): number {
  const [year, index] = month.split('-').map(Number);
  return Date.UTC(index === 12 ? year + 1 : year, index === 12 ? 0 : index, 1);
}

/**
 * Does a window's reveal run into the pair's final week of data?
 *
 * Pulled out of the pipeline and given its own tests because in practice it almost never fires —
 * illiquid months near a delisting are usually rejected for gaps first, so a whole corpus build
 * can pass through it without exercising it once. A filter that never runs and has no test is a
 * filter nobody can claim works.
 */
export function withinDelistingCliff(
  revealEndMs: number,
  lastMonth: string,
  cliffDays = DELISTING_CLIFF_DAYS,
): boolean {
  return revealEndMs >= endOfMonthMs(lastMonth) - cliffDays * 86_400_000;
}

/** Daily-kline months needed to tag windows in `month` — the trailing year plus the month. */
export function dailyMonthsFor(month: string): string[] {
  const months: string[] = [];
  for (let back = TRAILING_MONTHS_REQUIRED; back >= 0; back--) {
    months.push(shiftMonth(month, -back));
  }
  return months;
}

/**
 * Deterministic per-window tie-break.
 *
 * Stratified selection has to choose *which* windows fill a regime cell. Ordering by a hash of
 * the window's identity keeps that choice reproducible and independent of the order windows
 * happened to be discovered in.
 */
export function windowRank(symbol: string, month: string, start: number): number {
  return hashString(`${symbol}|${month}|${start}|rank`) >>> 0;
}

/** Delisted share of a set of cells, for the corpus report. */
export function delistedShare(cells: readonly { delisted: boolean }[]): number {
  if (cells.length === 0) return 0;
  return cells.filter((cell) => cell.delisted).length / cells.length;
}

export function symbolCount(cells: readonly { symbol: string }[]): number {
  return new Set(cells.map((cell) => cell.symbol)).size;
}

export type { SymbolRecord };
