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
    expect(resolve('/home')).toBe('/play');
    expect(resolve('/stats')).toBe('/play');
    expect(resolve('/rules')).toBe('/learn/rulebook');
  });

  it('the first game’s destinations land on Play', () => {
    for (const path of ['/today', '/you', '/ranks', '/manage', '/versus', '/versus/abc', '/tapes', '/tapes/chop', '/tapes/the-drop/cohort']) {
      expect(resolve(path)).toBe('/play');
    }
  });

  it('the first game’s play modes go to Play, without taking a round’s address', () => {
    for (const path of ['/play/daily', '/play/ranked', '/play/tape/chop', '/play/manage/the-drop', '/play/duel/abc']) {
      expect(resolve(path)).toBe('/play');
    }
    expect(resolve('/play')).toBeNull();
    expect(resolve('/play/new')).toBeNull();
    expect(resolve('/play/0b8f6c1e-2d4a-4e7b-9a51-3f2c1d0e9b8a')).toBeNull();
  });

  it('the trading platform’s pages go to the game’s (§23.9)', () => {
    for (const path of ['/markets', '/portfolio', '/leaderboard', '/trade', '/trade/abc', '/trade/abc/review', '/trade/new']) {
      expect(resolve(path)).toBe('/play');
    }
    expect(resolve('/strategies')).toBe('/schools');
    expect(resolve('/strategies/turtle')).toBe('/schools');
    expect(resolve('/learn/methods')).toBe('/schools');
  });

  it('leaves the game’s own pages alone', () => {
    for (const path of ['/play', '/duel/abcd2345', '/schools', '/learn', '/demo']) {
      expect(resolve(path)).toBeNull();
    }
  });

  it('retirements are temporary, so the paths stay free to reuse', () => {
    for (const rule of REDIRECTS as Rule[]) {
      if (!['/home', '/stats', '/rules'].includes(rule.source)) expect(rule.permanent).toBe(false);
    }
  });
});
