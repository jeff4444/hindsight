'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { MarketSignature } from '../ui/MarketSignature';
import { cx } from '../ui';
import { Popover } from '../ui/client';
import { Indicator } from '../ui/kinetic';
import { Icon, Mark, Wordmark, type IconName } from '../ui/icons';
import type { Accent } from '@/lib/avatar';
import { routes } from '@/lib/routes';

/**
 * The chrome.
 *
 * Four destinations, the same four everywhere: Today, Play, Tapes, Ranks. Everything else that used
 * to be scattered — Versus behind a home card, Storm and Streak behind two more, Manage behind a
 * tape page, Settings behind "Edit" on a profile — is now one tap from one of the four. The
 * identity block at the foot of the rail opens a menu with You, your profile, Settings, Learn and
 * Sign out.
 *
 * A rail at desktop widths and a bottom tab bar on a phone, with a slim top bar on a phone so the
 * brand and the account are never missing. Widths change *at* a breakpoint and are never
 * transitioned: the chart re-applies its range from a ResizeObserver, and an animating nav width
 * would fire that every frame.
 *
 * The play stage (`/play/…`) opts out entirely. During a round the chart owns the screen and the
 * only navigation that matters is the way out. The hub at `/play` is a destination like any other
 * and keeps the shell.
 */

export interface ViewerChip {
  handle: string;
  displayName: string | null;
  avatarSeed: number;
  avatarAccent: Accent;
  perfectStreak: boolean;
  streakLength: number;
}

const DESTINATIONS: { href: string; label: string; icon: IconName; match: string[] }[] = [
  { href: routes.markets(), label: 'Markets', icon: 'candle', match: ['/markets', '/trade'] },
  { href: routes.portfolio(), label: 'Portfolio', icon: 'wallet', match: ['/portfolio'] },
  { href: routes.strategies.index, label: 'Strategies', icon: 'bot', match: ['/strategies'] },
  { href: routes.leaderboard(), label: 'Leaderboard', icon: 'trophy', match: ['/leaderboard'] },
];

/**
 * Routes that render on the full-bleed stage with no shell around them: the game's play surface,
 * and the trading terminal (a session, or a market being opened). A session's review is a page and
 * keeps the shell.
 */
export function isStage(pathname: string): boolean {
  return pathname.startsWith('/play/') || /^\/trade\/[^/]+\/?$/.test(pathname);
}

export function AppShell({
  viewer,
  launcher,
  children,
}: {
  viewer: ViewerChip | null;
  /** The account chip, streamed in separately so the shell paints before the query lands. */
  launcher?: ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (isStage(pathname)) return <>{children}</>;

  const isActive = (match: string[]) =>
    match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const youActive =
    isActive(['/settings']) || (viewer !== null && pathname === routes.profile(viewer.handle));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#main"
        className="bg-gold text-on-gold sr-only rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
      >
        Skip to content
      </a>

      {/* Phone top bar */}
      <header className="border-line-faint bg-surface-0/95 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 md:hidden">
        <Link href={routes.markets()} aria-label="Hindsight, markets">
          <Wordmark size="sm" />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={routes.learn.index}
            className="text-ink-lo hover:text-ink-hi grid h-10 w-10 place-items-center rounded-full"
            aria-label="Learn how it works"
          >
            <Icon name="book" size={19} />
          </Link>
          {viewer ? (
            <AccountMenu viewer={viewer} compact />
          ) : (
            <Link
              href={routes.signIn()}
              className="press text-ink-hi ring-line hover:bg-fill-2 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Desktop rail */}
      <nav
        aria-label="Primary"
        className="border-line-faint bg-surface-1 sticky top-0 hidden h-dvh w-[4.75rem] shrink-0 flex-col border-r px-2 py-5 md:flex lg:w-60 lg:px-4"
      >
        <Link
          href={routes.markets()}
          aria-label="Hindsight, markets"
          className="mb-6 flex h-9 items-center justify-center lg:justify-start lg:px-2"
        >
          <Mark size={24} tone="duo" className="text-ink-max lg:hidden" />
          <Wordmark className="hidden lg:inline-flex" />
        </Link>

        {launcher}

        <div className="relative isolate mt-5 flex flex-col gap-1">
          {/* The highlight and its gold edge travel between destinations, and move on the click
              rather than waiting for the next page to arrive. */}
          <Indicator match="[aria-current=page]" optimistic="a" className="bg-fill-2 rounded-lg" />
          <Indicator
            match="[aria-current=page]"
            optimistic="a"
            edge="left"
            offset={16}
            inset={8}
            className="bg-gold hidden rounded-full lg:block"
          />
          {DESTINATIONS.map(({ href, label, icon, match }) => {
            const active = isActive(match);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'press relative flex flex-col items-center justify-center gap-1 rounded-lg py-2 transition-colors',
                  'lg:h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-0',
                  active
                    ? 'bg-fill-2 text-ink-max in-data-[indicator=ready]:bg-transparent'
                    : 'text-ink-lo hover:bg-fill-1 hover:text-ink-hi',
                )}
              >
                <Icon name={icon} size={19} />
                <span className="text-micro font-medium lg:text-sm">{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <Link
            href={routes.learn.index}
            aria-current={isActive(['/learn']) ? 'page' : undefined}
            className={cx(
              'press flex flex-col items-center gap-1 rounded-lg py-2 transition-colors lg:flex-row lg:gap-3 lg:px-3',
              isActive(['/learn']) ? 'text-ink-max bg-fill-2' : 'text-ink-dim hover:text-ink-hi hover:bg-fill-1',
            )}
          >
            <Icon name="book" size={18} />
            <span className="text-micro font-medium lg:text-sm">Learn</span>
          </Link>

          {viewer ? (
            <AccountMenu viewer={viewer} active={youActive} />
          ) : (
            <Link
              href={routes.signIn()}
              className="press border-line hover:bg-fill-1 flex flex-col items-center gap-1 rounded-xl py-2.5 text-center transition-colors lg:items-start lg:border lg:p-3.5 lg:text-left"
            >
              <Icon name="user" size={18} className="text-ink-lo lg:hidden" />
              <span className="text-micro text-ink-lo font-medium lg:hidden">Sign in</span>
              <span className="text-ink-hi hidden text-sm font-semibold lg:block">Keep your account</span>
              <span className="text-ink-dim hidden text-xs leading-relaxed lg:block">
                Sign in to keep your balance and history on any device, and to appear on the leaderboard.
              </span>
            </Link>
          )}
        </div>
      </nav>

      <main id="main" className="max-w-app mx-auto w-full min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-14 lg:px-12">
        {children}
      </main>

      {/* Phone tab bar. 44px targets, clear of the home indicator. */}
      <nav
        aria-label="Primary"
        className="border-line-faint bg-surface-1/95 fixed inset-x-0 bottom-0 z-30 isolate flex border-t pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <Indicator match="[aria-current=page]" optimistic="a" edge="top" length={32} className="bg-gold rounded-full" />
        {DESTINATIONS.map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.match)} />
        ))}
        <Link
          href={viewer ? routes.settings : routes.signIn()}
          aria-current={youActive ? 'page' : undefined}
          className={cx(
            'flex h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors',
            youActive ? 'text-ink-max' : 'text-ink-dim',
          )}
        >
          {viewer ? (
            <MarketSignature
              seed={viewer.avatarSeed}
              accent={viewer.avatarAccent}
              size={20}
              ring={viewer.perfectStreak ? 'gold' : 'accent'}
            />
          ) : (
            <Icon name="user" size={19} />
          )}
          <span className="text-micro font-medium">You</span>
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
        'relative flex h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors',
        active ? 'text-ink-max' : 'text-ink-dim',
      )}
    >
      {active && <span aria-hidden className="bg-gold absolute top-0 h-0.5 w-8 rounded-full in-data-[indicator=ready]:hidden" />}
      <Icon name={icon} size={19} className={cx('transition-transform duration-(--dur-3) ease-(--ease-spring)', active && '-translate-y-px scale-110')} />
      <span className="text-micro font-medium">{label}</span>
    </Link>
  );
}

function AccountMenu({ viewer, compact, active }: { viewer: ViewerChip; compact?: boolean; active?: boolean }) {
  const avatar = (
    <MarketSignature
      seed={viewer.avatarSeed}
      accent={viewer.avatarAccent}
      size={compact ? 30 : 32}
      ring={viewer.perfectStreak ? 'gold' : 'accent'}
    />
  );

  return (
    <Popover
      label="Your account"
      placement={compact ? 'bottom' : 'top'}
      width="w-64"
      className={cx(
        'press flex items-center rounded-xl transition-colors',
        compact ? 'h-10 w-10 justify-center' : 'w-full flex-col gap-1.5 p-2 lg:flex-row lg:gap-3 lg:p-2.5',
        !compact && (active ? 'bg-fill-2' : 'hover:bg-fill-1'),
      )}
      trigger={
        compact ? (
          avatar
        ) : (
          <>
            {avatar}
            <span className="hidden min-w-0 flex-1 text-left lg:block">
              <span className="text-ink-hi block truncate text-sm font-medium">
                {viewer.displayName ?? `@${viewer.handle}`}
              </span>
              <span className="text-ink-dim block truncate text-xs">@{viewer.handle}</span>
            </span>
            <Icon name="chevron-down" size={14} className="text-ink-dim hidden lg:block" />
          </>
        )
      }
    >
      <div className="border-line-faint -mx-4 -mt-4 mb-2 flex items-center gap-3 border-b px-4 py-3.5">
        {avatar}
        <div className="min-w-0">
          <div className="text-ink-max truncate text-sm font-semibold">{viewer.displayName ?? `@${viewer.handle}`}</div>
          <div className="text-ink-dim truncate text-xs">@{viewer.handle}</div>
        </div>
      </div>
      <nav className="-mx-2 flex flex-col" aria-label="Account">
        <MenuLink href={routes.portfolio()} icon="wallet">Portfolio</MenuLink>
        <MenuLink href={routes.profile(viewer.handle)} icon="user">Public profile</MenuLink>
        <MenuLink href={routes.settings} icon="settings">Settings</MenuLink>
        <MenuLink href={routes.learn.index} icon="book">Learn</MenuLink>
        <form action="/auth/sign-out" method="post" className="border-line-faint mt-1.5 border-t pt-1.5">
          <button
            type="submit"
            className="press text-ink-lo hover:text-ink-hi hover:bg-fill-2 flex h-10 w-full items-center gap-3 rounded-lg px-2 text-sm transition-colors"
          >
            <Icon name="log-out" size={17} />
            Sign out
          </button>
        </form>
      </nav>
    </Popover>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: IconName; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="press text-ink-hi hover:bg-fill-2 flex h-10 items-center gap-3 rounded-lg px-2 text-sm transition-colors"
    >
      <Icon name={icon} size={17} className="text-ink-dim" />
      {children}
    </Link>
  );
}
