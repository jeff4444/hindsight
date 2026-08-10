import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/core/random';
import { compareTiers, correctAttenuation, rSquared, type Observation } from '@/core/fairness';

/**
 * §14's exit condition for this phase is "two tiers validated by the §3.5 test: the expert-novice
 * gap is measurably wider at the more restricted tier". That needs a player pool, and there is not
 * one yet — so what is claimed here is narrower and checkable: **the instrument detects a gap whose
 * size was decided in advance, and refuses to declare one that is not there.**
 *
 * A harness that cannot be shown to work on a known answer is not evidence about an unknown one.
 */

/**
 * Simulate a pool playing the same charts at two tiers.
 *
 * `signal` is how much of the percentile the player's skill explains at that tier. A restriction
 * that removes a crutch *raises* it — the reading decides more — and one that removes load-bearing
 * information lowers it, which is exactly the distinction §3.5 draws.
 */
function pool(n: number, signalA: number, signalB: number, seed = 42) {
  const rng = mulberry32(seed);
  const normal = () => {
    const u = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  return Array.from({ length: n }, () => {
    const skill = normal();
    const at = (signal: number): Observation => ({
      skill,
      percentile: Math.min(1, Math.max(0, 0.5 + signal * skill * 0.15 + (1 - signal) * normal() * 0.2)),
    });
    return { a: at(signalA), b: at(signalB) };
  });
}

describe('the harness detects a gap it was told to expect (§3.5)', () => {
  const rng = mulberry32(9);

  it('calls a restriction legitimate when it widens the expert-novice gap', () => {
    // "If removing X widens the gap, X was a crutch and removing it is legitimate."
    const result = compareTiers(pool(600, 0.35, 0.75), { resamples: 400, rng });
    expect(result.bR2).toBeGreaterThan(result.aR2);
    expect(result.verdict).toBe('legitimate');
    expect(result.ci.low).toBeGreaterThan(0);
  });

  it('calls a restriction artificial when it compresses the gap', () => {
    // "If removing X compresses the skill gap, X was load-bearing information and removing it is
    // artificial difficulty." This is the verdict §15.1 suspects Blackout will earn.
    const result = compareTiers(pool(600, 0.75, 0.35), { resamples: 400, rng });
    expect(result.verdict).toBe('artificial');
    expect(result.ci.high).toBeLessThan(0);
  });

  it('refuses to call it either way when the tiers are the same', () => {
    // The failure mode that matters: a point estimate would order two identical tiers from noise
    // alone, and §3.5 says the result gets published.
    const result = compareTiers(pool(600, 0.5, 0.5), { resamples: 400, rng });
    expect(result.verdict).toBe('inconclusive');
    expect(result.ci.low).toBeLessThanOrEqual(0);
    expect(result.ci.high).toBeGreaterThanOrEqual(0);
  });

  it('refuses to conclude anything from a handful of players', () => {
    expect(compareTiers(pool(12, 0.2, 0.9), { resamples: 200, rng }).verdict).toBe('inconclusive');
  });
});

describe('R² itself', () => {
  it('is 1 when skill explains everything and 0 when it explains nothing', () => {
    const perfect = Array.from({ length: 50 }, (_, i) => ({ skill: i, percentile: i / 100 }));
    expect(rSquared(perfect)).toBeCloseTo(1, 9);

    const flat = Array.from({ length: 50 }, (_, i) => ({ skill: i, percentile: 0.5 }));
    expect(rSquared(flat)).toBe(0);
  });
});

describe('attenuation, which is how this test gets rigged by accident', () => {
  it('is undone by the predictor reliability', () => {
    // Live, skill is measured as a rating with its own error, and RD differs by tier — so without
    // this the tier whose players happened to be better measured wins by artefact rather than by
    // discriminating.
    expect(correctAttenuation(0.2, 0.5)).toBeCloseTo(0.4, 9);
    expect(correctAttenuation(0.2, 1)).toBeCloseTo(0.2, 9);
    // And it cannot manufacture more than all of the variance.
    expect(correctAttenuation(0.9, 0.5)).toBe(1);
  });
});
