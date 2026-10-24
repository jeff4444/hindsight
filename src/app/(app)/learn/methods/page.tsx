import Link from 'next/link';
import { PANEL } from '@/lib/panel';
import { routes } from '@/lib/routes';
import { Chip, PersonaAvatar } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

export const metadata = { title: 'Methods' };

/**
 * Methods: the research layer, behind its door.
 *
 * Everything the play screens no longer say out loud — the Panel's sources and record, why scores
 * are fair, what is measured and what is not known — lives here in plain words, with links into
 * the rulebook for the numbers. Nothing was removed from the product's honesty; it was moved to
 * where the reader who wants it will look.
 */

/** Trades taken across the published 1,000-chart measurement, rules §14.5. */
const TRADES: Record<string, number> = {
  CHANNEL: 198,
  REVERSION: 22,
  REVERSION_H: 88,
  SWEEP: 54,
  PATTERN: 32,
  GEOMETRY: 0,
  TAPE: 61,
  ZERO: 1000,
};

export default function MethodsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-14">
      <header>
        <Link href={routes.learn.index} className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors">
          <Icon name="arrow-left" size={14} />
          Learn
        </Link>
        <div className="eyebrow text-ink-dim mt-6">Methods</div>
        <h1 className="font-display text-ink-max mt-2 text-[2.75rem] leading-none md:text-6xl">What we can show, and what we cannot.</h1>
        <p className="text-ink-lo mt-4 max-w-2xl text-lg leading-relaxed">
          Trading education sells certainty. Hindsight would rather measure. This page is the short version of the
          rulebook&rsquo;s evidence — follow any link for the full numbers.
        </p>
      </header>

      <section className="space-y-5">
        <h2 className="text-ink-max text-2xl font-semibold tracking-tight">The Panel</h2>
        <p className="text-ink-lo max-w-2xl leading-relaxed">
          Each persona is an engine that trades one published school by its rules, written down so any two people
          implementing it would get the same answer. Where a school publishes no rule precise enough, the rule is ours,
          and it says so. They run on the same history you see and never on the future.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PANEL.map((persona) => (
            <article key={persona.engine} id={persona.engine.toLowerCase()} className="border-line bg-surface-2 scroll-mt-24 rounded-2xl border p-5">
              <div className="flex items-start gap-3">
                <PersonaAvatar persona={persona} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-ink-max text-base font-semibold">{persona.name}</h3>
                    {persona.ours && <Chip tone="neutral">{persona.isNull ? 'the control' : 'rules are ours'}</Chip>}
                  </div>
                  <p className="text-ink-hi mt-1 text-sm">{persona.style}</p>
                </div>
              </div>
              <p className="text-ink-lo mt-3 text-sm leading-relaxed">{persona.source}</p>
              <p className="numeral text-ink-dim mt-3 text-xs">
                <Link href={routes.learn.rulebook('145-nothing-here-beats-a-coin-flip')} className="hover:text-ink-hi">
                  traded {TRADES[persona.engine]?.toLocaleString('en-US') ?? '—'} of 1,000 charts in the published measurement
                </Link>
              </p>
            </article>
          ))}
        </div>
        <div className="border-gold-line bg-gold-bg rounded-2xl border p-5">
          <p className="text-ink-max font-semibold">None of them can be told apart from a coin flip.</p>
          <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">
            On the charts each school chose to trade, compared with a coin flip on those same charts, no school shows an
            edge — one test across the whole Panel returns p = 0.85. They are on the screen to show how competent methods
            disagree, not to tell you the answer.{' '}
            <Link href={routes.learn.rulebook('147-does-any-of-it-work-the-leaderboard-corrected')} className="text-ink-hi underline decoration-gold-line underline-offset-4">
              The full measurement
            </Link>
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-ink-max text-2xl font-semibold tracking-tight">Why the scores are fair</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Point title="No future data on your device" body="The candles you have not seen are sent only after you lock in, and a test checks every response for leaks." href={routes.learn.rulebook('6-integrity')} />
          <Point title="Resolved minute by minute" body="Every chart stores the one-minute path behind its candles, so which line was hit first is a fact, not a guess." href={routes.learn.rulebook('3-resolution')} />
          <Point title="Costs are charged" body="Spread and slippage come off every trade, and off all 98 possible ones too, so tight stops are not free." href={routes.learn.rulebook('5-costs')} />
          <Point title="Survivors and failures alike" body="Coins that were later delisted are in the library, so charts do not quietly drift upward and reward going long." href={routes.learn.rulebook('7-the-corpus')} />
          <Point title="Identity destroyed, scale kept" body="Prices re-based to 100, dates removed, about half of charts mirrored — and the ATR badge always shown." href={routes.learn.rulebook('1-the-chart')} />
          <Point title="Tapes are rules, not picks" body="A tape is a published filter over the library, never hand-chosen, so its difficulty and its statistics mean what they seem to." href={routes.learn.rulebook('20-maps')} />
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-ink-max text-2xl font-semibold tracking-tight">What is not known</h2>
        <div className="space-y-4">
          <Open title="Whether reading charts is a skill at all." href={routes.learn.rulebook('162-some-of-these-charts-are-not-real')}>
            About one chart in ten is generated rather than real, and is dealt like any other. If players score
            better on real charts than on generated ones — and the gap grows with rating — that is evidence the skill
            exists. If not, what Hindsight trains is risk arithmetic and restraint, which is still worth having.
          </Open>
          <Open title="Whether practice here transfers to real trading.">
            Replay practice does not reproduce real money, real slippage or real pressure, and there is no published
            evidence that it transfers. Hindsight does not claim to make anyone profitable. It trains risk-defined
            decisions and measures calibration — and says so.
          </Open>
        </div>
      </section>

      <section className="border-line bg-surface-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6">
        <div>
          <div className="text-ink-max font-semibold">Read every rule, in full</div>
          <p className="text-ink-lo mt-1 text-sm">The same document the game is built from, including the parts that do not flatter it.</p>
        </div>
        <Link href={routes.learn.rulebook()} className="press bg-fill-2 text-ink-hi ring-line hover:bg-fill-3 rounded-full px-5 py-2.5 text-sm font-medium ring-1">
          Open the rulebook
        </Link>
      </section>
    </div>
  );
}

function Point({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <Link href={href} className="press border-line bg-surface-2 hover:border-line-strong group rounded-2xl border p-5 transition-colors">
      <div className="text-ink-max flex items-center justify-between gap-2 font-semibold">
        {title}
        <Icon name="arrow-up-right" size={15} className="text-ink-dim group-hover:text-ink-hi" />
      </div>
      <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">{body}</p>
    </Link>
  );
}

function Open({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="border-line-faint border-l-2 pl-5">
      <div className="text-ink-max font-semibold">{title}</div>
      <p className="text-ink-lo mt-1.5 max-w-2xl text-sm leading-relaxed">
        {children}
        {href && (
          <>
            {' '}
            <Link href={href} className="text-ink-hi underline decoration-line-strong underline-offset-4 hover:decoration-ink-hi">
              Read more
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
