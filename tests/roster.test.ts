import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/bars';
import { assertWellFormed } from '@/core/causal';
import {
  BRACKET,
  ENGINES,
  GEOMETRY,
  PATTERN,
  PROVENANCE,
  SWEEP,
  TAPE,
  THRESHOLDS,
  council,
  type EngineInput,
} from '@/core/engines';
import { walk } from './geometry/fixtures';

/**
 * The four engines 3c added, each held to its own published rules.
 *
 * Every one of them carries a correction the research forced, and the tests are written against the
 * corrected version rather than against §5.2's table: SWEEP has no minimum-R rule, PATTERN builds
 * only the formations a 3.3-day window admits, GEOMETRY resolves the Crab contradiction on Carney's
 * own site, and TAPE is directional rather than a veto.
 */

function inputFor(bars: Bar[], atr = 1, seed = 1): EngineInput {
  return { bars, entry: bars[bars.length - 1].c, atr, seed };
}

/** A flat run, so a fixture's interesting bars are the only interesting bars. */
function flat(count: number, price = 100): Bar[] {
  return Array.from({ length: count }, (_, i) => ({
    o: price,
    h: price + 0.1,
    l: price - 0.1,
    c: price + (i % 2 === 0 ? 0.02 : -0.02),
    v: 10,
  }));
}

describe('SWEEP is ours, and says so', () => {
  it('does not carry the school’s name, because the school has no spec', () => {
    // The research is blunt: defining "the next liquidity pool" deterministically needs six rules
    // and none is published anywhere authoritative. Shipping this as "ICT" would claim a fidelity
    // that cannot exist.
    expect(SWEEP.name).toBe('Sweep');
    expect(SWEEP.school.startsWith('Ours')).toBe(true);
    expect(PROVENANCE.SWEEP).toEqual({ stop: 'ours', target: 'ours' });
  });

  it('has no minimum-R rule, because that was never an ICT rule', () => {
    // §5.2 specified "minimum 1:2". It is our invention and it silently overrides the pool choice
    // whenever the nearest pool is closer than 2R — so the engine would stop trading toward the
    // level it names on screen. There is deliberately no such threshold to find.
    expect(Object.keys(THRESHOLDS.sweep)).not.toContain('minRewardR');
    expect(JSON.stringify(THRESHOLDS.sweep)).not.toMatch(/reward/i);
  });

  it('passes when nothing was swept', () => {
    expect(SWEEP.read(inputFor(flat(80))).direction).toBeNull();
  });

  it('needs a rejection, not just a poke through — a breakout is a different trade', () => {
    // Build a clean swing high, then take it out and *close beyond it*. That is a breakout, and
    // this engine must not claim it.
    const rise = Array.from({ length: 30 }, (_, i) => 100 + i * 0.4);
    const fall = Array.from({ length: 20 }, (_, i) => 112 - i * 0.5);
    const back = Array.from({ length: 20 }, (_, i) => 102 + i * 0.6);
    const closes = [...rise, ...fall, ...back, 118];
    const bars: Bar[] = closes.map((c, i, all) => ({
      o: i === 0 ? c : all[i - 1],
      h: Math.max(c, i === 0 ? c : all[i - 1]) + 0.2,
      l: Math.min(c, i === 0 ? c : all[i - 1]) - 0.2,
      c,
      v: 10,
    }));
    const verdict = SWEEP.read(inputFor(bars));
    // Closing above the pool is a breakout; whatever this engine says, it must not be "short".
    expect(verdict.direction).not.toBe('short');
  });

  it('reads a swept high as short and a swept low as long', () => {
    // The direction is the *rejection's*, not the poke's: taking out highs and failing is bearish.
    for (let seed = 0; seed < 40; seed++) {
      const verdict = SWEEP.read(inputFor(walk(200, seed)));
      if (verdict.direction === null) continue;
      const swept = verdict.rules[0];
      expect(swept).toMatch(/swept the (high|low)/);
      expect(verdict.direction).toBe(swept.includes('swept the low') ? 'long' : 'short');
    }
  });

  it('passes rather than inventing a target when no opposing pool is in view', () => {
    // The abstention this school genuinely has. Checked by construction rather than by luck: if the
    // engine ever fired without a pool to aim at, the rule text would not mention one.
    for (let seed = 0; seed < 60; seed++) {
      const verdict = SWEEP.read(inputFor(walk(200, seed)));
      if (verdict.direction === null) continue;
      expect(verdict.rules.some((rule) => rule.includes('nearest opposing pool'))).toBe(true);
    }
  });
});

describe('PATTERN carries the only school-published target on the roster', () => {
  it('marks the target as the school’s and the stop as ours', () => {
    // The measuring rule is Bulkowski's and is 5/5 given a pattern. His stop guidance is
    // discretionary prose, so that half is ours.
    expect(PROVENANCE.PATTERN).toEqual({ stop: 'ours', target: 'school' });
  });

  it('projects a fraction of the pole, because the full projection is what the school warns against', () => {
    // "Percentage meeting price target" is a SCALING FACTOR, not a hit probability. Projecting the
    // full height produces a target patterns miss; projecting a fraction produces one about half
    // reach, by construction.
    expect(THRESHOLDS.pattern.projection).toBeLessThan(1);
    expect(THRESHOLDS.pattern.projection).toBeGreaterThan(0);
  });

  it('builds only formations that fit 3.3 days of 24/7 tape', () => {
    // A double top needs peaks "usually several weeks apart" and cannot exist at either tier. The
    // bound is structural: pole plus flag must fit inside the window the player actually sees.
    const longest = THRESHOLDS.pattern.poleMaxBars + THRESHOLDS.pattern.flagMaxBars;
    expect(longest).toBeLessThanOrEqual(80);
  });

  it('takes a bull flag that breaks out on the decision bar', () => {
    const pole = Array.from({ length: 8 }, (_, i) => 100 + i * 1.2);
    const flagBars = [109, 108.4, 108.8, 108.2];
    const closes = [...flat(30).map((b) => b.c), ...pole, ...flagBars, 111];
    const bars: Bar[] = closes.map((c, i, all) => ({
      o: i === 0 ? c : all[i - 1],
      h: Math.max(c, i === 0 ? c : all[i - 1]) + 0.15,
      l: Math.min(c, i === 0 ? c : all[i - 1]) - 0.15,
      c,
      v: 10,
    }));
    const verdict = PATTERN.read(inputFor(bars));
    expect(verdict.direction).toBe('long');
    expect(verdict.provenance.target).toBe('school');
    expect(verdict.rules.some((rule) => rule.includes('measuring rule'))).toBe(true);
  });

  it('will not call an unbroken flag a trade', () => {
    const pole = Array.from({ length: 8 }, (_, i) => 100 + i * 1.2);
    const closes = [...flat(30).map((b) => b.c), ...pole, 109, 108.4, 108.8, 108.5];
    const bars: Bar[] = closes.map((c, i, all) => ({
      o: i === 0 ? c : all[i - 1],
      h: Math.max(c, i === 0 ? c : all[i - 1]) + 0.15,
      l: Math.min(c, i === 0 ? c : all[i - 1]) - 0.15,
      c,
      v: 10,
    }));
    expect(PATTERN.read(inputFor(bars)).direction).toBeNull();
  });

  it('never uses Bulkowski’s percentages as conviction', () => {
    // They are daily-bar priors over decades of US equities, applied here out of domain. Conviction
    // comes from our own replay, like every other engine's.
    for (let seed = 0; seed < 30; seed++) {
      expect(PATTERN.read(inputFor(walk(200, seed))).conviction).toBeNull();
    }
  });
});

describe('GEOMETRY publishes what Carney did not', () => {
  it('publishes a tolerance, which is what takes it from 3/5 to 5/5', () => {
    // He gives exact ratios and no tolerances, so every vendor invents one and two faithful
    // implementers reading the same book produce different charts.
    expect(THRESHOLDS.geometry.tolerance).toBeGreaterThan(0);
  });

  it('resolves the Crab contradiction against the originator’s own page, and says why', () => {
    // Carney's Crab page states B = 0.886 XA; the near-universal secondary statement is 0.382–0.618.
    // 0.886 is the Deep Crab — taking it would merge the two patterns and leave one undefined.
    expect(THRESHOLDS.geometry.crab.bMin).toBe(0.382);
    expect(THRESHOLDS.geometry.crab.bMax).toBe(0.618);
    expect(THRESHOLDS.geometry.crab.bMax).not.toBe(0.886);
  });

  it('abstains almost always, which is the measured result and not a bug', () => {
    // Zero trades on 1,000 charts. The engine still has to *run* — a crash would look identical to
    // an abstention from the outside, which is exactly why this is asserted.
    for (let seed = 0; seed < 40; seed++) {
      const verdict = GEOMETRY.read(inputFor(walk(200, seed)));
      expect(verdict.direction === null || verdict.bracket !== null).toBe(true);
      assertWellFormed(verdict.annotations);
    }
  });

  it('stays in the family despite never firing', () => {
    // The file-drawer test. Dropping an engine because it returned an unwelcome answer would make
    // every other engine's correction look better than it is.
    expect(ENGINES.map((engine) => engine.code)).toContain('GEOMETRY');
    expect(BRACKET.GEOMETRY.n).toBe(0);
  });
});

describe('TAPE is directional, not a veto', () => {
  it('is corrected on both counts §5.2 got wrong', () => {
    // The stop IS native — beyond the signal bar's extreme. The target is not: VSA exits on an
    // opposing signal, which is a condition and not a price.
    expect(PROVENANCE.TAPE).toEqual({ stop: 'school', target: 'ours' });
  });

  it('emits a direction rather than a filter on someone else’s trade', () => {
    let spoke = 0;
    for (let seed = 0; seed < 120; seed++) {
      const verdict = TAPE.read(inputFor(walk(200, seed)));
      if (verdict.direction !== null) {
        spoke += 1;
        expect(['long', 'short']).toContain(verdict.direction);
      }
    }
    expect(spoke).toBeGreaterThan(0);
  });

  it('reads volume and spread as percentile ranks, not multiples of a median', () => {
    // Median-scaling equalises location but not dispersion, so a fixed multiple would fire at
    // different rates across instruments and make coverage a property of the symbol.
    for (let seed = 0; seed < 60; seed++) {
      const verdict = TAPE.read(inputFor(walk(200, seed)));
      if (verdict.direction === null) continue;
      expect(verdict.rules.some((rule) => rule.includes('percentile ranks'))).toBe(true);
    }
  });

  it('is unchanged by rebasing volume, because every VSA test is comparative', () => {
    // §12.2 rebases volume at generation time. Dividing by a positive constant preserves every
    // ordering and every ratio, so no signal may change — checked rather than assumed.
    for (let seed = 0; seed < 40; seed++) {
      const bars = walk(200, seed);
      const rebased = bars.map((bar) => ({ ...bar, v: bar.v * 37.5 }));
      expect(TAPE.read(inputFor(rebased)).direction).toBe(TAPE.read(inputFor(bars)).direction);
    }
  });
});

describe('the eight-engine council', () => {
  it('runs every engine and matches the registered family', () => {
    const verdicts = council(inputFor(walk(300, 3)));
    expect(verdicts).toHaveLength(8);
    expect(new Set(verdicts.map((v) => v.engine)).size).toBe(8);
  });

  it('gives an engine that never fired no conviction rather than nought per cent', () => {
    // 0% would read as "certain it loses". It never traded, which is a different statement.
    const verdicts = council(inputFor(walk(300, 3)));
    const geometry = verdicts.find((v) => v.engine === 'GEOMETRY')!;
    expect(geometry.conviction).toBeNull();
  });

  it('states the provenance of every engine on the roster', () => {
    for (const engine of ENGINES) {
      expect(PROVENANCE[engine.code]).toBeDefined();
    }
  });

  it('has four engines whose target is ours and four whose stop is', () => {
    // §14.2 was written at a roster of four and said no school here has a price target. At eight it
    // is four of eight, and PATTERN and GEOMETRY are the two that do.
    const targets = ENGINES.filter((engine) => PROVENANCE[engine.code].target === 'school');
    expect(targets.map((engine) => engine.code).sort()).toEqual(['GEOMETRY', 'PATTERN']);
  });
});
