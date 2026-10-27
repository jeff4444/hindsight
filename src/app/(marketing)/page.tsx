import Link from 'next/link';
import { routes } from '@/lib/routes';
import { SCHOOLS } from '@/lib/trading/schools';
import { FEE_SCHEDULE, MARGIN, STARTING_BALANCE_USDT } from '@/core/trading/costs';
import { formatUsd } from '@/lib/trading/format';
import { Button, PersonaAvatar, cx } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/icons';
import { TerminalPreview } from '@/components/marketing/TerminalPreview';

export const dynamic = 'force-dynamic';

/**
 * The front door.
 *
 * It leads with the terminal, because a trading platform is the pitch and no paragraph about one
 * competes with seeing it. Then, in order: how a session goes, what trading here costs (the
 * schedule itself, read from the constants the simulator charges), the schools trading beside
 * you, the ways into a market, and the promises that keep a replay honest.
 */
export default function LandingPage() {
  const starting = formatUsd(STARTING_BALANCE_USDT, { decimals: 0 });
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-14 pb-20 md:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
        <div>
          <div className="eyebrow text-gold-ink">Paper trading on real market history</div>
          <h1 className="font-display text-ink-max mt-4 text-[3.25rem] leading-[0.98] md:text-7xl">Trade the past like it is live.</h1>
          <p className="text-ink-lo mt-6 max-w-lg text-lg leading-relaxed md:text-xl">
            Real Binance markets, replayed minute by minute at real prices. Place market, limit and stop orders from a{' '}
            {starting} account, go long or short, and find out what your trading is worth in dollars.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href={routes.trade.open({ kind: 'random' })} variant="primary" size="xl">
              <Icon name="candle" size={16} />
              Start trading
            </Button>
            <Button href="/demo" variant="secondary" size="xl">
              Try the terminal
            </Button>
          </div>
          <p className="text-ink-dim mt-5 text-sm">No sign-up · {starting} of paper money · about four minutes a market</p>
        </div>
        <TerminalPreview />
      </section>

      {/* How a session goes */}
      <section className="border-line-faint bg-surface-1 border-y">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-ink-max max-w-2xl text-4xl leading-tight md:text-5xl">Pick. Trade. Settle. Review.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            <Step n={1} icon="candle" title="Pick a market" body="A real pair from the Binance archive, with the history before it. The pair and prices are real; the date stays hidden." />
            <Step n={2} icon="play" title="Trade the replay" body="Sixty hours of minutes stream in. Play, pause, speed up, step one candle. Order at any moment, with a take-profit and a stop attached." />
            <Step n={3} icon="wallet" title="Settle like an exchange" body="Fills against the real minute bars, fees on every one, slippage on stops, margin checked on every order, liquidation if it runs out." />
            <Step n={4} icon="chart-line" title="Review" body="The date, every trade in dollars, what the market offered in hindsight, and what each school did on the same tape." />
          </div>
        </div>
      </section>

      {/* What it costs */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2">
        <div>
          <div className="eyebrow text-ink-dim">The mechanics</div>
          <h2 className="font-display text-ink-max mt-3 text-4xl leading-tight md:text-5xl">Real orders, real costs.</h2>
          <p className="text-ink-lo mt-5 text-lg leading-relaxed">
            Every order fills the way an exchange would fill it against that minute&rsquo;s real candle: limits on touch, stops
            on the wick with slippage, gaps at the worse price. When a candle could have hit your stop and your target, the
            stop gets it.
          </p>
          <p className="text-ink-lo mt-4 text-lg leading-relaxed">
            Nothing is free. Commission is charged on every fill, and a tight stop pays for it again and again.
          </p>
          <Link href={routes.learn.rulebook('22-trading')} className="text-ink-hi decoration-gold-line hover:decoration-gold mt-5 inline-block underline underline-offset-4">
            Every rule, written down
          </Link>
        </div>
        <CostSheet />
      </section>

      {/* The schools */}
      <section className="border-line-faint bg-surface-1 border-y">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <div className="eyebrow text-ink-dim">Strategies</div>
              <h2 className="font-display text-ink-max mt-3 text-4xl leading-tight md:text-5xl">Seven schools and a coin, trading beside you.</h2>
              <p className="text-ink-lo mt-5 text-lg leading-relaxed">
                Each school of thought runs its published rules on its own {starting} account, on every market in the
                library, with the same fees and the same fills as you. Beside them, a coin flip. Their equity curves are
                public, and so is yours on the leaderboard.
              </p>
              <Link href={routes.strategies.index} className="text-ink-hi decoration-gold-line hover:decoration-gold mt-5 inline-block underline underline-offset-4">
                See how they are doing
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SCHOOLS.map(({ persona, spec }) => (
                <Link
                  key={spec.code}
                  href={routes.strategies.show(spec.code)}
                  className="press border-line bg-surface-2 hover:border-line-strong rounded-2xl border p-4 transition-colors"
                >
                  <PersonaAvatar persona={persona} size={40} />
                  <div className="text-ink-max mt-3 text-sm font-semibold">{persona.name}</div>
                  <div className="text-ink-dim mt-1 line-clamp-3 text-xs leading-relaxed">{persona.style}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Ways in */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="eyebrow text-ink-dim">Markets</div>
        <h2 className="font-display text-ink-max mt-3 max-w-2xl text-4xl leading-tight md:text-5xl">One market a day, or any pair you like.</h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Way icon="sun" title="Today’s market" body="The same market for everyone, once. Its board opens when you finish." href={routes.trade.open({ kind: 'daily' })} gold />
          <Way icon="shuffle" title="Random market" body="Any pair, any stretch of its history. The fastest way in." href={routes.trade.open({ kind: 'random' })} />
          <Way icon="candle" title="Pick a pair" body="BTC, ETH, SOL and the rest, including coins since delisted." href={routes.markets()} />
          <Way icon="book" title="Practice" body="A second account that may show the dates. It is never ranked." href={routes.portfolio('practice')} />
        </div>
      </section>

      {/* Honest by design */}
      <section className="border-line-faint bg-surface-1 border-y">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <div className="eyebrow text-ink-dim">Honest by design</div>
            <h2 className="font-display text-ink-max mt-3 text-4xl leading-tight">No hindsight, except the kind you earn.</h2>
          </div>
          <ul className="space-y-5">
            <Promise title="The future never reaches your browser early." body="The server keeps the replay clock. Your screen only ever has the minutes that have already printed, so there is nothing to scroll ahead to." />
            <Promise title="The date waits for the closing bell." body="You trade the real pair at real prices, but the calendar date appears only when the session ends — so nobody can look up what happens next." />
            <Promise title="Real markets, including the ones that failed." body="Coins that were delisted are in the library too, so the markets do not quietly drift upward." />
            <Promise title="The coin flip is on the leaderboard." body="Every school trades against it in public. Whether any of them beats it is measured, not claimed." />
          </ul>
        </div>
      </section>

      {/* Final call */}
      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <h2 className="font-display text-ink-max mx-auto max-w-2xl text-5xl leading-tight md:text-6xl">Your {starting} is waiting.</h2>
        <p className="text-ink-lo mt-4 text-lg">Paper money, real markets, every trade in dollars.</p>
        <div className="mt-8 flex justify-center">
          <Button href={routes.trade.open({ kind: 'random' })} variant="primary" size="xl">
            <Icon name="candle" size={16} />
            Start trading
          </Button>
        </div>
        <p className="text-ink-dim mt-4 text-sm">No account needed. Sign in later and your balance comes with you.</p>
      </section>
    </div>
  );
}

function Step({ n, icon, title, body }: { n: number; icon: IconName; title: string; body: string }) {
  return (
    <div className="border-line bg-surface-2 rounded-2xl border p-5">
      <div className="flex items-center justify-between">
        <span className="bg-fill-2 text-ink-hi ring-line grid h-10 w-10 place-items-center rounded-xl ring-1">
          <Icon name={icon} size={18} />
        </span>
        <span className="numeral text-ink-dim text-sm">0{n}</span>
      </div>
      <div className="text-ink-max mt-4 text-lg font-semibold">{title}</div>
      <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function Way({ icon, title, body, href, gold }: { icon: IconName; title: string; body: string; href: string; gold?: boolean }) {
  return (
    <Link href={href} className="press lift border-line bg-surface-2 hover:border-line-strong group flex flex-col rounded-2xl border p-5 transition-colors">
      <span className={cx('grid h-10 w-10 place-items-center rounded-xl ring-1', gold ? 'bg-gold text-on-gold ring-gold' : 'bg-fill-2 text-ink-hi ring-line')}>
        <Icon name={icon} size={18} />
      </span>
      <span className="text-ink-max mt-4 font-semibold">{title}</span>
      <span className="text-ink-lo mt-1 text-sm leading-relaxed">{body}</span>
    </Link>
  );
}

function Promise({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="bg-gold-bg text-gold-ink ring-gold-line mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1">
        <Icon name="check" size={14} stroke={2} />
      </span>
      <div>
        <div className="text-ink-max font-semibold">{title}</div>
        <p className="text-ink-lo mt-1 text-sm leading-relaxed">{body}</p>
      </div>
    </li>
  );
}

/** The fee and margin schedule, as the simulator charges it. */
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
    <div className="border-line bg-surface-2 rounded-3xl border p-6">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow text-ink-dim">Fee and margin schedule</span>
        <span className="numeral text-ink-dim text-xs">{FEE_SCHEDULE.version}</span>
      </div>
      <dl className="divide-line-faint mt-4 divide-y">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
            <dt>
              <div className="text-ink-hi text-sm font-medium">{row.label}</div>
              <div className="text-ink-dim text-xs">{row.note}</div>
            </dt>
            <dd className="numeral text-ink-max text-lg font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
