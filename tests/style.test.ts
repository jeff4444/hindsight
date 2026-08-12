import { describe, expect, it } from 'vitest';
import type { EngineCode } from '@/core/engines';
import {
  STYLE_SPEC,
  describe as describeStyle,
  fingerprint,
  resembles,
  rungsApart,
  shapeOf,
  type StyleRound,
} from '@/core/style';

/**
 * Style fingerprinting, held to the claims it is allowed to make.
 *
 * Most of these tests are about **refusal** rather than computation, because the arithmetic here is
 * a proportion and the hard part is not computing it — it is declining to show it. §5.12's sentence
 * is a strong claim about a person, and the corpus makes it expensive: an engine that fires on 2.2%
 * of charts needs 1,364 rounds before its affinity clears the sample floor.
 */

const ENGINES: EngineCode[] = ['CHANNEL', 'REVERSION', 'SWEEP'];

/** A round where the player traded and the named engines did too. */
function round(available: Partial<Record<EngineCode, number>>, matched: EngineCode[], playerR: number): StyleRound {
  return { available, matched, playerR };
}

describe('a bracket reduces to the three things a player controls', () => {
  it('reads direction from which side the stop sits on', () => {
    // The same rule §4.2 uses: the bracket is the whole decision, and direction is implied by it.
    expect(shapeOf(100, 98, 104, 1)?.direction).toBe('long');
    expect(shapeOf(100, 102, 96, 1)?.direction).toBe('short');
  });

  it('measures the stop in ATR and the reward in R', () => {
    const shape = shapeOf(100, 98, 106, 2);
    expect(shape?.stopAtr).toBeCloseTo(1, 9);
    expect(shape?.rewardR).toBeCloseTo(3, 9);
  });

  it('refuses a target on the wrong side of entry', () => {
    // Not a hostile input — a long whose target sits below entry is not a bracket, and calling it
    // one would give it a negative reward ratio that every comparison below would then believe.
    expect(shapeOf(100, 98, 99, 1)).toBeNull();
    expect(shapeOf(100, 102, 101, 1)).toBeNull();
  });

  it('refuses a stop on the entry, which is not an order', () => {
    expect(shapeOf(100, 100, 104, 1)).toBeNull();
    expect(shapeOf(100, 98, 104, 0)).toBeNull();
  });
});

describe('resemblance is one rung of the achievable grid', () => {
  const base = shapeOf(100, 98, 104, 1)!; // 2 ATR stop, 3R reward

  it('never matches across directions, however close the numbers', () => {
    const mirrored = shapeOf(100, 102, 96, 1)!;
    expect(rungsApart(base, mirrored)).toBe(Infinity);
    expect(resembles(base, mirrored)).toBe(false);
  });

  it('matches a bracket within a factor of 1.5 on both axes', () => {
    // The grid steps by 1.33–1.5, so this pair would have scored in adjacent cells of the same
    // distribution. Calling them different systems would be a distinction the scoring cannot make.
    const near = shapeOf(100, 97.4, 105.2, 1)!; // 2.6 ATR stop, 2R reward
    expect(rungsApart(base, near)).toBeLessThanOrEqual(STYLE_SPEC.tolerance);
    expect(resembles(base, near)).toBe(true);
  });

  it('rejects a bracket that is a rung away on either axis alone', () => {
    // Same reward, much tighter stop — a different trade, and the axis that costs the most money
    // (§16.1). One axis being far is enough.
    const tighter = shapeOf(100, 99, 103, 1)!;
    expect(resembles(base, tighter)).toBe(false);
    const greedier = shapeOf(100, 98, 116, 1)!;
    expect(resembles(base, greedier)).toBe(false);
  });

  it('is symmetric, so who is compared to whom does not matter', () => {
    const other = shapeOf(100, 97, 106, 1)!;
    expect(resembles(base, other)).toBe(resembles(other, base));
    expect(rungsApart(base, other)).toBeCloseTo(rungsApart(other, base), 12);
  });
});

describe('each engine is scored on its own charts', () => {
  it('counts only the charts where that engine traded', () => {
    // The construction that makes this work on a roster that is silent 66.9% of the time. Charts
    // where an engine passed are not evidence about the player's resemblance to it.
    const rounds = [
      round({ CHANNEL: 1 }, ['CHANNEL'], 1),
      round({ SWEEP: -1 }, [], -1),
      round({ CHANNEL: -1, SWEEP: -1 }, ['SWEEP'], 0.5),
    ];
    const [channel, , sweep] = fingerprint(rounds, ENGINES);
    expect(channel.charts).toBe(2);
    expect(channel.matched).toBe(1);
    expect(sweep.charts).toBe(2);
    expect(sweep.matched).toBe(1);
  });

  it('gives an engine that never traded no affinity rather than nought per cent', () => {
    // Geometry fires on no chart in the corpus. 0% would read as "you never trade like it"; the
    // truth is that it has never offered an opinion to resemble.
    const [, reversion] = fingerprint([round({ CHANNEL: 1 }, ['CHANNEL'], 1)], ENGINES);
    expect(reversion.charts).toBe(0);
    expect(reversion.reportable).toBe(false);
  });

  it('reports the player and the engine on the same charts, not overall', () => {
    // §5.12 asks whether you underperform *that engine*. Comparing your average everywhere to its
    // average on its own charts would compare two different chart sets and call it a gap.
    const rounds = [
      round({ CHANNEL: 2 }, ['CHANNEL'], 1),
      round({ CHANNEL: -1 }, ['CHANNEL'], -1),
      round({ SWEEP: 5 }, [], 4),
    ];
    const [channel] = fingerprint(rounds, ENGINES);
    expect(channel.playerMeanR).toBeCloseTo(0, 9);
    expect(channel.engineMeanR).toBeCloseTo(0.5, 9);
  });
});

describe('the sentence is refused until the sample supports it', () => {
  const many = (n: number, matched: boolean) =>
    Array.from({ length: n }, () => round({ CHANNEL: -0.1 }, matched ? ['CHANNEL'] : [], 0.2));

  it('says nothing at all on a short history', () => {
    // The floor is §16.3's, and the refusal is total rather than hedged: a fingerprint from nine
    // charts is a different claim, not a weaker one.
    expect(describeStyle(fingerprint(many(STYLE_SPEC.minCharts - 1, true), ENGINES))).toBeNull();
  });

  it('names the engine the way the roster does, not the way the enum does', () => {
    // The list beside this sentence says "Reversion (Hindsight)"; the sentence said REVERSION_H
    // until a rendered page showed the two disagreeing. The lookup is passed in rather than
    // imported so `src/core` keeps no opinion about display names.
    const line = describeStyle(fingerprint(many(40, true), ENGINES), () => 'Channel')!;
    expect(line).toContain('Channel');
    expect(line).not.toContain('CHANNEL');
  });

  it('speaks once an engine clears the floor', () => {
    const line = describeStyle(fingerprint(many(STYLE_SPEC.minCharts, true), ENGINES));
    expect(line).not.toBeNull();
    expect(line).toContain('CHANNEL');
    expect(line).toContain(`${STYLE_SPEC.minCharts} charts`);
  });

  it('says which way the gap runs, on those same charts', () => {
    // Player +0.2R against the engine's −0.1R over its own charts: ahead by 0.30R.
    const line = describeStyle(fingerprint(many(40, true), ENGINES))!;
    expect(line).toContain('0.30R ahead of');
  });

  it('stays silent when an engine traded often but never resembled the player', () => {
    // A sample that clears the floor and matches nothing is a real answer — "you trade nothing like
    // this school" — but it is not the sentence §5.12 asks for, and inventing one from a 0% share
    // would name whichever engine happened to be least unlike the player.
    expect(describeStyle(fingerprint(many(60, false), ENGINES))).toBeNull();
  });

  it('never grades the match, because matching a school is not praise', () => {
    // §14.7: no engine on this roster can be told apart from a coin flip on the charts it chose.
    const line = describeStyle(fingerprint(many(40, true), ENGINES))!;
    expect(line).not.toMatch(/good|bad|better than|worse than|should|improve/i);
  });
});

describe('the null is not a school', () => {
  it('is excluded from the evidence the round stores', () => {
    // Engine Zero speaks on every chart and its bracket is a fixed 2 ATR stop with a 2R target, so
    // "you resemble Engine Zero" means "you place 2 ATR stops" — not "your brackets are random".
    // Leaving it in would also give every round a denominator of at least one, so the one engine
    // that is not a school would be the only one ever to clear the sample floor. Guarded here
    // because the route builds `available` from `council()`, which does include it.
    // Evidence that *does* name it — rounds written before the exclusion existed — must still not
    // produce an affinity to it. The filter is in the aggregate as well as at the write.
    const rounds = Array.from({ length: 60 }, () =>
      round({ CHANNEL: -0.2, ZERO: 0.5 }, ['CHANNEL', 'ZERO'], 0.1),
    );
    const affinities = fingerprint(rounds, ['CHANNEL', 'ZERO']);
    expect(affinities.some((a) => a.engine === 'ZERO')).toBe(false);
    expect(describeStyle(affinities)).toContain('CHANNEL');
  });
});
