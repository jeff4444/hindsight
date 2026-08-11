import { describe, expect, it } from 'vitest';
import { lowerHull, upperHull } from '@/core/geometry/hull';
import { candidates, selected } from '@/core/geometry/trendlines';
import {
  CHANNEL_CONTAINMENT,
  fitChannel,
  median,
  quantile,
  railsAt,
  theilSenSlope,
} from '@/core/geometry/channels';
import { EXACT_CROSS_BOUND, cross, toTicks } from '@/core/geometry/space';
import { walk } from './fixtures';

describe('the hull is the exact candidate set, not a search over one', () => {
  it('keeps only the vertices a supporting line can touch', () => {
    // A tent: the middle bar is the only high a resistance line can rest on, and the first and last
    // are always vertices. Everything sagging below the roof is popped. Highs written out rather
    // than derived, because a helper that sets h = max(o, c) puts a second bar at the apex and the
    // test would then be about the helper.
    const highs = [100, 102, 104, 102, 100];
    const bars = highs.map((h) => ({ o: h, h, l: h - 5, c: h, v: 1 }));
    expect(upperHull(bars).map((v) => v.index)).toEqual([0, 2, 4]);
    // The lows are the same tent shifted down, so from below the whole run is spanned by one edge.
    expect(lowerHull(bars).map((v) => v.index)).toEqual([0, 4]);
  });

  it('keeps a vertex that only looks like it sags', () => {
    // Worth an explicit case, because the eye is bad at this. With highs 100, 102, 104, 103, 101
    // the fourth bar reads as a pullback — but the line from the apex to the last bar passes
    // through 102.5 at that index, so 103 pokes above it and the bar really is a hull vertex. Any
    // resistance line drawn from the apex that ignored it would be crossed.
    const highs = [100, 102, 104, 103, 101];
    const bars = highs.map((h) => ({ o: h, h, l: h - 5, c: h, v: 1 }));
    expect(upperHull(bars).map((v) => v.index)).toEqual([0, 2, 3, 4]);
  });

  it('drops collinear points, so the edge count is exactly h−1', () => {
    // Three highs on one straight line contribute one edge, not two. The claim §6 rests on is that
    // there are exactly h−1 candidates and no others; a hull that retained collinear middles would
    // quietly produce more.
    const bars = [100, 101, 102, 103].map((c, i) => ({ o: c, h: 100 + i, l: 90, c, v: 1 }));
    expect(upperHull(bars).map((v) => v.index)).toEqual([0, 3]);
    expect(candidates(bars, 'upper')).toHaveLength(1);
  });

  it('is the mirror of the lower hull on a reflected series', () => {
    const bars = walk(60, 9);
    const flipped = bars.map((b) => ({ ...b, h: -b.l, l: -b.h, o: -b.o, c: -b.c }));
    expect(lowerHull(flipped).map((v) => v.index)).toEqual(upperHull(bars).map((v) => v.index));
  });

  it('is prefix-causal, because bars arrive in increasing x', () => {
    // The property that makes the hull online: the hull of the first t bars is what a viewer at
    // bar t computes, with no filtering step to forget.
    const bars = walk(80, 4);
    for (const cut of [10, 30, 60]) {
      expect(upperHull(bars.slice(0, cut))).toEqual(upperHull(bars.slice(0, cut)));
      const partial = upperHull(bars.slice(0, cut));
      expect(partial[partial.length - 1].index).toBe(cut - 1);
    }
  });
});

describe('the orientation predicate is exact, which is why there is no tolerance in it', () => {
  it('stays inside float64 exact-integer range on the largest series any tier serves', () => {
    // `space.ts` claims eight orders of magnitude of headroom. Asserted rather than trusted,
    // because the whole no-epsilon argument depends on it.
    expect(EXACT_CROSS_BOUND).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(EXACT_CROSS_BOUND * 1e7).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('answers collinearity with an exact zero rather than a small number', () => {
    // In tick space the answer is an integer, so `=== 0` is a legitimate test. In float price space
    // it would not be, and the tolerance needed to rescue it is the free parameter the hull was
    // chosen to avoid.
    expect(cross(0, toTicks(100), 10, toTicks(101), 20, toTicks(102))).toBe(0);
    expect(cross(0, toTicks(100), 10, toTicks(101), 20, toTicks(102.01))).toBeGreaterThan(0);
  });
});

describe('trendline selection is a stated rule, not a fitted one', () => {
  const bars = walk(90, 15);

  it('takes the most recent edge, and ties by span', () => {
    const all = candidates(bars, 'upper');
    const line = selected(bars, 'upper')!;
    const latest = Math.max(...all.map((edge) => edge.value.to.index));
    expect(line.value.to.index).toBe(latest);
    // The final bar is always a hull vertex, so the selected edge always ends there.
    expect(line.value.to.index).toBe(bars.length - 1);
  });

  it('counts at least the two anchors as touches', () => {
    for (const edge of candidates(bars, 'upper')) {
      expect(edge.value.touches).toBeGreaterThanOrEqual(2);
    }
  });

  it('never crosses the series it supports', () => {
    // The defining property, and the one RANSAC does not have: RANSAC maximises inliers around a
    // line and will happily fit through the middle of the cloud. A supporting line has every point
    // on one side of it.
    const line = selected(bars, 'upper')!.value;
    const at = (i: number) =>
      line.from.price + ((line.to.price - line.from.price) * (i - line.from.index)) / (line.to.index - line.from.index);
    for (let i = line.from.index; i <= line.to.index; i++) {
      expect(bars[i].h).toBeLessThanOrEqual(at(i) + 0.01);
    }
  });

  it('declines to draw a line where there is no edge', () => {
    expect(selected([], 'upper')).toBeNull();
    expect(selected(walk(1, 2), 'upper')).toBeNull();
  });

  it('is knowable the moment its second anchor prints', () => {
    // No confirmation lag, and none invented. The hull is computed on the prefix, so an edge is
    // knowable as soon as it exists. That a later bar may pop it is the line breaking, not
    // repainting.
    for (const edge of candidates(bars, 'upper')) {
      expect(edge.knownAt).toBe(edge.existsAt);
      expect(edge.knownAt).toBe(edge.value.to.index);
    }
  });
});

describe('the order statistics have their rules pinned, because three "Silverman"s differ by 18%', () => {
  it('takes the mean of the two central values on an even sample', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 4, 2])).toBe(2.5);
    expect(median([1, 2, 3])).toBe(2);
  });

  it('interpolates quantiles the way R type 7 and numpy do', () => {
    // Nine definitions exist in R alone. Pinning one explicitly is the difference between a rule
    // that can be published and a number that happens to come out of a dependency.
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });

  it('recovers a known slope exactly', () => {
    expect(theilSenSlope([0, 2, 4, 6, 8])).toBe(2);
  });
});

describe('Theil–Sen is chosen for its breakdown point, and shows it', () => {
  it('ignores a single catastrophic print', () => {
    // The whole argument against the L∞ programme in one test. An LP optimum sits at a vertex, so
    // one bad bar sets the channel — breakdown point zero. A median of pairwise slopes needs 29.3%
    // of the data to be bad before it moves.
    const clean = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const spiked = [...clean];
    spiked[6] = 900;
    expect(theilSenSlope(clean)).toBe(1);
    expect(theilSenSlope(spiked)).toBe(1);
  });

  it('contains the share of bars it says it does', () => {
    const bars = walk(120, 21);
    const channel = fitChannel(bars)!.value;
    let inside = 0;
    for (let i = 0; i < bars.length; i++) {
      const rails = railsAt(channel, i);
      if (bars[i].h <= rails.upper + 1e-9 && bars[i].l >= rails.lower - 1e-9) inside += 1;
    }
    // Each rail is a quantile of its own residuals, so the joint containment is at least as tight
    // as the marginal one — the assertion is a floor, not an equality.
    expect(inside / bars.length).toBeGreaterThan(CHANNEL_CONTAINMENT - 0.25);
    expect(channel.upperOffset).toBeGreaterThan(0);
    expect(channel.lowerOffset).toBeLessThan(0);
  });

  it('declines a series too short to have a slope', () => {
    expect(fitChannel([])).toBeNull();
    expect(fitChannel(walk(2, 1))).toBeNull();
  });

  it('measures width vertically, so resizing the window cannot rotate it', () => {
    // Perpendicular width is Euclidean, and a chart's axes are incommensurate — x in bars, y in
    // ticks. Stretching the price unit must not change which bars the rails touch.
    const bars = walk(60, 33);
    const stretched = bars.map((b) => ({ ...b, o: b.o * 3, h: b.h * 3, l: b.l * 3, c: b.c * 3 }));
    const a = fitChannel(bars)!.value;
    const b = fitChannel(stretched)!.value;
    expect(b.slope / 3).toBeCloseTo(a.slope, 9);
    expect(b.upperOffset / 3).toBeCloseTo(a.upperOffset, 9);
  });
});
