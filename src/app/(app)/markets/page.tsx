import Link from 'next/link';
import { currentViewer, listTapes, type Tape } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { dailyNumber, nextResetAt } from '@/lib/daily';
import { formatPct, formatUsd } from '@/lib/trading/format';
import {
  getAccount,
  getDailyStanding,
  getMarkets,
  getOpenSession,
  hasPlayedDaily,
  untouchedAccount,
} from '@/lib/trading/server/queries';
import { Button, Chip, EmptyState, PageHeader, Panel, SectionHeader, Stat, cx } from '@/components/ui';
import { Countdown } from '@/components/ui/client';
import { Icon } from '@/components/ui/icons';
import { MarketTable } from '@/components/markets/MarketTable';

export const dynamic = 'force-dynamic';

/**
 * Markets: where a session starts.
 *
 * Every market here is a real stretch of Binance spot history, replayed. The pair and its prices
 * are real; the calendar date is held back until the session ends, so nobody can look up what
 * happens next (§22.9). Practice sessions may show the date, and never reach a leaderboard.
 */
export default async function MarketsPage() {
  const viewer = await currentViewer();
  const owner = viewer.userId ?? viewer.sessionId;
  const day = todayNumber();

  const [account, open, markets, playedDaily, standing, scenarios] = await Promise.all([
    getAccount(owner, 'main'),
    getOpenSession(owner),
    getMarkets(),
    hasPlayedDaily(owner, day),
    getDailyStanding(day, owner),
    listTapes().catch((): Tape[] => []),
  ]);
  const shown = account ?? untouchedAccount('main');

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Markets"
        title="Trade the real thing, again."
        lede="Real Binance markets, replayed minute by minute. Real prices, real volume, real fees — and the date stays hidden until the bell, so the only way to know what happens next is to read it."
        actions={
          <Button variant="primary" size="lg" glow="gold" href={routes.trade.open({ kind: 'random' })}>
            <Icon name="shuffle" size={17} />
            Random market
          </Button>
        }
      />

      {open && (
        <Panel tone="raised" glow="gold" className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="bg-gold h-2.5 w-2.5 animate-pulse rounded-full" aria-hidden />
            <div>
              <div className="text-ink-max font-semibold">{open.symbol.replace(/USDT$/, '/USDT')} is open</div>
              <div className="text-ink-dim text-sm">Your session is paused where you left it.</div>
            </div>
          </div>
          <Button variant="primary" href={routes.trade.session(open.id)}>
            Resume
          </Button>
        </Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Panel tone="hero" pad="md" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="eyebrow text-gold-ink">Today’s market · #{day}</div>
              <h2 className="text-ink-max mt-1 text-2xl font-semibold tracking-tight">Same market, everyone, once.</h2>
            </div>
            <Chip mono size="md">
              <Icon name="clock" size={13} /> <Countdown to={nextResetAt()} />
            </Chip>
          </div>
          <p className="text-ink-lo text-sm">
            One replay, identical for every trader today, ranked by return. The pair is revealed when you open it; the date
            when the day rolls over.
          </p>
          {playedDaily ? (
            <div className="flex flex-wrap items-center gap-4">
              {standing ? (
                <>
                  <Stat
                    label="Your return"
                    value={formatPct(standing.returnPct, { sign: true })}
                    tone={standing.returnPct >= 0 ? 'long' : 'short'}
                  />
                  <Stat label="Standing" value={`${standing.rank} of ${standing.field}`} />
                </>
              ) : (
                <Chip tone="long" icon="check">
                  Traded today
                </Chip>
              )}
              <Button variant="secondary" href={routes.leaderboard('daily')} className="ml-auto">
                Today’s board
              </Button>
            </div>
          ) : (
            <div>
              <Button variant="primary" href={routes.trade.open({ kind: 'daily' })}>
                Trade today’s market
              </Button>
            </div>
          )}
        </Panel>

        <Panel pad="md" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="eyebrow text-ink-dim">Your account</div>
            <Link href={routes.portfolio()} className="text-ink-lo hover:text-ink-hi text-xs">
              Portfolio →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Equity" value={formatUsd(shown.equity)} />
            <Stat
              label="Return"
              value={formatPct(shown.returnPct, { sign: true })}
              tone={shown.returnPct > 0 ? 'long' : shown.returnPct < 0 ? 'short' : 'neutral'}
            />
            <Stat label="Sessions" value={shown.sessions} size="sm" />
            <Stat label="Win rate" value={shown.winRate === null ? '—' : formatPct(shown.winRate, { decimals: 0 })} size="sm" />
          </div>
          <div className="border-line-faint flex flex-wrap gap-2 border-t pt-3">
            <Button size="sm" variant="secondary" href={routes.trade.open({ kind: 'random' }, 'practice')}>
              Practice
            </Button>
            <Button size="sm" variant="ghost" href={routes.trade.open({ kind: 'random' }, 'practice', true)}>
              Practice with dates
            </Button>
          </div>
          <p className="text-ink-dim text-xs">
            Practice is a separate $100,000 account. It can show real dates, so it never counts on a leaderboard.
          </p>
        </Panel>
      </div>

      <section className="flex flex-col gap-4">
        <SectionHeader eyebrow="Pairs" title="Every pair in the library" />
        {markets === null ? (
          <EmptyState icon="candle" title="The market list is not available yet." body="Once the trading tables are in place, every pair in the library is listed here." />
        ) : markets.length === 0 ? (
          <EmptyState icon="candle" title="No markets yet." body="The library is empty. Build the corpus to add markets." />
        ) : (
          <MarketTable markets={markets} account="main" />
        )}
      </section>

      {scenarios.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader eyebrow="Scenarios" title="Markets picked by what they were doing" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((scenario) => (
              <Link
                key={scenario.slug}
                href={routes.trade.open({ kind: 'scenario', slug: scenario.slug })}
                className={cx(
                  'press bg-surface-2 border-line hover:border-line-strong group flex flex-col gap-2 rounded-xl border p-4 transition-colors',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-ink-max font-semibold">{scenario.name}</span>
                  <Icon name="arrow-up-right" size={15} className="text-ink-dim group-hover:text-ink-hi" />
                </div>
                <p className="text-ink-lo line-clamp-3 text-sm">{scenario.blurb}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Today's market number. A helper rather than inline, so the clock read stays out of render. */
function todayNumber(): number {
  return dailyNumber(Date.now());
}
