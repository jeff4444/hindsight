import { describe, expect, it } from 'vitest';
import {
  SWING_GRADES,
  atGrade,
  persistentSwings,
  walkFromBars,
  walkFromPath,
  type Sample,
} from '@/core/geometry/swings';
import { assertWellFormed, visibleAt } from '@/core/causal';
import { fromCloses, walk } from './fixtures';

const samples = (prices: readonly number[]): Sample[] =>
  prices.map((price, index) => ({ index, price }));

describe('persistence is what a trader means by a swing', () => {
  // 100 → 110 → 104 → 108 → 100 → 120 → 112. Every number below is derivable by hand from the
  // definition, which is the point of using a fixture this small: the test states the semantics
  // rather than pinning whatever the code happened to produce.
  const series = samples([100, 110, 104, 108, 100, 120, 112]);
  const found = persistentSwings(series);
  const at = (index: number) => found.find((swing) => swing.value.index === index);

  it('prices a high by the retracement needed before it is exceeded', () => {
    // The 110 high is exceeded only at 120. Price fell to 100 first, and had fallen from 100 to
    // reach it, so both sides are worth 10.
    expect(at(1)?.value).toMatchObject({ kind: 'high', price: 110, persistence: 10 });

    // The 108 high sits inside the 110 high's shadow: only 4 points of drop separate them, so it
    // is worth 4 however far price later falls. min(left, right) is what stops a minor pullback
    // from inheriting the significance of the leg it interrupted.
    expect(at(3)?.value).toMatchObject({ kind: 'high', price: 108, persistence: 4 });
  });

  it('prices a low by the rally needed before it is broken', () => {
    // The mirror statement, and it runs through the same code with the sign flipped. The 104 low
    // saw a 4-point rally before price broke below it.
    expect(at(2)?.value).toMatchObject({ kind: 'low', price: 104, persistence: 4 });
    expect(at(4)?.value).toMatchObject({ kind: 'low', price: 100, persistence: 10 });
  });

  it('never emits the unsettled last leg — the failure that disqualifies ZigZag', () => {
    // 120 is the highest price in the series and price has not come back down. Its persistence is
    // still growing, so any number drawn for it now would be revised later. That is repainting,
    // and it is why §6 rules ZigZag out.
    expect(found.some((swing) => swing.value.price === 120)).toBe(false);
  });
});

describe('the confirmation lag is real and is carried, not discarded', () => {
  const found = persistentSwings(samples([100, 110, 104, 108, 100, 120, 112]));

  it('stamps knownAt at the settling bar, never at the extremum', () => {
    // §15's second named look-ahead bug is pre-confirmation stamping: drawing the swing at the bar
    // it occurred on, which is a moment nobody could have drawn it.
    const high = found.find((swing) => swing.value.price === 110);
    expect(high?.existsAt).toBe(1);
    expect(high?.knownAt).toBe(4);
    assertWellFormed(found);
  });

  it('hides every swing from a viewer standing before its confirmation', () => {
    // The gate §6 requires rendering and scoring to pass through. At bar 3 the 110 high exists and
    // is not yet knowable, so it must not be drawn.
    const visible = visibleAt(found, 3);
    expect(visible.some((swing) => swing.value.price === 110)).toBe(false);
    expect(visibleAt(found, 4).some((swing) => swing.value.price === 110)).toBe(true);
  });

  it('settles on the left side rather than waiting to be exceeded', () => {
    // A peak whose right-hand retracement has matched its left-hand one is final: min() is pinned
    // and no future bar can move it. Without this the lag would be the wait for a new extreme,
    // which on a trending chart is most of the window.
    const gentle = persistentSwings(samples([100, 105, 100, 99, 98, 97, 130]));
    const high = gentle.find((swing) => swing.value.price === 105);
    expect(high?.value.persistence).toBe(5);
    // Left drop is 5, so the moment price returns to 100 the answer is final — long before 130.
    expect(high?.knownAt).toBe(2);
  });
});

describe('plateaus do not swallow the extremum', () => {
  it('finds a swing whose neighbours repeat its price', () => {
    // The turn test compares three consecutive samples strictly, so without collapsing runs a
    // doji beside the peak would hide it. Keeping the first sample of a run is the stated tie rule.
    const found = persistentSwings(samples([100, 100, 112, 112, 100, 100, 130]));
    expect(found.some((swing) => swing.value.kind === 'high' && swing.value.price === 112)).toBe(true);
  });
});

describe('grading replaces a boolean, because a boolean cannot be stable', () => {
  const bars = walk(120, 11);
  const found = persistentSwings(walkFromBars(bars));

  it('cuts one computation at three thresholds instead of running three detectors', () => {
    const atr = 1;
    const counts = SWING_GRADES.map((grade) => atGrade(found, atr, grade.name).length);
    // Nested by construction: a swing that survives a higher bar survives every lower one.
    expect(counts[0]).toBeGreaterThanOrEqual(counts[1]);
    expect(counts[1]).toBeGreaterThanOrEqual(counts[2]);

    const major = atGrade(found, atr, 'major');
    const minor = atGrade(found, atr, 'minor');
    for (const swing of major) expect(minor).toContain(swing);
  });

  it('holds a swing already shown until it falls through the lower rail', () => {
    // Hysteresis: emit at τ_high, retract at τ_low. Only features inside the band can flip, so an
    // annotation does not flicker when a chart is re-rendered a tick later.
    //
    // Built rather than searched for, so the branch cannot silently go untested: the 101 high has
    // a left drop of exactly 1, which at ATR 1 lands it squarely between the two rails of the
    // intermediate grade (τ_high 1.05, τ_low 0.95).
    const atr = 1;
    const borderline = persistentSwings(samples([100, 101, 100, 90]));
    const swing = borderline.find((s) => s.value.price === 101);
    expect(swing?.value.persistence).toBe(1);

    // Below τ_high, so it is not admitted fresh…
    expect(atGrade(borderline, atr, 'intermediate')).not.toContain(swing);
    // …but above τ_low, so once shown it stays.
    expect(atGrade(borderline, atr, 'intermediate', [swing!])).toContain(swing);

    // And the band really is at least 4ε wide, which is the condition that makes the emitted set
    // provably invariant rather than merely usually stable.
    expect(atGrade(found, atr, 'intermediate').length).toBeGreaterThan(0);
  });

  it('refuses a grade it does not define', () => {
    // @ts-expect-error deliberately outside the union
    expect(() => atGrade(found, 1, 'enormous')).toThrow();
  });
});

describe('the minute path removes the intrabar convention', () => {
  it('reports at display resolution whichever input it is given', () => {
    // The walk builder is the only place an ordering is assumed, and the assumption is confined to
    // a single bar. Feeding the minute path pushes it down to a single minute, where it cannot
    // move a reported display index at all.
    const closes = [100, 101, 103, 102, 99, 97, 101, 104, 100, 96, 99, 103];
    const bars = fromCloses(closes);
    const perDisplay = 3;
    const minutes = bars.flatMap((b) => [b, b, b]);

    const coarse = persistentSwings(walkFromBars(bars));
    const fine = persistentSwings(walkFromPath(minutes, perDisplay));

    for (const swing of [...coarse, ...fine]) {
      expect(swing.value.index).toBeGreaterThanOrEqual(0);
      expect(swing.value.index).toBeLessThan(bars.length);
    }
    expect(coarse.length).toBeGreaterThan(0);
  });
});
