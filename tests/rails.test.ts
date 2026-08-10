import { describe, expect, it } from 'vitest';
import { nearestRail } from '@/components/TradeOverlay';

/**
 * The overlapping-rails bug.
 *
 * Both rails are 44px pointer boxes drawn as siblings, and TARGET renders after STOP — so with the
 * two lines within a box of each other, the target's box covered the stop's and won every press.
 * A player at 1:1 R:R with a tight ATR could not touch their stop at all, and on a phone there is
 * no zooming out of it.
 *
 * The regression this guards is specifically the *near* case: the far case worked before and after.
 */
describe('a press picks the rail it is nearest to, not the one painted last', () => {
  it('picks whichever line is closer when the rails are far apart', () => {
    expect(nearestRail(100, 90, 300)).toBe('stop');
    expect(nearestRail(290, 90, 300)).toBe('target');
  });

  it('still separates them when the boxes overlap — the case that was broken', () => {
    // 12px apart: both 44px boxes cover both lines.
    const stopY = 206;
    const targetY = 194;
    expect(nearestRail(208, stopY, targetY)).toBe('stop');
    expect(nearestRail(192, stopY, targetY)).toBe('target');
    // Pressing between them still resolves, rather than always yielding the later sibling.
    expect(nearestRail(199, stopY, targetY)).toBe('target');
    expect(nearestRail(201, stopY, targetY)).toBe('stop');
  });

  it('gives an exact tie to the stop', () => {
    // The stop defines the risk, so when the press is genuinely ambiguous it is the one that
    // stays reachable.
    expect(nearestRail(200, 190, 210)).toBe('stop');
  });

  it('is unaffected by which rail sits above the other', () => {
    // Direction is implied by the stop's side of the entry, so a short puts the stop on top.
    expect(nearestRail(100, 90, 300)).toBe('stop');
    expect(nearestRail(100, 300, 90)).toBe('target');
  });
});
