import Link from 'next/link';
import { currentViewer } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { Button } from '@/components/ui';
import { Wordmark } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

/**
 * The front door's frame: the mark, three links, and one call to action that changes with who is
 * looking. A returning trader goes straight to Markets; a visitor gets "Start trading".
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer();
  const signedIn = Boolean(viewer.profile);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line-faint bg-surface-0/90 sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="Hindsight home">
            <Wordmark size="md" />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1">
            <Link href={routes.learn.index} className="text-ink-lo hover:text-ink-hi hidden h-10 items-center px-3 text-sm font-medium transition-colors sm:inline-flex">
              How it works
            </Link>
            <Link href={routes.strategies.index} className="text-ink-lo hover:text-ink-hi hidden h-10 items-center px-3 text-sm font-medium transition-colors md:inline-flex">
              Strategies
            </Link>
            {signedIn ? (
              <Button href={routes.markets()} variant="primary">
                Open Hindsight
              </Button>
            ) : (
              <>
                <Button href={routes.signIn()} variant="ghost">
                  Sign in
                </Button>
                <Button href={routes.trade.open({ kind: 'random' })} variant="primary">
                  Start trading
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-line-faint border-t">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[1fr_auto]">
          <div>
            <Wordmark size="md" />
            <p className="text-ink-dim mt-3 max-w-sm text-sm leading-relaxed">
              Paper trading on replayed market history, at real prices with the dates held back until the close.
              No real money changes hands. Not investment advice, and nothing here predicts anything.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3" aria-label="Footer">
            <Link href={routes.markets()} className="text-ink-lo hover:text-ink-hi">Markets</Link>
            <Link href={routes.strategies.index} className="text-ink-lo hover:text-ink-hi">Strategies</Link>
            <Link href={routes.leaderboard()} className="text-ink-lo hover:text-ink-hi">Leaderboard</Link>
            <Link href={routes.learn.index} className="text-ink-lo hover:text-ink-hi">How it works</Link>
            <Link href={routes.learn.methods} className="text-ink-lo hover:text-ink-hi">Methods</Link>
            <Link href={routes.learn.rulebook()} className="text-ink-lo hover:text-ink-hi">Rulebook</Link>
          </nav>
        </div>
        <div className="border-line-faint text-ink-dim mx-auto max-w-6xl border-t px-5 py-5 text-xs">
          Historical price data from the public Binance archive.
        </div>
      </footer>
    </div>
  );
}
