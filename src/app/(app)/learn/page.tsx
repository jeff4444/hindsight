import Link from 'next/link';
import { TIERS } from '@/core/tiers';
import { DIVISIONS } from '@/core/divisions';
import { PANEL } from '@/lib/panel';
import { routes } from '@/lib/routes';
import { Button, DivisionBadge, PersonaAvatar } from '@/components/ui';
import { ChartArt } from '@/components/ui/ChartArt';
import { Icon, type IconName } from '@/components/ui/icons';

export const metadata = { title: 'How it works' };

/**
 * How it works, in six short sections. The plain-language version of the rulebook: everything a
 * player needs to understand a round, a score and a rating, with a door to the full rules and to
 * the methods for anyone who wants the evidence.
 */
export default function LearnPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-14">
      <header>
        <div className="eyebrow text-ink-dim">Learn</div>
        <h1 className="font-display text-ink-max mt-2 text-[2.75rem] leading-none md:text-6xl">How Hindsight works</h1>
        <p className="text-ink-lo mt-4 max-w-2xl text-lg leading-relaxed">
          Read a real chart with the name and date hidden. Call the trade. Watch what actually happened. See how your call
          ranks against every trade you could have made.
        </p>
      </header>

      <Section n={1} icon="eye" title="The chart" lede="Real history, no clues.">
        <p>
          Each chart is a real stretch of a real market — crypto, from the public Binance archive, including coins that
          were later delisted. The ticker and the date are hidden, the price is re-based to 100 at the first candle, and
          about half of all charts are flipped upside down, so you read the shape and not a memory.
        </p>
        <p>
          The one thing never hidden is scale: a badge says how big one <strong>ATR</strong> (a typical candle) is, because
          you cannot place a sensible stop without it.
        </p>
        <div className="border-line bg-surface-1 overflow-hidden rounded-2xl border">
          <ChartArt seed={1717} width={720} height={120} fog={0.25} />
        </div>
      </Section>

      <Section n={2} icon="arrow-up" title="Your call" lede="Long, short, or sit out.">
        <p>
          Pick a side and set two lines: the stop, where you are wrong, measured in ATR; and the target, where you take
          profit, measured in <strong>R</strong> — multiples of what you risked. A 1 ATR stop with a 2R target risks one to
          make two.
        </p>
        <p>
          Sitting out is a real answer. It scores exactly zero, and on most charts the typical trade loses money — so
          standing aside often ranks well.
        </p>
      </Section>

      <Section n={3} icon="play" title="The reveal" lede="The future is fog until you commit.">
        <p>
          Lock it in and the next sixty hours arrive one candle at a time. The candles you have not seen are only sent to
          your browser after you commit, so there is nothing to scroll to. Trades resolve minute by minute, so there is no
          guessing which line was hit first, and every trade pays a realistic spread and slippage.
        </p>
      </Section>

      <Section n={4} icon="distribution" title="Your score" lede="Ranked against every trade that was possible.">
        <p>
          One trade is mostly luck, so Hindsight compares yours with all 98 trades that were possible on that exact chart:
          both sides, seven stops, seven targets. Your <strong>score</strong> is how many of them you beat, out of 100.
        </p>
        <ul className="grid gap-3 sm:grid-cols-3">
          <Fact title="Par" body="The typical trade on the chart — the middle of the 98." />
          <Fact title="Best in hindsight" body="The best of the 98, drawn in gold after every chart." gold />
          <Fact title="Sitting out" body="Always 0R, ranked like everything else." />
        </ul>
      </Section>

      <Section n={5} icon="users" title="The Panel" lede="Seven schools and a coin.">
        <p>
          After every chart, seven trading schools show what their published rules would have done — and they disagree,
          because competent traders do. A coin flip sits beside them, and none of the schools reliably beats it. Tap any of
          them in the review to see their trade on the chart.
        </p>
        <div className="flex flex-wrap gap-2">
          {PANEL.map((persona) => (
            <span key={persona.engine} className="border-line bg-surface-2 flex items-center gap-2 rounded-full border py-1 pr-3 pl-1">
              <PersonaAvatar persona={persona} size={26} />
              <span className="text-ink-hi text-sm">{persona.name}</span>
            </span>
          ))}
        </div>
      </Section>

      <Section n={6} icon="trophy" title="Rules and rating" lede="Choose how much you get to see.">
        <p>
          Each ruleset takes something away. Ranked play uses <strong>Naked</strong>: eighty candles, one timeframe and a
          90-second clock. Practice lets you choose, and the sandbox turns everything on without a rating.
        </p>
        <ul className="border-line bg-surface-2 divide-line-faint divide-y overflow-hidden rounded-2xl border">
          {TIERS.map((tier) => (
            <li key={tier.code} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3">
              <span className="text-ink-max font-semibold">{tier.name}</span>
              <span className="numeral text-ink-dim text-xs">
                {tier.candles} candles · {tier.timeframes.length > 1 ? `${tier.timeframes.length} timeframes` : '1 timeframe'} ·{' '}
                {tier.tools.length ? 'tools' : 'no tools'} · {tier.volume ? 'volume' : 'no volume'} ·{' '}
                {tier.clockSeconds ? `${tier.clockSeconds}s` : 'no clock'} · {tier.rated ? 'rated' : 'unrated'}
              </span>
            </li>
          ))}
        </ul>
        <p>
          Rated charts move your <strong>rating</strong>, which appears after 30 of them, once it has settled. Your rating
          names your division:
        </p>
        <div className="flex flex-wrap gap-2">
          {DIVISIONS.map((division) => (
            <DivisionBadge key={division.id} division={division} size="sm" />
          ))}
        </div>
      </Section>

      <section className="grid gap-3 md:grid-cols-2">
        <Door href={routes.learn.rulebook()} icon="rules" title="The rulebook" body="Every rule the game enforces, in full — how charts are chosen, how trades resolve, how scores and ratings are computed." />
        <Door href={routes.learn.methods} icon="book" title="Methods" body="The Panel school by school, with sources and track records, and what we measured about whether any of this is a skill." />
      </section>

      <div className="flex justify-center pb-6">
        <Button href={routes.play.daily} variant="primary" size="lg">
          <Icon name="play" size={15} />
          Play today&rsquo;s daily
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
        <h2 className="text-ink-max mt-3 text-xl font-semibold">{title}</h2>
        <p className="font-display text-ink-lo mt-1 text-lg italic">{lede}</p>
      </div>
      <div className="text-ink space-y-4 text-base leading-relaxed [&_strong]:text-ink-max [&_strong]:font-semibold">{children}</div>
    </section>
  );
}

function Fact({ title, body, gold }: { title: string; body: string; gold?: boolean }) {
  return (
    <li className={gold ? 'border-gold-line bg-gold-bg rounded-2xl border p-4' : 'border-line bg-surface-2 rounded-2xl border p-4'}>
      <div className={gold ? 'text-gold-ink font-semibold' : 'text-ink-max font-semibold'}>{title}</div>
      <p className="text-ink-lo mt-1 text-sm leading-relaxed">{body}</p>
    </li>
  );
}

function Door({ href, icon, title, body }: { href: string; icon: IconName; title: string; body: string }) {
  return (
    <Link href={href} className="press border-line bg-surface-2 hover:border-line-strong rounded-2xl border p-6 transition-colors">
      <Icon name={icon} size={22} className="text-gold-ink" />
      <h2 className="text-ink-max mt-4 text-lg font-semibold">{title}</h2>
      <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">{body}</p>
    </Link>
  );
}
