/**
 * Manage — the other half of the skill, and the achievable set it needs.
 *
 * §10.1: *"Same charts, candles advance in real time, player may trail, scale out, move to
 * breakeven, or exit early. **Separate rating.**"* §3 calls this "the largest architectural gap in
 * v0.1" and compares it to blitz against classical: a different game on the same board.
 *
 * ## Why this file exists before any Manage interaction does
 *
 * `docs/phase-5-research.md` §1.1 measured the thing that decides the design. Against the 98
 * enumerated brackets a player is currently scored on:
 *
 * | over 300 real charts | mean | median |
 * | --- | --- | --- |
 * | best static bracket (the 98-cell oracle) | 4.37R | 3.78R |
 * | perfect management, at 1 ATR of risk | **7.29R** | **5.51R** |
 * | **charts where management beats every static bracket** | **79.0%** | |
 *
 * That is *perfect-foresight* management — exit at the exact extreme — so it is a ceiling rather
 * than something a rule reaches. Enumerating the seven mechanical policies below over 250 charts,
 * their oracle tops the bracket oracle on **17.6%** of charts, not 79%. The research doc's first
 * draft drew the wrong inference from the right number and §1.2 there corrects it.
 *
 * **The surviving argument is the baseline, and it is decisive.** Net of costs over the same charts:
 *
 * | grid | oracle | par (median cell) |
 * | --- | --- | --- |
 * | bracket (§1's 98) | 4.38R | **−0.880R** |
 * | manage (this file's 98) | 4.67R | **−0.458R** |
 *
 * Par is **0.42R apart**. A percentile is a rank against a distribution, so scoring a managed trade
 * in the bracket distribution would hand it that gap as a gift — and the bracket grid contains no
 * managed outcomes at all, so it compares unlike things whatever the numbers do. Everything
 * downstream inherits it: Glicko needs an outcome that varies with skill, chart ratings need the
 * same, and §16.3's regime work assumes a comparable percentile.
 *
 * ## What the grid found on the way in
 *
 * Mean R by policy, all stops, both directions, net of costs. Every one loses money, which is by now
 * the least surprising sentence in this repository — the ordering is the part worth reading:
 *
 * | policy | mean R |
 * | --- | --- |
 * | trail 3 ATR | **−0.017** |
 * | trail 2 ATR | −0.071 |
 * | hold to the end | −0.100 |
 * | **breakeven at 1R** | **−0.117** |
 *
 * **The loosest trail is the best of them, and moving to breakeven is the worst — worse than doing
 * nothing.** Breakeven stops are among the most widely taught habits in retail trading, and on this
 * corpus they convert trades that would have recovered into scratches. Same shape as §16.1's cost
 * gradient and §14.9's sweep tightening: acting more does not pay here.
 *
 * **The fix is the one Layer 1 already used: enumerate.** A management policy is as parameterisable
 * as a bracket, so the same trick applies — resolve a grid of policies against the same stored
 * one-minute path and rank the player among them.
 *
 * ## The grid is 98 cells, and that number is not a coincidence
 *
 * Direction × initial stop × exit policy = 2 × 7 × 7 = **98**, exactly the size of §1's bracket
 * grid. That is deliberate: a percentile drawn from 98 outcomes means the same thing on both
 * ladders, so "you were 60th at Naked and 40th at Manage" is a comparison rather than an artefact
 * of two differently-sized distributions. The exit condition of the phase is a *correlation between
 * the two ratings*, and it would be measuring resolution differences if the grids disagreed on size.
 *
 * The stop axis is reused verbatim from `STOP_ATR_MULTIPLES` for the same reason.
 *
 * ## Pre-registered, on the §14 pattern
 *
 * These seven policies are a choice. Under the discipline §14 established — and §14.9 demonstrated
 * the cost of ignoring — the grid is frozen before the first Manage round is scored, and changing it
 * bumps `MANAGE_VERSION` and re-enumerates rather than quietly re-ranking every player who came
 * before.
 */

import type { Bar } from './bars';
import { STOP_ATR_MULTIPLES } from './achievable';
import { InvalidOrderError, NO_COSTS, type Costs, type Direction, type Outcome } from './resolve';

/**
 * A management policy: what to do with the position once it is open.
 *
 * Deliberately a small closed union of *published rules* rather than a callback, for the same
 * reason `ConditionalExit` is in §14's engine contract — a rule you can print is one a player can
 * argue with, and a closure is neither printable nor enumerable.
 */
export interface ManagePolicy {
  /** Printed on screen and in `docs/rules.md`. */
  label: string;
  /** Move the stop to breakeven once the trade is this many R in front. Null to never. */
  breakevenAtR: number | null;
  /** Trail the stop this many ATR behind the best price seen. Null to never trail. */
  trailAtr: number | null;
  /** Take half the position off at this many R. Null to never scale out. */
  partialAtR: number | null;
}

/**
 * The seven policies, ordered from doing nothing to doing everything.
 *
 * The first is the control and it matters: it is "hold to the end of the window", which is what a
 * bracket with no target does, and it anchors the grid to the passive outcome. Without it the
 * distribution would contain only managed trades and a player who managed badly would still rank
 * above a floor that does not exist.
 */
export const MANAGE_POLICIES: readonly ManagePolicy[] = [
  { label: 'hold to the end', breakevenAtR: null, trailAtr: null, partialAtR: null },
  { label: 'trail 1 ATR', breakevenAtR: null, trailAtr: 1, partialAtR: null },
  { label: 'trail 2 ATR', breakevenAtR: null, trailAtr: 2, partialAtR: null },
  { label: 'trail 3 ATR', breakevenAtR: null, trailAtr: 3, partialAtR: null },
  { label: 'breakeven at 1R', breakevenAtR: 1, trailAtr: null, partialAtR: null },
  { label: 'breakeven at 1R, then trail 2 ATR', breakevenAtR: 1, trailAtr: 2, partialAtR: null },
  { label: 'half off at 1R, breakeven, then trail 2 ATR', breakevenAtR: 1, trailAtr: 2, partialAtR: 1 },
] as const;

/** Direction × stop × policy. Same size as §1's bracket grid, on purpose. */
export const MANAGE_GRID_SIZE = 2 * STOP_ATR_MULTIPLES.length * MANAGE_POLICIES.length;

export interface ManagedResolution {
  outcome: Exclude<Outcome, 'pass'>;
  direction: Direction;
  /** R over the whole position, counting a scaled-out half at the price it left. */
  rMultiple: number;
  entryFill: number;
  riskPerUnit: number;
  /** Index into the minute path where the last of the position closed. */
  exitPathIndex: number;
  /** True if the stop was moved above breakeven at any point. */
  trailed: boolean;
  /** True if half came off before the rest. */
  scaledOut: boolean;
}

const bps = (value: number) => value / 10_000;

/**
 * Walk one policy over the minute path.
 *
 * The order of checks inside a bar is the one §12.3.2 already fixed for the static resolver: **the
 * stop is tested before anything else**, because a bar that touches both the stop and a better
 * price is ambiguous at this resolution and the pessimistic reading is the honest one. Management
 * makes that convention matter more, not less — a trailing stop is hit far more often than a fixed
 * one, so a generous reading would inflate every managed result.
 *
 * The stop only ever moves **in the trade's favour**. That is not a nicety: a stop that can widen is
 * a different risk unit, and R is defined by the *initial* risk (§4.1), so widening it would make
 * the denominator a lie.
 */
export function resolveManaged(
  order: { entry: number; stop: number },
  path: readonly Bar[],
  policy: ManagePolicy,
  atr: number,
  costs: Costs = NO_COSTS,
): ManagedResolution {
  if (path.length === 0) throw new InvalidOrderError('cannot resolve against an empty path');
  if (!(atr > 0)) throw new InvalidOrderError('atr must be positive');
  const isLong = order.stop < order.entry;
  const direction: Direction = isLong ? 'long' : 'short';

  const halfSpread = bps(costs.spreadBps) / 2;
  const slip = bps(costs.stopSlippageBps);
  const entryFill = isLong ? order.entry * (1 + halfSpread) : order.entry * (1 - halfSpread);
  const riskPerUnit = Math.abs(entryFill - order.stop);
  if (riskPerUnit === 0) throw new InvalidOrderError('initial risk cannot be zero');

  const exitAt = (raw: number, slipped: boolean) => {
    const afterSlip = slipped ? (isLong ? raw * (1 - slip) : raw * (1 + slip)) : raw;
    return isLong ? afterSlip * (1 - halfSpread) : afterSlip * (1 + halfSpread);
  };
  const rOf = (fill: number) => (isLong ? fill - entryFill : entryFill - fill) / riskPerUnit;

  let stop = order.stop;
  let best = entryFill;
  let trailed = false;
  let scaledOut = false;
  /** R banked by the half that came off early. The rest of the position carries the other half. */
  let banked = 0;
  let remaining = 1;

  for (let i = 0; i < path.length; i++) {
    const bar = path[i];

    // 1. The stop, first and always.
    const hit = isLong ? bar.l <= stop : bar.h >= stop;
    if (hit) {
      const r = rOf(exitAt(stop, true));
      return {
        outcome: r > 0 ? 'target' : 'stop',
        direction,
        rMultiple: banked + remaining * r,
        entryFill,
        riskPerUnit,
        exitPathIndex: i,
        trailed,
        scaledOut,
      };
    }

    // 2. How far in front the trade has been, which is what every rule below reads.
    best = isLong ? Math.max(best, bar.h) : Math.min(best, bar.l);
    const bestR = rOf(best);

    // 3. Scale out — before the stop moves, so the half that comes off does so at the level the
    //    rule names rather than at whatever the stop has been dragged to.
    if (policy.partialAtR !== null && !scaledOut && bestR >= policy.partialAtR) {
      const level = isLong
        ? entryFill + policy.partialAtR * riskPerUnit
        : entryFill - policy.partialAtR * riskPerUnit;
      banked += 0.5 * rOf(exitAt(level, false));
      remaining = 0.5;
      scaledOut = true;
    }

    // 4. Breakeven, then the trail. Both may only tighten.
    const candidates: number[] = [stop];
    if (policy.breakevenAtR !== null && bestR >= policy.breakevenAtR) candidates.push(entryFill);
    if (policy.trailAtr !== null) {
      candidates.push(isLong ? best - policy.trailAtr * atr : best + policy.trailAtr * atr);
    }
    const tightened = isLong ? Math.max(...candidates) : Math.min(...candidates);
    if (tightened !== stop) {
      // Only count it as trailing once it is past breakeven — moving a stop from −2 ATR to −1.5 is
      // still risk reduction, not a locked-in gain, and the flag is read by the UI as the latter.
      if (isLong ? tightened > entryFill : tightened < entryFill) trailed = true;
      stop = tightened;
    }
  }

  // Never stopped: the remainder is marked to the last close, as §4.6 does for a timeout.
  const last = path[path.length - 1].c;
  const r = rOf(exitAt(last, false));
  return {
    outcome: 'timeout',
    direction,
    rMultiple: banked + remaining * r,
    entryFill,
    riskPerUnit,
    exitPathIndex: path.length - 1,
    trailed,
    scaledOut,
  };
}

export interface ManagedCell {
  direction: Direction;
  stopAtr: number;
  policy: number;
  rMultiple: number;
  outcome: Exclude<Outcome, 'pass'>;
}

/**
 * The Manage achievable set: every policy, at every stop, both ways.
 *
 * Emitted direction-major, then stop, then policy — the same canonical order §1's grid uses, so the
 * stored form can carry only the numbers and leave the coordinates implicit.
 */
export function enumerateManaged(
  entry: number,
  atr: number,
  path: readonly Bar[],
  costs: Costs = NO_COSTS,
): ManagedCell[] {
  const cells: ManagedCell[] = [];
  if (!(atr > 0) || path.length === 0) return cells;

  for (const direction of ['long', 'short'] as const) {
    const sign = direction === 'long' ? 1 : -1;
    for (const stopAtr of STOP_ATR_MULTIPLES) {
      const stop = entry - sign * stopAtr * atr;
      if (Math.abs(entry - stop) === 0) continue;

      MANAGE_POLICIES.forEach((policy, index) => {
        const resolution = resolveManaged({ entry, stop }, path, policy, atr, costs);
        cells.push({
          direction,
          stopAtr,
          policy: index,
          rMultiple: resolution.rMultiple,
          outcome: resolution.outcome,
        });
      });
    }
  }

  return cells;
}
