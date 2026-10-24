import { describe, expect, it } from 'vitest';
import { TIER_NAME, ordinal, percentileBar, shareCard } from '@/lib/share';

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
