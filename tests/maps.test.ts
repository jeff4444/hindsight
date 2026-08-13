import { describe, expect, it } from 'vitest';
import {
  DRIFT_LIMIT,
  EMPTY_FILTER,
  RESERVED_SLUGS,
  describeFilter,
  hasAnyCondition,
  slugify,
  validateDraft,
  type MapDraft,
} from '@/core/maps';

/**
 * §11.2's creator maps, and mostly the ways a map can be created that can only fail.
 *
 * §11.1's requirement is that a map be a published filter "so the map's difficulty distribution is
 * reproducible and its statistics are valid". Two failure modes follow from that and neither is
 * obvious from the form: a map with no conditions is the whole library under a new name, and a map
 * with contradictory conditions selects nothing at all — which `issue_round` answers by raising, so
 * the map exists, lists, shares, and then tells every player the corpus is empty.
 */

const draft = (over: Partial<MapDraft> = {}): MapDraft => ({
  name: 'Week 1',
  blurb: '',
  visibility: 'unlisted',
  lockedTier: null,
  filter: { ...EMPTY_FILTER, er: ['chop'] },
  ...over,
});

describe('a map that could only fail is refused at creation', () => {
  it('rejects a map with no conditions, which is the whole library', () => {
    const problems = validateDraft(draft({ filter: EMPTY_FILTER }));
    expect(problems.some((p) => p.includes('at least one condition'))).toBe(true);
  });

  it('rejects drift bounds that cross, which select nothing', () => {
    // `issue_round` keeps the tape's predicates in its fallback query, so an empty map does not
    // quietly become The Open Tape — it raises, and the player is told the corpus is empty. True of
    // their map, alarming about the library.
    const problems = validateDraft(
      draft({ filter: { ...EMPTY_FILTER, driftBelow: -8, driftAbove: 5 } }),
    );
    expect(problems.some((p) => p.includes('exclude every chart'))).toBe(true);
  });

  it('accepts drift bounds that form a band', () => {
    // At most +8 and at least −8 is the middle of the distribution, which is a perfectly good map.
    expect(validateDraft(draft({ filter: { ...EMPTY_FILTER, driftBelow: 8, driftAbove: -8 } }))).toEqual([]);
  });

  it('rejects a bound past anything the corpus contains', () => {
    const problems = validateDraft(
      draft({ filter: { ...EMPTY_FILTER, driftAbove: DRIFT_LIMIT + 1 } }),
    );
    expect(problems.some((p) => p.includes('±'))).toBe(true);
  });

  it('rejects a ruleset that is not one', () => {
    const problems = validateDraft(draft({ lockedTier: 'NKD' as never }));
    expect(problems).toContain('That is not a ruleset.');
  });

  it('takes a name of three characters and refuses two', () => {
    expect(validateDraft(draft({ name: 'ABC' }))).toEqual([]);
    expect(validateDraft(draft({ name: 'AB' })).length).toBeGreaterThan(0);
  });

  it('reports every problem at once rather than one per attempt', () => {
    // A form that reveals one problem per submission is a form people abandon.
    const problems = validateDraft(draft({ name: 'x', filter: EMPTY_FILTER }));
    expect(problems.length).toBeGreaterThan(1);
  });
});

describe('slugs', () => {
  it('carries a suffix, so two people may both make a "Week 1"', () => {
    // Without it the second creation either fails or, far worse, resolves to the first person's map.
    expect(slugify('Week 1', 'abc123')).toBe('week-1-abc123');
    expect(slugify('Week 1', 'def456')).not.toBe(slugify('Week 1', 'abc123'));
  });

  it('survives a name with nothing sluggable in it', () => {
    expect(slugify('！！！', 'abc123')).toBe('map-abc123');
  });

  it('never collides with a route segment', () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(slugify(reserved, 'abc123')).not.toBe(reserved);
    }
  });

  it('caps the base so a 60-character name does not become a 60-character URL', () => {
    expect(slugify('a'.repeat(60), 'abc123').length).toBeLessThanOrEqual(32 + 7);
  });
});

describe('the filter is published, not merely applied', () => {
  it('describes every condition it holds', () => {
    const lines = describeFilter({
      er: ['chop'],
      vol: ['violent'],
      themes: ['liquidity-sweep'],
      driftBelow: -8,
      driftAbove: null,
      councilSplit: true,
    });
    expect(lines).toHaveLength(5);
    expect(lines.join(' ')).toContain('chop');
    expect(lines.join(' ')).toContain('liquidity sweep');
    expect(lines.join(' ')).toContain('-8 ATR');
  });

  it('says nothing about an empty filter, and knows it is empty', () => {
    expect(describeFilter(EMPTY_FILTER)).toEqual([]);
    expect(hasAnyCondition(EMPTY_FILTER)).toBe(false);
  });

  it('counts a lone council-split condition as a condition', () => {
    // It is the only boolean in the set, so it is the one most likely to be missed by a check that
    // asks whether any array is non-empty.
    expect(hasAnyCondition({ ...EMPTY_FILTER, councilSplit: true })).toBe(true);
  });
});
