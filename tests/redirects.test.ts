import { describe, expect, it } from 'vitest';
import { REDIRECTS } from '../next.config';

/**
 * Old links keep working. A redirect table is the kind of config nobody re-reads, and a typo in
 * one entry silently 404s every link sent before the change — so the table is pinned.
 */

type Rule = (typeof REDIRECTS)[number];

/**
 * Resolve a path through the table the way Next does: first match wins. `:name` is one segment,
 * `:name*` is zero or more (with its slash), and named captures fill the destination.
 */
function resolve(path: string): string | null {
  for (const rule of REDIRECTS as Rule[]) {
    const pattern = rule.source
      .replace(/\/:(\w+)\*/g, '(?:/(?<$1>.*))?')
      .replace(/:(\w+)/g, '(?<$1>[^/]+)');
    const match = new RegExp(`^${pattern}$`).exec(path);
    if (!match) continue;
    const captures = match.groups ?? {};
    return rule.destination.replace(/:(\w+)/g, (_, name: string) => captures[name] ?? '');
  }
  return null;
}

describe('legacy URLs', () => {
  it('renames that predate the platform', () => {
    expect(resolve('/home')).toBe('/markets');
    expect(resolve('/stats')).toBe('/portfolio');
    expect(resolve('/rules')).toBe('/learn/rulebook');
  });

  it('the game’s destinations land on the pages that do their job now', () => {
    expect(resolve('/today')).toBe('/markets');
    expect(resolve('/you')).toBe('/portfolio');
    expect(resolve('/ranks')).toBe('/leaderboard');
  });

  it('every play mode, at any depth, goes to Markets', () => {
    for (const path of ['/play', '/play/daily', '/play/ranked', '/play/tape/chop', '/play/manage/the-drop', '/play/duel/abc', '/manage', '/versus', '/versus/abc']) {
      expect(resolve(path)).toBe('/markets');
    }
  });

  it('a tape opens Markets on the scenario it became', () => {
    expect(resolve('/tapes/chop')).toBe('/markets?scenario=chop');
    expect(resolve('/tapes/the-drop/cohort')).toBe('/markets?scenario=the-drop');
    expect(resolve('/tapes')).toBe('/markets#scenarios');
  });

  it('does not read the old builder and the old tab as tape names', () => {
    expect(resolve('/tapes/new')).toBe('/markets#scenarios');
    expect(resolve('/tapes/mine')).toBe('/markets#scenarios');
  });

  it('leaves the platform’s own pages alone', () => {
    for (const path of ['/markets', '/trade', '/trade/abc', '/portfolio', '/strategies', '/leaderboard', '/learn', '/demo']) {
      expect(resolve(path)).toBeNull();
    }
  });

  it('retirements are temporary, so the paths stay free to reuse', () => {
    for (const rule of REDIRECTS as Rule[]) {
      if (!['/home', '/stats', '/rules'].includes(rule.source)) expect(rule.permanent).toBe(false);
    }
  });
});
