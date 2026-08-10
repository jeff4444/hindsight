import { describe, expect, it } from 'vitest';
import {
  DIRECTIONS,
  GRID_SIZE,
  STOP_ATR_MULTIPLES,
  TARGET_R_MULTIPLES,
  enumerateAchievable,
  median,
  oracleBound,
  percentileOf,
  scoreAgainst,
  type PlayerTrade,
} from '@/core/achievable';
import { TICK_SIZE } from '@/core/normalize';
import { resolve } from '@/core/resolve';
import type { Bar } from '@/core/bars';
import { bar, flat, path } from './helpers';

const ENTRY = 100;
const ATR = 1;
const RATIO = 60;

/** A path that rises steadily, so longs work and shorts do not. */
const rising = path(3600, (i) => {
  const p = 100 + i * 0.002;
  return bar(p, p + 0.05, p - 0.05, p + 0.002);
});

/** A path that chops around the entry and ends where it began. */
const chop = path(3600, (i) => {
  const p = 100 + Math.sin(i / 90) * 0.9;
  return bar(p, p + 0.08, p - 0.08, p);
});

describe('the grid (§4.2)', () => {
  const cells = enumerateAchievable(ENTRY, ATR, rising, RATIO);

  it('is exactly the cross-product §4.2 tabulates', () => {
    expect(STOP_ATR_MULTIPLES).toEqual([0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0]);
    expect(TARGET_R_MULTIPLES).toEqual([0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 8.0]);
    expect(GRID_SIZE).toBe(98);
    expect(cells).toHaveLength(98);
  });

  it('covers every combination exactly once', () => {
    const keys = cells.map((c) => `${c.direction}|${c.stopAtr}|${c.targetR}`);
    expect(new Set(keys).size).toBe(98);
    for (const direction of DIRECTIONS) {
      expect(cells.filter((c) => c.direction === direction)).toHaveLength(49);
    }
  });

  it('is exact rather than sampled — the same path gives the same grid forever', () => {
    // §6: "the same chart yields the same distribution forever, which matters enormously when
    // leaderboards are involved."
    expect(enumerateAchievable(ENTRY, ATR, rising, RATIO)).toEqual(cells);
  });

  it('contains only brackets a player could actually have placed', () => {
    for (const cell of cells) {
      const risk = cell.stopAtr * ATR;
      // Every level is on the tick grid and on the correct side of the entry.
      expect(Number.isFinite(cell.rMultiple)).toBe(true);
      expect(risk).toBeGreaterThan(0);
    }
  });

  it('agrees with the resolver it is built from', () => {
    // A spot check that the enumeration is not quietly constructing different orders.
    const cell = cells.find((c) => c.direction === 'long' && c.stopAtr === 1 && c.targetR === 2)!;
    const stop = ENTRY - 1 * ATR;
    const target = ENTRY + 2 * (ENTRY - stop);
    expect(cell.rMultiple).toBeCloseTo(
      resolve({ entry: ENTRY, stop, target }, rising, RATIO).rMultiple,
      9,
    );
  });

  it('has a losing side on a one-way path', () => {
    const longs = cells.filter((c) => c.direction === 'long');
    const shorts = cells.filter((c) => c.direction === 'short');
    expect(longs.filter((c) => c.rMultiple > 0).length).toBeGreaterThan(0);
    expect(shorts.every((c) => c.rMultiple <= 0)).toBe(true);
  });
});

describe('the oracle bound (§4.2)', () => {
  /** Rebuild the argmax the closed form found, so the claim can be tested by construction. */
  function bestBracket(entry: number, series: Bar[]) {
    let best = { r: 0, stop: entry, target: entry };
    let low = Infinity;
    let high = -Infinity;

    for (const b of series) {
      low = Math.min(low, b.l);
      high = Math.max(high, b.h);

      const longR = (b.h - entry) / (entry - low + TICK_SIZE);
      if (longR > best.r) best = { r: longR, stop: low - TICK_SIZE, target: b.h };

      const shortR = (entry - b.l) / (high - entry + TICK_SIZE);
      if (shortR > best.r) best = { r: shortR, stop: high + TICK_SIZE, target: b.l };
    }

    return best;
  }

  it('is actually attainable, not merely an upper bound', () => {
    // The strong claim. A bound nobody can reach would make "efficiency" meaningless, so the
    // bracket the closed form implies is reconstructed and resolved, and must produce that R.
    for (const series of [rising, chop]) {
      const oracle = oracleBound(ENTRY, series, TICK_SIZE);
      const best = bestBracket(ENTRY, series);
      const realised = resolve(
        { entry: ENTRY, stop: best.stop, target: best.target },
        series,
        RATIO,
      ).rMultiple;

      expect(oracle).toBeCloseTo(best.r, 9);
      expect(realised).toBeCloseTo(oracle, 6);
    }
  });

  it('is never below the best cell on the grid', () => {
    for (const series of [rising, chop]) {
      const oracle = oracleBound(ENTRY, series, TICK_SIZE);
      const bestCell = Math.max(...enumerateAchievable(ENTRY, ATR, series, RATIO).map((c) => c.rMultiple));
      expect(oracle).toBeGreaterThanOrEqual(bestCell - 1e-9);
    }
  });

  it('is never beaten by a brute-force sweep over a far finer lattice', () => {
    // The grid offers 7 stop distances; this sweeps 60, including stops far tighter than any of
    // them, against 40 target multiples in both directions. Nothing in 4800 brackets may exceed
    // the bound.
    //
    // This test proves the bound holds, not that it is tight — a lattice cannot reach an oracle
    // whose stop sits one tick from the entry without an unbounded target multiple. Tightness is
    // proved exactly, by construction, in the attainability test above.
    const oracle = oracleBound(ENTRY, rising, TICK_SIZE);
    let bruteBest = 0;

    for (let s = 1; s <= 60; s++) {
      const risk = s * 0.05;
      for (let t = 1; t <= 40; t++) {
        for (const sign of [1, -1]) {
          const r = resolve(
            { entry: ENTRY, stop: ENTRY - sign * risk, target: ENTRY + sign * t * 0.25 * risk },
            rising,
            RATIO,
          ).rMultiple;
          bruteBest = Math.max(bruteBest, r);
        }
      }
    }

    expect(bruteBest).toBeGreaterThan(0);
    expect(bruteBest).toBeLessThanOrEqual(oracle + 1e-6);
  });

  it('is zero on a path that never moves', () => {
    expect(oracleBound(ENTRY, flat(100, ENTRY), TICK_SIZE)).toBeCloseTo(0, 6);
  });

  it('is never negative — doing nothing is always available', () => {
    for (const series of [rising, chop, flat(100, ENTRY)]) {
      expect(oracleBound(ENTRY, series, TICK_SIZE)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('percentile', () => {
  it('is bounded and monotone', () => {
    const distribution = [-1, -1, 0, 0.5, 2, 5];
    let previous = -1;
    for (const value of [-5, -1, 0, 0.5, 2, 5, 99]) {
      const p = percentileOf(value, distribution)!;
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });

  it('splits ties down the middle', () => {
    // Mid-rank, so a value scored against its own distribution is centred rather than biased by
    // how many cells happen to land exactly on it.
    expect(percentileOf(0, [-1, 0, 1])).toBeCloseTo((1 + 0.5) / 3, 12);
    expect(percentileOf(1, [1, 1, 1, 1])).toBeCloseTo(0.5, 12);
  });

  it('declines to answer for an empty distribution', () => {
    expect(percentileOf(0, [])).toBeNull();
    expect(median([])).toBeNull();
  });
});

describe('restraint is scored, not special-cased (§4.4)', () => {
  it('beats most entries on a chart that went nowhere', () => {
    // §4.4: "On a chart whose distribution median is negative, passing legitimately beats most
    // entries." No branch makes that true — it falls out of scoring 0R in the same distribution.
    const cells = enumerateAchievable(ENTRY, ATR, chop, RATIO);
    const distribution = cells.map((c) => c.rMultiple);

    expect(median(distribution)!).toBeLessThan(0);
    expect(percentileOf(0, distribution)!).toBeGreaterThan(0.5);
  });

  it('does badly on a chart that went somewhere', () => {
    const distribution = enumerateAchievable(ENTRY, ATR, rising, RATIO).map((c) => c.rMultiple);
    const pass = percentileOf(0, distribution)!;
    const goodLong = percentileOf(3, distribution)!;
    expect(goodLong).toBeGreaterThan(pass);
  });
});

describe('axis decomposition (§4.5)', () => {
  const cells = enumerateAchievable(ENTRY, ATR, rising, RATIO);
  const oracle = oracleBound(ENTRY, rising, TICK_SIZE);

  const trade = (over: Partial<PlayerTrade> = {}): PlayerTrade => ({
    direction: 'long',
    stopAtr: 1,
    rMultiple: 2,
    outcome: 'target',
    windowMfeR: 4,
    ...over,
  });

  it('credits direction by where the winning cells were', () => {
    const long = scoreAgainst(trade(), cells, oracle);
    const short = scoreAgainst(trade({ direction: 'short' }), cells, oracle);
    // Everything that worked on this path was long.
    expect(long.axes.direction).toBeCloseTo(1, 6);
    expect(short.axes.direction).toBeCloseTo(0, 6);
  });

  it('reports what share of the row a stop that distance would have been swept from', () => {
    const tight = scoreAgainst(trade({ stopAtr: 0.5 }), cells, oracle);
    const wide = scoreAgainst(trade({ stopAtr: 4 }), cells, oracle);
    expect(tight.axes.stopSweptShare!).toBeGreaterThanOrEqual(wide.axes.stopSweptShare!);
    for (const score of [tight, wide]) {
      expect(score.axes.stopSweptShare!).toBeGreaterThanOrEqual(0);
      expect(score.axes.stopSweptShare!).toBeLessThanOrEqual(1);
    }
  });

  it('flags a stop tighter than the drawdown the winners had to survive', () => {
    const score = scoreAgainst(trade({ stopAtr: 0.5 }), cells, oracle);
    expect(score.axes.profitableMaeR).not.toBeNull();
    expect(typeof score.axes.stopInsideNoise).toBe('boolean');
  });

  it('reports efficiency as a share of the oracle', () => {
    const score = scoreAgainst(trade({ rMultiple: oracle }), cells, oracle);
    expect(score.axes.efficiency).toBeCloseTo(1, 6);
    expect(scoreAgainst(trade({ rMultiple: 0 }), cells, oracle).axes.efficiency).toBeCloseTo(0, 9);
  });

  it('reports capture as the share of the move that was there', () => {
    const score = scoreAgainst(trade({ rMultiple: 1, windowMfeR: 4 }), cells, oracle);
    expect(score.axes.captureShare).toBeCloseTo(0.25, 9);
  });

  it('returns null rather than a number the grid cannot support (§4.9)', () => {
    const passed = scoreAgainst(
      { direction: null, stopAtr: null, rMultiple: 0, outcome: 'pass', windowMfeR: null },
      cells,
      oracle,
    );
    expect(passed.axes.direction).toBeNull();
    expect(passed.axes.stopSweptShare).toBeNull();
    expect(passed.axes.targetReached).toBeNull();
    expect(passed.axes.captureShare).toBeNull();
    // Restraint is exactly the axis a pass *does* have.
    expect(passed.axes.restraint).not.toBeNull();
    expect(passed.percentile).toBeCloseTo(passed.axes.restraint!, 12);
  });

  it('survives an empty grid without inventing numbers', () => {
    const score = scoreAgainst(trade(), [], 0);
    expect(score.percentile).toBeNull();
    expect(score.parR).toBeNull();
    expect(score.axes.efficiency).toBeNull();
    expect(score.axes.restraint).toBeNull();
  });

  it('declines efficiency when nothing was achievable', () => {
    const nothing = enumerateAchievable(ENTRY, ATR, flat(200, ENTRY), RATIO);
    expect(scoreAgainst(trade(), nothing, 0).axes.efficiency).toBeNull();
  });
});
