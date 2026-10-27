/**
 * Every route a trader can be sent to, built in one place, so a rename is one edit.
 *
 * The game's routes (`/today`, `/play/*`, `/tapes`, `/versus`, `/ranks`, `/you`) are retired;
 * next.config.ts redirects each of them to the page that does its job now.
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

  markets: (opts: { scenario?: string } = {}) => `/markets${q({ scenario: opts.scenario })}`,
  portfolio: (tab?: 'main' | 'practice') => `/portfolio${q({ account: tab === 'practice' && 'practice' })}`,
  strategies: {
    index: '/strategies',
    show: (code: string) => `/strategies/${encodeURIComponent(code.toLowerCase())}`,
  },
  leaderboard: (board?: 'all' | 'daily' | 'strategies') => `/leaderboard${q({ board: board !== 'all' && board })}`,

  trade: {
    /** The open session, or Markets if there is none. */
    index: '/trade',
    session: (id: string) => `/trade/${encodeURIComponent(id)}`,
    review: (id: string) => `/trade/${encodeURIComponent(id)}/review`,
    /** Open a new market and go to it. */
    open: (market: { kind: 'random' } | { kind: 'pair'; symbol: string } | { kind: 'daily' } | { kind: 'scenario'; slug: string }, account?: 'main' | 'practice', showDates?: boolean) =>
      `/trade/new${q({
        market: market.kind,
        symbol: market.kind === 'pair' ? market.symbol : undefined,
        scenario: market.kind === 'scenario' ? market.slug : undefined,
        account: account === 'practice' && 'practice',
        dates: showDates && '1',
      })}`,
  },

  learn: {
    index: '/learn',
    rulebook: (anchor?: string) => `/learn/rulebook${anchor ? `#${anchor}` : ''}`,
    methods: '/learn/methods',
  },
} as const;
