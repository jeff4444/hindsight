/**
 * §3.5's fairness test, as arithmetic.
 *
 * > **The test** — Does an expert beat a novice by a **larger** margin at this tier, or a smaller
 * > one? If removing X compresses the skill gap, X was load-bearing information and removing it is
 * > artificial difficulty. If removing X widens the gap, X was a crutch and removing it is
 * > legitimate.
 * >
 * > This is measurable, not arguable. Run both tiers on the same charts with the same player pool
 * > and compare the variance in score explained by player rating. Every tier in §3.2 should be
 * > validated this way before it is ranked, and the result should be published.
 *
 * That is the entire specification: same charts, same pool, compare variance explained, publish.
 * No statistic, model form, sample size or significance criterion is given, so:
 *
 * **The statistic is R² of achieved percentile on player skill, per tier**, and the comparison is
 * the difference between two R² values with a bootstrap interval on it. A point estimate would let
 * any pair of tiers be declared ordered from noise alone, and §3.5 says the result gets published —
 * so it has to come with the uncertainty attached.
 *
 * **Attenuation is the trap.** Live, skill is not observed; the *rating* is, and it carries its own
 * error. Regressing on a noisy predictor attenuates R² by the predictor's reliability, and RD
 * differs by tier — so the tier whose players happen to be better measured would win by artefact.
 * `correctAttenuation` divides it out, and it must be applied to both tiers or not at all.
 *
 * Against simulated players the latent skill is known exactly, so no correction is needed and the
 * harness can be validated against a gap whose size was chosen in advance. That is what this phase
 * claims: the instrument works. The claim about NTZ versus NTVZ waits for players.
 */

export interface Observation {
  /** Latent skill when simulating; the estimated rating when live. */
  skill: number;
  percentile: number;
}

/** Fraction of variance in percentile explained by skill. The §3.5 statistic. */
export function rSquared(observations: readonly Observation[]): number {
  const n = observations.length;
  if (n < 3) return 0;

  const mx = observations.reduce((a, o) => a + o.skill, 0) / n;
  const my = observations.reduce((a, o) => a + o.percentile, 0) / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const o of observations) {
    const dx = o.skill - mx;
    const dy = o.percentile - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0;
  return (sxy * sxy) / (sxx * syy);
}

/**
 * Undo the attenuation caused by measuring skill with error.
 *
 * `reliability` is the proportion of the observed rating's variance that is true signal —
 * `sigma²/(sigma² + RD²)` for a pool whose true spread is sigma. Applied identically to both tiers,
 * or the comparison measures which tier had better-measured players rather than which tier
 * discriminates.
 */
export function correctAttenuation(observed: number, reliability: number): number {
  if (reliability <= 0) return observed;
  return Math.min(1, observed / reliability);
}

export interface FairnessComparison {
  /** The more permissive tier. */
  aR2: number;
  /** The more restrictive tier. */
  bR2: number;
  /** bR2 − aR2. Positive means the restriction widened the gap, which §3.5 calls legitimate. */
  difference: number;
  ci: { low: number; high: number };
  verdict: 'legitimate' | 'artificial' | 'inconclusive';
  n: number;
}

/**
 * Compare two tiers played by the same pool on the same charts.
 *
 * The bootstrap resamples **players**, not observations: a player contributes many rounds and
 * treating those as independent would understate the interval by roughly the square root of the
 * rounds-per-player. Pairs are resampled together so the two tiers always see the same pool, which
 * is §3.5's own condition.
 */
export function compareTiers(
  paired: readonly { a: Observation; b: Observation }[],
  options: { resamples?: number; rng?: () => number } = {},
): FairnessComparison {
  const resamples = options.resamples ?? 2000;
  const rng = options.rng ?? Math.random;
  const n = paired.length;

  const aR2 = rSquared(paired.map((p) => p.a));
  const bR2 = rSquared(paired.map((p) => p.b));
  const difference = bR2 - aR2;

  if (n < 20) {
    return { aR2, bR2, difference, ci: { low: -1, high: 1 }, verdict: 'inconclusive', n };
  }

  const differences: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sampleA: Observation[] = [];
    const sampleB: Observation[] = [];
    for (let i = 0; i < n; i++) {
      const pick = paired[Math.floor(rng() * n)];
      sampleA.push(pick.a);
      sampleB.push(pick.b);
    }
    differences.push(rSquared(sampleB) - rSquared(sampleA));
  }
  differences.sort((x, y) => x - y);

  const low = differences[Math.floor(0.025 * resamples)];
  const high = differences[Math.min(resamples - 1, Math.floor(0.975 * resamples))];

  // §3.5's two directions, plus the third the document does not name: no answer yet. Publishing
  // "inconclusive" is the honest output when the interval spans zero, and §4.9 says as much about
  // every statistic in the app.
  const verdict = low > 0 ? 'legitimate' : high < 0 ? 'artificial' : 'inconclusive';

  return { aR2, bR2, difference, ci: { low, high }, verdict, n };
}
