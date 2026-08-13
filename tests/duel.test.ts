import { describe, expect, it } from 'vitest';
import {
  DUEL_SPEC,
  damageFor,
  duelAfter,
  ghostAt,
  newDuel,
  standings,
  type DuelState,
  type RacePosition,
} from '@/core/duel';
import { IMP_MAX, imp } from '@/core/ranked';

/**
 * §10.1's duel, and mostly the two properties §4.3 asserts about it without measuring either.
 *
 * The claims are that the escalating multiplier "guarantees termination" and that uncapped damage
 * "makes round order decisive rather than round quality". Simulated over the same null the research
 * used — two players picking at random, which is what a bracket chosen at random does against the
 * achievable distribution by construction — the first is unnecessary and the second credits the
 * wrong mechanism. `docs/phase-5e-research.md` has the full tables; these are the properties that
 * have to keep holding.
 */

/** mulberry32, so a failure here is reproducible rather than a thing that happened once. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` duels between two players drawing percentiles at random. */
function simulate(n: number, seed = 4242) {
  const draw = rng(seed);
  const results: { state: DuelState; sumA: number; sumB: number }[] = [];
  for (let i = 0; i < n; i++) {
    const pairs: [number, number][] = [];
    for (let k = 0; k < 400; k++) pairs.push([draw(), draw()]);
    let state = newDuel();
    let sumA = 0;
    let sumB = 0;
    for (const [a, b] of pairs) {
      state = duelAfter(state, a, b);
      sumA += imp(a);
      sumB += imp(b);
      if (state.over) break;
    }
    results.push({ state, sumA, sumB });
  }
  return results;
}

describe('a duel always ends, which is what §4.3 credited the multiplier with', () => {
  it('finishes every time, with no escalation at all', () => {
    // The measured claim: flat damage on a 40-point bar ends at a median of 8 rounds and a p99 of
    // 15, and nothing failed to finish in any simulated cell. Escalation was never what guaranteed
    // this — damage averaging 8 a round against a 40-point bar was.
    const results = simulate(2_000);
    expect(results.every((r) => r.state.over)).toBe(true);
  });

  it('lands in the measured range rather than merely terminating eventually', () => {
    const lengths = simulate(2_000).map((r) => r.state.rounds).sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)];
    const p99 = lengths[Math.floor(lengths.length * 0.99)];
    // A regression that doubled the health or halved the damage would still "terminate", and this is
    // what would catch it.
    expect(median).toBeGreaterThanOrEqual(6);
    expect(median).toBeLessThanOrEqual(10);
    expect(p99).toBeLessThanOrEqual(20);
  });

  it('holds the multiplier at one, so a re-added escalation is a visible change', () => {
    expect(DUEL_SPEC.multiplier).toBe(1);
  });
});

describe('the winner is the better player, not the luckier-ordered one', () => {
  it('agrees with total score on virtually every duel', () => {
    // The direct test of §4.3's concern. Flat and capped measured 99.4% against the null; escalation
    // dropped it to 90–95%, which is why it is not here.
    const results = simulate(3_000).filter((r) => r.state.winner !== 'draw' && r.sumA !== r.sumB);
    const agree = results.filter(
      (r) => (r.sumA > r.sumB ? 'a' : 'b') === r.state.winner,
    ).length;
    expect(agree / results.length).toBeGreaterThan(0.98);
  });

  it('is fair between equal players', () => {
    const results = simulate(4_000).filter((r) => r.state.winner !== 'draw');
    const aWins = results.filter((r) => r.state.winner === 'a').length / results.length;
    expect(aWins).toBeGreaterThan(0.45);
    expect(aWins).toBeLessThan(0.55);
  });

  it('finds the stronger player when there is one', () => {
    // A stronger player keeps the better of two draws — crude, but monotone. Measured at 93.1%.
    const draw = rng(99);
    let aWins = 0;
    let decided = 0;
    for (let i = 0; i < 2_000; i++) {
      let state = newDuel();
      while (!state.over) state = duelAfter(state, Math.max(draw(), draw()), draw());
      if (state.winner === 'draw') continue;
      decided += 1;
      if (state.winner === 'a') aWins += 1;
    }
    expect(aWins / decided).toBeGreaterThan(0.85);
  });
});

describe('one chart, one exchange', () => {
  it('does nothing when both players read the chart equally well', () => {
    // 4.3% of rounds against the null, and 79.5% between two engines — the council is silent on two
    // thirds of charts, and two players who both stand aside score identically.
    expect(damageFor(7, 7)).toEqual({ toA: 0, toB: 0 });
    const state = duelAfter(newDuel(), 0.5, 0.5);
    expect(state.healthA).toBe(DUEL_SPEC.health);
    expect(state.healthB).toBe(DUEL_SPEC.health);
    expect(state.rounds).toBe(1);
  });

  it('damages only the player who scored less', () => {
    expect(damageFor(9, 2)).toEqual({ toA: 0, toB: 7 });
    expect(damageFor(2, 9)).toEqual({ toA: 7, toB: 0 });
  });

  it('caps a blowout so one chart cannot decide a match', () => {
    // 16.2% of rounds against the null are at or above the cap. Uncapped, the worst of them is 30
    // against a 40-point bar.
    expect(damageFor(IMP_MAX, -IMP_MAX).toB).toBe(DUEL_SPEC.damageCap);
    expect(DUEL_SPEC.damageCap).toBeLessThan(DUEL_SPEC.health);
  });

  it('accepts nothing once it is over', () => {
    let state = newDuel();
    while (!state.over) state = duelAfter(state, 0.99, 0.01);
    const frozen = duelAfter(state, 0.01, 0.99);
    expect(frozen).toBe(state);
  });

  it('never lets a health bar go negative', () => {
    let state = newDuel();
    while (!state.over) state = duelAfter(state, 0.99, 0.01);
    expect(state.healthB).toBe(0);
    expect(state.winner).toBe('a');
  });
});

describe('a race is scored on reading, not on hurrying', () => {
  const position = (over: Partial<RacePosition> = {}): RacePosition => ({
    recordedAt: null,
    handle: null,
    charts: 3,
    score: 20,
    elapsedMs: 60_000,
    ...over,
  });

  it('puts the higher score first however many charts it took', () => {
    // The whole point: a player who read three charts well beats one who rushed eight badly. Making
    // charts-finished the objective would reward the guessing everything else here discourages.
    const ranked = standings([
      position({ handle: 'fast', charts: 8, score: 12 }),
      position({ handle: 'careful', charts: 3, score: 20 }),
    ]);
    expect(ranked[0].handle).toBe('careful');
  });

  it('breaks a tie towards the player who needed fewer charts', () => {
    const ranked = standings([
      position({ handle: 'more', charts: 6, score: 20 }),
      position({ handle: 'fewer', charts: 4, score: 20 }),
    ]);
    expect(ranked[0].handle).toBe('fewer');
  });

  it('places a ghost on the board like anyone else', () => {
    // A recording is an opponent, and is labelled as one rather than being hidden or excluded.
    const ranked = standings([
      position({ handle: 'live', score: 10 }),
      position({ handle: 'ghost', score: 25, recordedAt: '2026-08-01T00:00:00Z' }),
    ]);
    expect(ranked[0].handle).toBe('ghost');
    expect(ranked[0].recordedAt).not.toBeNull();
  });
});

describe('a ghost is where it actually was', () => {
  const samples = [
    { atMs: 0, score: 0, charts: 0 },
    { atMs: 20_000, score: 7, charts: 1 },
    { atMs: 45_000, score: 15, charts: 2 },
  ];

  it('reports the last sample at or before the moment asked for', () => {
    expect(ghostAt(samples, 30_000).score).toBe(7);
    expect(ghostAt(samples, 45_000).score).toBe(15);
  });

  it('starts at nothing rather than at its first sample', () => {
    // A ghost that appeared already ahead would misrepresent the run it is a recording of.
    expect(ghostAt(samples, 0).score).toBe(0);
    expect(ghostAt([], 10_000).score).toBe(0);
  });

  it('stays where it finished once the recording runs out', () => {
    expect(ghostAt(samples, 90_000).score).toBe(15);
  });
});
