import { describe, expect, it } from 'vitest';
import {
  INDEX_BASE,
  TICK_SIZE,
  indexFactor,
  median,
  mirrorBar,
  mirrorPrice,
  normalizeWindow,
  scaleBar,
  toTick,
} from '@/core/normalize';
import { bar, flat, path, timed } from './helpers';

describe('indexing to 100 (§12.2)', () => {
  it('puts the first visible candle open at the base regardless of instrument scale', () => {
    for (const price of [0.00000312, 1.0842, 67_431.25]) {
      expect(scaleBar(bar(price, price, price, price), indexFactor(price)).o).toBeCloseTo(
        INDEX_BASE,
        9,
      );
    }
  });

  it('preserves relative moves exactly', () => {
    const factor = indexFactor(50);
    const scaled = scaleBar(bar(50, 55, 45, 52.5), factor);
    expect(scaled.h / scaled.o).toBeCloseTo(1.1, 12);
    expect(scaled.l / scaled.o).toBeCloseTo(0.9, 12);
  });
});

describe('mirroring (§3.3, §12.2)', () => {
  it('is an involution', () => {
    for (const price of [40, 99.5, 100, 137.25, 600]) {
      expect(mirrorPrice(mirrorPrice(price))).toBeCloseTo(price, 9);
    }
  });

  it('fixes the base', () => {
    expect(mirrorPrice(INDEX_BASE)).toBeCloseTo(INDEX_BASE, 12);
  });

  it('swaps high and low, because the reflection reverses order', () => {
    const mirrored = mirrorBar(bar(100, 110, 95, 105));
    expect(mirrored.h).toBeCloseTo(mirrorPrice(95), 12);
    expect(mirrored.l).toBeCloseTo(mirrorPrice(110), 12);
    expect(mirrored.h).toBeGreaterThan(mirrored.l);
  });

  it('maps a move to its multiplicative inverse, which arithmetic reflection would not', () => {
    // A log reflection sends a x1.5 move to a x(1/1.5) move at any distance from the base.
    // 2 * BASE - p would not: it depends on where the chart already is.
    const up = mirrorPrice(150) / mirrorPrice(100);
    const far = mirrorPrice(600) / mirrorPrice(400);
    expect(up).toBeCloseTo(1 / 1.5, 12);
    expect(far).toBeCloseTo(1 / 1.5, 12);
  });

  it('leaves volume alone', () => {
    expect(mirrorBar(bar(100, 110, 95, 105, 42)).v).toBe(42);
  });
});

describe('tick grid', () => {
  it('rounds to the published tick', () => {
    expect(toTick(100.004)).toBeCloseTo(100, 10);
    expect(toTick(100.006)).toBeCloseTo(100.01, 10);
    expect(TICK_SIZE).toBe(0.01);
  });
});

describe('median', () => {
  it('handles odd and even lengths and does not mutate', () => {
    const input = [5, 1, 4, 2];
    expect(median(input)).toBe(3);
    expect(median([5, 1, 4])).toBe(4);
    expect(input).toEqual([5, 1, 4, 2]);
  });
});

describe('normalizeWindow', () => {
  const leadIn = timed(0, path(80, (i) => bar(50 + i * 0.1, 50 + i * 0.1 + 0.5, 50 + i * 0.1 - 0.5, 50 + i * 0.1 + 0.2, 1000 + i)));
  const reveal = timed(80 * 3_600_000, path(60, () => bar(58, 59, 57, 58.5, 2000)), 3_600_000);
  const pathRaw = timed(80 * 3_600_000, flat(3600, 58));

  it('applies the identical factor to display bars and the resolution path', () => {
    const norm = normalizeWindow(leadIn, reveal, pathRaw, false);
    // The path is a flat 58 in raw terms; it must arrive at exactly 58 * factor, the same
    // number the reveal bars were scaled by. If these ever diverge, a player's stop fires at
    // a price that is not on their chart.
    expect(norm.path[0].o).toBeCloseTo(58 * norm.indexFactor, 9);
    expect(norm.leadIn[0].o).toBeCloseTo(INDEX_BASE, 9);
  });

  it('rebases volume so nothing is currency-denominated', () => {
    const norm = normalizeWindow(leadIn, reveal, pathRaw, false);
    const raw = leadIn.map((b) => b.v);
    expect(norm.leadIn.map((b) => b.v)).not.toEqual(raw);
    expect(median(norm.leadIn.map((b) => b.v))).toBeCloseTo(1, 9);
  });

  it('drops volume from the resolution path, which the resolver does not read', () => {
    const norm = normalizeWindow(leadIn, reveal, pathRaw, false);
    expect(norm.path.every((b) => b.v === 0)).toBe(true);
  });

  it('mirrors display bars and path together or not at all', () => {
    const plain = normalizeWindow(leadIn, reveal, pathRaw, false);
    const flipped = normalizeWindow(leadIn, reveal, pathRaw, true);

    expect(flipped.mirrored).toBe(true);
    expect(flipped.leadIn[0].o).toBeCloseTo(INDEX_BASE, 6);
    expect(flipped.path[0].o).toBeCloseTo(mirrorPrice(plain.path[0].o), 6);
    // A chart that rose must now fall.
    expect(plain.reveal[0].c).toBeGreaterThan(INDEX_BASE);
    expect(flipped.reveal[0].c).toBeLessThan(INDEX_BASE);
  });

  it('carries no time information into the normalised output', () => {
    const norm = normalizeWindow(leadIn, reveal, pathRaw, false);
    for (const collection of [norm.leadIn, norm.reveal, norm.path]) {
      expect(collection.every((b) => !('t' in b))).toBe(true);
    }
  });
});
