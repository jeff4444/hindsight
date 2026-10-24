import Link from 'next/link';
import { currentViewer } from '@/lib/viewer';
import { Button } from '@/components/ui';
import { Wordmark } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

/**
 * The public shell.
 *
 * There was no layout here at all: the landing page hand-rolled its own header and footer, and
 * every other public route inherited neither. One shell means the front door looks the same
 * wherever somebody lands on it.
 */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer();
  const signedIn = Boolean(viewer.profile);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-line-faint bg-surface-0/95 sticky top-0 z-40 border-b">
        <div className="max-w-app mx-auto flex h-16 items-center justify-between px-5">
          <Link href="/" aria-label="Hindsight home">
            <Wordmark size="md" />
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1.5">
            <Link
              href="/learn"
              className="text-ink-lo hover:text-ink-hi hidden h-10 items-center px-3 text-sm font-medium transition-colors sm:inline-flex"
            >
              Ruleset
            </Link>
            {signedIn ? (
              <Button as="a" href="/today" variant="primary">
                Your desk
              </Button>
            ) : (
              <>
                <Button as="a" href="/sign-in" variant="ghost">
                  Sign in
                </Button>
                <Button as="a" href="/play/daily" variant="primary">
                  Play today
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-line-faint border-t">
        <div className="max-w-app mx-auto flex flex-wrap items-center justify-between gap-4 px-5 py-8">
          <Wordmark size="sm" className="opacity-70" />
          <nav className="text-ink-dim flex flex-wrap items-center gap-5 text-sm" aria-label="Footer">
            <Link href="/learn" className="hover:text-ink-hi transition-colors">
              Ruleset
            </Link>
            <Link href="/tapes" className="hover:text-ink-hi transition-colors">
              Tapes
            </Link>
            <Link href="/play/daily" className="hover:text-ink-hi transition-colors">
              Play
            </Link>
          </nav>
        </div>
        <div className="border-line-faint border-t">
          <div className="max-w-app text-ink-dim mx-auto flex flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm">
            <span>Historical price data from the public Binance archive.</span>
            <span>Not investment advice. Nothing here predicts anything.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
