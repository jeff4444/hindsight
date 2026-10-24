import { describe, expect, it } from 'vitest';
import { REDIRECTS } from '../next.config';

/**
 * Old links keep working. A redirect table is the kind of config nobody re-reads, and a typo in
 * one entry silently 404s every duel link sent before the redesign — so the table is pinned.
 */

type Rule = (typeof REDIRECTS)[number];

/** Resolve a path and query through the table the way Next does: first match wins. */
function resolve(path: string, query: Record<string, string> = {}): string | null {
  for (const rule of REDIRECTS as Rule[]) {
    if (rule.source !== path) continue;
    const captures: Record<string, string> = {};
    const has = ('has' in rule && rule.has) || [];
    const ok = has.every((condition) => {
      const value = query[condition.key];
      if (value === undefined) return false;
      const match = new RegExp(`^${condition.value}$`).exec(value);
      if (!match) return false;
      Object.assign(captures, match.groups ?? {});
      return true;
    });
    if (!ok) continue;
    return rule.destination.replace(/:(\w+)/g, (_, name: string) => captures[name] ?? `:${name}`);
  }
  return null;
}

describe('legacy URLs', () => {
  it('renamed destinations', () => {
    expect(resolve('/home')).toBe('/today');
    expect(resolve('/stats')).toBe('/you');
    expect(resolve('/rules')).toBe('/learn/rulebook');
    expect(resolve('/tapes/mine')).toBe('/tapes?tab=yours');
  });

  it('play modes from the query string', () => {
    expect(resolve('/play', { mode: 'daily' })).toBe('/play/daily');
    expect(resolve('/play', { mode: 'ranked', new: '1' })).toBe('/play/ranked');
    expect(resolve('/play', { mode: 'storm' })).toBe('/play/storm');
    expect(resolve('/play', { mode: 'streak' })).toBe('/play/survival');
    expect(resolve('/play', { mode: 'tape', tape: 'chop', tier: 'FD' })).toBe('/play/tape/chop');
    expect(resolve('/play', { mode: 'tape' })).toBe('/play/tape/open');
    expect(resolve('/play', { mode: 'duel', match: 'abc' })).toBe('/play/duel/abc');
    expect(resolve('/play', { mode: 'race', match: 'xyz' })).toBe('/play/race/xyz');
  });

  it('Manage, with and without a tape', () => {
    expect(resolve('/manage', { tape: 'the-drop' })).toBe('/play/manage/the-drop');
    expect(resolve('/manage')).toBe('/play/manage/open');
  });

  it('leaves the hub alone', () => {
    expect(resolve('/play')).toBeNull();
  });
});
