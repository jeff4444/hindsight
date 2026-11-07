import Link from 'next/link';
import { GLOSSARY, type TermId } from '@/lib/glossary';
import { SCHOOLS } from '@/lib/trading/schools';
import { routes } from '@/lib/routes';
import { FEE_SCHEDULE, MARGIN, STARTING_BALANCE_USDT } from '@/core/trading/costs';
import { REPLAY_SPEEDS } from '@/core/trading/clock';
import { formatUsd } from '@/lib/trading/format';
import { Button, PersonaAvatar } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/icons';

export const metadata = { title: 'How it works' };

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/**
 * How it works, in six short sections: the plain-language version of the rulebook's §22.
 * Everything a trader needs to read the terminal, place an order, and understand what it cost, with
 * a door to the full rules and to the methods behind the schools. Every number on the page comes
 * from the constants the simulator charges, so the explanation cannot drift from the behaviour.
 */
export default function LearnPage() {
  const starting = formatUsd(STARTING_BALANCE_USDT, { decimals: 0 });
  return (
    <div className="mx-auto max-w-4xl space-y-14">
      <header>
        <div className="eyebrow text-ink-dim">Learn</div>
        <h1 className="font-display text-ink-max mt-2 text-[2.75rem] leading-none md:text-6xl">How Hindsight works</h1>
        <p className="text-ink-lo mt-4 max-w-2xl text-lg leading-relaxed">
          A real market from the past, replayed minute by minute. A {starting} paper account. Orders that fill and cost what
          they would on an exchange. Trade it, then see what the market was and what you made of it.
        </p>
      </header>

      <Section n={1} icon="candle" title="The market" lede="Real pair, real prices, no date.">
        <p>
          Every session is a real stretch of a real Binance spot market, including coins that were later delisted, so the
          library is not only the survivors. You see the pair, its real prices and volume, and about two weeks of history
          before the replay starts.
        </p>
        <p>
          What you do not see is the date. The weekday and time of day are real, but the calendar date stays hidden until
          the session ends — otherwise anyone could look up what happens next. The <strong>Practice</strong> account may show
          dates; it never reaches a leaderboard.
        </p>
      </Section>

      <Section n={2} icon="play" title="The replay" lede="Sixty hours, at the speed you choose.">
        <p>
          Press play and the market moves on, one minute at a time, at{' '}
          {REPLAY_SPEEDS.map((speed) => `${speed}`).join(', ')} market-minutes per second. Pause to think, step one candle at
          a time, or end the session early. Leave the page and the replay pauses itself where you left it.
        </p>
        <p>
          The server keeps the clock. Your browser only ever has the minutes that have already printed, so there is nothing
          ahead to scroll to or inspect. When the tape ends, anything still open is closed at the last price.
        </p>
      </Section>

      <Section n={3} icon="wallet" title="Orders" lede="Market, limit and stop, long or short.">
        <ul className="grid gap-3 sm:grid-cols-3">
          <Fact term="market" body="Fills now, at the price on offer." />
          <Fact term="limit" body="Rests at your price, fills when the market trades through it." />
          <Fact term="stop" body="Waits beyond the market, then fills at whatever the market gives." />
        </ul>
        <p>
          Size an order in coins, in dollars, or as a share of your buying power — or set a stop-loss and pick how much of
          your equity to risk on it, and the ticket works out the size. Attach a <strong>take-profit</strong> and a{' '}
          <strong>stop-loss</strong> to any order: they arm when it fills, and when one of them fills the other is cancelled.
          Drag any working order on the chart to move it.
        </p>
        <p>
          Sell with no position and you are short. Buy more to scale in, sell part to scale out, or sell more than you hold
          to flip. One position per market, as on a real account.
        </p>
      </Section>

      <Section n={4} icon="activity" title="Fills and costs" lede="Filled against the real minute bars.">
        <p>
          Limits fill when the minute&rsquo;s range reaches them — at your price, or better if the market opened through it.
          Stops fill at the trigger plus slippage, or at the open if the market gapped past them. When one minute could have
          hit both your stop and your target, nobody can know which came first, so the stop is taken and the fill is marked{' '}
          <em>ambiguous</em> in your review.
        </p>
        <dl className="border-line bg-surface-2 divide-line-faint divide-y overflow-hidden rounded-2xl border">
          <Row label="Maker fee (limit orders)" value={pct(FEE_SCHEDULE.makerBps)} note="Binance spot, published" />
          <Row label="Taker fee (market and stop orders)" value={pct(FEE_SCHEDULE.takerBps)} note="Binance spot, published" />
          <Row label="Spread" value={`${FEE_SCHEDULE.halfSpreadBps * 2} bp`} note="Ours — the archive has trades, not quotes" />
          <Row label="Stop slippage" value={`${FEE_SCHEDULE.stopSlippageBps} bp`} note="Ours" />
        </dl>
      </Section>

      <Section n={5} icon="shield" title="Margin" lede={`Up to ${MARGIN.maxGrossLeverage}× your equity.`}>
        <p>
          Your position and your resting orders together may be worth up to {MARGIN.maxGrossLeverage}× your equity, long or
          short. That is your <strong>buying power</strong>, and the ticket checks it before an order is accepted and again
          when it fills.
        </p>
        <p>
          If losses take equity below {MARGIN.maintenanceRatio * 100}% of what the position is worth, it is{' '}
          <strong>liquidated</strong>: closed for you at the market, with a {pct(MARGIN.liquidationFeeBps)} fee. If equity
          reaches zero, the account is finished until you reset it.
        </p>
      </Section>

      <Section n={6} icon="trophy" title="Accounts and rankings" lede="Your money carries from session to session.">
        <p>
          Your <strong>main</strong> account starts with {starting} and carries every session&rsquo;s result into the next,
          like a real account. After ten sessions it appears on the leaderboard, ranked by return, win rate or drawdown.
          Today&rsquo;s market is the same for everyone; its board opens when you finish it.
        </p>
        <p>
          The schools trade too: seven published trading systems and a coin flip, each on its own {starting} account, on
          every market in the library, with the same fees and fills as you. After every session, the review shows what each
          of them did on the market you just traded.
        </p>
        <div className="flex flex-wrap gap-2">
          {SCHOOLS.map(({ persona, spec }) => (
            <Link
              key={spec.code}
              href={routes.strategies.show(spec.code)}
              className="border-line bg-surface-2 hover:border-rule flex items-center gap-2 rounded-sm border py-1 pr-3 pl-1 transition-colors"
            >
              <PersonaAvatar persona={persona} size={26} />
              <span className="text-ink-hi text-sm">{persona.name}</span>
            </Link>
          ))}
        </div>
      </Section>

      <section className="space-y-4">
        <h2 className="font-display text-ink-max text-2xl">Words you will meet</h2>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {(Object.keys(GLOSSARY) as TermId[]).map((id) => (
            <div key={id} id={`term-${id}`} className="scroll-mt-6">
              <dt className="text-ink-max font-semibold">{GLOSSARY[id].label}</dt>
              <dd className="text-ink-lo mt-0.5 text-sm leading-relaxed">{GLOSSARY[id].body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Door href={routes.learn.rulebook('22-trading')} icon="rules" title="The rulebook" body="Every rule the exchange enforces, in full — how markets are chosen, how orders fill, what is charged and when an account is liquidated." />
        <Door href={routes.learn.methods} icon="book" title="Methods" body="The schools one by one, with their sources, how each one trades, and what was measured about whether any of them has an edge." />
      </section>

      <div className="flex justify-center pb-6">
        <Button href={routes.trade.open({ kind: 'random' })} variant="primary" size="lg">
          <Icon name="candle" size={15} />
          Start trading
        </Button>
      </div>
    </div>
  );
}

function Section({ n, icon, title, lede, children }: { n: number; icon: IconName; title: string; lede: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)]">
      <div>
        <div className="flex items-center gap-2">
          <span className="bg-fill-2 text-ink-hi ring-line grid h-9 w-9 place-items-center rounded-xl ring-1">
            <Icon name={icon} size={17} />
          </span>
          <span className="numeral text-ink-dim text-sm">0{n}</span>
        </div>
        <h2 className="font-display text-ink-max mt-3 text-2xl">{title}</h2>
        <p className="font-display text-ink-lo mt-1 text-lg italic">{lede}</p>
      </div>
      <div className="text-ink space-y-4 text-base leading-relaxed [&_strong]:text-ink-max [&_strong]:font-semibold">{children}</div>
    </section>
  );
}

function Fact({ term, body }: { term: TermId; body: string }) {
  return (
    <li className="border-line bg-surface-2 rounded-2xl border p-4">
      <div className="text-ink-max font-semibold">{GLOSSARY[term].label}</div>
      <p className="text-ink-lo mt-1 text-sm leading-relaxed">{body}</p>
    </li>
  );
}

function Row({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-3">
      <dt>
        <div className="text-ink-hi text-sm font-medium">{label}</div>
        <div className="text-ink-dim text-xs">{note}</div>
      </dt>
      <dd className="numeral text-ink-max font-semibold">{value}</dd>
    </div>
  );
}

function Door({ href, icon, title, body }: { href: string; icon: IconName; title: string; body: string }) {
  return (
    <Link href={href} className="press lift border-line bg-surface-2 hover:border-line-strong rounded-2xl border p-6 transition-colors">
      <Icon name={icon} size={22} className="text-accent-ink" />
      <h2 className="text-ink-max mt-4 text-lg font-semibold">{title}</h2>
      <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">{body}</p>
    </Link>
  );
}
