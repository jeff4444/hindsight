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
 * A masthead, the way a paper opens: the name on the left, the sections across the top — Markets,
 * Portfolio, Strategies, Leaderboard, Learn — and the account on the right, all standing on a
 * double rule. The identity block opens a menu with your portfolio, your profile, Settings, Learn
 * and Sign out.
 *
 * On a phone the masthead slims to the name and the account, and the sections move to a tab bar at
 * the bottom, clear of the home indicator. Nothing here animates its size: the chart re-applies its
 * range from a ResizeObserver, and a header that grew or shrank would fire that every frame.
 *
 * A trading session opts out entirely: the terminal owns the screen and the only navigation that
 * matters is the way out. Markets, where a session starts, is a destination like any other and
 * keeps the masthead.
 */

export interface ViewerChip {
  handle: string;
  displayName: string | null;
  avatarSeed: number;
  avatarAccent: Accent;
}

const DESTINATIONS: { href: string; label: string; icon: IconName; match: string[] }[] = [
  { href: routes.markets(), label: 'Markets', icon: 'candle', match: ['/markets', '/trade'] },
  { href: routes.portfolio(), label: 'Portfolio', icon: 'wallet', match: ['/portfolio'] },
  { href: routes.strategies.index, label: 'Strategies', icon: 'bot', match: ['/strategies'] },
  { href: routes.leaderboard(), label: 'Leaderboard', icon: 'trophy', match: ['/leaderboard'] },
];

/** Learn sits in the masthead with the sections, and behind the book icon on a phone. */
const LEARN = { href: routes.learn.index, label: 'Learn', icon: 'book' as IconName, match: ['/learn'] };

/**
 * Routes that render on the full-bleed stage with no shell around them: the trading terminal (a
 * session, or a market being opened). A session's review is a page and keeps the shell.
 */
export function isStage(pathname: string): boolean {
  return /^\/trade\/[^/]+\/?$/.test(pathname);
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
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="bg-accent text-on-accent sr-only rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
      >
        Skip to content
      </a>

      <header className="bg-surface-0 rule-double sticky top-0 z-30">
        {/* Phone: the name and the account. */}
        <div className="flex h-14 items-center justify-between px-4 md:hidden">
          <Link href={routes.markets()} aria-label="Hindsight, markets">
            <Wordmark size="sm" />
          </Link>
          <div className="flex items-center gap-1">
            <Link
              href={routes.learn.index}
              className="text-ink-lo hover:text-ink-max grid h-10 w-10 place-items-center"
              aria-label="Learn how it works"
            >
              <Icon name="book" size={19} />
            </Link>
            {viewer ? (
              <AccountMenu viewer={viewer} compact />
            ) : (
              <Link
                href={routes.signIn()}
                className="press text-ink-max ring-line-strong hover:ring-rule rounded-sm px-3 py-1.5 text-sm font-semibold ring-1 ring-inset"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>

        {/* Tablet and up: the masthead. */}
        <div className="max-w-app mx-auto hidden h-16 items-stretch gap-6 px-8 md:flex lg:gap-10 lg:px-12">
          {/* The mark alone on a tablet, where the sections need the width; the name from lg up. */}
          <Link href={routes.markets()} aria-label="Hindsight, markets" className="flex shrink-0 items-center">
            <Mark size={26} tone="duo" className="text-ink-max lg:hidden" />
            <span className="hidden lg:contents">
              <Wordmark />
            </span>
          </Link>

          <nav aria-label="Primary" className="relative isolate flex items-stretch">
            {/* The pen's underline travels between sections, and moves on the click rather than
                waiting for the next page to arrive. */}
            <Indicator match="[aria-current=page]" optimistic="a" edge="bottom" thickness={3} className="bg-accent" />
            {[...DESTINATIONS, LEARN].map(({ href, label, match }) => {
              const active = isActive(match);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'relative flex items-center border-b-[3px] px-2.5 text-sm font-semibold whitespace-nowrap transition-colors lg:px-3 xl:px-3.5 xl:text-[0.9375rem]',
                    active
                      ? 'border-accent text-ink-max in-data-[indicator=ready]:border-transparent'
                      : 'text-ink-lo hover:text-ink-max border-transparent',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {launcher}
            {viewer ? (
              <AccountMenu viewer={viewer} active={youActive} />
            ) : (
              <Link
                href={routes.signIn()}
                className="press text-ink-lo hover:text-ink-max flex h-10 items-center px-2 text-sm font-semibold whitespace-nowrap transition-colors"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="max-w-app mx-auto w-full min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-16 lg:px-12">
        {children}
      </main>

      {/* Phone tab bar. 44px targets, clear of the home indicator. */}
      <nav
        aria-label="Primary"
        className="border-rule bg-surface-0 fixed inset-x-0 bottom-0 z-30 isolate flex border-t-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <Indicator match="[aria-current=page]" optimistic="a" edge="top" thickness={3} length={32} className="bg-accent" />
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
              ring="accent"
            />
          ) : (
            <Icon name="user" size={19} />
          )}
          <span className="text-micro font-semibold">You</span>
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
      {active && <span aria-hidden className="bg-accent absolute top-0 h-[3px] w-8 in-data-[indicator=ready]:hidden" />}
      <Icon name={icon} size={19} className={cx('transition-transform duration-(--dur-3) ease-(--ease-spring)', active && '-translate-y-px scale-110')} />
      <span className="text-micro font-semibold">{label}</span>
    </Link>
  );
}

function AccountMenu({ viewer, compact, active }: { viewer: ViewerChip; compact?: boolean; active?: boolean }) {
  const avatar = (
    <MarketSignature
      seed={viewer.avatarSeed}
      accent={viewer.avatarAccent}
      size={compact ? 30 : 32}
      ring="accent"
    />
  );

  return (
    <Popover
      label="Your account"
      placement="bottom"
      width="w-64"
      className={cx(
        'press flex items-center rounded-md transition-colors',
        compact ? 'h-10 w-10 justify-center' : 'h-11 gap-2 px-1.5',
        !compact && (active ? 'bg-fill-2' : 'hover:bg-fill-1'),
      )}
      trigger={
        compact ? (
          avatar
        ) : (
          <>
            {avatar}
            <Icon name="chevron-down" size={14} className="text-ink-dim" />
          </>
        )
      }
    >
      <div className="border-line -mx-4 -mt-4 mb-2 flex items-center gap-3 border-b px-4 py-3.5">
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
        <form action="/auth/sign-out" method="post" className="border-line mt-1.5 border-t pt-1.5">
          <button
            type="submit"
            className="press text-ink-lo hover:text-ink-max hover:bg-fill-2 flex h-10 w-full items-center gap-3 rounded-sm px-2 text-sm transition-colors"
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
      className="press text-ink-hi hover:bg-fill-2 flex h-10 items-center gap-3 rounded-sm px-2 text-sm transition-colors"
    >
      <Icon name={icon} size={17} className="text-ink-dim" />
      {children}
    </Link>
  );
}
