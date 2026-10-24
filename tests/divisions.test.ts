import { describe, expect, it } from 'vitest';
import {
  DIVISIONS,
  POPULATION_MEAN,
  divisionFor,
  divisionProgress,
  isPlaced,
  roundsToPlacement,
} from '@/core/divisions';
import { RANK_MAX_RD, RANK_MIN_ATTEMPTS } from '@/core/rating';

describe('divisions', () => {
  it('are ordered and contiguous', () => {
    for (let i = 1; i < DIVISIONS.length; i++) {
      expect(DIVISIONS[i].floor).toBeGreaterThan(DIVISIONS[i - 1].floor);
    }
  });

  it('put the population mean at the floor of Desk', () => {
    expect(divisionFor(POPULATION_MEAN).id).toBe('desk');
    expect(divisionFor(POPULATION_MEAN - 1).id).toBe('swing');
  });

  it('cover every rating, including absurd ones', () => {
    expect(divisionFor(0).id).toBe('paper');
    expect(divisionFor(9999).id).toBe('wizard');
  });

  it('report progress inside a band, and none to make at the top', () => {
    const desk = DIVISIONS.find((d) => d.id === 'desk')!;
    const prop = DIVISIONS.find((d) => d.id === 'prop')!;
    const mid = (desk.floor + prop.floor) / 2;
    const { division, next, progress } = divisionProgress(mid);
    expect(division.id).toBe('desk');
    expect(next?.id).toBe('prop');
    expect(progress).toBeCloseTo(0.5, 5);
    expect(divisionProgress(9999)).toMatchObject({ next: null, progress: 1 });
    expect(divisionProgress(0).progress).toBe(0);
  });

  it('wait for the same sample the rating does', () => {
    expect(isPlaced(RANK_MIN_ATTEMPTS, RANK_MAX_RD)).toBe(true);
    expect(isPlaced(RANK_MIN_ATTEMPTS - 1, RANK_MAX_RD)).toBe(false);
    expect(isPlaced(RANK_MIN_ATTEMPTS, RANK_MAX_RD + 1)).toBe(false);
    expect(roundsToPlacement(12)).toBe(RANK_MIN_ATTEMPTS - 12);
    expect(roundsToPlacement(500)).toBe(0);
  });
});
