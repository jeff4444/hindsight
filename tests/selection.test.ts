import { describe, expect, it } from 'vitest';
import {
  DELISTING_CLIFF_DAYS,
  MIN_ARCHIVE_BYTES,
  PER_SYMBOL_CAP,
  TRAILING_MONTHS_REQUIRED,
  dailyMonthsFor,
  delistedShare,
  eligibleCells,
  endOfMonthMs,
  monthsBetween,
  sampleCells,
  shiftMonth,
  symbolCount,
  windowRank,
  withinDelistingCliff,
} from '../scripts/selection';
import type { Universe } from '../scripts/universe';

/** A synthetic archive index, so the rule is tested against known input rather than the cache. */
function universe(
  symbols: {
    symbol: string;
    from: string;
    months: number;
    bytes?: number;
    delisted?: boolean;
  }[],
): Universe {
  return {
    generatedFrom: 'test',
    rangeStart: '2020-01',
    rangeEnd: '2025-12',
    minMonthsInRange: 18,
    frontierMonth: '2026-07',
    symbols: symbols.map((spec) => {
      const monthsInRange = Array.from({ length: spec.months }, (_, i) => ({
        month: shiftMonth(spec.from, i),
        bytes: spec.bytes ?? 1_400_000,
      }));
      return {
        symbol: spec.symbol,
        monthsInRange,
        firstMonth: spec.from,
        lastMonth: monthsInRange[monthsInRange.length - 1].month,
        delisted: spec.delisted ?? false,
        eligible: true,
      };
    }),
  };
}

describe('month arithmetic', () => {
  it('counts whole months across year boundaries', () => {
    expect(monthsBetween('2020-01', '2020-01')).toBe(0);
    expect(monthsBetween('2020-11', '2021-02')).toBe(3);
    expect(monthsBetween('2020-01', '2025-12')).toBe(71);
  });

  it('shifts in both directions', () => {
    expect(shiftMonth('2021-03', 1)).toBe('2021-04');
    expect(shiftMonth('2021-01', -1)).toBe('2020-12');
    expect(shiftMonth('2021-12', 1)).toBe('2022-01');
    expect(shiftMonth('2021-06', -13)).toBe('2020-05');
  });

  it('asks for the trailing year plus the month itself', () => {
    const months = dailyMonthsFor('2022-06');
    expect(months).toHaveLength(TRAILING_MONTHS_REQUIRED + 1);
    expect(months[0]).toBe('2021-05');
    expect(months[months.length - 1]).toBe('2022-06');
  });

  it('finds the first instant after a month, December included', () => {
    expect(endOfMonthMs('2021-01')).toBe(Date.UTC(2021, 1, 1));
    expect(endOfMonthMs('2021-12')).toBe(Date.UTC(2022, 0, 1));
  });
});

describe('the delisting cliff', () => {
  // This filter almost never fires during a real build — illiquid months near a delisting are
  // usually rejected for gaps first — so a whole corpus can pass through it unexercised. These
  // tests are the only thing standing behind the claim that it works.
  const last = '2022-05';
  const monthEnd = endOfMonthMs(last);
  const day = 86_400_000;

  it('rejects a window whose reveal runs into the final week', () => {
    expect(withinDelistingCliff(monthEnd - 1 * day, last)).toBe(true);
    expect(withinDelistingCliff(monthEnd - 6 * day, last)).toBe(true);
  });

  it('keeps a window that ends before the final week', () => {
    expect(withinDelistingCliff(monthEnd - 8 * day, last)).toBe(false);
    expect(withinDelistingCliff(monthEnd - 60 * day, last)).toBe(false);
  });

  it('sits exactly on the published boundary', () => {
    expect(withinDelistingCliff(monthEnd - DELISTING_CLIFF_DAYS * day, last)).toBe(true);
    expect(withinDelistingCliff(monthEnd - DELISTING_CLIFF_DAYS * day - 1, last)).toBe(false);
  });

  it('keeps the collapse, drops only the flat bit after it', () => {
    // The point of the rule: LUNA fell through May 2022 and was delisted at the end of it. The
    // crash itself is real price action and belongs in the corpus; only the last week goes.
    const crash = Date.UTC(2022, 4, 11); // 11 May 2022
    expect(withinDelistingCliff(crash, last)).toBe(false);
  });
});

describe('eligibility', () => {
  it('drops months whose archive is below the liquidity floor', () => {
    const cells = eligibleCells(
      universe([
        { symbol: 'LIQUIDUSDT', from: '2020-01', months: 30 },
        { symbol: 'THINUSDT', from: '2020-01', months: 30, bytes: MIN_ARCHIVE_BYTES - 1 },
      ]),
    );
    expect(new Set(cells.map((c) => c.symbol))).toEqual(new Set(['LIQUIDUSDT']));
  });

  it('drops months before the pair has a trailing year', () => {
    const cells = eligibleCells(universe([{ symbol: 'NEWUSDT', from: '2020-01', months: 30 }]));
    // The first 13 months cannot carry a volatility percentile, so they are not samplable.
    expect(cells[0].month).toBe(shiftMonth('2020-01', TRAILING_MONTHS_REQUIRED));
    expect(cells).toHaveLength(30 - TRAILING_MONTHS_REQUIRED);
  });

  it('ignores pairs the universe marked ineligible', () => {
    const u = universe([{ symbol: 'SHORTUSDT', from: '2020-01', months: 30 }]);
    u.symbols[0].eligible = false;
    expect(eligibleCells(u)).toHaveLength(0);
  });
});

describe('sampling', () => {
  const u = universe([
    { symbol: 'AUSDT', from: '2020-01', months: 60 },
    { symbol: 'BUSDT', from: '2020-01', months: 60 },
    { symbol: 'CUSDT', from: '2020-01', months: 60, delisted: true },
    { symbol: 'DUSDT', from: '2020-01', months: 20, delisted: true },
  ]);

  it('is decided by the seed alone', () => {
    expect(sampleCells(u, 40)).toEqual(sampleCells(u, 40));
  });

  it('never gives one pair more than the cap', () => {
    const counts = new Map<string, number>();
    for (const cell of sampleCells(u, 100)) {
      counts.set(cell.symbol, (counts.get(cell.symbol) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(PER_SYMBOL_CAP);
  });

  it('does not exceed the target', () => {
    expect(sampleCells(u, 5)).toHaveLength(5);
    expect(sampleCells(u, 1000).length).toBeLessThanOrEqual(4 * PER_SYMBOL_CAP);
  });

  it('is not affected by the order pairs appear in the index', () => {
    // Cells are sorted canonically before the shuffle, so however the archive listing came back
    // cannot leak into which windows become charts.
    const reversed: Universe = { ...u, symbols: [...u.symbols].reverse() };
    expect(sampleCells(reversed, 40)).toEqual(sampleCells(u, 40));
  });

  it('keeps delisted pairs in the sample', () => {
    const cells = sampleCells(u, 16);
    expect(delistedShare(cells)).toBeGreaterThan(0);
    expect(symbolCount(cells)).toBeGreaterThan(1);
  });
});

describe('window ranking', () => {
  it('is stable and identity-based, not discovery-order-based', () => {
    expect(windowRank('BTCUSDT', '2021-04', 140)).toBe(windowRank('BTCUSDT', '2021-04', 140));
    expect(windowRank('BTCUSDT', '2021-04', 140)).not.toBe(windowRank('BTCUSDT', '2021-04', 280));
    expect(windowRank('BTCUSDT', '2021-04', 140)).not.toBe(windowRank('ETHUSDT', '2021-04', 140));
  });
});
