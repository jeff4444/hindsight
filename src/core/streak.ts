/**
 * The retention streak.
 *
 * §10.3 is unusually specific, and it is specific about the failure mode: "A streak works through
 * loss aversion, which means it works by making people anxious. Ship the whole mitigation stack,
 * not just the first piece" — two freezes granted up front ("two outperform one, three are no
 * better than two"), earn-back ("which works precisely because it is earned rather than
 * forgiven"), and a gold perfect state for players who never used a freeze, "which is the
 * counterweight that stops freezes cheapening the achievement".
 *
 * ## The part that is easy to get wrong
 *
 * A streak here is a set of consecutive **daily day-numbers**, not a set of visits. §10.1 keeps
 * each daily open for 48 hours, so a player who completes day 10 on day 11 has completed day 10
 * and the streak does not care when they did it. Counting visits is wrong in both directions:
 * someone who completes days 10 and 11 both on day 11 would score one streak day despite the
 * window explicitly permitting it, and someone permanently a day behind would show an unbroken
 * visit streak while never completing a daily on its own day.
 *
 * The consequence that matters is that **a missed day cannot be declared missed until 48 hours
 * after it opened**. With `F` as the frontier — the highest day in the current run:
 *
 *   alive     ⟺  today <= F + 2
 *   breaks    at  today = F + 3
 *   the day that saves the run is **F + 1**, not today
 *
 * That last line is a product rule, not a detail. At `today = F + 2`, playing *today's* daily does
 * not save the streak: it starts an island of length one and leaves the hole at `F+1`, which
 * closes tomorrow. The only move that rescues it is yesterday's backlog daily, and the UI has to
 * point at the right one. The naive `if (F < today - 1) break` is wrong — it breaks runs that are
 * still recoverable.
 *
 * Pure, so the boundary cases are a golden table rather than a manual QA pass. The decisions this
 * returns are re-validated in SQL before they are applied, so a bug here cannot mint freezes.
 */

export interface StreakRepair {
  id: string;
  state: 'open' | 'redeemed' | 'expired';
  coversFrom: number;
  coversTo: number | null;
  chartsRequired: number;
  chartsDone: number;
  /** Epoch ms. */
  expiresAt: number;
}

export interface StreakInputs {
  today: number;
  /** Day numbers of completed dailies. */
  completions: number[];
  /** Day numbers already covered by a spent freeze. */
  freezes: number[];
  repairs: StreakRepair[];
  freezesRemaining: number;
  /** Epoch ms, for expiring repairs. Passed in rather than read, so this stays pure. */
  now: number;
}

export interface StreakView {
  /** Completed days in the current run. Frozen and repaired days bridge it but do not count. */
  length: number;
  frontier: number | null;
  runStart: number | null;
  alive: boolean;
  /** Alive, but today is not covered yet. */
  atRisk: boolean;
  /** No freeze and no repair anywhere in the current run. §10.3's gold state. */
  perfect: boolean;
  /** The daily that must be completed to extend the run. Not always today. */
  requiredDay: number | null;
  /** The last day on which `requiredDay` can still be played. */
  deadlineDay: number | null;
  /** Whether today's daily is itself already done. */
  todayDone: boolean;
  freezesRemaining: number;
  repair: StreakRepair | null;
  longest: number;
}

export interface StreakDecisions {
  spendFreezeDays: number[];
  broke: { runStartDay: number; runEndDay: number; length: number; perfect: boolean } | null;
  openRepair: { brokenRunEndDay: number; brokenLength: number; chartsRequired: number } | null;
  redeemRepairId: string | null;
  expireRepairIds: string[];
}

const DAY_MS = 86_400_000;
void DAY_MS;

/** Charts to earn a broken run back. Scaled to what was lost, floored so it is never trivial. */
export function repairCost(brokenLength: number): number {
  return Math.min(30, Math.max(8, brokenLength * 2));
}

export function streakState(input: StreakInputs): {
  view: StreakView;
  decisions: StreakDecisions;
} {
  const { today, now } = input;

  const completions = new Set(input.completions);
  const freezes = new Set(input.freezes);

  const expireRepairIds = input.repairs
    .filter((r) => r.state === 'open' && now > r.expiresAt)
    .map((r) => r.id);
  const expired = new Set(expireRepairIds);

  // A redeemed repair bridges the days it covers, exactly like a freeze — except it also forfeits
  // the perfect state, because it was a break that got earned back rather than one that never
  // happened.
  const repaired = new Set<number>();
  for (const r of input.repairs) {
    if (r.state !== 'redeemed' || r.coversTo === null) continue;
    for (let d = r.coversFrom; d <= r.coversTo; d++) repaired.add(d);
  }

  const covered = (day: number) => completions.has(day) || freezes.has(day) || repaired.has(day);

  // The current run: the maximal island of consecutive covered days ending at the highest covered
  // day that is not in the future.
  let frontier: number | null = null;
  for (const day of completions) if (day <= today && (frontier === null || day > frontier)) frontier = day;
  for (const day of freezes) if (day <= today && (frontier === null || day > frontier)) frontier = day;
  for (const day of repaired) if (day <= today && (frontier === null || day > frontier)) frontier = day;

  let runStart: number | null = null;
  let length = 0;
  let perfect = true;
  if (frontier !== null) {
    let day = frontier;
    while (covered(day)) {
      if (completions.has(day)) length += 1;
      if (freezes.has(day) || repaired.has(day)) perfect = false;
      runStart = day;
      day -= 1;
    }
  }

  const decisions: StreakDecisions = {
    spendFreezeDays: [],
    broke: null,
    openRepair: null,
    redeemRepairId: null,
    expireRepairIds,
  };

  // An open repair whose quota is met redeems, bridging from the break to yesterday. The player
  // still has to complete today's daily to continue — earning it back restores the run, it does
  // not play the day for them.
  const open = input.repairs.find((r) => r.state === 'open' && !expired.has(r.id)) ?? null;
  if (open && open.chartsDone >= open.chartsRequired) {
    decisions.redeemRepairId = open.id;
  }

  let alive = frontier !== null && today <= frontier + 2;

  if (frontier !== null && !alive) {
    // Days F+1 .. today-2 are closed and uncovered; today-1 and today are still playable.
    const closedMissing = today - 2 - frontier;
    if (closedMissing > 0 && closedMissing <= input.freezesRemaining) {
      for (let d = frontier + 1; d <= today - 2; d++) decisions.spendFreezeDays.push(d);
      alive = true;
    } else if (closedMissing > 0) {
      // Never burn a mitigation on a gap it cannot bridge.
      decisions.broke = {
        runStartDay: runStart ?? frontier,
        runEndDay: frontier,
        length,
        perfect,
      };
      if (length >= 3 && !open) {
        decisions.openRepair = {
          brokenRunEndDay: frontier,
          brokenLength: length,
          chartsRequired: repairCost(length),
        };
      }
    }
  }

  const spent = decisions.spendFreezeDays.length;
  const effectiveFrontier =
    spent > 0 ? decisions.spendFreezeDays[decisions.spendFreezeDays.length - 1] : frontier;

  const view: StreakView = {
    length: decisions.broke ? 0 : length,
    frontier: decisions.broke ? null : effectiveFrontier,
    runStart: decisions.broke ? null : runStart,
    alive: !decisions.broke && alive,
    atRisk: !decisions.broke && alive && !completions.has(today),
    perfect: !decisions.broke && perfect && spent === 0 && length > 0,
    // The rescue day is the first uncovered one, which at today = F+2 is *yesterday*.
    requiredDay: decisions.broke ? today : effectiveFrontier === null ? today : effectiveFrontier + 1,
    deadlineDay: decisions.broke ? today + 1 : effectiveFrontier === null ? today + 1 : effectiveFrontier + 2,
    todayDone: completions.has(today),
    freezesRemaining: input.freezesRemaining - spent,
    repair: decisions.redeemRepairId ? null : open,
    longest: 0,
  };

  return { view, decisions };
}
