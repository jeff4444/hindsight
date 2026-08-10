import { describe, expect, it } from 'vitest';
import { aggregateByCount } from '@/core/bars';
import { packDetail, unpackDetail, toBase64, fromBase64, DETAIL_BAR_BYTES } from '@/core/pack';
import { DISPLAY_TIER, TIERS, tierLabel, tierPhase, tierPlan } from '@/lib/resolution';
import { HOUR_SECONDS, formatClock, timeOrigin } from '@/lib/clock';
import { bar, path } from './helpers';

describe('aggregating minutes into candles', () => {
  const minutes = path(180, (i) => bar(100 + i, 100 + i + 2, 100 + i - 3, 100 + i + 1, 10));

  it('takes open from the first, close from the last, and the extremes across the bucket', () => {
    const [first] = aggregateByCount(minutes, 60);
    expect(first.o).toBe(100);
    expect(first.c).toBe(160); // minute 59: 100 + 59 + 1
    expect(first.h).toBe(161);
    expect(first.l).toBe(97);
    expect(first.v).toBe(600);
  });

  it('produces the bar counts each tier implies', () => {
    expect(aggregateByCount(minutes, 60)).toHaveLength(3);
    expect(aggregateByCount(minutes, 15)).toHaveLength(12);
    expect(aggregateByCount(minutes, 5)).toHaveLength(36);
    expect(aggregateByCount(minutes, 1)).toHaveLength(180);
  });

  it('emits a trailing partial bucket, because the newest candle is still forming', () => {
    const partial = aggregateByCount(minutes.slice(0, 90), 60);
    expect(partial).toHaveLength(2);
    expect(partial[1].c).toBe(minutes[89].c);
  });

  it('is consistent across tiers — coarse equals aggregating the fine', () => {
    // 5m candles grouped by 12 must equal the 60m candles. If this ever fails, zooming would
    // change what the chart says happened, which is worse than no zoom at all.
    const hourly = aggregateByCount(minutes, 60);
    const viaFive = aggregateByCount(aggregateByCount(minutes, 5), 12);
    expect(viaFive).toEqual(hourly);

    const viaFifteen = aggregateByCount(aggregateByCount(minutes, 15), 4);
    expect(viaFifteen).toEqual(hourly);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(minutes);
    aggregateByCount(minutes, 15);
    expect(JSON.stringify(minutes)).toBe(before);
  });
});

describe('detail packing', () => {
  const minutes = path(8400, (i) => bar(100 + i * 0.001, 100.4, 99.6, 100.2, i % 97));

  it('round-trips prices and volume', () => {
    const restored = unpackDetail(packDetail(minutes));
    expect(restored).toHaveLength(8400);
    for (const i of [0, 1234, 4799, 8399]) {
      expect(restored[i].o).toBeCloseTo(minutes[i].o, 4);
      expect(restored[i].v).toBeCloseTo(minutes[i].v, 4);
    }
  });

  it('costs twenty bytes a bar, which is what the server slices by', () => {
    expect(DETAIL_BAR_BYTES).toBe(20);
    expect(packDetail(minutes).byteLength).toBe(8400 * DETAIL_BAR_BYTES);
  });

  it('survives the base64 round trip used to ship it', () => {
    const restored = unpackDetail(fromBase64(toBase64(packDetail(minutes.slice(0, 100)))));
    expect(restored[42].c).toBeCloseTo(minutes[42].c, 4);
  });

  it('base64 is a third smaller than the hex Postgres would hand back', () => {
    const packed = packDetail(minutes);
    expect(toBase64(packed).length).toBeLessThan(packed.byteLength * 2);
  });
});

describe('the resolution menu', () => {
  it('offers the timeframes a trader expects, coarsening in order', () => {
    expect(TIERS.map((t) => t.label)).toEqual(['1m', '15m', '30m', '1h', '4h', '1d']);
    const minutes = TIERS.map((t) => t.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it('defaults to the timeframe the trade is scored on', () => {
    expect(DISPLAY_TIER).toBe(60);
    expect(TIERS.some((t) => t.minutes === DISPLAY_TIER)).toBe(true);
  });

  it('labels tiers the way a trader writes them', () => {
    expect(tierLabel(60)).toBe('1h');
    expect(tierLabel(15)).toBe('15m');
    expect(tierLabel(240)).toBe('4h');
    expect(tierLabel(1440)).toBe('1d');
  });

  it('builds sub-hour tiers from the minute detail and the rest from the scored candles', () => {
    expect(tierPlan(1)).toEqual({ unitMinutes: 1, group: 1 });
    expect(tierPlan(15)).toEqual({ unitMinutes: 1, group: 15 });
    expect(tierPlan(30)).toEqual({ unitMinutes: 1, group: 30 });
    // At an hour and above the source is the authoritative display candles, not the Float32
    // detail, so the resolution the trade is scored on is never re-derived.
    expect(tierPlan(60)).toEqual({ unitMinutes: 60, group: 1 });
    expect(tierPlan(240)).toEqual({ unitMinutes: 60, group: 4 });
    expect(tierPlan(1440)).toEqual({ unitMinutes: 60, group: 24 });
  });
});

describe('clock alignment (§12.2 aside: 4h and 1d do not divide an hour)', () => {
  it('has no phase for any tier that divides an hour', () => {
    for (const startHour of [0, 7, 15, 23]) {
      const origin = timeOrigin(2, startHour);
      for (const minutes of [1, 15, 30, 60]) {
        expect(tierPhase(minutes, origin)).toBe(0);
      }
    }
  });

  it('phases 4h and 1d against the clock, not against the window', () => {
    // A window opening Wednesday 15:00 is three hours into a 12:00-16:00 candle, and fifteen
    // hours into that day. Without this, a "daily" candle would run 15:00 to 15:00.
    const origin = timeOrigin(2, 15);
    expect(tierPhase(240, origin)).toBe(3);
    expect(tierPhase(1440, origin)).toBe(15);
  });

  it('opens the first 1d candle at midnight, before the window starts', () => {
    const origin = timeOrigin(2, 15);
    const phase = tierPhase(1440, origin);
    const firstCandleOpens = origin - phase * HOUR_SECONDS;
    expect(formatClock(firstCandleOpens)).toBe('Wed 00:00');
  });

  it('makes the first bucket short by the phase', () => {
    const hours = path(30, (i) => bar(100 + i, 100 + i + 1, 100 + i - 1, 100 + i + 0.5, 1));
    // Three hours into a 4h candle: the first bucket holds one hour, then they run in fours.
    const aligned = aggregateByCount(hours, 4, 3);
    expect(aligned[0]).toEqual({ o: 100, h: 101, l: 99, c: 100.5, v: 1 });
    expect(aligned[1].o).toBe(101);
    expect(aligned[1].v).toBe(4);
  });

  it('is still the same chart — coarse equals aggregating the fine, phase and all', () => {
    const minutes = path(1440, (i) => bar(100 + i * 0.01, 100.5 + i * 0.01, 99.5 + i * 0.01, 100.2 + i * 0.01, 2));
    // 15 minutes into the hour: 4h via minutes must equal 4h via hours.
    const viaMinutes = aggregateByCount(minutes, 240, 0);
    const viaHours = aggregateByCount(aggregateByCount(minutes, 60, 0), 4, 0);
    expect(viaHours).toEqual(viaMinutes);
  });
});
