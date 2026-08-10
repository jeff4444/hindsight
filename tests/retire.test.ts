import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@/core/random';
import {
  RETIRE_MIN_N,
  RETIRE_RHO_MIN,
  assess,
  correctForRestriction,
  rank,
  rhoInterval,
  spearman,
  type Attempt,
} from '@/core/retire';

/**
 * Synthetic attempts with a known latent relationship.
 *
 * `signal` is how much of the percentile is explained by rating; the rest is the enormous
 * per-round noise this domain actually has. Seeded, so a failure is reproducible.
 */
function attempts(n: number, signal: number, seed = 7, ratingSd = 200): Attempt[] {
  const rng = mulberry32(seed);
  const normal = () => {
    // Box–Muller, adequate for a fixture.
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return Array.from({ length: n }, () => {
    const rating = 1500 + normal() * ratingSd;
    const skill = (rating - 1500) / (ratingSd * 3);
    const percentile = Math.min(1, Math.max(0, 0.5 + signal * skill + (1 - signal) * normal() * 0.28));
    return { rating, percentile };
  });
}

describe('the correlation itself', () => {
  it('uses mid-ranks so the −1R pile does not bias it', () => {
    // Roughly half the 98-cell grid stops out at exactly −1R, so ties are the common case here,
    // not the exception.
    expect(rank([5, 1, 1, 3])).toEqual([4, 1.5, 1.5, 3]);
  });

  it('is monotone-invariant, which is why it is Spearman', () => {
    const xs = [1, 2, 3, 4, 5, 6];
    const ys = [2, 3, 5, 8, 13, 21];
    // A score-map change is a monotone transform. Spearman does not notice; Pearson would, and
    // every retirement verdict would have to be re-adjudicated on a SCORE_MAP_VERSION bump.
    expect(spearman(xs, ys)).toBeCloseTo(1, 12);
    expect(spearman(xs, ys.map((y) => Math.log(y)))).toBeCloseTo(1, 12);
  });
});

describe('retirement is an equivalence test, not a significance test (§8.3)', () => {
  it('keeps a discriminating chart that a naive threshold would destroy', () => {
    // The trap: at n=60 a genuinely good chart's estimate wanders inside a ±0.10 band by chance
    // often enough to cost ~17 charts per 1000. "Coin flip" is the null, and a null cannot be
    // accepted — so too little data must mean keep.
    const sample = attempts(60, 0.75);
    const verdict = assess(sample, 200);
    expect(verdict.verdict).toBe('keep');
    expect(verdict.reason).toContain('cannot conclude');
  });

  it('retires a genuine coin flip once the sample can prove it', () => {
    const sample = attempts(1200, 0, 11);
    const verdict = assess(sample, 200);
    expect(verdict.verdict).toBe('retire');
    expect(Math.abs(verdict.rho)).toBeLessThan(RETIRE_RHO_MIN);
    expect(verdict.ci.low).toBeGreaterThan(-RETIRE_RHO_MIN);
    expect(verdict.ci.high).toBeLessThan(RETIRE_RHO_MIN);
  });

  it('keeps a chart that discriminates, however large the sample', () => {
    const sample = attempts(1200, 0.8, 3);
    expect(assess(sample, 200).verdict).toBe('keep');
  });

  it('never retires below the minimum sample, whatever rho happens to be', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sample = attempts(RETIRE_MIN_N - 1, 0, seed);
      expect(assess(sample, 200).verdict).not.toBe('retire');
    }
  });

  it('flags an inverted chart for review rather than retiring it', () => {
    // Weak players reliably outscoring strong ones is far more likely a mis-signed mirror or a
    // mislabelled regime than a real phenomenon. Auto-retiring would hide the bug.
    const sample = attempts(1200, 0.8, 5).map((a) => ({ ...a, percentile: 1 - a.percentile }));
    expect(assess(sample, 200).verdict).toBe('review');
  });
});

describe('range restriction (§8.5 matchmaking)', () => {
  it('refuses to judge a chart nobody diverse has played', () => {
    // Matchmaking narrows each chart's served slice, and a chart at the edge of the difficulty
    // range sees a narrower one — so without this, hard and easy charts retire preferentially.
    const sample = attempts(1200, 0, 13, 40);
    const verdict = assess(sample, 200);
    expect(verdict.verdict).toBe('defer');
    expect(verdict.reason).toContain('too narrow');
  });

  it('corrects upward, because restriction only ever attenuates', () => {
    expect(correctForRestriction(0.2, 100, 200)).toBeGreaterThan(0.2);
    expect(correctForRestriction(0.2, 200, 200)).toBeCloseTo(0.2, 12);
  });
});

describe('the interval', () => {
  it('carries Bonett–Wright rather than Pearson standard error', () => {
    // Spearman's sampling variance exceeds Pearson's; using 1/sqrt(n-3) would make the interval
    // too narrow and retire more charts than the stated alpha admits.
    const { low, high } = rhoInterval(0, 400);
    const pearsonHalfWidth = 1.645 / Math.sqrt(397);
    expect((high - low) / 2).toBeGreaterThan(pearsonHalfWidth);
  });

  it('narrows as the sample grows', () => {
    const small = rhoInterval(0.1, 100);
    const large = rhoInterval(0.1, 2000);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });
});
