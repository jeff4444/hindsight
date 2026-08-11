/**
 * Which daily it is.
 *
 * §10.1: "One chart, identical for every player... Resets at midnight UTC, with a 48-hour
 * completion window rather than a hard cut."
 *
 * The chart count is five rather than one. §10.1 says one, but §4.4 ("in the daily, allow
 * unlimited passes but print 'traded 2 of 5'") and §10.4's example card ("traded 3 of 5") both
 * describe five, and §14 puts "scored pass with quota" in this phase — a quota that cannot bind
 * on a single chart. Two references against one, and the two make the phase coherent.
 */

/** Day zero. Every daily is numbered from here so the number on a share card is stable. */
export const DAILY_EPOCH_UTC = Date.UTC(2026, 7, 1); // 1 August 2026

export const DAILY_CHARTS = 5;

/** §10.1's completion window: day N stays playable until N+2 opens. */
export const DAILY_WINDOW_DAYS = 2;

const DAY_MS = 86_400_000;

/** The daily number for an instant. Rolls at midnight UTC. */
export function dailyNumber(nowMs: number): number {
  return Math.floor((nowMs - DAILY_EPOCH_UTC) / DAY_MS);
}

/**
 * When the next daily opens: the next midnight UTC.
 *
 * Derived from the epoch rather than from a `Date` with local fields, so it lands on the same
 * instant the day number rolls over regardless of where the clock reading it is.
 */
export function nextResetAt(nowMs: number = Date.now()): number {
  return DAILY_EPOCH_UTC + (dailyNumber(nowMs) + 1) * DAY_MS;
}

/** Is `day` still open at `nowMs`? Today and yesterday are; older is not. */
export function isDailyOpen(day: number, nowMs: number): boolean {
  const today = dailyNumber(nowMs);
  return day <= today && day > today - DAILY_WINDOW_DAYS;
}

/** The dailies a player may still complete, newest first. */
export function openDailies(nowMs: number): number[] {
  const today = dailyNumber(nowMs);
  return Array.from({ length: DAILY_WINDOW_DAYS }, (_, i) => today - i).filter((day) => day >= 0);
}
