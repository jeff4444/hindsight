/**
 * §10.1's Duel and Racer, and the primitive they share.
 *
 * | | §10.1 |
 * | --- | --- |
 * | **Duel** | *"Two players, identical charts, health-bar damage equal to the compressed score difference. Escalating multiplier, capped per round in ranked, uncapped in casual."* |
 * | **Racer** | *"Five to ten players, same charts, ninety seconds, live positions."* |
 *
 * Both need one thing nothing else in this product has: **a fixed, ordered chart sequence that
 * several players play independently and are scored against.** A duel is two players on that
 * sequence with a health bar; a race is *n* players on it against a clock. That is why they ship
 * together — one primitive, two scorers.
 *
 * ## The escalating multiplier is withdrawn, and the reason is measured
 *
 * §4.3 justifies it twice: it *"manufactures comebacks and guarantees termination"*, and uncapped it
 * *"makes round order decisive rather than round quality"*. Simulated over 20,000 duels a cell
 * against a null of two players picking at random (`docs/phase-5e-research.md` §3–4):
 *
 * - **Termination never needed it.** Flat damage on a 40-point bar ends at a median of 8 rounds and
 *   a p99 of 15, and *nothing* failed to finish in any cell, including with no multiplier at all.
 * - **Escalation is what makes round order decisive.** Weighting later rounds more heavily is exactly
 *   a statement that the same results in a different order should give a different winner, and it
 *   costs 6 to 10 points of agreement with total score.
 * - **The cap is not the remedy for that**, though §4.3 credits it as one. It moves agreement by
 *   0.6 to 2.7 points, and in one cell it moves it the wrong way.
 *
 * So damage is flat. What remains of the multiplier's case is "manufactures comebacks", which is
 * entertainment bought with correctness — and §4.3 opens by rejecting that exact trade for the
 * ranked ladder.
 *
 * **The cap stays.** Not for order-dependence, but because 16.2% of rounds against the null are at or
 * above 15 IMPs, and without it one catastrophic chart can end a duel outright. It costs 0.6 points
 * of agreement to stop a single round deciding a match, and it is §10.1's rule regardless.
 */

import { IMP_MAX, imp } from './ranked';

/** Frozen on the §14 pattern: these decide every duel this product will ever resolve. */
export const DUEL_SPEC = {
  /**
   * The health bar. **Ours** — §10.1 asks for one and never says how big.
   *
   * 40 puts an even duel at a median of 8 charts and a p99 of 15, which is a sitting. It also leaves
   * the honest failure mode visible rather than hidden: two strong players take a median of 17,
   * because they differ less, and that is the price of two people who are both right most of the
   * time rather than a bug to tune away.
   */
  health: 40,
  /** §10.1's per-round cap. Same number as the ranked IMP bound, because it is the same scale. */
  damageCap: IMP_MAX,
  /**
   * §10.1's *"escalating multiplier"*, measured and withdrawn. Kept as an explicit 1 rather than
   * deleted, so the withdrawal is a visible decision rather than an omission someone re-adds.
   */
  multiplier: 1,
} as const;

export const RACE_SPEC = {
  /** §10.1's ninety seconds. */
  durationMs: 90 * 1000,
  /** §10.1's "five to ten players". A race needs opponents, even recorded ones. */
  minPlayers: 2,
  maxPlayers: 10,
} as const;

/**
 * How much damage one chart does, and to whom.
 *
 * Positive means *A took damage*. Both players scored the same chart against the same achievable
 * distribution, so the difference is what §4.3 calls "the compressed score difference" — and a chart
 * both players read equally well does nothing at all, which is 4.3% of rounds against the null and
 * **79.5%** between two engines.
 */
export function damageFor(impA: number, impB: number): { toA: number; toB: number } {
  const raw = Math.abs(impA - impB) * DUEL_SPEC.multiplier;
  const dealt = Math.min(DUEL_SPEC.damageCap, raw);
  if (impA > impB) return { toA: 0, toB: dealt };
  if (impB > impA) return { toA: dealt, toB: 0 };
  return { toA: 0, toB: 0 };
}

export interface DuelState {
  healthA: number;
  healthB: number;
  /** Charts both players have finished. A chart only counts once both have answered it. */
  rounds: number;
  over: boolean;
  /** 'a' | 'b' | 'draw' once it is over. A draw needs both bars emptied on the same chart. */
  winner: 'a' | 'b' | 'draw' | null;
}

export function newDuel(): DuelState {
  return {
    healthA: DUEL_SPEC.health,
    healthB: DUEL_SPEC.health,
    rounds: 0,
    over: false,
    winner: null,
  };
}

/**
 * One chart's effect on a duel.
 *
 * Takes percentiles rather than IMPs, because the conversion is the scoring rule and two callers
 * doing it separately is two chances to disagree about it. §4.4's pass is already a percentile —
 * 0R scored against the same distribution — so nothing here needs to know whether either player
 * traded.
 */
export function duelAfter(state: DuelState, percentileA: number, percentileB: number): DuelState {
  if (state.over) return state;

  const { toA, toB } = damageFor(imp(percentileA), imp(percentileB));
  const healthA = Math.max(0, state.healthA - toA);
  const healthB = Math.max(0, state.healthB - toB);
  const over = healthA <= 0 || healthB <= 0;

  return {
    healthA,
    healthB,
    rounds: state.rounds + 1,
    over,
    // Both at zero is a draw and is reachable only through the tie branch of `damageFor`, which
    // deals nothing — so in practice a draw needs both players to arrive at zero on the same chart
    // from different directions, which the cap makes rare rather than impossible.
    winner: !over ? null : healthA <= 0 && healthB <= 0 ? 'draw' : healthA <= 0 ? 'b' : 'a',
  };
}

/* ---------------------------------------------------------------------- race */

/**
 * A race position: how far through the sequence, and how much was scored.
 *
 * A race is scored on **IMPs, not charts finished**, so hurrying through the sequence badly loses to
 * reading three of them well. §10.1 gives the clock and nothing else; making raw speed the objective
 * would reward exactly the guessing this product's whole scoring model exists to discourage.
 */
export interface RacePosition {
  /** Null for a live player; the moment a ghost's run was recorded, for one that is not. */
  recordedAt: string | null;
  handle: string | null;
  charts: number;
  score: number;
  /** Milliseconds from the start of the run, so a ghost can be replayed against the clock. */
  elapsedMs: number;
}

/**
 * The standings, best first.
 *
 * Ties on score break on **fewer charts**, which is deliberate: two players on the same score have
 * read the same sequence to the same standard, and the one who needed less of it to get there was
 * more efficient with the clock the mode is built around.
 */
export function standings(positions: readonly RacePosition[]): RacePosition[] {
  return [...positions].sort((a, b) => b.score - a.score || a.charts - b.charts || a.elapsedMs - b.elapsedMs);
}

/** Where a ghost had got to at `atMs` into the race, for drawing it moving. */
export function ghostAt(samples: readonly { atMs: number; score: number; charts: number }[], atMs: number) {
  let current = { atMs: 0, score: 0, charts: 0 };
  for (const sample of samples) {
    if (sample.atMs > atMs) break;
    current = sample;
  }
  return current;
}
