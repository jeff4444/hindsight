import Link from 'next/link';
import { routes } from '@/lib/routes';
import { SCHOOLS } from '@/lib/trading/schools';
import { FEE_SCHEDULE, MARGIN, STARTING_BALANCE_USDT } from '@/core/trading/costs';
import { formatUsd } from '@/lib/trading/format';
import { Button, PersonaAvatar, TextLink, cx } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/icons';
import { TerminalPreview } from '@/components/marketing/TerminalPreview';

export const dynamic = 'force-dynamic';

/**
 * The front door, set as a front page.
 *
 * It leads with the terminal, because a trading platform is the pitch and no paragraph about one
 * competes with seeing it. Then, in order: how a session goes, what trading here costs (the
 * schedule itself, read from the constants the simulator charges), the schools trading beside
 * you, the ways into a market, and the promises that keep a replay honest.
 *
 * Every section opens under a full-width rule with its name set in the caption italic, the way a
 * paper's sections do; nothing is boxed that a rule can separate instead.
 */
export default function LandingPage() {
  const starting = formatUsd(STARTING_BALANCE_USDT, { decimals: 0 });
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-12 pb-20 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <div className="eyebrow text-accent-ink text-base!">Paper trading on real market history</div>
          <h1 className="font-display text-ink-max mt-3 text-[3.25rem] leading-[0.96] md:text-[4.75rem]">
            Trade the past like it is live.
          </h1>
          <p className="text-ink-lo mt-6 max-w-lg text-lg leading-relaxed md:text-xl">
            Real Binance markets, replayed minute by minute at real prices. Place market, limit and stop orders from a{' '}
            {starting} account, go long or short, and find out what your trading is worth in dollars.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button href={routes.trade.open({ kind: 'random' })} variant="primary" size="xl">
              <Icon name="candle" size={16} />
              Start trading
            </Button>
            <Button href="/demo" variant="secondary" size="xl">
              Try the terminal
            </Button>
          </div>
          <p className="text-ink-dim mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span>No sign-up</span>
            <span aria-hidden>·</span>
            <span>{starting} of paper money</span>
            <span aria-hidden>·</span>
            <span>About four minutes a market</span>
          </p>
        </div>
        <TerminalPreview />
      </section>

      {/* How a session goes */}
      <Section label="How it works">
        <h2 className="font-display text-ink-max max-w-2xl text-4xl leading-tight md:text-5xl">Pick. Trade. Settle. Review.</h2>
        <ol className="divide-line mt-10 grid gap-y-8 md:grid-cols-4 md:divide-x">
          <Step n={1} icon="candle" title="Pick a market" body="A real pair from the Binance archive, with the history before it. The pair and prices are real; the date stays hidden." />
          <Step n={2} icon="play" title="Trade the replay" body="Sixty hours of minutes stream in. Play, pause, speed up, step one candle. Order at any moment, with a take-profit and a stop attached." />
          <Step n={3} icon="wallet" title="Settle like an exchange" body="Fills against the real minute bars, fees on every one, slippage on stops, margin checked on every order, liquidation if it runs out." />
          <Step n={4} icon="chart-line" title="Review" body="The date, every trade in dollars, what the market offered in hindsight, and what each school did on the same tape." />
        </ol>
      </Section>

      {/* What it costs */}
      <Section label="The mechanics">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-ink-max text-4xl leading-tight md:text-5xl">Real orders, real costs.</h2>
            <p className="text-ink-lo mt-5 text-lg leading-relaxed">
              Every order fills the way an exchange would fill it against that minute&rsquo;s real candle: limits on touch, stops
              on the wick with slippage, gaps at the worse price. When a candle could have hit your stop and your target, the
              stop gets it.
            </p>
            <p className="text-ink-lo mt-4 text-lg leading-relaxed">
              Nothing is free. Commission is charged on every fill, and a tight stop pays for it again and again.
            </p>
            <TextLink href={routes.learn.rulebook('22-trading')} className="mt-6 inline-block font-semibold">
              Every rule, written down
            </TextLink>
          </div>
          <CostSheet />
        </div>
      </Section>

      {/* The schools */}
      <Section label="Strategies">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <h2 className="font-display text-ink-max text-4xl leading-tight md:text-5xl">Seven schools and a coin, trading beside you.</h2>
            <p className="text-ink-lo mt-5 text-lg leading-relaxed">
              Each school of thought runs its published rules on its own {starting} account, on every market in the
              library, with the same fees and the same fills as you. Beside them, a coin flip. Their equity curves are
              public, and so is yours on the leaderboard.
            </p>
            <TextLink href={routes.strategies.index} className="mt-6 inline-block font-semibold">
              See how they are doing
            </TextLink>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SCHOOLS.map(({ persona, spec }) => (
              <Link
                key={spec.code}
                href={routes.strategies.show(spec.code)}
                className="press lift border-line bg-surface-2 rounded-2xl border p-4"
              >
                <PersonaAvatar persona={persona} size={40} />
                <div className="text-ink-max mt-3 text-sm font-semibold">{persona.name}</div>
                <div className="text-ink-dim mt-1 line-clamp-3 text-xs leading-relaxed">{persona.style}</div>
              </Link>
            ))}
          </div>
        </div>
      </Section>

      {/* Ways in */}
      <Section label="Markets">
        <h2 className="font-display text-ink-max max-w-2xl text-4xl leading-tight md:text-5xl">One market a day, or any pair you like.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Way icon="sun" title="Today’s market" body="The same market for everyone, once. Its board opens when you finish." href={routes.trade.open({ kind: 'daily' })} featured />
          <Way icon="shuffle" title="Random market" body="Any pair, any stretch of its history. The fastest way in." href={routes.trade.open({ kind: 'random' })} />
          <Way icon="candle" title="Pick a pair" body="BTC, ETH, SOL and the rest, including coins since delisted." href={routes.markets()} />
          <Way icon="book" title="Practice" body="A second account that may show the dates. It is never ranked." href={routes.portfolio('practice')} />
        </div>
      </Section>

      {/* Honest by design */}
      <Section label="Honest by design">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <h2 className="font-display text-ink-max text-4xl leading-tight md:text-5xl">No hindsight, except the kind you earn.</h2>
          <ol className="divide-line divide-y">
            <Promise n={1} title="The future never reaches your browser early." body="The server keeps the replay clock. Your screen only ever has the minutes that have already printed, so there is nothing to scroll ahead to." />
            <Promise n={2} title="The date waits for the closing bell." body="You trade the real pair at real prices, but the calendar date appears only when the session ends — so nobody can look up what happens next." />
            <Promise n={3} title="Real markets, including the ones that failed." body="Coins that were delisted are in the library too, so the markets do not quietly drift upward." />
            <Promise n={4} title="The coin flip is on the leaderboard." body="Every school trades against it in public. Whether any of them beats it is measured, not claimed." />
          </ol>
        </div>
      </Section>

      {/* Final call */}
      <section className="border-rule border-t-2">
        <div className="mx-auto max-w-6xl px-5 py-24 text-center">
          <h2 className="font-display text-ink-max mx-auto max-w-3xl text-5xl leading-[1.02] md:text-7xl">Your {starting} is waiting.</h2>
          <p className="text-ink-lo mt-5 text-lg">Paper money, real markets, every trade in dollars.</p>
          <div className="mt-9 flex justify-center">
            <Button href={routes.trade.open({ kind: 'random' })} variant="primary" size="xl">
              <Icon name="candle" size={16} />
              Start trading
            </Button>
          </div>
          <p className="text-ink-dim mt-5 text-sm">No account needed. Sign in later and your balance comes with you.</p>
        </div>
      </section>
    </div>
  );
}

/** A section of the page: a full-width rule, its name in the caption italic, then the story. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-rule border-t-2">
      <div className="mx-auto max-w-6xl px-5 pt-6 pb-20">
        <div className="eyebrow text-ink-dim mb-10 text-sm!">{label}</div>
        {children}
      </div>
    </section>
  );
}

function Step({ n, icon, title, body }: { n: number; icon: IconName; title: string; body: string }) {
  return (
    <li className="md:px-6 md:first:pl-0 md:last:pr-0">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-accent-ink text-5xl leading-none">{n}</span>
        <Icon name={icon} size={18} className="text-ink-dim" />
      </div>
      <div className="text-ink-max mt-5 text-lg font-semibold">{title}</div>
      <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">{body}</p>
    </li>
  );
}

function Way({ icon, title, body, href, featured }: { icon: IconName; title: string; body: string; href: string; featured?: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        'press lift group flex flex-col rounded-2xl border p-5',
        featured ? 'bg-accent text-on-accent border-rule shadow-e2' : 'border-line bg-surface-2',
      )}
    >
      <span className="flex items-center justify-between">
        <Icon name={icon} size={20} className={featured ? undefined : 'text-ink-hi'} />
        <Icon name="chevron-right" size={16} className={cx('transition-transform group-hover:translate-x-0.5', featured ? 'opacity-80' : 'text-ink-dim')} />
      </span>
      <span className={cx('font-display mt-6 text-2xl', featured ? undefined : 'text-ink-max')}>{title}</span>
      <span className={cx('mt-1.5 text-sm leading-relaxed', featured ? 'opacity-85' : 'text-ink-lo')}>{body}</span>
    </Link>
  );
}

function Promise({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-5 py-5 first:pt-0">
      <span className="font-display text-accent-ink w-6 shrink-0 text-2xl leading-none">{n}</span>
      <div>
        <div className="text-ink-max font-semibold">{title}</div>
        <p className="text-ink-lo mt-1 text-sm leading-relaxed">{body}</p>
      </div>
    </li>
  );
}

/** The fee and margin schedule, as the simulator charges it — printed like a rate card. */
function CostSheet() {
  const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
  const rows: { label: string; value: string; note: string }[] = [
    { label: 'Starting balance', value: formatUsd(STARTING_BALANCE_USDT, { decimals: 0 }), note: 'Paper money, for every account' },
    { label: 'Maker fee', value: pct(FEE_SCHEDULE.makerBps), note: 'Binance spot, published' },
    { label: 'Taker fee', value: pct(FEE_SCHEDULE.takerBps), note: 'Binance spot, published' },
    { label: 'Spread', value: `${FEE_SCHEDULE.halfSpreadBps * 2} bp`, note: 'Market orders cross it' },
    { label: 'Stop slippage', value: `${FEE_SCHEDULE.stopSlippageBps} bp`, note: 'A stop fills as a market order' },
    { label: 'Buying power', value: `${MARGIN.maxGrossLeverage}× equity`, note: 'Long or short' },
    { label: 'Liquidation', value: `${MARGIN.maintenanceRatio * 100}% margin`, note: `Forced close, ${pct(MARGIN.liquidationFeeBps)} fee` },
  ];
  return (
    <div className="border-rule bg-surface-2 shadow-e3 rounded-3xl border px-6 pt-5 pb-3">
      <div className="rule-double flex items-baseline justify-between pb-3">
        <span className="font-display text-ink-max text-xl">Fee and margin schedule</span>
        <span className="numeral text-ink-dim text-xs">{FEE_SCHEDULE.version}</span>
      </div>
      <dl className="divide-line divide-y">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline py-3">
            {/* Dot leaders, as on a rate card, carry the eye from the item to its price. */}
            <dt className="text-ink-hi flex min-w-0 flex-1 items-baseline gap-3 pr-3 text-sm font-semibold">
              {row.label}
              <span aria-hidden className="border-line-strong min-w-4 flex-1 border-b-2 border-dotted" />
            </dt>
            <dd className="numeral text-ink-max text-lg font-semibold">{row.value}</dd>
            <dd className="text-ink-dim w-full text-xs">{row.note}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
