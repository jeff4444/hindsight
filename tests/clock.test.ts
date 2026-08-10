import { describe, expect, it } from 'vitest';
import { LEAD_IN_BARS, WINDOW_BARS } from '@/core/config';
import {
  DAY_NAMES,
  HOUR_SECONDS,
  SYNTHETIC_WEEK_EPOCH,
  clockAt,
  decisionClockSeconds,
  formatClock,
  formatHour,
  formatTick,
  timeOrigin,
} from '@/lib/clock';

describe('the synthetic week', () => {
  it('is anchored to a real Monday, so weekdays come out right', () => {
    expect(new Date(SYNTHETIC_WEEK_EPOCH * 1000).getUTCDay()).toBe(1); // 1 = Monday
    expect(clockAt(SYNTHETIC_WEEK_EPOCH).day).toBe('Mon');
    expect(clockAt(SYNTHETIC_WEEK_EPOCH).hour).toBe(0);
  });

  it('places a chart on the weekday and hour it was actually issued for', () => {
    for (let dow = 0; dow < 7; dow++) {
      for (const hour of [0, 7, 13, 23]) {
        const clock = clockAt(timeOrigin(dow, hour));
        expect(clock.dayOfWeek).toBe(dow);
        expect(clock.hour).toBe(hour);
        expect(clock.day).toBe(DAY_NAMES[dow]);
      }
    }
  });

  it('rolls the weekday over correctly across a whole window', () => {
    // A 140-bar window is 5 days and 20 hours, so it always crosses at least five midnights
    // and may wrap past Sunday.
    const origin = timeOrigin(4, 20); // Friday 20:00
    const clocks = Array.from({ length: WINDOW_BARS }, (_, i) =>
      clockAt(origin + i * HOUR_SECONDS),
    );

    expect(clocks[0].day).toBe('Fri');
    expect(clocks[4].day).toBe('Sat'); // 20:00 + 4h = Saturday 00:00
    expect(clocks[4].hour).toBe(0);
    expect(clocks[52].day).toBe('Mon'); // wrapped past Sunday into the next week
    expect(new Set(clocks.map((c) => c.day)).size).toBe(7);
  });

  it('marks Saturday and Sunday as the weekend', () => {
    expect(clockAt(timeOrigin(4, 12)).weekend).toBe(false);
    expect(clockAt(timeOrigin(5, 12)).weekend).toBe(true);
    expect(clockAt(timeOrigin(6, 12)).weekend).toBe(true);
    expect(clockAt(timeOrigin(0, 12)).weekend).toBe(false);
  });
});

describe('nothing a label can render is a date (§12.2)', () => {
  // The formatters are the last line of defence: whatever tick density lightweight-charts
  // settles on — including its year and month tick types — it renders these strings.
  const everyHourOfAWeek = Array.from({ length: 7 * 24 }, (_, i) => SYNTHETIC_WEEK_EPOCH + i * HOUR_SECONDS);

  it('never emits a year, a month name or a day of the month', () => {
    const months = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i;
    for (const seconds of everyHourOfAWeek) {
      for (const label of [formatTick(seconds), formatClock(seconds)]) {
        expect(label).not.toMatch(/\d{4}/); // no year
        expect(label).not.toMatch(months);
        expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        expect(label).not.toContain('1970');
      }
    }
  });

  it('labels a midnight tick with the weekday and every other tick with the hour', () => {
    expect(formatTick(timeOrigin(1, 0))).toBe('Tue');
    expect(formatTick(timeOrigin(1, 14))).toBe('14:00');
    expect(formatTick(timeOrigin(1, 9))).toBe('09:00');
    expect(formatClock(timeOrigin(1, 14))).toBe('Tue 14:00');
  });
});

describe('the decision bar', () => {
  it('sits 79 hours after the first visible candle', () => {
    // A window opening Sunday 08:00 puts the decision bar three days and seven hours later.
    const seconds = decisionClockSeconds(6, 8, LEAD_IN_BARS);
    expect(formatClock(seconds)).toBe('Wed 15:00');
  });

  it('agrees with walking the window one bar at a time', () => {
    for (let dow = 0; dow < 7; dow++) {
      for (const hour of [0, 5, 17, 23]) {
        const walked = clockAt(timeOrigin(dow, hour) + (LEAD_IN_BARS - 1) * HOUR_SECONDS);
        const direct = clockAt(decisionClockSeconds(dow, hour, LEAD_IN_BARS));
        expect(direct).toEqual(walked);
      }
    }
  });
});

describe('sub-hour labels', () => {
  // The formatter used to hardcode ":00" for minutes, which was invisible while every candle
  // opened on the hour and wrong the moment finer resolutions existed.
  it('shows real minutes, not a hardcoded :00', () => {
    const base = timeOrigin(1, 14);
    expect(formatHour(base)).toBe('14:00');
    expect(formatHour(base + 5 * 60)).toBe('14:05');
    expect(formatHour(base + 35 * 60)).toBe('14:35');
    expect(formatHour(base + 59 * 60)).toBe('14:59');
    expect(formatClock(base + 35 * 60)).toBe('Tue 14:35');
  });

  it('only names the weekday at true midnight', () => {
    const midnight = timeOrigin(2, 0);
    expect(formatTick(midnight)).toBe('Wed');
    expect(formatTick(midnight + 60)).toBe('00:01');
    expect(formatTick(midnight + 30 * 60)).toBe('00:30');
  });

  it('still never renders a date at minute resolution', () => {
    const months = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i;
    for (let minute = 0; minute < 60 * 24 * 2; minute += 7) {
      const label = formatTick(SYNTHETIC_WEEK_EPOCH + minute * 60);
      expect(label).not.toMatch(/\d{4}/);
      expect(label).not.toMatch(months);
    }
  });
});
