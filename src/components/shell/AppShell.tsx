'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MarketSignature } from '../ui/MarketSignature';
import { cx } from '../ui';
import { Icon, Mark, type IconName } from '../ui/icons';
import type { Accent } from '@/lib/avatar';

/**
 * The chrome.
 *
 * A rail at desktop widths and a tab bar on a phone, because a bottom bar is where a thumb already
 * is and a side rail is where a cursor already is. Both are fixed-width by construction: the chart
 * re-applies its logical range from a ResizeObserver, so an animating nav width would fire that
 * every frame next to a canvas redraw. The widths below change *at* a breakpoint and are never
 * transitioned — `transition-colors` only, never `transition-[width]` or `transition-all`.
 *
 * The play route opts out entirely, because during a round the chart should own the screen and the
 * only navigation that matters is the way out.
 *
 * Three things were wrong with the previous version and are fixed here:
 *
 *   Labels appeared only at `xl` (1440), so every laptop between 768 and 1440 got a 72px column of
 *   unlabelled icons. Now the rail stacks icon-over-label in the same 72px from `md`, and widens
 *   to a real labelled rail at `lg` — 1024 is a laptop, and there was never a reason to withhold
 *   the words until 1440.
 *
 *   There was no way to reach `/play` from the chrome at all. The core screen was reachable only
 *   by finding the daily card on `/home` or opening a tape. Play is a launcher rather than a
 *   destination — the route opts out of this shell, so it is not somewhere you navigate "to" and
 *   back from — which is why it is a filled pill above the destinations rather than a fourth item
 *   in the list.
 *
 *   The rail knew who you were but never said so. The identity block now carries the streak, which
 *   is the one number that makes coming back tomorrow mean something.
 */

export interface ViewerChip {
  handle: string;
  displayName: string | null;
  avatarSeed: number;
  avatarAccent: Accent;
  perfectStreak: boolean;
  streakLength: number;
}

const DESTINATIONS: { href: string; label: string; icon: IconName }[] = [
  { href: '/home', label: 'Today', icon: 'candle' },
  { href: '/tapes', label: 'Tapes', icon: 'tape' },
  { href: '/stats', label: 'Stats', icon: 'distribution' },
  { href: '/rules', label: 'Rules', icon: 'rules' },
];

/** Phone tabs. Play sits in the middle, where a thumb rests. */
const TABS = DESTINATIONS.filter((d) => d.href !== '/rules');

export function AppShell({
  viewer,
  launcher,
  children,
}: {
  viewer: ViewerChip | null;
  /** The daily launcher, streamed in separately so the shell paints before the query lands. */
  launcher?: ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname.startsWith('/play')) return <>{children}</>;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#main"
        className="bg-surface-inv text-ink-inv sr-only rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <nav
        aria-label="Primary"
        className="border-line bg-surface-1 sticky top-0 hidden h-dvh w-[4.5rem] shrink-0 flex-col gap-1 border-r px-2 py-4 md:flex lg:w-54 lg:px-3"
      >
        <Link
          href="/"
          aria-label="Hindsight home"
          className="mb-4 flex h-9 items-center justify-center gap-2 lg:justify-start lg:px-1"
        >
          <Mark size={22} className="text-ink-hi" />
          <span className="text-ink-hi tracking-wordmark font-hero hidden text-base lg:inline">
            HINDSIGHT
          </span>
        </Link>

        {launcher}

        <div className="mt-3 flex flex-col gap-1">
          {DESTINATIONS.map(({ href, label, icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'press flex flex-col items-center justify-center gap-1 rounded-md py-2 transition-colors',
                  'lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-0',
                  active ? 'bg-fill-3 text-ink-max' : 'text-ink-dim hover:bg-fill-1 hover:text-ink-hi',
                )}
              >
                <Icon name={icon} size={19} />
                <span className="text-micro font-medium lg:text-sm">{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto">
          {viewer ? (
            <Link
              href={`/u/${viewer.handle}`}
              className="press hover:bg-fill-1 flex flex-col items-center gap-1.5 rounded-md p-2 transition-colors lg:flex-row lg:gap-2.5"
            >
              <MarketSignature
                seed={viewer.avatarSeed}
                accent={viewer.avatarAccent}
                size={30}
                ring={viewer.perfectStreak ? 'gold' : 'accent'}
              />
              <span className="hidden min-w-0 flex-1 lg:block">
                <span className="text-ink-hi block truncate text-sm font-medium">
                  {viewer.displayName ?? viewer.handle}
                </span>
                <span className="text-ink-dim block text-xs">
                  {viewer.streakLength > 0 ? `${viewer.streakLength}-day streak` : 'No streak yet'}
                </span>
              </span>
              {viewer.streakLength > 0 && (
                <span
                  className={cx(
                    'numeral text-micro font-semibold lg:hidden',
                    viewer.perfectStreak ? 'text-gold-ink' : 'text-ink-dim',
                  )}
                >
                  {viewer.streakLength}d
                </span>
              )}
            </Link>
          ) : (
            <Link
              href="/sign-in"
              className="press text-ink-dim hover:text-ink-hi hover:bg-fill-1 flex flex-col items-center gap-1 rounded-md py-2 text-center transition-colors lg:flex-row lg:gap-2.5 lg:px-3 lg:py-2.5 lg:text-left"
            >
              <Icon name="signature" size={19} />
              <span className="text-micro font-medium lg:text-sm">
                <span className="lg:hidden">Sign in</span>
                <span className="hidden lg:inline">Save your progress</span>
              </span>
            </Link>
          )}
        </div>
      </nav>

      <main id="main" className="max-w-app mx-auto w-full flex-1 px-4 pt-5 pb-24 md:px-8 md:pb-10">
        {children}
      </main>

      {/* Phone tab bar. 44px targets, clear of the home indicator. */}
      <nav
        aria-label="Primary"
        className="border-line bg-surface-1 fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {TABS.slice(0, 2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}

        {/* The only filled tab, raised into the bar. It is an action, not a destination. */}
        <Link
          href="/play"
          className="press flex h-14 flex-1 flex-col items-center justify-center gap-1"
          aria-label="Play"
        >
          <span className="bg-surface-inv text-ink-inv shadow-key -mt-5 grid h-12 w-12 place-items-center rounded-full">
            <Icon name="play" size={20} />
          </span>
          <span className="text-ink-hi text-micro -mt-0.5 font-medium">Play</span>
        </Link>

        {TABS.slice(2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}

        <Link
          href={viewer ? `/u/${viewer.handle}` : '/sign-in'}
          aria-current={isActive('/u') ? 'page' : undefined}
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
            <Icon name="signature" size={19} />
          )}
          <span className="text-micro font-medium">{viewer ? 'You' : 'Sign in'}</span>
        </Link>
      </nav>
    </div>
  );
}

function Tab({ href, label, icon, active }: { href: string; label: string; icon: IconName; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors',
        active ? 'text-ink-max' : 'text-ink-dim',
      )}
    >
      <Icon name={icon} size={19} />
      <span className="text-micro font-medium">{label}</span>
    </Link>
  );
}
