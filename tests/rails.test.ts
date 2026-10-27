import { describe, expect, it } from 'vitest';
import { nearestLine } from '@/components/trading/OrderLinesOverlay';

/**
 * The overlapping-lines bug, carried over from the bracket rails.
 *
 * Every order line is a 44px pointer box drawn as a sibling, and a later sibling's box covers an
 * earlier one's — so with a stop-loss and a take-profit within a box of each other, the one
 * painted last won every press, and on a phone there is no zooming out of it. A press goes to the
 * nearest line instead.
 *
 * The regression this guards is specifically the *near* case: the far case worked before and after.
 */
describe('a press picks the line it is nearest to, not the one painted last', () => {
  it('picks whichever line is closer when they are far apart', () => {
    expect(nearestLine(100, [90, 300])).toBe(0);
    expect(nearestLine(290, [90, 300])).toBe(1);
  });

  it('still separates them when the boxes overlap — the case that was broken', () => {
    // 12px apart: both 44px boxes cover both lines.
    const lines = [206, 194];
    expect(nearestLine(208, lines)).toBe(0);
    expect(nearestLine(192, lines)).toBe(1);
    expect(nearestLine(199, lines)).toBe(1);
    expect(nearestLine(201, lines)).toBe(0);
  });

  it('gives an exact tie to the line listed first', () => {
    expect(nearestLine(200, [190, 210])).toBe(0);
  });

  it('skips lines that are off the chart, and finds nothing when there are none', () => {
    expect(nearestLine(100, [null, 300, 120])).toBe(2);
    expect(nearestLine(100, [null, null])).toBe(-1);
    expect(nearestLine(100, [])).toBe(-1);
  });
});
