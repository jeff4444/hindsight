import { describe, expect, it } from 'vitest';
import { streakState, repairCost } from '@/core/streak';

/**
 * The 48-hour window is what makes this subtle.
 *
 * §10.1 keeps each daily open for two days, so a missed day cannot be declared missed the moment
 * it ends. With F as the frontier: the run is alive while today <= F + 2, it breaks at F + 3, and
 * the day that rescues it is F + 1 — which on the last possible day is *yesterday's* daily.
 *
 * The naive rule (`if (F < today - 1) break`) fails the case at today = F + 2 by killing a run
 * that is still recoverable, so that row is the one that matters most here.
 */
const base = { freezes: [], repairs: [], freezesRemaining: 2, now: 1_000 };

describe('the window', () => {
  it('is alive on the day after the frontier', () => {
    const { view } = streakState({ ...base, today: 11, completions: [9, 10] });
    expect(view.alive).toBe(true);
    expect(view.length).toBe(2);
    expect(view.requiredDay).toBe(11);
  });

  it('is still alive two days after the frontier — and points at yesterday, not today', () => {
    const { view, decisions } = streakState({ ...base, today: 12, completions: [9, 10] });
    expect(view.alive).toBe(true);
    expect(view.length).toBe(2);
    // The rescue is day 11. Playing day 12 instead starts an island of one and lets 11 close.
    expect(view.requiredDay).toBe(11);
    expect(view.deadlineDay).toBe(12);
    expect(decisions.spendFreezeDays).toEqual([]);
    expect(decisions.broke).toBeNull();
  });

  it('spends a freeze once the missed day has actually closed', () => {
    const { view, decisions } = streakState({ ...base, today: 13, completions: [9, 10] });
    expect(decisions.spendFreezeDays).toEqual([11]);
    expect(decisions.broke).toBeNull();
    expect(view.alive).toBe(true);
    expect(view.freezesRemaining).toBe(1);
    // A bridged run keeps its length: a freeze covers a day, it does not earn one.
    expect(view.length).toBe(2);
  });

  it('breaks rather than burning freezes on a gap it cannot bridge', () => {
    const { view, decisions } = streakState({
      ...base,
      today: 20,
      completions: [9, 10, 11],
      freezesRemaining: 2,
    });
    expect(decisions.spendFreezeDays).toEqual([]);
    expect(decisions.broke).toMatchObject({ runEndDay: 11, length: 3, perfect: true });
    expect(view.alive).toBe(false);
    expect(view.length).toBe(0);
    expect(view.freezesRemaining).toBe(2);
  });
});

describe('the gold state', () => {
  it('holds while no freeze or repair is inside the run', () => {
    const { view } = streakState({ ...base, today: 12, completions: [10, 11, 12] });
    expect(view.perfect).toBe(true);
    expect(view.todayDone).toBe(true);
  });

  it('is forfeited by a freeze inside the run', () => {
    const { view } = streakState({
      ...base,
      today: 12,
      completions: [9, 11, 12],
      freezes: [10],
    });
    expect(view.length).toBe(3);
    expect(view.perfect).toBe(false);
  });

  it('is not claimed by a player with no run at all', () => {
    const { view } = streakState({ ...base, today: 12, completions: [] });
    expect(view.perfect).toBe(false);
    expect(view.length).toBe(0);
  });
});

describe('earn-back', () => {
  it('is offered only for a run worth mourning', () => {
    const short = streakState({ ...base, today: 30, completions: [10, 11] });
    expect(short.decisions.openRepair).toBeNull();

    const long = streakState({ ...base, today: 30, completions: [10, 11, 12, 13] });
    expect(long.decisions.openRepair).toMatchObject({ brokenLength: 4, chartsRequired: 8 });
  });

  it('scales the cost with what was lost, and caps it', () => {
    expect(repairCost(3)).toBe(8);
    expect(repairCost(10)).toBe(20);
    expect(repairCost(40)).toBe(30);
  });

  it('redeems once the quota is met', () => {
    const { decisions } = streakState({
      ...base,
      today: 30,
      completions: [10, 11, 12],
      repairs: [
        {
          id: 'r1',
          state: 'open',
          coversFrom: 13,
          coversTo: null,
          chartsRequired: 8,
          chartsDone: 8,
          expiresAt: 10_000,
        },
      ],
    });
    expect(decisions.redeemRepairId).toBe('r1');
  });

  it('expires an offer nobody took', () => {
    const { decisions } = streakState({
      ...base,
      now: 20_000,
      today: 30,
      completions: [10, 11, 12],
      repairs: [
        {
          id: 'r1',
          state: 'open',
          coversFrom: 13,
          coversTo: null,
          chartsRequired: 8,
          chartsDone: 2,
          expiresAt: 10_000,
        },
      ],
    });
    expect(decisions.expireRepairIds).toEqual(['r1']);
  });
});

describe('a fresh player', () => {
  it('has two freezes and is pointed at today', () => {
    const { view } = streakState({ ...base, today: 7, completions: [] });
    expect(view.length).toBe(0);
    expect(view.freezesRemaining).toBe(2);
    expect(view.requiredDay).toBe(7);
    expect(view.todayDone).toBe(false);
  });
});
