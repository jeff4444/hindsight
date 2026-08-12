import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/bars';
import { STOP_ATR_MULTIPLES } from '@/core/achievable';
import {
  MANAGE_GRID_SIZE,
  MANAGE_POLICIES,
  enumerateManaged,
  resolveManaged,
  resolvePlayerManaged,
} from '@/core/manage';
import { InvalidOrderError, NO_COSTS } from '@/core/resolve';

/**
 * Manage's achievable set.
 *
 * The reason this exists before any Manage screen does: perfect management beats the best of §1's 98
 * brackets on **79% of charts**, so a managed trade would score 100th percentile almost every round
 * against the existing grid. These tests are about the properties that make a *replacement* grid
 * usable as a score — the stop only ever tightens, R keeps its initial-risk denominator, and the
 * pessimistic within-bar convention survives management rather than being quietly relaxed by it.
 */

/** A path of one-minute bars from a list of closes, with a small symmetric wick. */
function path(closes: number[], wick = 0.05): Bar[] {
  return closes.map((c, i, all) => {
    const o = i === 0 ? c : all[i - 1];
    return { o, h: Math.max(o, c) + wick, l: Math.min(o, c) - wick, c, v: 1 };
  });
}

const HOLD = MANAGE_POLICIES[0];
const TRAIL1 = MANAGE_POLICIES[1];
const BREAKEVEN = MANAGE_POLICIES[4];
const PARTIAL = MANAGE_POLICIES[6];

describe('the grid is the same size as the one it replaces', () => {
  it('is 98 cells, so a percentile means the same on both ladders', () => {
    // The phase's exit condition is a correlation between the Naked and Manage ratings. Two grids
    // of different sizes would make that correlation partly an artefact of resolution.
    expect(MANAGE_GRID_SIZE).toBe(98);
    expect(MANAGE_POLICIES).toHaveLength(7);
    expect(STOP_ATR_MULTIPLES).toHaveLength(7);
  });

  it('opens with a do-nothing policy, which is the floor the rest are measured against', () => {
    // Without it every cell is a managed trade and a badly managed one still ranks above a floor
    // that does not exist in the distribution.
    expect(HOLD.breakevenAtR).toBeNull();
    expect(HOLD.trailAtr).toBeNull();
    expect(HOLD.partialAtR).toBeNull();
  });

  it('enumerates every combination, in the canonical order', () => {
    const cells = enumerateManaged(100, 1, path([100, 101, 102, 101, 103]));
    expect(cells).toHaveLength(MANAGE_GRID_SIZE);
    expect(cells[0].direction).toBe('long');
    expect(cells[0].stopAtr).toBe(STOP_ATR_MULTIPLES[0]);
    expect(cells[0].policy).toBe(0);
    // Direction-major, then stop, then policy.
    expect(cells[MANAGE_POLICIES.length].stopAtr).toBe(STOP_ATR_MULTIPLES[1]);
    expect(cells[cells.length - 1].direction).toBe('short');
  });
});

describe('the stop only ever moves in the trade’s favour', () => {
  it('never widens, because R is defined by the initial risk', () => {
    // §4.1: R is the *initial* risk. A stop that could widen would change the denominator after the
    // fact and make every R on the ladder incomparable. Price runs up then collapses; a trailing
    // stop must catch it above the original level rather than reverting.
    const bars = path([100, 104, 108, 112, 90]);
    const trailing = resolveManaged({ entry: 100, stop: 98 }, bars, TRAIL1, 1, NO_COSTS);
    const holding = resolveManaged({ entry: 100, stop: 98 }, bars, HOLD, 1, NO_COSTS);
    expect(trailing.rMultiple).toBeGreaterThan(holding.rMultiple);
    expect(trailing.trailed).toBe(true);
  });

  it('reports a breakeven stop as a real outcome rather than a loss', () => {
    // Up 1R, then straight back through entry. Breakeven-at-1R should exit at about zero, while
    // holding eats the full stop.
    const bars = path([100, 101, 102, 99, 97, 95]);
    const flat = resolveManaged({ entry: 100, stop: 98 }, bars, BREAKEVEN, 1, NO_COSTS);
    const held = resolveManaged({ entry: 100, stop: 98 }, bars, HOLD, 1, NO_COSTS);
    expect(flat.rMultiple).toBeGreaterThan(-0.2);
    expect(held.rMultiple).toBeCloseTo(-1, 1);
  });

  it('does not call risk reduction a locked-in gain', () => {
    // A trail that has only moved the stop from −2 ATR to −1.5 is still a losing stop. The flag the
    // UI reads must mean "past breakeven", not "moved".
    const bars = path([100, 100.4, 100.2, 100.1]);
    const result = resolveManaged({ entry: 100, stop: 96 }, bars, MANAGE_POLICIES[3], 1, NO_COSTS);
    expect(result.trailed).toBe(false);
  });
});

describe('scaling out banks half and lets the rest run', () => {
  it('splits the result between the two halves', () => {
    // Half off at 1R, then the remainder stopped at breakeven: about +0.5R overall, not +1 and not 0.
    const bars = path([100, 101, 102, 103, 99, 95]);
    const result = resolveManaged({ entry: 100, stop: 98 }, bars, PARTIAL, 1, NO_COSTS);
    expect(result.scaledOut).toBe(true);
    expect(result.rMultiple).toBeGreaterThan(0.3);
    expect(result.rMultiple).toBeLessThan(0.8);
  });

  it('banks the half at the level the rule names, not at the trailing stop', () => {
    // The order of operations inside a bar matters: scaling out is checked before the stop moves,
    // so the half comes off at 1R rather than wherever the trail had dragged the stop to.
    const bars = path([100, 102, 104, 106]);
    const result = resolveManaged({ entry: 100, stop: 98 }, bars, PARTIAL, 1, NO_COSTS);
    expect(result.scaledOut).toBe(true);
    expect(result.rMultiple).toBeGreaterThan(1);
  });
});

describe('the pessimistic conventions survive management', () => {
  it('tests the stop before anything else in the bar', () => {
    // §12.3.2's stop-first rule. Management makes it matter more: a trailing stop is hit far more
    // often than a fixed one, so a generous within-bar reading would inflate every managed result.
    // This bar reaches +3R and also takes out the stop; the pessimistic reading is the stop.
    const bars: Bar[] = [{ o: 100, h: 103, l: 97, c: 100, v: 1 }];
    const result = resolveManaged({ entry: 100, stop: 98 }, bars, TRAIL1, 1, NO_COSTS);
    expect(result.outcome).toBe('stop');
    expect(result.rMultiple).toBeCloseTo(-1, 1);
  });

  it('marks an unstopped position to the last close, like a timeout', () => {
    const bars = path([100, 101, 102]);
    const result = resolveManaged({ entry: 100, stop: 98 }, bars, HOLD, 1, NO_COSTS);
    expect(result.outcome).toBe('timeout');
    expect(result.rMultiple).toBeCloseTo(1, 1);
  });

  it('charges costs the same way the static resolver does', () => {
    // A managed ladder scored gross against a static ladder scored net would hand Manage §16.1's
    // whole cost gradient for free, and the two ratings would not be comparable.
    const bars = path([100, 101, 102]);
    const gross = resolveManaged({ entry: 100, stop: 98 }, bars, HOLD, 1, NO_COSTS);
    const net = resolveManaged({ entry: 100, stop: 98 }, bars, HOLD, 1, {
      spreadBps: 10,
      stopSlippageBps: 5,
    });
    expect(net.rMultiple).toBeLessThan(gross.rMultiple);
  });
});

describe('it refuses rather than guessing', () => {
  it('will not resolve against an empty path', () => {
    expect(() => resolveManaged({ entry: 100, stop: 98 }, [], HOLD, 1)).toThrow(InvalidOrderError);
  });

  it('will not resolve a zero-risk order or a missing ATR', () => {
    const bars = path([100, 101]);
    expect(() => resolveManaged({ entry: 100, stop: 100 }, bars, HOLD, 1)).toThrow(InvalidOrderError);
    expect(() => resolveManaged({ entry: 100, stop: 98 }, bars, HOLD, 0)).toThrow(InvalidOrderError);
  });

  it('returns an empty grid rather than a partial one', () => {
    expect(enumerateManaged(100, 0, path([100, 101]))).toEqual([]);
    expect(enumerateManaged(100, 1, [])).toEqual([]);
  });
});

describe('management is worth something, which is the premise of the ladder', () => {
  it('beats holding on a trend that gives back its gains', () => {
    // The measured claim from the research, in miniature: 79% of charts contain value a
    // set-and-forget bracket cannot capture. A run that reverses is the simplest case of it.
    const bars = path([100, 103, 106, 109, 112, 100, 99]);
    const held = resolveManaged({ entry: 100, stop: 98 }, bars, HOLD, 1, NO_COSTS);
    for (const policy of [TRAIL1, MANAGE_POLICIES[2], PARTIAL]) {
      expect(resolveManaged({ entry: 100, stop: 98 }, bars, policy, 1, NO_COSTS).rMultiple)
        .toBeGreaterThan(held.rMultiple);
    }
  });

  it('costs something on a trade that never reverses', () => {
    // The honest other half: trailing a stop into a clean trend exits early for less than holding.
    // A grid where management always won would be a grid that had smuggled in hindsight.
    const bars = path([100, 102, 104, 106, 108, 110]);
    const held = resolveManaged({ entry: 100, stop: 98 }, bars, HOLD, 1, NO_COSTS);
    const trailed = resolveManaged({ entry: 100, stop: 98 }, bars, TRAIL1, 1, NO_COSTS);
    expect(trailed.rMultiple).toBeLessThanOrEqual(held.rMultiple);
  });
});

describe('a player’s managed trade is walked by the same rules as the grid', () => {
  it('cannot out-click a stop the bar had already run through', () => {
    // The player watches bar i print, then clicks. If that bar had already taken the stop out, the
    // position was closed before the click arrived. Applying the action first would be exactly the
    // generous within-bar reading §12.3.2 forbids, and it would be worth a lot: every loss becomes
    // avoidable by clicking fast.
    const bars: Bar[] = [{ o: 100, h: 101, l: 97, c: 100, v: 1 }];
    const saved = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [
      { atPathIndex: 0, action: { kind: 'exit' } },
    ], 1, NO_COSTS);
    expect(saved.outcome).toBe('stop');
    expect(saved.rMultiple).toBeCloseTo(-1, 1);
  });

  it('refuses a stop that widens, rather than clamping it', () => {
    // R is the *initial* risk (§4.1). A player who could walk the stop away from entry would never
    // take a loss, and the denominator would stop meaning anything.
    const bars = path([100, 99.5, 99, 97.5, 96]);
    const widened = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [
      { atPathIndex: 1, action: { kind: 'stop', price: 90 } },
    ], 1, NO_COSTS);
    const untouched = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [], 1, NO_COSTS);
    expect(widened.rMultiple).toBeCloseTo(untouched.rMultiple, 9);
    expect(widened.outcome).toBe('stop');
  });

  it('accepts a stop that tightens, and calls it trailing only past breakeven', () => {
    const bars = path([100, 102, 104, 103, 101]);
    const result = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [
      { atPathIndex: 2, action: { kind: 'stop', price: 102 } },
    ], 1, NO_COSTS);
    expect(result.trailed).toBe(true);
    expect(result.rMultiple).toBeGreaterThan(0.5);

    const risk = resolvePlayerManaged({ entry: 100, stop: 96 }, bars, [
      { atPathIndex: 1, action: { kind: 'stop', price: 97 } },
    ], 1, NO_COSTS);
    expect(risk.trailed).toBe(false);
  });

  it('scales out once and once only', () => {
    // Repeated partials would be position sizing rather than management, and the grid has no cell
    // that does it — so a player doing it would be ranked against a distribution containing nothing
    // comparable.
    const bars = path([100, 102, 104, 106]);
    const once = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [
      { atPathIndex: 1, action: { kind: 'partial' } },
    ], 1, NO_COSTS);
    const thrice = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [
      { atPathIndex: 1, action: { kind: 'partial' } },
      { atPathIndex: 2, action: { kind: 'partial' } },
      { atPathIndex: 3, action: { kind: 'partial' } },
    ], 1, NO_COSTS);
    expect(thrice.rMultiple).toBeCloseTo(once.rMultiple, 9);
    expect(thrice.scaledOut).toBe(true);
  });

  it('exits at the close of the bar the click arrived on', () => {
    const bars = path([100, 103, 96]);
    const exited = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [
      { atPathIndex: 1, action: { kind: 'exit' } },
    ], 1, NO_COSTS);
    expect(exited.exitPathIndex).toBe(1);
    expect(exited.rMultiple).toBeCloseTo(1.5, 1);
  });

  it('reproduces a grid policy exactly when the player plays that policy', () => {
    // The strongest available check that the two walks share their conventions: drive the player
    // resolver with the events a mechanical rule would have generated and the results must agree.
    // If these two ever diverge, the ladder is ranking a player against a distribution built by
    // different arithmetic.
    const bars = path([100, 101, 102, 103, 102, 101, 100, 99]);
    const atr = 1;
    const grid = resolveManaged({ entry: 100, stop: 98 }, bars, MANAGE_POLICIES[0], atr, NO_COSTS);
    const player = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [], atr, NO_COSTS);
    expect(player.rMultiple).toBeCloseTo(grid.rMultiple, 9);
    expect(player.exitPathIndex).toBe(grid.exitPathIndex);
    expect(player.riskPerUnit).toBeCloseTo(grid.riskPerUnit, 9);
  });

  it('charges costs the same way the grid does', () => {
    const bars = path([100, 101, 102]);
    const gross = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [], 1, NO_COSTS);
    const net = resolvePlayerManaged({ entry: 100, stop: 98 }, bars, [], 1, {
      spreadBps: 10,
      stopSlippageBps: 5,
    });
    expect(net.rMultiple).toBeLessThan(gross.rMultiple);
  });
});
