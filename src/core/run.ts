/**
 * Storm and Streak — §10.1's two rep generators, and the rule that stops both being farmed.
 *
 * | | §10.1 |
 * | --- | --- |
 * | **Storm** | *"Three-minute clock. +1 per chart where you beat the distribution median. −10 seconds when stopped out. Combo bonuses at 5, 12, 20 and 30 and every 10 thereafter."* |
 * | **Streak** | *"Untimed. The run ends on the first sub-median result. One skip per run."* |
 *
 * They exist because one chart a day cannot produce a thousand reps: §3 reclassifies the daily as a
 * distribution mechanism and promotes these from "later" to core, because every unanswered question
 * in this project is waiting on volume. Calibration needs 30 forecasts before it will speak (§18),
 * the style fingerprint needs 152 rounds (§17.4), and §7.2's synthetic-control comparison needs more
 * than either.
 *
 * ## The rule §10.1 does not contain, and both modes need
 *
 * Both are scored on *beating the distribution median* — `par_r`, the median of the 98 enumerated
 * brackets. Measured over the corpus, net of costs:
 *
 * > **`par_r` is negative on 95.0% of charts**, mean −0.792R. A pass scores exactly 0R.
 *
 * So **a pass beats the median on 95 charts in 100**, and both modes as written are trivially
 * farmed: pass every chart in Storm for +1 each, or pass forever in Streak and never post a
 * sub-median result. Neither is a bug in the scoring — §4.4 means it when it says restraint is a
 * real move, and §16.1 measured that the median bracket loses money. It is a bug in using "beat the
 * median" as a *game* objective without saying what a pass does.
 *
 * Streak already carries its own fix and §10.1 supplies it: **one skip per run**. That is the pass,
 * rationed.
 *
 * Storm has no such limit in the specification, so one is added here and marked as ours: **a pass
 * scores nothing.** Not a point, not a penalty, just the clock. Passing then costs exactly what it
 * should — time — and a player who passes everything finishes a three-minute run on zero.
 */

/** Frozen on the §14 pattern: these decide every score either mode will ever produce. */
export const STORM_SPEC = {
  /** §10.1's three minutes. */
  durationMs: 3 * 60 * 1000,
  /** §10.1: ten seconds off the clock for a stop-out. Theirs. */
  stopPenaltyMs: 10_000,
  /**
   * §10.1's combo ladder: 5, 12, 20, 30, then every 10.
   *
   * The bonus at each rung is **the rung itself** — five in a row pays 5, twelve pays 12 — which is
   * ours. §10.1 asks for "a flat penalty against a superlinear bonus" and does not say what the
   * bonus is; paying the rung makes the *cumulative* reward grow faster than the run length while
   * staying a number a player can compute in their head mid-run.
   */
  comboRungs: [5, 12, 20, 30] as const,
  comboEveryAfter: 10,
  /**
   * **Ours, and not in §10.1.** A pass scores nothing — see the header. Without it the dominant
   * strategy is to pass every chart, because a pass beats the median on 95% of them.
   */
  passScores: 0,
} as const;

export const STREAK_SPEC = {
  /** §10.1's one skip. It is also what stops the run being farmed by passing. */
  skips: 1,
} as const;

/** What a finished round was, in the only terms a run cares about. */
export interface RunOutcome {
  /** Did the result beat `par_r`? A pass is 0R, which usually does. */
  beatMedian: boolean;
  /** Stop-out specifically, not merely a loss. §10.1 penalises the stop, not the red number. */
  stoppedOut: boolean;
  passed: boolean;
}

/* --------------------------------------------------------------------- Storm */

export interface StormState {
  score: number;
  combo: number;
  bestCombo: number;
  charts: number;
  /** Milliseconds remaining when the run last advanced. The server owns the wall clock. */
  remainingMs: number;
  over: boolean;
}

export function newStorm(): StormState {
  return {
    score: 0,
    combo: 0,
    bestCombo: 0,
    charts: 0,
    remainingMs: STORM_SPEC.durationMs,
    over: false,
  };
}

/** Is `n` a combo rung? 5, 12, 20, 30, 40, 50, … */
export function isComboRung(n: number): boolean {
  if ((STORM_SPEC.comboRungs as readonly number[]).includes(n)) return true;
  const last = STORM_SPEC.comboRungs[STORM_SPEC.comboRungs.length - 1];
  return n > last && (n - last) % STORM_SPEC.comboEveryAfter === 0;
}

/**
 * One chart's effect on a Storm run.
 *
 * `remainingMs` is passed in rather than derived, because only the server knows what time it is —
 * the same argument §17.5 makes for Manage. This function decides *what the result is worth*; the
 * clock belongs to the caller.
 */
export function stormAfter(state: StormState, outcome: RunOutcome, remainingMs: number): StormState {
  if (state.over) return state;

  // A pass costs the clock and nothing else. See the header: without this, passing every chart
  // scores +1 on 95% of them.
  if (outcome.passed) {
    return {
      ...state,
      charts: state.charts + 1,
      // A pass does not break a combo either — it did not fail, it declined. Ending a run of
      // twelve because a player correctly stood aside would punish the one move §4.4 rewards.
      remainingMs: Math.max(0, remainingMs),
      over: remainingMs <= 0,
    };
  }

  const penalised = outcome.stoppedOut ? remainingMs - STORM_SPEC.stopPenaltyMs : remainingMs;
  const combo = outcome.beatMedian ? state.combo + 1 : 0;
  const bonus = outcome.beatMedian && isComboRung(combo) ? combo : 0;

  return {
    score: state.score + (outcome.beatMedian ? 1 + bonus : 0),
    combo,
    bestCombo: Math.max(state.bestCombo, combo),
    charts: state.charts + 1,
    remainingMs: Math.max(0, penalised),
    over: penalised <= 0,
  };
}

/* -------------------------------------------------------------------- Streak */

export interface StreakState {
  length: number;
  best: number;
  skipsLeft: number;
  charts: number;
  alive: boolean;
}

export function newStreak(): StreakState {
  return { length: 0, best: 0, skipsLeft: STREAK_SPEC.skips, charts: 0, alive: true };
}

/**
 * One chart's effect on a Streak run.
 *
 * A pass spends the skip. That is §10.1's own rule and it is also the thing that makes the mode a
 * game: without it a player passes for ever and never posts a sub-median result, because a pass
 * beats the median on 95% of charts. With one skip, restraint is a resource rather than a strategy.
 *
 * A pass with no skip left **ends the run**, rather than being rejected. A rejected move would let a
 * player sit on a chart they did not like until the mode gave them a different one, which is
 * cherry-picking with extra steps — §15 of the scope names it as a risk in its own right.
 */
export function streakAfter(state: StreakState, outcome: RunOutcome): StreakState {
  if (!state.alive) return state;

  if (outcome.passed) {
    if (state.skipsLeft <= 0) {
      return { ...state, charts: state.charts + 1, alive: false };
    }
    return { ...state, charts: state.charts + 1, skipsLeft: state.skipsLeft - 1 };
  }

  if (!outcome.beatMedian) {
    return { ...state, charts: state.charts + 1, alive: false };
  }

  const length = state.length + 1;
  return { ...state, length, best: Math.max(state.best, length), charts: state.charts + 1 };
}

/**
 * Whether a finished round beat the chart's median.
 *
 * One place, so the two modes cannot disagree about what "beat the median" means. `parR` is the
 * median of the 98 enumerated brackets — §1's `par_r`, net of costs since §16.1 — and a pass is 0R
 * by §4.4, which is why it clears the bar on 95% of charts and why both modes ration it.
 */
export function beatsMedian(rMultiple: number | null, parR: number | null): boolean {
  if (parR === null) return false;
  return (rMultiple ?? 0) > parR;
}
