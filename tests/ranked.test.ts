import { describe, expect, it } from 'vitest';
import {
  COMPRESS_KNEE,
  FORFEIT_IMP,
  IMP_MAX,
  PASS_ANCHOR,
  RANKED_CHARTS,
  RANKED_MAX_PASSES,
  affine,
  compress,
  duelDamage,
  glickoScore,
  imp,
  mayPass,
  scoreSession,
  type RankedEntry,
} from '@/core/ranked';

const entry = (over: Partial<RankedEntry> = {}): RankedEntry => ({
  percentile: 0.5,
  passed: false,
  ambiguous: false,
  forfeited: false,
  ...over,
});

describe('the score map is anchored on doing nothing (§4.4)', () => {
  it('scores a pass as a draw', () => {
    // Every rating in the product is measured from this line: not "how much did you make", but
    // "how much better than standing aside".
    expect(compress(PASS_ANCHOR)).toBeCloseTo(0, 12);
    expect(glickoScore(PASS_ANCHOR)).toBeCloseTo(0.5, 12);
    expect(imp(PASS_ANCHOR)).toBe(0);
  });

  it('bottoms out at exactly −1 for the worst possible result', () => {
    expect(compress(0)).toBeCloseTo(-1, 12);
    expect(glickoScore(0)).toBeCloseTo(0, 12);
  });

  it('is monotone', () => {
    let previous = -Infinity;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const value = compress(p);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });
});

describe('the only nonlinearity is a penalty, and only in the top decile (§4.3)', () => {
  it('is exactly affine everywhere outcomes actually live', () => {
    // This is the invariant that protects §15's guarantee. See the failure below for why.
    for (let p = 0; p <= COMPRESS_KNEE + 1e-12; p += 0.005) {
      expect(compress(p)).toBeCloseTo(affine(p), 12);
    }
  });

  it('never pays more than the straight line, anywhere', () => {
    // A curve that could exceed the line above the knee would be a *reward* for extremity, which
    // is the incentive §4.3 exists to remove rather than to install.
    for (let p = 0; p <= 1.0001; p += 0.005) {
      expect(compress(p)).toBeLessThanOrEqual(affine(p) + 1e-12);
    }
  });

  it('damps the top decile, because that range is intrabar luck rather than reading', () => {
    // Separating the best bracket from the fifth-best of 98 is §12.3 resolution, not skill.
    const belowKnee = compress(0.9) - compress(0.8);
    const aboveKnee = compress(1.0) - compress(0.9);
    expect(aboveKnee).toBeLessThan(belowKnee / 2);
  });
});

/**
 * §15 requires "a simulation check before launch that degenerate wide-stop tight-target brackets do
 * not top the leaderboard", and `docs/rules.md` §10.3 published that check's result on the *mean
 * raw percentile*: passing 0.610, best fixed bracket 0.577.
 *
 * Any score map with a kink inside the range outcomes occupy re-orders those means and voids the
 * guarantee silently. This table is the guard.
 */
describe('§15 still holds under the compression', () => {
  const expectation = (outcomes: readonly [number, number][]) =>
    outcomes.reduce((acc, [probability, percentile]) => acc + probability * compress(percentile), 0);

  it('keeps passing ahead of the degenerate wide-stop tight-target bracket', () => {
    const passing = compress(PASS_ANCHOR);
    // Short, 4 ATR stop, 0.5R target: prints often and small, stops out rarely and large.
    const degenerate = expectation([
      [0.727, 0.7],
      [0.273, 0.25],
    ]);
    expect(passing).toBeCloseTo(0, 12);
    expect(degenerate).toBeCloseTo(-0.054, 3);
    expect(degenerate).toBeLessThan(passing);
  });

  it('annihilates the lottery ticket', () => {
    // 0.5 ATR stop, 8R target: the maximum-variance play a percentile ladder would reward.
    const lottery = expectation([
      [0.05, 0.99],
      [0.95, 0.25],
    ]);
    expect(lottery).toBeCloseTo(-0.534, 3);
    expect(lottery).toBeLessThan(compress(PASS_ANCHOR));
  });

  it('still pays a competent reader', () => {
    // The map must not be so punitive that reading loses too — that would just be a worse game.
    const reader = expectation([
      [0.55, 0.88],
      [0.15, 0.68],
      [0.3, 0.25],
    ]);
    expect(reader).toBeCloseTo(0.084, 3);
    expect(reader).toBeGreaterThan(compress(PASS_ANCHOR));
  });

  it('rejects the anchored two-piece map that would have looked like an improvement', () => {
    // The trap, kept as a live test. Rescaling each side of the anchor to fill [0, 1] is the
    // obvious "use the whole range" instinct, and under it the degenerate bracket BEATS passing.
    const kinked = (p: number) =>
      p <= PASS_ANCHOR ? (0.5 * p) / PASS_ANCHOR : 0.5 + (0.5 * (p - PASS_ANCHOR)) / (1 - PASS_ANCHOR);
    const degenerate = 0.727 * kinked(0.7) + 0.273 * kinked(0.25);
    expect(degenerate).toBeGreaterThan(kinked(PASS_ANCHOR));

    // The shipped curve does not have that property, which is the whole point.
    const shipped = 0.727 * glickoScore(0.7) + 0.273 * glickoScore(0.25);
    expect(shipped).toBeLessThan(glickoScore(PASS_ANCHOR));
  });
});

describe('the ranked quota (§4.4)', () => {
  it('allows two passes out of five and no more', () => {
    expect(RANKED_CHARTS).toBe(5);
    expect(RANKED_MAX_PASSES).toBe(2);
    expect(mayPass(0)).toBe(true);
    expect(mayPass(1)).toBe(true);
    expect(mayPass(2)).toBe(false);
  });

  it('marks a session that met the three-entry minimum', () => {
    const session = scoreSession([
      entry({ percentile: 0.8 }),
      entry({ percentile: 0.4 }),
      entry({ percentile: 0.9 }),
      entry({ percentile: PASS_ANCHOR, passed: true }),
      entry({ percentile: PASS_ANCHOR, passed: true }),
    ]);
    expect(session.entries).toBe(3);
    expect(session.passes).toBe(2);
    expect(session.quotaMet).toBe(true);
  });

  it('forfeits every chart an abandoned session never reached', () => {
    // Without this, discarding a bad start is free — the lottery-ticket incentive arriving by the
    // back door.
    const session = scoreSession([entry({ percentile: 0.2 })]);
    expect(session.forfeits).toBe(4);
    expect(session.imps.slice(1)).toEqual([FORFEIT_IMP, FORFEIT_IMP, FORFEIT_IMP, FORFEIT_IMP]);
    expect(session.quotaMet).toBe(false);
  });

  it('makes a forfeit cost strictly more than the worst honest result', () => {
    // Otherwise walking away from a chart you dislike is priced the same as taking the disaster,
    // which makes abandonment a free option on every round.
    expect(FORFEIT_IMP).toBeLessThan(imp(0));
  });

  it('pays nothing for an unused pass (§4.8)', () => {
    const spent = scoreSession([
      entry({ percentile: 0.7 }),
      entry({ percentile: 0.7 }),
      entry({ percentile: 0.7 }),
      entry({ percentile: PASS_ANCHOR, passed: true }),
      entry({ percentile: 0.7 }),
    ]);
    const unspent = scoreSession([
      entry({ percentile: 0.7 }),
      entry({ percentile: 0.7 }),
      entry({ percentile: 0.7 }),
      entry({ percentile: 0.7 }),
      entry({ percentile: 0.7 }),
    ]);
    expect(unspent.total).toBeGreaterThan(spent.total);
  });
});

describe('a pass is scored, not excused (§4.4)', () => {
  it('can be a win on a chart where standing aside was right', () => {
    // pass_percentile is derived from the reveal path and never leaves the server, so this cannot
    // be gamed — the player does not know which charts these are.
    expect(glickoScore(0.85)).toBeGreaterThan(0.65);
    expect(imp(0.85)).toBeGreaterThan(0);
  });

  it('can be a loss on a chart that was there to be taken', () => {
    expect(imp(0.2)).toBeLessThan(0);
  });
});

describe('duel damage (§4.3)', () => {
  it('caps per round in ranked so round order does not become decisive', () => {
    expect(duelDamage(8, -15, 3, true)).toBe(IMP_MAX);
    expect(duelDamage(8, -15, 3, false)).toBe(69);
  });
});
