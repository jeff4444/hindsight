/**
 * Every route a player can be sent to, built in one place.
 *
 * Before the redesign the play surface took its mode from a query string (`/play?mode=tape&tape=…`)
 * and every launcher assembled that string by hand. Now each mode has a path a person can read and
 * share — `/play/daily`, `/play/tape/chop` — and the strings are built here so a rename is one edit.
 * Old URLs still work: next.config.ts redirects every one of them.
 */

export type RulesCode = 'FD' | 'NT' | 'NTZ' | 'NTVZ';

const q = (params: Record<string, string | undefined | false>) => {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

export const routes = {
  landing: '/',
  today: '/today',
  ranks: (board?: 'daily' | 'ranked' | 'tapes') => `/ranks${q({ board })}`,
  you: '/you',
  settings: '/settings',
  profile: (handle: string) => `/u/${encodeURIComponent(handle)}`,
  signIn: (next?: string) => `/sign-in${q({ next })}`,

  play: {
    hub: '/play',
    daily: '/play/daily',
    ranked: (fresh?: boolean) => `/play/ranked${q({ new: fresh && '1' })}`,
    storm: (tape?: string) => `/play/storm${q({ tape: tape !== 'open' && tape })}`,
    survival: (tape?: string) => `/play/survival${q({ tape: tape !== 'open' && tape })}`,
    tape: (slug: string, opts: { rules?: RulesCode; sandbox?: boolean } = {}) =>
      `/play/tape/${encodeURIComponent(slug)}${q({ rules: opts.rules, sandbox: opts.sandbox && '1' })}`,
    manage: (slug: string) => `/play/manage/${encodeURIComponent(slug)}`,
    duel: (id: string) => `/play/duel/${encodeURIComponent(id)}`,
    race: (id: string) => `/play/race/${encodeURIComponent(id)}`,
  },

  tapes: {
    index: (tab?: 'official' | 'community' | 'yours') => `/tapes${q({ tab })}`,
    show: (slug: string) => `/tapes/${encodeURIComponent(slug)}`,
    cohort: (slug: string) => `/tapes/${encodeURIComponent(slug)}/cohort`,
    create: '/tapes/new',
  },

  versus: {
    index: '/versus',
    match: (id: string) => `/versus/${encodeURIComponent(id)}`,
  },

  learn: {
    index: '/learn',
    rulebook: (anchor?: string) => `/learn/rulebook${anchor ? `#${anchor}` : ''}`,
    methods: '/learn/methods',
  },
} as const;
