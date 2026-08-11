import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/bars';
import { atr } from '@/core/atr';
import { assertWellFormed } from '@/core/causal';
import {
  CHANNEL,
  ENGINES,
  BRACKET,
  EDGE,
  MEASURED_OVER,
  REGISTERED,
  REVERSION,
  REVERSION_H,
  THRESHOLDS,
  THRESHOLD_HASH,
  ZERO,
  convictionFor,
  council,
  digest,
  disagreement,
  type EngineInput,
} from '@/core/engines';
import { walk } from './geometry/fixtures';

/**
 * The roster, held to its own published rules.
 *
 * `docs/phase-3-research.md` found three of §5.2's claims false, and the tests below are written
 * against the corrected versions rather than the table: CHANNEL abstains, no engine has a native
 * target, and every determinism score was too high.
 */

const ATR = 1;

function inputFor(bars: Bar[], seed = 1): EngineInput {
  return { bars, entry: bars[bars.length - 1].c, atr: atr(bars) ?? ATR, seed };
}

/** A flat run, so a fixture's interesting bar is the only interesting bar. */
function flat(count: number, price = 100): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    o: price,
    h: price + 0.1,
    l: price - 0.1,
    c: price + (i % 2 === 0 ? 0.02 : -0.02),
    v: 10,
  }));
}

describe('pre-registration is enforced, not promised', () => {
  it('matches the recorded hash', () => {
    // The mechanism that makes 3b's family size honest. If this fails, a threshold moved: bump
    // ENGINE_VERSION and re-run the corpus rather than inheriting the old track record.
    //
    // This only means anything because THRESHOLD_HASH is a hand-written literal. 3a shipped it as
    // `digest(THRESHOLDS)`, under which this assertion compared a value to itself and could never
    // fail — a guard that cannot fail is decoration, which the next test says out loud.
    expect(digest(THRESHOLDS)).toBe(THRESHOLD_HASH);
  });

  it('refuses to publish a track record measured under different thresholds', () => {
    // The other half of the pre-registration, and the half 3a left open. `baseRates.ts` is a set of
    // numbers measured under one manifest; attaching them to another is how an engine inherits a
    // record it never earned. Changing THRESHOLDS must invalidate the measurement, not survive it.
    expect(MEASURED_OVER.thresholdHash).toBe(THRESHOLD_HASH);
  });

  it('changes the hash when any threshold moves', () => {
    // A guard that cannot fail is decoration. This proves the digest actually reads the values.
    const tampered = { ...THRESHOLDS, channel: { ...THRESHOLDS.channel, breakoutBars: 21 } };
    expect(digest(tampered)).not.toBe(THRESHOLD_HASH);
  });

  it('ignores key order, so a reformat is not a retune', () => {
    // Reversed rather than hand-listed: the first version named the four groups that existed when it
    // was written, so adding engines silently narrowed what it checked until it failed outright.
    const reordered = Object.fromEntries(Object.entries(THRESHOLDS).reverse());
    expect(Object.keys(reordered)).not.toEqual(Object.keys(THRESHOLDS));
    expect(digest(reordered)).toBe(THRESHOLD_HASH);
  });

  it('refuses to run an unregistered engine', () => {
    // 3b corrects against REGISTERED.engines. An engine that ran without being registered would be
    // a free extra trial no correction accounts for.
    expect(ENGINES.map((engine) => engine.code)).toEqual([...REGISTERED.engines]);
  });
});

describe('CHANNEL abstains, which §5.2 said it never does', () => {
  it('passes when the bar trades inside the channel', () => {
    // The most consequential correction in the research. System 1 does not take every bar; on this
    // corpus a faithful CHANNEL takes a position on 19.8% of charts.
    const verdict = CHANNEL.read(inputFor(flat(80)));
    expect(verdict.direction).toBeNull();
    expect(verdict.rules[0]).toContain('no breakout');
  });

  it('takes a breakout above the 20-bar high', () => {
    const bars = [...flat(60), { o: 100, h: 108, l: 99.9, c: 107.5, v: 10 }];
    const verdict = CHANNEL.read(inputFor(bars));
    expect(verdict.direction).toBe('long');
    expect(verdict.bracket).not.toBeNull();
    expect(verdict.rules[0]).toContain('broke the 20-bar high');
  });

  it('puts the stop 2N below entry, and calls that the school’s', () => {
    const bars = [...flat(60), { o: 100, h: 108, l: 99.9, c: 107.5, v: 10 }];
    const verdict = CHANNEL.read(inputFor(bars));
    const n = atr(bars, THRESHOLDS.channel.atrPeriod)!;
    expect(verdict.bracket!.stop).toBeCloseTo(verdict.bracket ? 107.5 - 2 * n : 0, 6);
    expect(verdict.provenance.stop).toBe('school');
  });

  it('calls the target ours, because the Turtles have none', () => {
    // Turtle exits are trailing breakout exits, not price objectives. §5.2 discloses this for
    // Connors only; it is true of four of the six schools.
    const bars = [...flat(60), { o: 100, h: 108, l: 99.9, c: 107.5, v: 10 }];
    const verdict = CHANNEL.read(inputFor(bars));
    expect(verdict.provenance.target).toBe('ours');
    expect(verdict.exit).toEqual({
      kind: 'opposite-extreme',
      bars: THRESHOLDS.channel.exitBars,
      description: 'exit on the opposite 10-bar extreme',
    });
  });

  it('declines rather than guessing when there is no channel yet', () => {
    expect(CHANNEL.read(inputFor(flat(10))).direction).toBeNull();
  });
});

describe('REVERSION is faithful, and the Hindsight variant differs in exactly one rule', () => {
  // A long decline into a deeply oversold close, with a rising 200-period backdrop so the two
  // engines can be made to disagree on the filter alone.
  const build = (aboveRegime: boolean): Bar[] => {
    const base = aboveRegime ? 100 : 60;
    const rise = Array.from({ length: 240 }, (_, i) => base + i * 0.2);
    const drop = [base + 48, base + 44, base + 40, base + 36];
    return [...rise, ...drop].map((c, i, all) => ({
      o: i === 0 ? c : all[i - 1],
      h: Math.max(c, i === 0 ? c : all[i - 1]) + 0.2,
      l: Math.min(c, i === 0 ? c : all[i - 1]) - 0.2,
      c,
      v: 10,
    }));
  };

  it('buys an oversold pullback above the 200-period average', () => {
    const verdict = REVERSION.read(inputFor(build(true)));
    expect(verdict.direction).toBe('long');
    expect(verdict.rules[0]).toContain('Rule 3 permits');
  });

  it('refuses the same pullback below it, because Rule 3 is load-bearing', () => {
    // Dip-buying below the 200-MA is where the system loses, so this is not a garnish. It is also
    // what reduces the engine to 22 charts on this corpus.
    const bars = build(true);
    const belowRegime = bars.map((bar, i) => (i > 200 ? { ...bar, o: bar.o - 60, h: bar.h - 60, l: bar.l - 60, c: bar.c - 60 } : bar));
    const verdict = REVERSION.read(inputFor(belowRegime));
    expect(verdict.direction).toBeNull();
    expect(verdict.rules[0]).toContain('Rule 3 forbids');
  });

  it('is long-only, because the published system has no short side', () => {
    for (let seed = 0; seed < 12; seed++) {
      const verdict = REVERSION.read(inputFor(walk(260, seed)));
      expect(verdict.direction === null || verdict.direction === 'long').toBe(true);
    }
  });

  it('marks the stop as ours, and says why on the verdict itself', () => {
    // Rule 5 of the book is titled "Stops Hurt", and Connors tested stops from 1% to 50%: "In every
    // single case, the use of stops lowered the performance." The engine carries that objection.
    const verdict = REVERSION.read(inputFor(build(true)));
    expect(verdict.provenance.stop).toBe('ours');
    expect(verdict.rules.some((rule) => rule.includes('Stops Hurt'))).toBe(true);
  });

  it('names the variant as ours wherever it appears', () => {
    expect(REVERSION_H.name).toContain('Hindsight');
    expect(REVERSION_H.school.startsWith('Ours')).toBe(true);
  });

  it('is otherwise identical, so the pair is a control on the filter alone', () => {
    const bars = build(true);
    const faithful = REVERSION.read(inputFor(bars));
    const variant = REVERSION_H.read(inputFor(bars));
    expect(variant.direction).toBe(faithful.direction);
    expect(variant.bracket).toEqual(faithful.bracket);
    expect(variant.exit).toEqual(faithful.exit);
  });
});

describe('Engine Zero is the null, and behaves like one', () => {
  const bars = walk(120, 5);

  it('is reproducible from its seed', () => {
    expect(ZERO.read(inputFor(bars, 42))).toEqual(ZERO.read(inputFor(bars, 42)));
  });

  it('flips with the seed rather than with the chart', () => {
    const directions = new Set(
      Array.from({ length: 40 }, (_, seed) => ZERO.read(inputFor(bars, seed)).direction),
    );
    expect(directions).toEqual(new Set(['long', 'short']));
  });

  it('never abstains, which is what makes it the reference', () => {
    // Every other engine passes most of the time. Engine Zero speaks on every chart, so it is the
    // only one with a full-corpus record to measure the others against.
    for (let seed = 0; seed < 25; seed++) {
      expect(ZERO.read(inputFor(walk(120, seed), seed)).direction).not.toBeNull();
    }
  });

  it('places its target exactly 2R from its own stop', () => {
    const verdict = ZERO.read(inputFor(bars, 7));
    const entry = bars[bars.length - 1].c;
    const risk = Math.abs(entry - verdict.bracket!.stop);
    expect(Math.abs(verdict.bracket!.target - entry)).toBeCloseTo(2 * risk, 9);
  });
});

describe('the council is a spread of opinion, never a consensus', () => {
  const bars = walk(260, 11);
  const verdicts = council(inputFor(bars));

  it('returns every engine, passes included', () => {
    expect(verdicts).toHaveLength(ENGINES.length);
    expect(verdicts.map((v) => v.engine)).toEqual([...REGISTERED.engines]);
  });

  it('stamps every verdict with the version that produced it', () => {
    for (const verdict of verdicts) {
      expect(verdict.version).toBe(REGISTERED.version);
      assertWellFormed(verdict.annotations);
    }
  });

  it('discloses how much history each engine read', () => {
    // Engines see up to 300 candles while the player may have seen 80. Not a leak — history before
    // the window, never after — but an asymmetry, so it is reported.
    for (const verdict of verdicts) expect(verdict.candlesUsed).toBe(bars.length);
  });

  it('detects disagreement only when at least two engines took a position', () => {
    expect(disagreement([])).toBe(false);
    const long = { direction: 'long' } as never;
    const short = { direction: 'short' } as never;
    const pass = { direction: null } as never;
    expect(disagreement([long, pass])).toBe(false);
    expect(disagreement([long, long])).toBe(false);
    expect(disagreement([long, short])).toBe(true);
  });

  it('carries measured conviction, and says where the number came from', () => {
    // §5.5 wants "a conviction level, and a statement of where that conviction number comes from".
    // §5.6 forbids inventing one. The only source is the corpus replay in `baseRates.ts`.
    for (const verdict of verdicts) {
      if (verdict.direction === null) {
        // An engine that took no position has nothing to be convinced about.
        expect(verdict.conviction).toBeNull();
        continue;
      }
      expect(verdict.conviction).not.toBeNull();
      expect(verdict.conviction!.source).toMatch(/trades on this corpus/);
      expect(verdict.conviction!.value).toBeGreaterThan(0);
      expect(verdict.conviction!.value).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the published headline true of the published numbers', () => {
    // §14.7's headline — "the only thing on this roster that beats a coin flip is not trading" — is
    // rendered as prose in Council.tsx, and prose does not fail a build when the measurement moves.
    // This is what fails instead. Re-run `npm run leaderboard` and rewrite both if it does.
    // At a roster of four every paired delta was negative, and this test said so. At eight, SWEEP
    // and PATTERN are fractionally positive — so the claim is no longer "every engine loses to a
    // coin flip" but "no engine can be distinguished from one", which is what SPA measures and what
    // the prose now says. The distinction matters: the first is a stronger statement than the data
    // supports, and this test failing is what stopped it being published.
    expect(EDGE.spa.pValue).toBeGreaterThan(0.05);
    for (const paired of Object.values(EDGE.paired)) {
      expect(Math.abs(paired.t)).toBeLessThan(1.96);
    }
    // Doing nothing clears Engine Zero by as much as any school does, which is the whole finding.
    expect(EDGE.abstain.beatsZero).toBe(true);
    // At or above a half: the in-sample winner is no better than chance out of sample, and here it
    // is reliably worse. Either way there is no ordering to publish.
    expect(EDGE.pbo).toBeGreaterThanOrEqual(0.5);
    expect(EDGE.observedBestSharpe).toBeLessThan(EDGE.deflationFloor);
    expect(EDGE.charts).toBe(MEASURED_OVER.charts);
    // The family size the deflation floor was computed against must be the family that ran.
    expect(EDGE.trials).toBe(REGISTERED.engines.length);
  });

  it('says so when an engine is indistinguishable from a coin flip', () => {
    // The measurement's headline: every engine's mean R sits inside Engine Zero's band at its own
    // sample size. A conviction number without that sentence beside it would be a lie of omission.
    for (const code of ['CHANNEL', 'REVERSION', 'REVERSION_H', 'ZERO'] as const) {
      const rate = BRACKET[code];
      expect(rate.meanR).toBeGreaterThanOrEqual(rate.nullBand.low);
      expect(rate.meanR).toBeLessThanOrEqual(rate.nullBand.high);
      expect(convictionFor(code)!.source).toContain("inside a coin flip's range");
    }
  });
});
