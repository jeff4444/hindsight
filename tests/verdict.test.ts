import { describe, expect, it } from 'vitest';
import type { RoundResult, ScorePayload } from '@/lib/api-types';
import { bestBracket, verdictFor } from '@/lib/verdict';
import { GRID_CELLS } from '@/lib/grid';

const result = (over: Partial<RoundResult>): RoundResult =>
  ({ outcome: 'stop', direction: 'long', rMultiple: -1, ...over }) as RoundResult;

const score = (percentile: number | null, axes: Partial<ScorePayload['axes']> = {}, parR = -0.8): ScorePayload => ({
  percentile,
  oracleR: 4,
  parR,
  distribution: [],
  axes: {
    direction: 0.5,
    stopSweptShare: null,
    stopInsideNoise: null,
    profitableMaeR: null,
    targetReached: null,
    captureShare: null,
    restraint: null,
    efficiency: null,
    ...axes,
  },
});

describe('verdictFor', () => {
  it('rewards a sit-out on a chart where par lost', () => {
    expect(verdictFor(result({ outcome: 'pass', rMultiple: 0 }), score(0.62)).kind).toBe('satOutRight');
    expect(verdictFor(result({ outcome: 'pass', rMultiple: 0 }), score(0.3, {}, 0.4)).kind).toBe('satOutCostly');
  });

  it('calls the top decile clean before anything else', () => {
    expect(verdictFor(result({ outcome: 'target', rMultiple: 2 }), score(0.93, { direction: 0.05 })).kind).toBe('clean');
  });

  it('names the wrong side, then the tight stop', () => {
    expect(verdictFor(result({}), score(0.2, { direction: 0.1 })).kind).toBe('wrongSide');
    expect(verdictFor(result({}), score(0.2, { direction: 0.8, stopInsideNoise: true, stopSweptShare: 0.61 })).kind).toBe('stopTight');
  });

  it('separates a thin win from a good loss', () => {
    expect(verdictFor(result({ outcome: 'target', rMultiple: 0.5 }), score(0.4)).kind).toBe('luckyWin');
    expect(verdictFor(result({ rMultiple: -1 }), score(0.7)).kind).toBe('goodLoss');
  });

  it('copes with no score at all', () => {
    expect(verdictFor(result({}), null).kind).toBe('rough');
  });
});

describe('bestBracket', () => {
  it('decodes the best cell back to a bracket', () => {
    const distribution = Array.from({ length: GRID_CELLS }, () => -1);
    // short half, stop index 2 (1.0 ATR), target index 3 (2.0R)
    distribution[49 + 2 * 7 + 3] = 2;
    const best = bestBracket(distribution, 100, 2);
    expect(best).toMatchObject({ direction: 'short', stopAtr: 1, targetR: 2, r: 2, stop: 102, target: 96 });
  });

  it('refuses a short grid', () => {
    expect(bestBracket([1, 2, 3], 100, 2)).toBeNull();
  });
});
