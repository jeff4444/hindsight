import { describe, expect, it } from 'vitest';
import {
  STORM_SPEC,
  STREAK_SPEC,
  beatsMedian,
  isComboRung,
  newStorm,
  newStreak,
  stormAfter,
  streakAfter,
  type RunOutcome,
} from '@/core/run';

/**
 * Storm and Streak, and mostly the one rule §10.1 does not contain.
 *
 * Both modes score "beat the distribution median", and **a pass beats the median on 95% of charts** —
 * `par_r` is negative on 950 of 1,000, mean −0.792R, while a pass is exactly 0R. So the specification
 * as written is farmable by passing in both modes, and most of what follows is the audit of the
 * rationing that fixes it.
 */

const beat: RunOutcome = { beatMedian: true, stoppedOut: false, passed: false };
const missed: RunOutcome = { beatMedian: false, stoppedOut: false, passed: false };
const stopped: RunOutcome = { beatMedian: false, stoppedOut: true, passed: false };
const passed: RunOutcome = { beatMedian: true, stoppedOut: false, passed: true };

/** Run `n` beating charts through a fresh Storm, clock untouched. */
function stormRun(outcomes: RunOutcome[]) {
  let state = newStorm();
  for (const outcome of outcomes) state = stormAfter(state, outcome, state.remainingMs);
  return state;
}

describe('a pass cannot be farmed, which is the whole difficulty', () => {
  it('scores nothing in Storm, however many times it is used', () => {
    // Without this the dominant strategy is to pass every chart: a pass is 0R and the median
    // bracket loses money on 95% of charts, so passing would score +1 almost every time.
    const state = stormRun(Array.from({ length: 20 }, () => passed));
    expect(state.score).toBe(0);
    expect(state.charts).toBe(20);
  });

  it('does not break a Storm combo either', () => {
    // Passing did not fail — it declined. Ending a run of twelve because a player correctly stood
    // aside would punish the exact move §4.4 rewards.
    const state = stormRun([beat, beat, beat, passed, beat]);
    expect(state.combo).toBe(4);
  });

  it('spends the single skip in Streak, and the next one ends the run', () => {
    // §10.1's own rule, and the thing that turns restraint from a strategy into a resource.
    let state = newStreak();
    expect(state.skipsLeft).toBe(STREAK_SPEC.skips);

    state = streakAfter(state, passed);
    expect(state.skipsLeft).toBe(0);
    expect(state.alive).toBe(true);

    state = streakAfter(state, passed);
    expect(state.alive).toBe(false);
  });

  it('ends the run rather than rejecting a skipless pass', () => {
    // A rejected move would let a player sit on a chart they disliked until the mode offered a
    // different one, which is cherry-picking with extra steps — a risk §15 names in its own right.
    let state = newStreak();
    state = streakAfter(state, passed);
    const dead = streakAfter(state, passed);
    expect(dead.alive).toBe(false);
    expect(dead.charts).toBe(2);
  });
});

describe('Storm’s clock is the resource, and the penalty is on the stop', () => {
  it('takes ten seconds off for a stop-out', () => {
    const state = stormAfter(newStorm(), stopped, STORM_SPEC.durationMs);
    expect(state.remainingMs).toBe(STORM_SPEC.durationMs - STORM_SPEC.stopPenaltyMs);
    expect(state.score).toBe(0);
  });

  it('does not penalise a loss that was not a stop-out', () => {
    // §10.1 penalises the stop, not the red number. A timeout that finished slightly below par is
    // a different mistake and the mode does not charge for it.
    const state = stormAfter(newStorm(), missed, STORM_SPEC.durationMs);
    expect(state.remainingMs).toBe(STORM_SPEC.durationMs);
  });

  it('ends when the penalty runs the clock out, and never goes negative', () => {
    const state = stormAfter(newStorm(), stopped, 4_000);
    expect(state.remainingMs).toBe(0);
    expect(state.over).toBe(true);
  });

  it('accepts nothing once it is over', () => {
    const over = stormAfter(newStorm(), stopped, 1_000);
    expect(stormAfter(over, beat, 60_000)).toBe(over);
  });
});

describe('the combo ladder is §10.1’s, and pays the rung', () => {
  it('rings at 5, 12, 20, 30 and every ten after', () => {
    for (const rung of [5, 12, 20, 30, 40, 50, 100]) expect(isComboRung(rung)).toBe(true);
    for (const notRung of [1, 4, 6, 11, 13, 19, 21, 31, 35, 41]) expect(isComboRung(notRung)).toBe(false);
  });

  it('pays one a chart plus the rung when it is reached', () => {
    // Five in a row: five points for the charts, plus a bonus of five for the rung.
    const state = stormRun(Array.from({ length: 5 }, () => beat));
    expect(state.combo).toBe(5);
    expect(state.score).toBe(5 + 5);
  });

  it('is superlinear across a long run, which is §10.1’s stated intent', () => {
    // 12 charts: 12 points, plus rungs at 5 and 12 = 17 bonus. A run twice as long is worth more
    // than twice as much, which is the "one more run" pull the mode is built around.
    const twelve = stormRun(Array.from({ length: 12 }, () => beat));
    const six = stormRun(Array.from({ length: 6 }, () => beat));
    expect(twelve.score).toBe(12 + 5 + 12);
    expect(twelve.score).toBeGreaterThan(2 * six.score);
  });

  it('resets the combo on a miss but keeps the best', () => {
    const state = stormRun([beat, beat, beat, beat, beat, missed, beat]);
    expect(state.combo).toBe(1);
    expect(state.bestCombo).toBe(5);
    expect(state.score).toBe(5 + 5 + 1);
  });
});

describe('Streak ends on the first sub-median result', () => {
  it('counts a run and remembers the best', () => {
    let state = newStreak();
    for (let i = 0; i < 7; i++) state = streakAfter(state, beat);
    expect(state.length).toBe(7);
    expect(state.best).toBe(7);
    expect(state.alive).toBe(true);
  });

  it('dies on a miss, and stays dead', () => {
    let state = newStreak();
    state = streakAfter(state, beat);
    state = streakAfter(state, missed);
    expect(state.alive).toBe(false);
    expect(state.best).toBe(1);

    const frozen = streakAfter(state, beat);
    expect(frozen.length).toBe(1);
    expect(frozen.alive).toBe(false);
  });

  it('dies on a stop-out below par like any other miss', () => {
    expect(streakAfter(newStreak(), stopped).alive).toBe(false);
  });
});

describe('both modes agree what beating the median means', () => {
  it('compares the net result against the chart’s own par', () => {
    expect(beatsMedian(0.5, -0.8)).toBe(true);
    expect(beatsMedian(-1, -0.8)).toBe(false);
    // The equality case is a miss: "beat" is strict, so matching par is not beating it.
    expect(beatsMedian(-0.8, -0.8)).toBe(false);
  });

  it('treats a pass as 0R, which is what makes it clear the bar so often', () => {
    // The measured fact behind every rationing rule above: par is negative on 95% of charts.
    expect(beatsMedian(null, -0.792)).toBe(true);
    expect(beatsMedian(null, 0.2)).toBe(false);
  });

  it('refuses to judge a chart with no par rather than guessing', () => {
    // A chart that predates the achievable set has no median to beat. Counting that as a win would
    // hand a free point; counting it as a loss would end a streak on a missing column.
    expect(beatsMedian(2, null)).toBe(false);
  });
});
