import { describe, expect, it } from 'vitest';
import { TIER_NAME, ordinal, percentileBar, sessionCard, shareCard } from '@/lib/share';

describe('the share card cannot leak the setup (§10.4)', () => {
  // §10.4's first property: "spoiler-free — encode percentile buckets, never the R-multiple or
  // direction, so a posted card cannot leak the setup". Someone who has not played today has to
  // be able to read a friend's card without learning which way the chart went.
  const card = shareCard({ day: 12, percentile: 0.78, traded: 3, total: 5 });

  it('names no instrument, date or price', () => {
    expect(card).not.toMatch(/USDT|BTC|Binance/i);
    expect(card).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(card).not.toMatch(/20\d\d/);
  });

  it('says nothing about direction', () => {
    expect(card.toLowerCase()).not.toContain('long');
    expect(card.toLowerCase()).not.toContain('short');
  });

  it('says nothing about the R-multiple or the outcome', () => {
    expect(card).not.toMatch(/[-+]?\d+(\.\d+)?R\b/);
    expect(card.toLowerCase()).not.toContain('stop');
    expect(card.toLowerCase()).not.toContain('target');
    expect(card.toLowerCase()).not.toContain('oracle');
  });

  it('is plain Unicode with no image and no link', () => {
    expect(card).not.toMatch(/https?:\/\//);
    expect(card).not.toMatch(/[<>]/);
    expect(card).not.toContain('![');
  });

  it('carries what makes it comparable: the day and the tier', () => {
    expect(card).toContain('Hindsight #12');
    expect(card).toContain(TIER_NAME);
  });

  it('prints the traded count prominently, which is §4.4’s only brake on passing', () => {
    expect(card).toContain('traded 3 of 5');
  });
});

describe('the card', () => {
  it('reads as a score, a square per chart, and the trade count', () => {
    expect(shareCard({ day: 412, percentile: 0.78, traded: 3, total: 5, charts: [0.95, 0.7, 'pass', 0.2, 'pass'] })).toBe(
      ['Hindsight #412 · Naked · 78', '🟨🟩🟪🟥🟪', 'traded 3 of 5'].join('\n'),
    );
  });

  it('adds the field rank when there is one', () => {
    expect(shareCard({ day: 412, percentile: 0.78, traded: 3, total: 5, charts: [0.95, 0.7, 'pass', 0.2, 'pass'], beat: 0.82 }).split('\n')[0]).toBe(
      'Hindsight #412 · Naked · 78 · top 18%',
    );
  });

  it('falls back to the bar when the charts are not given', () => {
    expect(shareCard({ day: 412, percentile: 0.78, traded: 3, total: 5 })).toBe(
      ['Hindsight #412 · Naked · 78', '████████░░', 'traded 3 of 5'].join('\n'),
    );
  });

  it('drops the score rather than inventing one when nothing was scored', () => {
    const card = shareCard({ day: 7, percentile: null, traded: 0, total: 5 });
    expect(card).toBe(['Hindsight #7 · Naked', 'traded 0 of 5'].join('\n'));
  });

  it('bars are always ten blocks wide and bounded', () => {
    for (const p of [-1, 0, 0.04, 0.5, 0.999, 1, 2]) {
      const bar = percentileBar(p);
      expect([...bar]).toHaveLength(10);
      expect(bar).toMatch(/^█*░*$/);
    }
    expect(percentileBar(0)).toBe('░░░░░░░░░░');
    expect(percentileBar(1)).toBe('██████████');
  });

  it('writes ordinals the way English does, teens included', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(78)).toBe('78th');
    expect(ordinal(100)).toBe('100th');
    expect(ordinal(101)).toBe('101st');
    expect(ordinal(111)).toBe('111th');
  });
});

describe('the session card', () => {
  const daily = sessionCard({ daily: 412, symbol: 'BTC/USDT', returnPct: 0.02414, trips: [120.5, -40, 310], maxDrawdown: 0.0123 });

  it('reads as the day, the return, a square per trade, and the count', () => {
    expect(daily).toBe(['Hindsight #412 · Today’s market', '+2.41%', '🟩🟥🟩', '3 trades · 2 won · max drawdown 1.23%'].join('\n'));
  });

  it('cannot leak the market: no pair on a daily, no side, no price, no date', () => {
    expect(daily).not.toMatch(/USDT|BTC|Binance/i);
    expect(daily.toLowerCase()).not.toMatch(/long|short|buy|sell/);
    expect(daily).not.toMatch(/\$/);
    expect(daily).not.toMatch(/20\d\d|\d{4}-\d{2}-\d{2}/);
    expect(daily).not.toMatch(/https?:\/\/|[<>]/);
  });

  it('names the pair on any other market, which the trader saw before trading', () => {
    expect(sessionCard({ daily: null, symbol: 'ETH/USDT', returnPct: -0.005, trips: [-500], maxDrawdown: 0.006 }).split('\n')).toEqual([
      'Hindsight · ETH/USDT replay',
      '−0.50%',
      '🟥',
      '1 trade · 0 won · max drawdown 0.60%',
    ]);
  });

  it('says so when nothing was traded, and when the account was liquidated', () => {
    expect(sessionCard({ daily: 9, symbol: 'X', returnPct: 0, trips: [], maxDrawdown: 0 })).toBe(['Hindsight #9 · Today’s market', '0.00%', 'no trades'].join('\n'));
    expect(sessionCard({ daily: null, symbol: 'X/USDT', returnPct: -1, trips: [-100_000], maxDrawdown: 1, bankrupt: true }).split('\n')[1]).toBe('−100.00% · liquidated');
  });

  it('caps the squares and counts the rest', () => {
    const card = sessionCard({ daily: null, symbol: 'X/USDT', returnPct: 0.1, trips: Array.from({ length: 15 }, (_, i) => (i % 2 ? 1 : -1)), maxDrawdown: 0.02 });
    expect(card.split('\n')[2]).toMatch(/^(🟩|🟥){12} \+3$/u);
  });

  it('adds the field rank on a daily when there is one', () => {
    expect(sessionCard({ daily: 3, symbol: 'X', returnPct: 0.01, trips: [1], maxDrawdown: 0, beat: 0.82 }).split('\n')[1]).toBe('+1.00% · top 18%');
  });
});
