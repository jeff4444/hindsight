/**
 * Weekday and time of day, without a date.
 *
 * §12.2 requires stripping dates, and a weekday plus an hour is part of a date — so this needs
 * an argument rather than an assumption. The argument is that §3.1 draws the line at
 * *identity*, *hindsight* and *crutches*, and session structure is none of the three. Crypto
 * trades around the clock but not evenly: liquidity thins across the weekend, and the
 * Asia/Europe/US handoffs are visible in the range of the bars themselves. A reader who can
 * see that a compression is happening at 03:00 on a Sunday is reading the chart, not looking
 * it up. That is the same category as the ATR badge — context that makes the problem legible
 * rather than a shortcut past it.
 *
 * What is released is three bits of weekday and a little under five of hour. The year, the
 * month and the day of the month never leave the server, and no combination of what does can
 * reconstruct them.
 *
 * The mechanism is a **synthetic epoch**. Bars are stamped into a fixed reference week rather
 * than carrying their real timestamps, so the charting library gets properly hour-spaced times
 * — which it needs to lay out an axis sensibly — while the calendar date it computes from them
 * is a constant fiction. Anyone opening devtools finds January 1970 and the correct weekday,
 * which is exactly what the interface is showing them anyway.
 */

export const HOUR_SECONDS = 3600;
export const DAY_SECONDS = 86_400;

/** 1970-01-05 was a Monday, which makes it a convenient week to pin everything to. */
export const SYNTHETIC_WEEK_EPOCH = 4 * DAY_SECONDS;

/** Monday first, matching the ISO weekday the database hands over. */
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Seconds since the synthetic epoch for a chart whose first candle opens on this weekday/hour. */
export function timeOrigin(dayOfWeek: number, hourUtc: number): number {
  return SYNTHETIC_WEEK_EPOCH + dayOfWeek * DAY_SECONDS + hourUtc * HOUR_SECONDS;
}

export interface Clock {
  /** 0 = Monday. */
  dayOfWeek: number;
  day: string;
  hour: number;
  /** Minute past the hour. Zero for every display candle, non-zero once zoomed finer. */
  minute: number;
  /** Saturday or Sunday — thin books in crypto, and worth seeing at a glance. */
  weekend: boolean;
}

export function clockAt(seconds: number): Clock {
  const elapsed = seconds - SYNTHETIC_WEEK_EPOCH;
  const dayIndex = Math.floor(elapsed / DAY_SECONDS);
  const dayOfWeek = ((dayIndex % 7) + 7) % 7;
  const intoDay = ((seconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const hour = Math.floor(intoDay / HOUR_SECONDS);
  const minute = Math.floor((intoDay % HOUR_SECONDS) / 60);

  return {
    dayOfWeek,
    day: DAY_NAMES[dayOfWeek],
    hour,
    minute,
    weekend: dayOfWeek >= 5,
  };
}

/** "14:00", or "14:35" once the resolution is finer than an hour. */
export function formatHour(seconds: number): string {
  const { hour, minute } = clockAt(seconds);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** "Tue 14:00" */
export function formatClock(seconds: number): string {
  const { day } = clockAt(seconds);
  return `${day} ${formatHour(seconds)}`;
}

/**
 * Clock of the decision bar — the last lead-in candle, and the one the entry is fixed at.
 *
 * `leadInBars` candles at one hour each puts the decision bar `leadInBars - 1` hours after the
 * first visible candle. This is the number the badge shows, so an off-by-one here would
 * quietly tell the player the wrong hour.
 */
export function decisionClockSeconds(
  startDayOfWeek: number,
  startHourUtc: number,
  leadInBars: number,
): number {
  return timeOrigin(startDayOfWeek, startHourUtc) + (leadInBars - 1) * HOUR_SECONDS;
}

/**
 * Axis label for one tick: the weekday at midnight, the hour otherwise.
 *
 * Never a date, whatever tick density the library settles on.
 */
export function formatTick(seconds: number): string {
  const { day, hour, minute } = clockAt(seconds);
  return hour === 0 && minute === 0 ? day : formatHour(seconds);
}
