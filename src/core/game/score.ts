/**
 * The grade, and what a duel does with it (docs/rules.md §23.3, §23.6).
 */

import { DAMAGE_K, DUEL_HEALTH, DUEL_TAPES, GRADE_MAX } from './rules';

/**
 * Where a result sits between the worst and the best the tape allowed, 0 to 1000.
 *
 * Clamped only as a guard: the best and worst are the extremes of every order a round can place,
 * so a result outside them is a bug in `tapeExtremes`, and the tests look for one. A tape whose
 * best is no better than its worst cannot be dealt (§23.4); it grades everything at the middle.
 */
export function grade(result: number, best: number, worst: number): number {
  const range = best - worst;
  if (!(range > 0)) return GRADE_MAX / 2;
  const raw = Math.round((GRADE_MAX * (result - worst)) / range);
  return Math.min(GRADE_MAX, Math.max(0, raw));
}

/**
 * Damage for a gap between two grades: 1000 × (e^(k·gap) − 1) / (e^k − 1), with the gap as a
 * share of the scale. Small gaps barely hurt; a gap of the whole scale is a knockout (§23.6).
 */
export function damage(gradeA: number, gradeB: number, k: number = DAMAGE_K): number {
  const gap = Math.abs(gradeA - gradeB) / GRADE_MAX;
  if (gap === 0) return 0;
  return Math.round((DUEL_HEALTH * (Math.exp(k * gap) - 1)) / (Math.exp(k) - 1));
}

export type Seat = 0 | 1;

/** One tape of a duel: each seat's grade, or null while that seat has not played it. */
export type DuelTape = [number | null, number | null];

export interface ResolvedTape {
  index: number;
  grades: [number, number];
  /** Who took the damage; null when the grades were equal. */
  to: Seat | null;
  damage: number;
  /** Health after this tape. */
  health: [number, number];
}

export interface DuelStanding {
  health: [number, number];
  resolved: ResolvedTape[];
  /** The tape both seats are on, or the first one either still has to play. Null when over. */
  current: number | null;
  over: boolean;
  /** The winning seat, 'draw', or null while the duel is on. */
  winner: Seat | 'draw' | null;
  knockout: boolean;
}

/**
 * Fold a duel's tapes into its standing. Tapes resolve in order, each once both seats have played
 * it; the duel ends at a knockout or after the last tape, and anything played past a knockout
 * counts for nothing.
 */
export function standDuel(tapes: readonly DuelTape[], limit: number = DUEL_TAPES): DuelStanding {
  const health: [number, number] = [DUEL_HEALTH, DUEL_HEALTH];
  const resolved: ResolvedTape[] = [];
  let current: number | null = null;

  for (let index = 0; index < limit; index++) {
    const tape = tapes[index];
    const a = tape?.[0] ?? null;
    const b = tape?.[1] ?? null;
    if (a === null || b === null) {
      current = index;
      break;
    }
    const hit = damage(a, b);
    const to: Seat | null = a === b ? null : a < b ? 0 : 1;
    if (to !== null) health[to] = Math.max(0, health[to] - hit);
    resolved.push({ index, grades: [a, b], to, damage: to === null ? 0 : hit, health: [health[0], health[1]] });
    if (health[0] === 0 || health[1] === 0) break;
  }

  const knockout = health[0] === 0 || health[1] === 0;
  const over = knockout || resolved.length >= limit;
  const winner: DuelStanding['winner'] = !over
    ? null
    : health[0] === health[1]
      ? 'draw'
      : health[0] > health[1]
        ? 0
        : 1;
  return { health, resolved, current: over ? null : current, over, winner, knockout };
}
