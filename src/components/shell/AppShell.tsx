'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MarketSignature } from '../ui/MarketSignature';
import { cx } from '../ui';
import type { Accent } from '@/lib/avatar';

/**
 * The chrome.
 *
 * A rail at desktop widths and a tab bar on a phone, because a bottom bar is where a thumb already
 * is and a side rail is where a cursor already is. Both are fixed-width by construction: the chart
 * re-applies its logical range from a ResizeObserver, so an animating nav width would fire that
 * every frame next to a canvas redraw.
 *
 * The play route opts out entirely — it collapses to a thin strip, because during a round the
 * chart should own the screen and the only navigation that matters is the way out.
 */

export interface ViewerChip {
  handle: string;
  displayName: string | null;
  avatarSeed: number;
  avatarAccent: Accent;
  perfectStreak: boolean;
}

const DESTINATIONS = [
  { href: '/home', label: 'Today', icon: TodayIcon },
  { href: '/tapes', label: 'Tapes', icon: TapesIcon },
  { href: '/stats', label: 'Stats', icon: StatsIcon },
] as const;

export function AppShell({
  viewer,
  children,
}: {
  viewer: ViewerChip | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const bare = pathname.startsWith('/play');

  if (bare) return <>{children}</>;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Desktop rail */}
      <nav className="border-line bg-surface-1 sticky top-0 hidden h-dvh w-[4.5rem] shrink-0 flex-col items-center gap-1 border-r py-4 md:flex xl:w-56 xl:items-stretch xl:px-3">
        <Link
          href="/"
          className="text-ink-hi tracking-wordmark mb-4 flex h-9 items-center justify-center text-sm font-semibold xl:justify-start xl:px-2"
        >
          <span className="xl:hidden">H</span>
          <span className="hidden xl:inline">HINDSIGHT</span>
        </Link>

        {DESTINATIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'press flex h-11 items-center justify-center gap-3 rounded-md transition-colors xl:justify-start xl:px-3',
                active ? 'bg-fill-3 text-ink-max' : 'text-ink-dim hover:bg-fill-1 hover:text-ink-hi',
              )}
              title={label}
            >
              <Icon active={active} />
              <span className="hidden text-sm font-medium xl:inline">{label}</span>
            </Link>
          );
        })}

        <div className="mt-auto w-full">
          {viewer ? (
            <Link
              href={`/u/${viewer.handle}`}
              className="press hover:bg-fill-1 flex h-11 items-center justify-center gap-2 rounded-md transition-colors xl:justify-start xl:px-2"
            >
              <MarketSignature
                seed={viewer.avatarSeed}
                accent={viewer.avatarAccent}
                size={28}
                ring={viewer.perfectStreak ? 'gold' : 'accent'}
              />
              <span className="text-ink-lo hidden truncate text-xs xl:inline">
                {viewer.displayName ?? viewer.handle}
              </span>
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="press text-ink-dim hover:text-ink-hi hover:bg-fill-1 flex h-11 items-center justify-center rounded-md text-xs font-medium transition-colors xl:px-3"
            >
              <span className="xl:hidden">→</span>
              <span className="hidden xl:inline">Sign in</span>
            </Link>
          )}
        </div>
      </nav>

      <main className="max-w-app mx-auto w-full flex-1 px-4 pt-5 pb-24 md:px-8 md:pb-10">
        {children}
      </main>

      {/* Phone tab bar. 44px targets, clear of the home indicator. */}
      <nav className="border-line bg-surface-1/95 fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {DESTINATIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors',
                active ? 'text-ink-max' : 'text-ink-dim',
              )}
            >
              <Icon active={active} />
              <span className="text-micro font-medium">{label}</span>
            </Link>
          );
        })}
        <Link
          href={viewer ? `/u/${viewer.handle}` : '/sign-in'}
          className="text-ink-dim flex h-14 flex-1 flex-col items-center justify-center gap-1"
        >
          {viewer ? (
            <MarketSignature
              seed={viewer.avatarSeed}
              accent={viewer.avatarAccent}
              size={20}
              ring={viewer.perfectStreak ? 'gold' : 'accent'}
            />
          ) : (
            <YouIcon active={false} />
          )}
          <span className="text-micro font-medium">{viewer ? 'You' : 'Sign in'}</span>
        </Link>
      </nav>
    </div>
  );
}

/* Icons are inline and hand-drawn from the product's own vocabulary — a candle, a reel, a
   distribution — rather than a generic icon set, because they are the only decorative surface
   in the app and a stock house/chart/person trio would say nothing. */

function TodayIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="3" y="5.5" width="3" height="7" rx="1" fill="currentColor" opacity={active ? 1 : 0.75} />
      <path d="M4.5 3v2.5M4.5 12.5V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="10" y="3.5" width="3" height="9" rx="1" fill="currentColor" opacity={active ? 1 : 0.45} />
      <path d="M11.5 2v1.5M11.5 12.5V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity={0.6} />
    </svg>
  );
}

function TapesIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6.5" cy="9" r="1.6" fill="currentColor" opacity={active ? 1 : 0.7} />
      <circle cx="11.5" cy="9" r="1.6" fill="currentColor" opacity={active ? 1 : 0.7} />
      <path d="M6.5 12.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function StatsIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 14V9M7 14V5M11 14v-3M15 14V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity={active ? 1 : 0.8} />
    </svg>
  );
}

function YouIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="6.5" r="2.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 15a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity={active ? 1 : 0.8} />
    </svg>
  );
}
