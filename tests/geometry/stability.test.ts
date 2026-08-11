import { describe, expect, it } from 'vitest';
import { EPSILON, snap } from '@/core/geometry/space';
import { atGrade, persistentSwings, walkFromBars } from '@/core/geometry/swings';
import { selected } from '@/core/geometry/trendlines';
import { fitChannel } from '@/core/geometry/channels';
import type { Sample } from '@/core/geometry/swings';
import { jittered, walk } from './fixtures';

const samples = (prices: readonly number[]): Sample[] =>
  prices.map((price, index) => ({ index, price }));

/**
 * Annotation stability — §6's first-class test suite, with its own correction applied.
 *
 * > **Correction to v0.2 as first drafted:** the original text said "the overlap of the pivot
 * > **index** sets", and that measures the one quantity the theory says is unstable. Persistence
 * > gives stability of critical *values* "in sharp contrast to the lack of stability of critical
 * > points" — in a flat or choppy region one tick of jitter moves the argmax arbitrarily far along
 * > the time axis while the price barely moves. The index-set test would fail on correct code.
 *
 * So every assertion here is in **price space**. The design consequence is larger than the test and
 * is what `trendlines.ts` anchors on: lines anchored on pivot prices with approximate times are
 * provably stable; lines anchored on exact bar indices are not.
 *
 * The theorem doing the work: **a peak of persistence p is destroyed only by a perturbation of
 * sup-norm ≥ p/2.** With a quarter-tick perturbation, nothing above 2ε of persistence can be
 * destroyed at all. That is a proof, not a hope, and the tests below are its executable form.
 */

const BARS = walk(160, 23);
const JITTERED = jittered(BARS);

/**
 * One-sided Hausdorff distance from `a` to `b` in price space: the worst distance any member of
 * `a` has to travel to find a partner in `b`.
 */
function hausdorff(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0) return 0;
  if (b.length === 0) return Infinity;
  return Math.max(...a.map((x) => Math.min(...b.map((y) => Math.abs(x - y)))));
}

describe('a quarter-tick perturbation does not move the swings, in price space', () => {
  const original = persistentSwings(walkFromBars(BARS));
  const perturbed = persistentSwings(walkFromBars(JITTERED));

  it('finds a partner for every swing within a tick', () => {
    const from = original.map((swing) => swing.value.price);
    const to = perturbed.map((swing) => swing.value.price);
    expect(hausdorff(from, to)).toBeLessThanOrEqual(4 * EPSILON);
    expect(hausdorff(to, from)).toBeLessThanOrEqual(4 * EPSILON);
  });

  it('keeps every well-separated swing at exactly the same snapped price', () => {
    // The stronger claim, and the one snapping exists to make assertable at all: quantising the
    // output to a grid coarser than 2ε turns "the level moved 0.3 ticks" into "the level did not
    // move". Without it there is no exact equality to assert anywhere in this file.
    const survivors = original.filter((swing) =>
      perturbed.some(
        (other) =>
          other.value.kind === swing.value.kind && other.value.index === swing.value.index,
      ),
    );
    expect(survivors.length).toBeGreaterThan(original.length * 0.9);

    for (const swing of survivors) {
      const partner = perturbed.find(
        (other) => other.value.kind === swing.value.kind && other.value.index === swing.value.index,
      )!;
      expect(partner.value.price).toBe(swing.value.price);
      expect(snap(partner.value.price)).toBe(partner.value.price);
    }
  });

  it('destroys no swing whose persistence clears the theorem, at any grade', () => {
    // p/2 > ε is the theorem's condition. Every swing with persistence above 2ε must survive, and
    // the graded output is what makes that checkable — a boolean detector could not state it.
    const atr = 1;
    for (const grade of ['minor', 'intermediate', 'major'] as const) {
      const before = atGrade(original, atr, grade);
      const after = atGrade(perturbed, atr, grade);
      const robust = before.filter((swing) => swing.value.persistence > 2 * EPSILON);
      const survived = robust.filter((swing) =>
        after.some(
          (other) =>
            other.value.kind === swing.value.kind && other.value.price === swing.value.price,
        ),
      );
      expect(survived.length / Math.max(1, robust.length)).toBeGreaterThan(0.95);
    }
  });
});

describe('index is the unstable quantity, which is why nothing asserts on it', () => {
  it('lets a swing move along the time axis while its price does not move', () => {
    // Stated as a positive claim rather than left implicit. A flat region is where the argmax is
    // free to wander: the two candidate bars are within a quarter tick of each other, so which one
    // wins is decided by the perturbation, while the price the swing reports is the same either
    // way. A test asserting index overlap here would fail on correct code.
    const flat = [100, 100.02, 100.01, 100.02, 100.01, 100.02, 99.0, 103];
    const bars = flat.map((c, i) => ({
      o: i === 0 ? c : flat[i - 1],
      h: c + 0.01,
      l: c - 0.01,
      c,
      v: 1,
    }));

    const a = persistentSwings(walkFromBars(bars)).map((s) => s.value.price);
    const b = persistentSwings(walkFromBars(jittered(bars, 5))).map((s) => s.value.price);
    expect(hausdorff(a, b)).toBeLessThanOrEqual(4 * EPSILON);
  });
});

describe('lines and channels move by less than the perturbation that caused it', () => {
  it('keeps the trendline within a tick of where it was, at both anchors', () => {
    const before = selected(BARS, 'upper')!;
    const after = selected(JITTERED, 'upper')!;
    // Price-space, per the correction. The anchors' *indices* may move; their prices may not.
    expect(Math.abs(after.value.from.price - before.value.from.price)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.value.to.price - before.value.to.price)).toBeLessThanOrEqual(1);
  });

  it('barely moves the channel, because Theil–Sen is a median and not a vertex', () => {
    // The contrast §6 draws with the L∞ programme, made concrete. An LP optimum sits at a vertex
    // determined by exactly three bars — breakdown point zero, so one perturbed print can set it.
    // A median of 12,720 pairwise slopes cannot be moved by a quarter tick on any of them.
    const before = fitChannel(BARS)!.value;
    const after = fitChannel(JITTERED)!.value;
    expect(Math.abs(after.slope - before.slope)).toBeLessThan(EPSILON);
    expect(Math.abs(after.intercept - before.intercept)).toBeLessThan(1);
  });
});

/**
 * A quantised-accumulator slope estimator, in the shape of a Hough transform.
 *
 * Every pair of bars votes for a slope; votes land in fixed-width bins; the answer is the argmax
 * bin. This is deliberately *bad* code and it is here to be caught — see the canary below.
 */
function houghSlope(bars: readonly { h: number }[], binWidth = 0.01): number {
  const votes = new Map<number, number>();
  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      const bin = Math.round((bars[j].h - bars[i].h) / (j - i) / binWidth);
      votes.set(bin, (votes.get(bin) ?? 0) + 1);
    }
  }
  let best = 0;
  let bestCount = -1;
  for (const [bin, count] of [...votes.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > bestCount) {
      best = bin;
      bestCount = count;
    }
  }
  return best * binWidth;
}

describe('canaries — deliberately bad detectors, asserted to be caught', () => {
  it('catches a quantised estimator answering to its own bin width', () => {
    // `docs/phase-2-research.md` proposed this as "a ready-made stability test: perturb closes by
    // ±¼ tick and assert the Hough slope jumps while the hull slope does not."
    //
    // **That does not reproduce, and the research note has been corrected.** Measured across bin
    // widths from 0.02 down to 0.0005, the argmax bin is unmoved by a quarter-tick perturbation on
    // this fixture — the modal bin carries far too many votes for a sub-tick nudge to unseat it.
    //
    // The real defect is the one that does reproduce, and it is worse: the estimator's answer is a
    // function of the bin width, which is a free parameter with no principled value. 0.04, 0.03,
    // 0.04, 0.03, 0.026 across those five resolutions, on identical data. That is what "the hull
    // removes the free parameter" is actually buying, and it is why `hull.ts` carries an exact
    // integer predicate with no tolerance rather than a tuned one.
    const answers = new Set([0.02, 0.01, 0.005, 0.002, 0.001].map((w) => houghSlope(BARS, w)));
    expect(answers.size).toBeGreaterThan(1);

    // The hull has no such knob to turn, so there is no corresponding table to produce.
    const hullBefore = selected(BARS, 'upper')!.value;
    const hullAfter = selected(JITTERED, 'upper')!.value;
    expect(Math.abs(hullAfter.to.price - hullBefore.to.price)).toBeLessThanOrEqual(1);
  });

  it('catches a boolean threshold flickering where the graded one holds', () => {
    // Kumabe & Yoshida (2023) prove no deterministic boolean-output algorithm can be
    // Lipschitz-continuous; bounded sensitivity requires randomisation, which shared game state
    // rules out. This is that theorem made executable, and it is the direct justification for the
    // hysteresis in `atGrade`.
    //
    // The adversarial input is *constructed*, not searched for. The theorem says such an input
    // exists; hunting for one in a random fixture tests the fixture's luck instead, and on this
    // corpus it does not find one — 230 of 231 swings come through the perturbation at exactly the
    // same snapped price.
    //
    // A peak of 101 above a floor of 100 has persistence of exactly 1. Drop the peak by a quarter
    // tick and it has 0.9975.
    const before = persistentSwings(samples([100, 101, 100, 90]));
    const after = persistentSwings(samples([100, 100.9975, 100, 90]));
    expect(before[0].value.persistence).toBe(1);
    expect(after[0].value.persistence).toBeCloseTo(0.9975, 9);

    // A boolean detector with the bar at 1 draws it, then does not, on a chart no eye could tell
    // apart. That is the flicker, and no amount of care in the threshold's choice removes it —
    // wherever the bar goes, some chart sits on it.
    const hard = (swings: typeof before) =>
      swings.filter((swing) => swing.value.persistence >= 1).length;
    expect(hard(before)).toBe(1);
    expect(hard(after)).toBe(0);

    // The graded detector does not *decide* the borderline case — it declines to change its mind
    // about it. Inside the band, the answer is whatever it already was, in both directions.
    const shown = atGrade(before, 0.9, 'intermediate');
    expect(shown).toHaveLength(1);
    expect(atGrade(after, 0.9, 'intermediate', shown)).toHaveLength(1);
  });
});

describe('determinism, which is a precondition for stability meaning anything', () => {
  it('returns byte-identical output on repeated runs', () => {
    // A detector that is merely *usually* the same is not stable, it is lucky. The classic offender
    // is iterating an unordered container to produce ordered output; every sort in Layer 2 has a
    // total tiebreak for this reason.
    const once = JSON.stringify(persistentSwings(walkFromBars(BARS)));
    const twice = JSON.stringify(persistentSwings(walkFromBars(BARS)));
    expect(twice).toBe(once);

    expect(JSON.stringify(fitChannel(BARS))).toBe(JSON.stringify(fitChannel(BARS)));
    expect(JSON.stringify(selected(BARS, 'lower'))).toBe(JSON.stringify(selected(BARS, 'lower')));
  });

  it('does not depend on the order the input array was constructed in', () => {
    const copy = BARS.map((bar) => ({ ...bar }));
    expect(persistentSwings(walkFromBars(copy))).toEqual(persistentSwings(walkFromBars(BARS)));
  });
});
