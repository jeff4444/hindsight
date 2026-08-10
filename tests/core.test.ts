import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS, aggregate, isContiguous } from '@/core/bars';
import { atr, trueRange } from '@/core/atr';
import { fromPgHex, packPath, toPgHex, unpackPath } from '@/core/pack';
import { hashString, mulberry32, shuffle } from '@/core/random';
import { bar, path, timed } from './helpers';

describe('aggregation', () => {
  const minutes = timed(
    0,
    path(120, (i) => bar(100 + i, 100 + i + 2, 100 + i - 2, 100 + i + 1, 10)),
  );

  it('buckets on UTC hour boundaries', () => {
    const hours = aggregate(minutes, HOUR_MS);
    expect(hours).toHaveLength(2);
    expect(hours[0].t).toBe(0);
    expect(hours[1].t).toBe(HOUR_MS);
  });

  it('takes open from the first bar, close from the last, and extremes across the bucket', () => {
    const [first] = aggregate(minutes, HOUR_MS);
    expect(first.o).toBe(100);
    expect(first.c).toBe(160); // minute 59: 100 + 59 + 1
    expect(first.h).toBe(161);
    expect(first.l).toBe(98);
    expect(first.v).toBe(600);
    expect(first.n).toBe(60);
  });

  it('starts a bucket on the hour even when the input does not', () => {
    const offset = aggregate(timed(30 * MINUTE_MS, path(60, () => bar(1, 1, 1, 1))), HOUR_MS);
    expect(offset[0].t).toBe(0);
    expect(offset[0].n).toBe(30);
  });

  it('detects a hole in the middle of a window', () => {
    const gapped = [...minutes.slice(0, 40), ...minutes.slice(45)];
    const hours = aggregate(gapped, HOUR_MS);
    expect(isContiguous(hours, HOUR_MS, 60)).toBe(false);
    expect(isContiguous(aggregate(minutes, HOUR_MS), HOUR_MS, 60)).toBe(true);
  });

  it('detects a missing bucket', () => {
    const twoHourGap = [
      ...minutes.slice(0, 60),
      ...timed(2 * HOUR_MS, path(60, () => bar(1, 1, 1, 1))),
    ];
    expect(isContiguous(aggregate(twoHourGap, HOUR_MS), HOUR_MS, 60)).toBe(false);
  });
});

describe('ATR', () => {
  it('uses the bar range when there is no previous close', () => {
    expect(trueRange(bar(10, 12, 9, 11), null)).toBe(3);
  });

  it('accounts for a gap away from the previous close', () => {
    expect(trueRange(bar(20, 21, 19, 20), 15)).toBe(6);
    expect(trueRange(bar(10, 11, 9, 10), 15)).toBe(6);
  });

  it('returns null when the sample is too short (§4.9)', () => {
    expect(atr(path(14, () => bar(10, 11, 9, 10)))).toBeNull();
    expect(atr(path(15, () => bar(10, 11, 9, 10)))).not.toBeNull();
  });

  it('recovers a constant range exactly', () => {
    // Every bar spans 2 with no gaps, so the true range is 2 everywhere.
    expect(atr(path(80, () => bar(10, 11, 9, 10)))).toBeCloseTo(2, 10);
  });

  it('is causal — later bars cannot change an earlier value', () => {
    const leadIn = path(80, (i) => bar(100 + i * 0.1, 100 + i * 0.1 + 1, 100 + i * 0.1 - 1, 100 + i * 0.1));
    const withFuture = [...leadIn, ...path(60, () => bar(500, 900, 100, 500))];
    expect(atr(leadIn)).toBeCloseTo(atr(withFuture.slice(0, 80))!, 12);
  });
});

describe('path packing', () => {
  const bars = path(3600, (i) => bar(100 + i * 0.001, 100.5 + i * 0.001, 99.5 + i * 0.001, 100.2 + i * 0.001));

  it('round-trips within a small fraction of the tick', () => {
    const restored = unpackPath(packPath(bars));
    expect(restored).toHaveLength(bars.length);
    for (let i = 0; i < bars.length; i += 137) {
      expect(restored[i].o).toBeCloseTo(bars[i].o, 4);
      expect(restored[i].h).toBeCloseTo(bars[i].h, 4);
      expect(restored[i].l).toBeCloseTo(bars[i].l, 4);
      expect(restored[i].c).toBeCloseTo(bars[i].c, 4);
    }
  });

  it('costs 4 bytes per price', () => {
    expect(packPath(bars).byteLength).toBe(3600 * 4 * 4);
  });

  it('survives the Postgres bytea hex round trip', () => {
    const restored = unpackPath(fromPgHex(toPgHex(packPath(bars.slice(0, 10)))));
    expect(restored[7].c).toBeCloseTo(bars[7].c, 4);
  });

  it('unpacks from a view at an unaligned offset', () => {
    const packed = packPath(bars.slice(0, 4));
    const padded = new Uint8Array(packed.byteLength + 3);
    padded.set(packed, 3);
    expect(() => unpackPath(padded.subarray(3))).not.toThrow();
    expect(unpackPath(padded.subarray(3))[0].o).toBeCloseTo(bars[0].o, 4);
  });
});

describe('seeded randomness', () => {
  it('reproduces the same stream from the same seed', () => {
    const draw = (seed: number) => Array.from({ length: 8 }, mulberry32(seed));
    expect(draw(12345)).toEqual(draw(12345));
    expect(draw(12345)).not.toEqual(draw(12346));
  });

  it('hashes strings deterministically', () => {
    expect(hashString('BTCUSDT')).toBe(hashString('BTCUSDT'));
    expect(hashString('BTCUSDT')).not.toBe(hashString('ETHUSDT'));
  });

  it('shuffles reproducibly without mutating the input', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(items, mulberry32(7));
    const b = shuffle(items, mulberry32(7));
    expect(a).toEqual(b);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });
});
