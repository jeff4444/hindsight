import { describe, expect, it } from 'vitest';
import { atr } from '@/core/atr';
import { mirrorBar } from '@/core/normalize';
import { permuteBars } from '@/core/permute';
import { persistentSwings, walkFromBars } from '@/core/geometry/swings';
import { candidates, selected } from '@/core/geometry/trendlines';
import { fitChannel, railsAt } from '@/core/geometry/channels';
import { levelsFrom } from '@/core/geometry/levels';
import { volumeProfile } from '@/core/geometry/volumeProfile';
import { LOG_BASE, reflectLog, toLog } from '@/core/geometry/space';
import { reflected, scaled, shifted, volumeJittered, walk } from './fixtures';

/**
 * Metamorphic testing — the discipline for "perturb the input, assert a relation on the output"
 * when there is no oracle, which is exactly Layer 2's situation. Nobody can say what the *right*
 * trendline is. Everybody can say that reflecting the chart must reflect the trendline.
 *
 * The relations are ordered here by how much distinct code each one exercises, and that ordering is
 * the substance rather than the presentation. A +0.01 additive shift runs almost the same code path
 * and is nearly worthless; a reflection or a hundredfold rescale runs entirely different branches.
 * The invertive relation alone covers half the module surface, because it is the one that catches
 * the classic copy-paste asymmetry between the high-side and low-side paths.
 */

const BARS = walk(140, 3);

/* ------------------------------------------------------------------ invertive */

describe('invertive — reflection swaps every high-side answer for its low-side twin', () => {
  const original = persistentSwings(walkFromBars(BARS));
  const mirroredBars = reflected(BARS);
  const mirroredSwings = persistentSwings(walkFromBars(mirroredBars));

  it('turns every swing high into a swing low at the reflected price', () => {
    expect(mirroredSwings.length).toBe(original.length);

    for (const swing of original) {
      const twin = mirroredSwings.find(
        (candidate) =>
          candidate.value.index === swing.value.index &&
          candidate.value.kind !== swing.value.kind,
      );
      expect(twin).toBeDefined();
      expect(twin!.value.price).toBeCloseTo(200 - swing.value.price, 9);
      // Persistence is a distance, so it is invariant rather than reflected.
      expect(twin!.value.persistence).toBeCloseTo(swing.value.persistence, 9);
      // And it is confirmed at the same moment, because the same bars did the confirming.
      expect(twin!.knownAt).toBe(swing.knownAt);
    }
  });

  it('turns resistance into support with the same anchors', () => {
    const resistance = selected(BARS, 'upper');
    const support = selected(mirroredBars, 'lower');
    expect(resistance).not.toBeNull();
    expect(support).not.toBeNull();

    expect(support!.value.from.index).toBe(resistance!.value.from.index);
    expect(support!.value.to.index).toBe(resistance!.value.to.index);
    expect(support!.value.from.price).toBeCloseTo(200 - resistance!.value.from.price, 9);
    expect(support!.value.slope).toBeCloseTo(-resistance!.value.slope, 9);
    expect(support!.value.touches).toBe(resistance!.value.touches);
  });

  it('turns an ascending channel into a descending one', () => {
    const up = fitChannel(BARS)!;
    const down = fitChannel(mirroredBars)!;

    expect(down.value.slope).toBeCloseTo(-up.value.slope, 9);
    const at = 40;
    expect(railsAt(down.value, at).lower).toBeCloseTo(200 - railsAt(up.value, at).upper, 6);
    expect(railsAt(down.value, at).upper).toBeCloseTo(200 - railsAt(up.value, at).lower, 6);
  });

  it('resolves a doji, whose naive ordering rule would not flip', () => {
    // The bug this fixture caught. A bar with c === o reflects to a bar with c === o, so `c >= o`
    // answers `true` both times and the two walks silently desynchronise — 203 swings against 205
    // on a 140-bar chart. The cascade in `lowCameFirst` falls through to the close's position
    // inside the range, which does negate.
    const doji = [
      { o: 100, h: 100.4, l: 99.2, c: 100, v: 1 },
      { o: 100, h: 101.5, l: 99.9, c: 101.2, v: 1 },
      { o: 101.2, h: 101.3, l: 98.4, c: 98.6, v: 1 },
      { o: 98.6, h: 103, l: 98.5, c: 102.8, v: 1 },
    ];
    const straight = persistentSwings(walkFromBars(doji));
    const flipped = persistentSwings(walkFromBars(reflected(doji)));
    expect(flipped.length).toBe(straight.length);
    for (let i = 0; i < straight.length; i++) {
      expect(flipped[i].value.kind).not.toBe(straight[i].value.kind);
      expect(flipped[i].value.price).toBeCloseTo(200 - straight[i].value.price, 9);
    }
  });

  it('cannot orient a perfectly balanced bar, and says so rather than pretending', () => {
    // o === c and the close exactly mid-range: the bar *is* its own mirror, so no deterministic
    // rule can order it antisymmetrically. The ambiguity lives in the data, not the code. Naming
    // it here means the exact-duality assertions above are a real claim about everything else,
    // rather than a claim that quietly holds only for the fixture it was written against.
    const balanced = { o: 100, h: 101, l: 99, c: 100, v: 1 };
    const its = reflected([balanced])[0];
    expect(its.o).toBeCloseTo(balanced.o, 9);
    expect(its.h).toBeCloseTo(balanced.h, 9);
    expect(its.l).toBeCloseTo(balanced.l, 9);
    expect(its.c).toBeCloseTo(balanced.c, 9);
  });

  it('produces the same candidate count on both hulls', () => {
    // The strongest single statement of the asymmetry check: the upper hull of a series and the
    // lower hull of its reflection are the same object.
    expect(candidates(mirroredBars, 'lower').length).toBe(candidates(BARS, 'upper').length);
  });
});

describe("invertive, against the product's own §12.2 mirror", () => {
  it('is an exact affine reflection in log space', () => {
    // `space.ts` claims log(mirrorPrice(p)) = 2·log(100) − log(p) — that the identity-hiding
    // transform already applied to half the corpus *is* the invertive relation. Asserted rather
    // than assumed, because every log-space detector's mirror test rests on it.
    for (const price of [50, 87.5, 100, 100.01, 143.2, 260]) {
      const mirrored = mirrorBar({ o: price, h: price, l: price, c: price, v: 0 });
      expect(toLog(mirrored.o)).toBeCloseTo(reflectLog(toLog(price)), 12);
    }
    expect(reflectLog(LOG_BASE)).toBeCloseTo(LOG_BASE, 12);
  });

  it('carries the level detector through it, to the accuracy the mirror allows', () => {
    // The level detector works in log space, where the §12.2 mirror is an exact reflection, so its
    // *structure* mirrors exactly: the same number of levels, each at the reflected price, each
    // with the same supporters.
    //
    // What does not mirror exactly is the scale. The kernel bandwidth and the touch band are
    // denominated in ATR, which is a **linear** price quantity, while the mirror is a **log** map.
    // Relative bandwidth is preserved only to first order, and measurement puts the residual at
    // **0.54%** on this fixture — enough to move a level sitting on a band edge by one supporter,
    // and no more. That is a real property of composing a linear volatility measure with a
    // multiplicative reflection, not a defect to be tuned away.
    //
    // Each series is given *its own* ATR, which is what the product does. Handing both the same
    // number is the mistake that makes this look ten times worse than it is: the discrepancy goes
    // to 7.6% and the touch counts to two apart, none of which is the detector's doing.
    const mirroredBars = BARS.map(mirrorBar);
    const levels = levelsFrom(persistentSwings(walkFromBars(BARS)), atr(BARS)!);
    const mirroredLevels = levelsFrom(
      persistentSwings(walkFromBars(mirroredBars)),
      atr(mirroredBars)!,
    );

    expect(levels.length).toBeGreaterThan(0);
    expect(mirroredLevels.length).toBe(levels.length);

    for (const level of levels) {
      const twin = mirroredLevels.find(
        (candidate) =>
          Math.abs(toLog(candidate.value.price) - reflectLog(toLog(level.value.price))) < 5e-3,
      );
      expect(twin, `no mirrored twin for level at ${level.value.price}`).toBeDefined();
      // Kind flips exactly — that is pure structure and involves no scale at all.
      const flipped = { resistance: 'support', support: 'resistance', both: 'both' } as const;
      expect(twin!.value.kind).toBe(flipped[level.value.kind]);
      // Touch counts agree to within one supporter, for the reason above.
      expect(Math.abs(twin!.value.touches - level.value.touches)).toBeLessThanOrEqual(1);
    }
  });
});

/* -------------------------------------------------------------- multiplicative */

describe('multiplicative — a hidden absolute threshold would show up here', () => {
  const k = 100;
  const big = scaled(BARS, k);

  it('scales every swing price by k and leaves persistence proportional', () => {
    // This is the relation that fails if any threshold anywhere is denominated in price rather
    // than in ATR. It is the difference between a detector that works on a $5 instrument and one
    // that only ever worked on the corpus it was written against.
    const original = persistentSwings(walkFromBars(BARS));
    const rescaled = persistentSwings(walkFromBars(big));

    expect(rescaled.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(rescaled[i].value.index).toBe(original[i].value.index);
      expect(rescaled[i].value.kind).toBe(original[i].value.kind);
      expect(rescaled[i].value.price / k).toBeCloseTo(original[i].value.price, 6);
      expect(rescaled[i].value.persistence / k).toBeCloseTo(original[i].value.persistence, 6);
    }
  });

  it('scales the channel and keeps the same bars inside it', () => {
    const small = fitChannel(BARS)!;
    const large = fitChannel(big)!;
    expect(large.value.slope / k).toBeCloseTo(small.value.slope, 6);
    expect(large.value.upperOffset / k).toBeCloseTo(small.value.upperOffset, 6);
  });

  it('scales the volume profile with the ATR that defines its bins', () => {
    const small = volumeProfile(BARS, 1)!;
    const large = volumeProfile(big, k)!;
    expect(large.poc / k).toBeCloseTo(small.poc, 6);
    expect(large.bins.length).toBe(small.bins.length);
  });
});

/* -------------------------------------------------------------------- additive */

describe('additive — the weakest relation, kept for completeness', () => {
  it('shifts prices and leaves the feature set alone', () => {
    const original = persistentSwings(walkFromBars(BARS));
    const moved = persistentSwings(walkFromBars(shifted(BARS, 25)));

    expect(moved.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(moved[i].value.index).toBe(original[i].value.index);
      expect(moved[i].value.price - 25).toBeCloseTo(original[i].value.price, 6);
      expect(moved[i].value.persistence).toBeCloseTo(original[i].value.persistence, 6);
    }
  });
});

/* ------------------------------------------------------------------- inclusive */

describe('inclusive — appending bars must not rewrite the past', () => {
  it('leaves every already-settled swing bit-identical', () => {
    // This is the relation the widely used SMC package fails: append future bars and its labels
    // inside a fixed window change, because its clustering tolerance is drawn from the whole
    // dataframe's range. Three liquidity pools become nine.
    //
    // "Settled" is the precise claim. A swing whose persistence is final can never move; one still
    // open is never emitted in the first place, so there is nothing to rewrite.
    const prefix = BARS.slice(0, 90);
    const early = persistentSwings(walkFromBars(prefix));
    const late = persistentSwings(walkFromBars(BARS));

    for (const swing of early) {
      const same = late.find(
        (candidate) =>
          candidate.value.index === swing.value.index && candidate.value.kind === swing.value.kind,
      );
      expect(same, `swing at ${swing.value.index} vanished when the future arrived`).toBeDefined();
      expect(same!.value.price).toBe(swing.value.price);
      expect(same!.value.persistence).toBe(swing.value.persistence);
      expect(same!.knownAt).toBe(swing.knownAt);
    }
  });

  it('leaves the hull candidate set a prefix of the longer one', () => {
    // The hull is not monotone — a new high pops old vertices — so the claim is narrower and it is
    // the true one: edges confirmed before the cut and never popped are unchanged.
    const prefix = BARS.slice(0, 90);
    const early = candidates(prefix, 'upper');
    const late = candidates(BARS, 'upper');
    const survivors = early.filter((edge) =>
      late.some(
        (other) =>
          other.value.from.index === edge.value.from.index &&
          other.value.to.index === edge.value.to.index,
      ),
    );
    expect(survivors.length).toBeGreaterThan(0);
    for (const edge of survivors) {
      const other = late.find(
        (candidate) =>
          candidate.value.from.index === edge.value.from.index &&
          candidate.value.to.index === edge.value.to.index,
      )!;
      expect(other.value.slope).toBe(edge.value.slope);
      expect(other.knownAt).toBe(edge.knownAt);
    }
  });
});

/* ----------------------------------------------------------------- permutative */

describe('permutative — the anti-relation, where the output must change', () => {
  it('finds different geometry in shuffled bars', () => {
    // Every other relation asserts invariance, which a detector returning a constant would pass.
    // This one asserts the opposite: a detector invariant under time permutation is not detecting
    // geometry at all, it is reporting a summary statistic.
    const original = persistentSwings(walkFromBars(BARS));
    const shuffled = persistentSwings(walkFromBars(permuteBars(BARS, 5)));

    const signature = (swings: typeof original) =>
      swings.map((swing) => `${swing.value.index}:${swing.value.kind}:${swing.value.persistence}`).join('|');
    expect(signature(shuffled)).not.toBe(signature(original));
  });

  it('draws a different trendline on shuffled bars', () => {
    const real = selected(BARS, 'upper')!;
    const fake = selected(permuteBars(BARS, 5), 'upper')!;
    expect(fake.value.slope).not.toBe(real.value.slope);
  });
});

/* ----------------------------------------------------------------- volume-only */

describe('volume-only — volume must not leak into price geometry', () => {
  const jittered = volumeJittered(BARS);

  it('leaves swings exactly untouched', () => {
    expect(persistentSwings(walkFromBars(jittered))).toEqual(persistentSwings(walkFromBars(BARS)));
  });

  it('leaves trendlines and channels exactly untouched', () => {
    expect(candidates(jittered, 'upper')).toEqual(candidates(BARS, 'upper'));
    expect(fitChannel(jittered)).toEqual(fitChannel(BARS));
  });

  it('does move the volume profile, which is the point of it', () => {
    // The anti-relation's local twin: the one detector that reads volume had better notice.
    // Asserted on the bin volumes rather than the POC — the heaviest bin can survive a reweighting
    // and often does, so a POC assertion would be testing the fixture's luck rather than the code.
    const original = volumeProfile(BARS, 1)!;
    const moved = volumeProfile(jittered, 1)!;
    expect(moved.total).not.toBe(original.total);
    expect(moved.bins.map((bin) => bin.volume)).not.toEqual(original.bins.map((bin) => bin.volume));
    // The bin *edges* come from price and ATR, so those are untouched.
    expect(moved.bins.map((bin) => bin.price)).toEqual(original.bins.map((bin) => bin.price));
  });

  it('does not let volume reach the levels detector', () => {
    // §6 weights levels by touch count, not by volume, because Chung & Bellotti measured the
    // former against a shuffled control and nobody has measured the latter.
    const atr = 1;
    expect(levelsFrom(persistentSwings(walkFromBars(jittered)), atr)).toEqual(
      levelsFrom(persistentSwings(walkFromBars(BARS)), atr),
    );
  });
});
