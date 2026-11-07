/**
 * Every route a player can be sent to, built in one place, so a rename is one edit.
 *
 * Hindsight is a game (docs/rules.md §23): `/play`, `/duel/*` and `/schools` are its pages. The
 * trading platform's pages and the older game's are gone, and next.config.ts redirects each of
 * them to the page that does its job now.
 */

const q = (params: Record<string, string | undefined | false>) => {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

export const routes = {
  landing: '/',
  settings: '/settings',
  profile: (handle: string) => `/u/${encodeURIComponent(handle)}`,
  signIn: (next?: string) => `/sign-in${q({ next })}`,

  play: {
    /** The hub: training grounds, duels, schools, and what you have played. */
    index: '/play',
    /** Deal a training round and play it. */
    new: '/play/new',
    round: (id: string) => `/play/${encodeURIComponent(id)}`,
  },
  duel: (code: string) => `/duel/${encodeURIComponent(code)}`,
  schools: '/schools',

  learn: {
    index: '/learn',
    rulebook: (anchor?: string) => `/learn/rulebook${anchor ? `#${anchor}` : ''}`,
  },
} as const;
