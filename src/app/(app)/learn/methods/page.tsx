import Link from 'next/link';
import { routes } from '@/lib/routes';
import { SCHOOLS } from '@/lib/trading/schools';
import { formatPct } from '@/lib/trading/format';
import { getBotAccounts, type BotAccount } from '@/lib/trading/server/queries';
import { BOT_PARAMS } from '@/core/bots/spec';
import { Chip, PersonaAvatar } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

export const metadata = { title: 'Methods' };
export const dynamic = 'force-dynamic';

/**
 * Methods: the research layer, behind its door.
 *
 * Where the schools come from and how each one trades, what keeps the exchange honest, and what is
 * not known — in plain words, with links into the rulebook for the numbers. Each school's record is
 * read from its live account rather than written here, so the page cannot go stale.
 */
export default async function MethodsPage() {
  const accounts = await getBotAccounts();
  const byCode = new Map<string, BotAccount>((accounts ?? []).map((account) => [account.code, account]));

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
        <h2 className="text-ink-max text-2xl font-semibold tracking-tight">The schools</h2>
        <p className="text-ink-lo max-w-2xl leading-relaxed">
          Each school is an engine that reads the market by one published system&rsquo;s rules, written down so any two
          people implementing it would get the same answer. Where a school publishes no rule precise enough, the rule is
          ours, and it says so. As traders they get in by those rules, get out the way the school says to, and size every
          trade so its stop costs {BOT_PARAMS.riskFraction * 100}% of equity. They see the same history you do and never the
          future.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SCHOOLS.map(({ persona, spec, exit }) => {
            const account = byCode.get(spec.code);
            return (
              <article key={spec.code} id={spec.code.toLowerCase()} className="border-line bg-surface-2 scroll-mt-24 rounded-2xl border p-5">
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
                <p className="text-ink-lo mt-2 text-sm leading-relaxed">
                  <span className="text-ink-hi font-medium">Exit.</span> {exit}
                </p>
                <p className="numeral text-ink-dim mt-3 text-xs">
                  <Link href={routes.strategies.show(spec.code)} className="hover:text-ink-hi">
                    {account && account.sessions > 0
                      ? `${formatPct(account.returnPct, { sign: true })} over ${account.roundTrips.toLocaleString('en-US')} trades on ${account.sessions.toLocaleString('en-US')} markets`
                      : 'Its account has not traded yet'}
                  </Link>
                </p>
              </article>
            );
          })}
        </div>
        <div className="border-gold-line bg-gold-bg rounded-2xl border p-5">
          <p className="text-ink-max font-semibold">In the first measurement, none of them could be told apart from a coin flip.</p>
          <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">
            Before they had accounts, every school&rsquo;s trades were compared with a coin flip on the same charts, and one test
            across all of them returned p = 0.85. The accounts are the second test, in dollars and with each school&rsquo;s own
            exit. They are here to show how competent methods disagree, not to tell you the answer.{' '}
            <Link href={routes.learn.rulebook('147-does-any-of-it-work-the-leaderboard-corrected')} className="text-ink-hi underline decoration-gold-line underline-offset-4">
              The first measurement
            </Link>
          </p>
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-ink-max text-2xl font-semibold tracking-tight">Why the results are fair</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Point title="No future data on your device" body="The server keeps the replay clock and only ever sends minutes that have printed. A test checks every response for leaks." href={routes.learn.rulebook('229-integrity')} />
          <Point title="Filled against the real minutes" body="Every order fills against the one-minute bars of the real market, and a minute that could have gone either way goes against you." href={routes.learn.rulebook('224-fills')} />
          <Point title="Costs are charged" body="Commission on every fill, the spread on market orders and slippage on stops — the same for you and for every school." href={routes.learn.rulebook('225-costs')} />
          <Point title="Survivors and failures alike" body="Coins that were later delisted are in the library, so markets do not quietly drift upward and reward going long." href={routes.learn.rulebook('7-the-corpus')} />
          <Point title="The date waits for the bell" body="The pair and its prices are real; the calendar date is held back until the session ends, so nobody can look up what happens next." href={routes.learn.rulebook('229-integrity')} />
          <Point title="Scenarios are rules, not picks" body="A scenario is a published filter over the library, never hand-chosen, so what it says about a market is what it means." href={routes.learn.rulebook('20-maps')} />
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-ink-max text-2xl font-semibold tracking-tight">What is not known</h2>
        <div className="space-y-4">
          <Open title="Whether any school has an edge in dollars." href={routes.strategies.index}>
            Each account runs the school&rsquo;s rules unchanged across the whole library, whatever the result. A school that
            ends up ahead of the coin over that many markets has shown something; one that does not has shown something too.
            The rules are versioned, so a tuned school starts a fresh account rather than rewriting the old one.
          </Open>
          <Open title="Whether practice here transfers to real trading.">
            A replay does not reproduce real money, a real order book or real pressure, and there is no published evidence
            that replay practice transfers. Hindsight does not claim to make anyone profitable. It lets you trade real
            history with real costs and see, in dollars, what your decisions were worth.
          </Open>
        </div>
      </section>

      <section className="border-line bg-surface-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-6">
        <div>
          <div className="text-ink-max font-semibold">Read every rule, in full</div>
          <p className="text-ink-lo mt-1 text-sm">The same document the platform is built from, including the parts that do not flatter it.</p>
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
    <Link href={href} className="press lift border-line bg-surface-2 hover:border-line-strong group rounded-2xl border p-5 transition-colors">
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
