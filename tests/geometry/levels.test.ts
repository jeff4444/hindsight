import { describe, expect, it } from 'vitest';
import { MIN_PROMINENCE, levelsFrom } from '@/core/geometry/levels';
import { SUBDIVISION, decadeStep, roundLevels } from '@/core/geometry/roundNumbers';
import { VALUE_AREA_SHARE, volumeProfile } from '@/core/geometry/volumeProfile';
import { persistentSwings, walkFromBars } from '@/core/geometry/swings';
import { denormalizePrice, normalizePrice } from '@/core/normalize';
import { atr } from '@/core/atr';
import { walk } from './fixtures';

describe('levels are weighted by touch count, which is the weight with evidence behind it', () => {
  // Six visits to 106 with lows that step steadily downward and never repeat. The lows being
  // *spread* is the design of the fixture: an earlier version drifted them around 100 and the
  // strongest level was legitimately found there, which tested the fixture rather than the claim.
  //
  // Chung & Bellotti (2021) measured bounce probability rising monotonically with prior touches
  // against a shuffled-returns control; there is no comparable result for volume, which is why
  // volume is not a weight here.
  const closes = [100, 106, 99, 106, 96, 106, 93, 106, 90, 106, 87, 106, 84];
  const bars = closes.map((c, i) => ({
    o: i === 0 ? c : closes[i - 1],
    h: c + 0.1,
    l: c - 0.1,
    c,
    v: 10,
  }));
  // Passed explicitly rather than estimated: this suite is about the level detector, and letting
  // it depend on whether the fixture is long enough for ATR(14) would make a failure ambiguous.
  const ATR = 1;
  const swings = persistentSwings(walkFromBars(bars));
  const levels = levelsFrom(swings, ATR);

  it('finds the price the chart kept returning to', () => {
    expect(levels).toHaveLength(1);
    expect(levels[0].value.price).toBeCloseTo(106.1, 1);
    expect(levels[0].value.touches).toBe(6);
    expect(levels[0].value.kind).toBe('resistance');
  });

  it('does not manufacture a level out of prices visited once each', () => {
    // The lows step 99, 96, 93, 90, 87 — five swing lows, no two of them near each other. A
    // detector that forced every extreme into a cluster would report a support level here. That is
    // the specific reason §6 rules out k-means: it requires a k and then has to spend it.
    for (const level of levels) expect(level.value.kind).not.toBe('support');
  });

  it('reports a level only once every counted touch has settled', () => {
    // The look-ahead that would be easy to write by accident: report "five touches" stamped at the
    // bar of the second one. Every supporter must be knowable by the level's own knownAt.
    for (const level of levels) {
      const supporters = swings.filter(
        (swing) => Math.abs(swing.value.price - level.value.price) < 1,
      );
      for (const supporter of supporters.slice(0, level.value.touches)) {
        expect(supporter.knownAt).toBeLessThanOrEqual(level.knownAt);
      }
      expect(level.knownAt).toBeGreaterThanOrEqual(level.existsAt);
    }
  });

  it('needs two extremes before it will call something a level', () => {
    // §4.9's habit applied to geometry: do not produce a number the sample does not support. One
    // touch is a price, not a level.
    for (const level of levels) expect(level.value.touches).toBeGreaterThanOrEqual(2);
  });

  it('declines to answer when there is nothing to answer with', () => {
    expect(levelsFrom([], 1)).toEqual([]);
    expect(levelsFrom(swings, 0)).toEqual([]);
    expect(levelsFrom(swings, -1)).toEqual([]);
  });

  it('uses prominence rather than a level count, so a chart can have as many as it has', () => {
    const quiet = levelsFrom(persistentSwings(walkFromBars(walk(120, 44))), 1);
    const busy = levelsFrom(persistentSwings(walkFromBars(bars)), atr(bars) ?? 1);
    // Nothing forces a fixed k, which is why k-means is the wrong tool: it would require one and
    // would push every extreme into some cluster whether or not it belonged to one.
    expect(quiet.length).not.toBe(-1);
    expect(busy.length).toBeGreaterThan(0);
    for (const level of [...quiet, ...busy]) {
      expect(level.value.prominence).toBeGreaterThanOrEqual(MIN_PROMINENCE);
      expect(level.value.prominence).toBeLessThanOrEqual(1);
    }
  });
});

describe('round numbers live on the real lattice, because that is where the evidence is', () => {
  it('steps by the decade, scale-free', () => {
    expect(decadeStep(45_000)).toBe(10_000);
    expect(decadeStep(1.08)).toBe(1);
    expect(decadeStep(0.045)).toBeCloseTo(0.01, 12);
    expect(SUBDIVISION).toBe(0.25);
  });

  it('ranks whole multiples above halves above quarters', () => {
    // The decade step at 40,000 is 10,000, so the grid runs every 2,500. 45,000 is four and a half
    // decades — a *half*, not a whole, however round it looks written down. The rule is arithmetic
    // on the grid index, which is the only way it stays a rule rather than an intuition.
    const levels = roundLevels(40_000, 50_000, 1, false);
    const at = (price: number) => levels.find((level) => Math.abs(level.price - price) < 1);
    expect(at(40_000)?.strength).toBe(3);
    expect(at(50_000)?.strength).toBe(3);
    expect(at(45_000)?.strength).toBe(2);
    expect(at(42_500)?.strength).toBe(1);
    expect(at(47_500)?.strength).toBe(1);
  });

  it('maps into displayed space through the same transform the pipeline used', () => {
    // The forward map has to be the exact inverse of `denormalizePrice`, or a level would be drawn
    // at a price the chart never traded at.
    const factor = 100 / 43_210;
    for (const mirrored of [false, true]) {
      const levels = roundLevels(42_000, 44_000, factor, mirrored);
      expect(levels.length).toBeGreaterThan(0);
      for (const level of levels) {
        const real = denormalizePrice(level.price, factor, mirrored);
        expect(normalizePrice(real, factor, mirrored)).toBeCloseTo(level.price, 6);
        expect(real).toBeGreaterThan(41_000);
        expect(real).toBeLessThan(45_000);
      }
    }
  });

  it('sorts by displayed price even though the mirror reverses the real order', () => {
    // A caller assuming the two orders agree would be right on half the corpus and silently wrong
    // on the other half, which is the worst kind of wrong.
    const factor = 100 / 43_210;
    const mirrored = roundLevels(42_000, 44_000, factor, true);
    for (let i = 1; i < mirrored.length; i++) {
      expect(mirrored[i].price).toBeGreaterThanOrEqual(mirrored[i - 1].price);
    }
    // …and the real prices behind them therefore run the other way.
    const reals = mirrored.map((level) => denormalizePrice(level.price, factor, true));
    for (let i = 1; i < reals.length; i++) expect(reals[i]).toBeLessThanOrEqual(reals[i - 1]);
  });

  it('refuses nonsense rather than enumerating forever', () => {
    expect(roundLevels(0, 100, 1, false)).toEqual([]);
    expect(roundLevels(100, 50, 1, false)).toEqual([]);
    expect(roundLevels(100, 200, 0, false)).toEqual([]);
    // A range spanning many decades would enumerate unboundedly; the corpus filter makes it
    // impossible, but a detector should not rely on a filter elsewhere for its termination.
    expect(roundLevels(1, 1e9, 1, false)).toEqual([]);
  });
});

describe('the volume profile is built, not synthesised', () => {
  // A path that spends most of its volume at one price. Real minute bars carrying real volume —
  // the distinction the whole feature turns on. Spreading an hour's volume across its range would
  // produce something that looks identical and means nothing.
  const heavy = 103;
  const path = [
    ...Array.from({ length: 40 }, () => ({ o: heavy, h: heavy + 0.05, l: heavy - 0.05, c: heavy, v: 50 })),
    ...Array.from({ length: 20 }, () => ({ o: 108, h: 108.05, l: 107.95, c: 108, v: 3 })),
    ...Array.from({ length: 20 }, () => ({ o: 99, h: 99.05, l: 98.95, c: 99, v: 3 })),
  ];

  it('puts the point of control where the volume actually traded', () => {
    const profile = volumeProfile(path, 1)!;
    expect(Math.abs(profile.poc - heavy)).toBeLessThan(0.2);
    expect(profile.total).toBe(40 * 50 + 40 * 3);
  });

  it('encloses the share of volume the value area claims to', () => {
    const profile = volumeProfile(path, 1)!;
    let inside = 0;
    for (const bin of profile.bins) {
      if (bin.price >= profile.val && bin.price <= profile.vah) inside += bin.volume;
    }
    expect(inside / profile.total).toBeGreaterThanOrEqual(VALUE_AREA_SHARE);
    expect(profile.val).toBeLessThan(profile.poc);
    expect(profile.vah).toBeGreaterThan(profile.poc);
  });

  it('scales its bins with ATR, so profiles are comparable across the corpus', () => {
    const fine = volumeProfile(path, 0.5)!;
    const coarse = volumeProfile(path, 2)!;
    expect(fine.bins.length).toBeGreaterThan(coarse.bins.length);
    // The heavy price is the heavy price at either resolution.
    expect(Math.abs(fine.poc - coarse.poc)).toBeLessThan(1);
  });

  it('declines rather than returning a profile of nothing', () => {
    expect(volumeProfile([], 1)).toBeNull();
    expect(volumeProfile(path, 0)).toBeNull();
    expect(volumeProfile(path.map((b) => ({ ...b, v: 0 })), 1)).toBeNull();
  });
});
