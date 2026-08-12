import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_SPEC,
  brier,
  brierScore,
  calibrationCurve,
  decompose,
  describe as describeCalibration,
  skillScore,
  type Forecast,
} from '@/core/calibration';

/**
 * Calibration, held to the properties that make it a proper score rather than a vibe.
 *
 * The central one is that **honesty is optimal**: a rule a player can beat by shading their stated
 * probability is not measuring calibration, it is measuring how well they have reverse-engineered
 * the rule. That is asserted directly below rather than taken on trust from the literature.
 */

const forecasts = (pairs: [number, boolean][]): Forecast[] =>
  pairs.map(([stated, hit]) => ({ stated, hit }));

/** `count` forecasts at `stated`, of which `hits` came true. */
function repeat(stated: number, count: number, hits: number): Forecast[] {
  return Array.from({ length: count }, (_, i) => ({ stated, hit: i < hits }));
}

describe('the score is proper, which is the only reason to use it', () => {
  it('is minimised by stating your true belief', () => {
    // The definition of a proper scoring rule, checked numerically. With a true probability of 0.7,
    // the expected Brier of *saying* q is minimised at q = 0.7 — so there is no shading, no hedging
    // toward the middle, and no reason to say anything but what you think.
    const truth = 0.7;
    const expected = (q: number) => truth * brier(q, true) + (1 - truth) * brier(q, false);

    const best = expected(truth);
    for (const q of [0, 0.2, 0.5, 0.6, 0.65, 0.75, 0.8, 0.9, 1]) {
      expect(expected(q)).toBeGreaterThan(best - 1e-12);
    }
    // And strictly worse either side, so the optimum is not a plateau a player could drift along.
    expect(expected(0.6)).toBeGreaterThan(best + 1e-9);
    expect(expected(0.8)).toBeGreaterThan(best + 1e-9);
  });

  it('scores the textbook extremes the textbook way', () => {
    expect(brier(1, true)).toBe(0);
    expect(brier(0, false)).toBe(0);
    expect(brier(0, true)).toBe(1);
    expect(brier(0.5, true)).toBeCloseTo(0.25, 12);
  });
});

describe('skill is measured against the base rate, never against zero', () => {
  it('scores zero for a forecaster who always says the base rate', () => {
    // The anchor: 39.2% of enumerated brackets finish in profit, so saying 39.2% every time is what
    // no opinion looks like. A Brier of 0.238 is not bad — it is exactly average.
    const base = CALIBRATION_SPEC.baseRate;
    const history = repeat(base, 1000, Math.round(1000 * base));
    expect(brierScore(history)).toBeCloseTo(base * (1 - base), 3);
    expect(skillScore(history)!).toBeCloseTo(0, 2);
  });

  it('is positive for a forecaster who knows something', () => {
    // Says 90% and is right 90% of the time; says 10% and is right 10% of the time.
    const history = [...repeat(0.9, 100, 90), ...repeat(0.1, 100, 10)];
    expect(skillScore(history)!).toBeGreaterThan(0.5);
  });

  it('is negative for confident nonsense', () => {
    // The failure mode the product exists to make visible: certainty that is wrong scores far worse
    // than admitting you do not know.
    expect(skillScore(repeat(0.95, 100, 20))!).toBeLessThan(0);
  });

  it('declines to score an empty history rather than returning zero', () => {
    expect(skillScore([])).toBeNull();
    expect(decompose([])).toBeNull();
  });
});

describe('Murphy’s decomposition adds up, which is what makes the curve diagnostic', () => {
  it('satisfies BS = reliability − resolution + uncertainty exactly', () => {
    // The identity is the strongest available check that the bucketing and the score agree. If the
    // bins ever drift from the forecasts they summarise, this is what fails.
    const history = [
      ...repeat(0.05, 40, 3),
      ...repeat(0.35, 60, 22),
      ...repeat(0.65, 50, 30),
      ...repeat(0.95, 30, 27),
    ];
    const parts = decompose(history)!;
    expect(parts.reliability - parts.resolution + parts.uncertainty).toBeCloseTo(parts.brier, 12);
  });

  it('separates the two ways of being good', () => {
    // A forecaster who says the base rate on every chart is perfectly *calibrated* and has learned
    // nothing about any individual chart. Reliability near zero, resolution exactly zero — and a
    // product reporting only the Brier could not tell them which half they lack.
    const flat = repeat(0.4, 200, 80);
    const flatParts = decompose(flat)!;
    expect(flatParts.reliability).toBeLessThan(0.001);
    expect(flatParts.resolution).toBeCloseTo(0, 9);

    const sharp = [...repeat(0.9, 100, 90), ...repeat(0.1, 100, 10)];
    expect(decompose(sharp)!.resolution).toBeGreaterThan(0.15);
  });

  it('puts uncertainty beyond the forecaster’s reach', () => {
    // It depends only on what happened, never on what was said — so no amount of forecasting skill
    // moves it, and it is not a thing to be improved.
    const said90 = repeat(0.9, 100, 40);
    const said10 = repeat(0.1, 100, 40);
    expect(decompose(said90)!.uncertainty).toBeCloseTo(decompose(said10)!.uncertainty, 12);
  });
});

describe('the curve keeps the shape of what was said', () => {
  it('buckets by stated probability, and keeps the empty bins', () => {
    // A player who never says anything under 50% has a shape, and dropping the bins they avoid
    // would hide it. The gaps are part of the diagnosis.
    const curve = calibrationCurve(forecasts([[0.75, true], [0.72, false], [0.05, false]]));
    expect(curve).toHaveLength(CALIBRATION_SPEC.bins);
    expect(curve[7].count).toBe(2);
    expect(curve[0].count).toBe(1);
    expect(curve.filter((bucket) => bucket.count === 0)).toHaveLength(8);
  });

  it('puts a forecast of exactly 1 in the last bucket, not an eleventh', () => {
    const curve = calibrationCurve(forecasts([[1, true]]));
    expect(curve).toHaveLength(CALIBRATION_SPEC.bins);
    expect(curve[CALIBRATION_SPEC.bins - 1].count).toBe(1);
  });

  it('reports observed frequency per bucket, which is the whole picture', () => {
    const curve = calibrationCurve(repeat(0.85, 10, 5));
    expect(curve[8].stated).toBeCloseTo(0.85, 9);
    expect(curve[8].observed).toBeCloseTo(0.5, 9);
  });
});

describe('it refuses to diagnose a short history', () => {
  it('says nothing below the floor', () => {
    // Ten proportions over twenty forecasts is ten pieces of noise arranged to look like a
    // diagnosis. Same floor as §16.3's regime cells and §17.4's style fingerprint.
    expect(describeCalibration(repeat(0.5, CALIBRATION_SPEC.minForecasts - 1, 10))).toBeNull();
  });

  it('speaks once the floor is cleared, and names the direction', () => {
    const over = describeCalibration(repeat(0.8, 100, 40));
    expect(over).toContain('over-confident');
    const under = describeCalibration(repeat(0.2, 100, 60));
    expect(under).toContain('under-confident');
  });

  it('says so when the stated confidence matches the outcome', () => {
    const line = describeCalibration(repeat(0.5, 100, 50))!;
    expect(line).toContain('matches what happened');
  });

  it('always cites the reference it is being scored against', () => {
    // A Brier alone is uninterpretable — 0.22 sounds poor and beats the climatology. Every sentence
    // carries the number to compare it with.
    const line = describeCalibration(repeat(0.4, 100, 40))!;
    expect(line).toContain('base rate');
    expect(line).toContain('skill score');
  });
});
