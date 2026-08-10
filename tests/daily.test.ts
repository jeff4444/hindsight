import { describe, expect, it } from 'vitest';
import {
  DAILY_CHARTS,
  DAILY_EPOCH_UTC,
  DAILY_WINDOW_DAYS,
  dailyNumber,
  isDailyOpen,
  openDailies,
} from '@/lib/daily';

const DAY = 86_400_000;

describe('daily numbering', () => {
  it('starts at zero on the epoch and rolls at midnight UTC', () => {
    expect(dailyNumber(DAILY_EPOCH_UTC)).toBe(0);
    expect(dailyNumber(DAILY_EPOCH_UTC + DAY - 1)).toBe(0);
    expect(dailyNumber(DAILY_EPOCH_UTC + DAY)).toBe(1);
    expect(dailyNumber(DAILY_EPOCH_UTC + 411 * DAY)).toBe(411);
  });

  it('rolls on UTC midnight, not local midnight', () => {
    // The epoch is a UTC instant, so the boundary cannot drift with the runner's timezone.
    expect(new Date(DAILY_EPOCH_UTC).toISOString()).toMatch(/T00:00:00/);
  });

  it('plays five charts', () => {
    expect(DAILY_CHARTS).toBe(5);
  });
});

describe('the 48-hour window (§10.1)', () => {
  const now = DAILY_EPOCH_UTC + 10 * DAY + 5 * 3_600_000;

  it('keeps today and yesterday open', () => {
    expect(isDailyOpen(10, now)).toBe(true);
    expect(isDailyOpen(9, now)).toBe(true);
  });

  it('closes anything older, and refuses the future', () => {
    expect(isDailyOpen(8, now)).toBe(false);
    expect(isDailyOpen(11, now)).toBe(false);
  });

  it('offers exactly the open days, newest first', () => {
    expect(openDailies(now)).toEqual([10, 9]);
    expect(openDailies(now)).toHaveLength(DAILY_WINDOW_DAYS);
  });

  it('never offers a negative day before the epoch has passed', () => {
    expect(openDailies(DAILY_EPOCH_UTC)).toEqual([0]);
  });
});
