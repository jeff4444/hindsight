import Link from 'next/link';
import { routes } from '@/lib/routes';
import { DAMAGE_K, DUEL_HEALTH, DUEL_TAPES, MIN_MOVE, ROUND_STAKE_USDT, damage } from '@/core/game';
import { FEE_SCHEDULE } from '@/core/trading/costs';
import { formatUsd } from '@/lib/trading/format';
import { Button, TextLink, cx } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

/**
 * The front door, set as a front page.
 *
 * It leads with a grade, because the grade is the game (docs/rules.md §23): one trade on a fresh
 * $500, played over sixty hours of real market, scored against the best and worst that stretch
 * allowed. Then, in order: how a round goes, what the grade and a duel measure (the damage card
 * read from the constants the game is scored by), the three ways to play, and the promises that
 * keep a replay honest.
 *
 * Every section opens under a full-width rule with its name set in the caption italic, the way a
 * paper's sections do; nothing is boxed that a rule can separate instead.
 */
export default function LandingPage() {
  const stake = formatUsd(ROUND_STAKE_USDT, { decimals: 0 });
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-12 pb-20 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-16">
        <div>
          <div className="eyebrow text-accent-ink text-base!">A trading game on real market history</div>
          <h1 className="font-display text-ink-max mt-3 text-[3.25rem] leading-[0.96] md:text-[4.75rem]">One trade. Sixty hours. Graded.</h1>
          <p className="text-ink-lo mt-6 max-w-lg text-lg leading-relaxed md:text-xl">
            Read a real market up to a moment in its past. Draw your levels, place one trade on a fresh {stake}, and lock it in.
            Then the tape plays — and you are graded out of 1000 against the best and the worst trade it allowed.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button href={routes.play.new} variant="primary" size="xl">
              <Icon name="candle" size={16} />
              Deal a tape
            </Button>
            <Button href="/demo" variant="secondary" size="xl">
              Try a round
            </Button>
          </div>
          <p className="text-ink-dim mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <span>No sign-up</span>
            <span aria-hidden>·</span>
            <span>No money</span>
            <span aria-hidden>·</span>
            <span>A few minutes a round</span>
          </p>
        </div>
        <GradePreview />
      </section>

      {/* How a round goes */}
      <Section label="How it works">
        <h2 className="font-display text-ink-max max-w-2xl text-4xl leading-tight md:text-5xl">Read. Lock in. Watch. Graded.</h2>
        <ol className="divide-line mt-10 grid gap-y-8 md:grid-cols-4 md:divide-x">
          <Step n={1} icon="candle" title="Read" body="Two weeks of a real pair's history, the date held back. Draw on it, add your studies, take your time." />
          <Step n={2} icon="lock" title="Lock in" body={`Long or short, up to ${stake}, at the bell or resting on the tape, with a take-profit and a stop. Or sit out.`} />
          <Step n={3} icon="play" title="Watch" body="The next sixty hours play at the speed you like. Nothing can be changed: you find out what your read was worth." />
          <Step n={4} icon="oracle" title="Graded" body="Out of 1000, against the best and worst trade the tape allowed — both drawn on the chart where they happened." />
        </ol>
      </Section>

      {/* The grade and the duel */}
      <Section label="The scoring">
        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-ink-max text-4xl leading-tight md:text-5xl">Graded against what was possible.</h2>
            <p className="text-ink-lo mt-5 text-lg leading-relaxed">
              Not against luck, and not against a crowd. Once the tape has played, Hindsight finds the best trade it allowed and
              the worst, as real orders filled and charged like yours, and puts your result between them. A quiet tape and a
              wild one both run from 0 to 1000.
            </p>
            <p className="text-ink-lo mt-4 text-lg leading-relaxed">
              Sitting out scores a little over 500, because it pays no fees. That is the bar a trade has to clear. In a duel,
              the lower grade on each tape loses points, and a bigger gap hits a great deal harder.
            </p>
            <TextLink href={routes.learn.rulebook('23-the-game')} className="mt-6 inline-block font-semibold">
              Every rule, written down
            </TextLink>
          </div>
          <DamageCard />
        </div>
      </Section>

      {/* Three ways */}
      <Section label="Ways to play">
        <h2 className="font-display text-ink-max max-w-2xl text-4xl leading-tight md:text-5xl">Alone, against a friend, or against a school.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Way icon="candle" title="Training grounds" body="Just you and the tape. Your grade is your score, and your average is your record." href={routes.play.new} featured />
          <Way
            icon="swords"
            title="Duel a friend"
            body={`Send a link. ${DUEL_TAPES} tapes, ${DUEL_HEALTH} points each, played in your own time. Knock them out, or finish with more.`}
            href={routes.play.index}
          />
          <Way icon="bot" title="Duel a school" body="A school reads every tape under a published playbook, plays its trade live beside yours, then shows you why." href={routes.schools} />
        </div>
      </Section>

      {/* Honest by design */}
      <Section label="Honest by design">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <h2 className="font-display text-ink-max text-4xl leading-tight md:text-5xl">No hindsight, except the kind you earn.</h2>
          <ol className="divide-line divide-y">
            <Promise n={1} title="The future never reaches your browser early." body="Not one minute of the tape leaves the server until your trade is locked in, and nothing can be changed after it." />
            <Promise n={2} title="The date waits for your grade." body="The pair, the prices, the weekday and the time are real; the calendar date arrives with your result, so nothing can be looked up." />
            <Promise n={3} title="Never the same tape twice." body={`You are only dealt tapes you have not played — in a duel, tapes neither of you has — and only ones that moved at least ${MIN_MOVE * 100}%.`} />
            <Promise n={4} title="Real costs, real fills." body={`Every order fills against that minute's real candle and pays ${FEE_SCHEDULE.takerBps / 100}% a side. When a candle could have hit your stop and your target, the stop gets it.`} />
          </ol>
        </div>
      </Section>

      {/* Final call */}
      <section className="border-rule border-t-2">
        <div className="mx-auto max-w-6xl px-5 py-24 text-center">
          <h2 className="font-display text-ink-max mx-auto max-w-3xl text-5xl leading-[1.02] md:text-7xl">Your first tape is waiting.</h2>
          <p className="text-ink-lo mt-5 text-lg">One trade, sixty hours, a grade out of 1000.</p>
          <div className="mt-9 flex justify-center">
            <Button href={routes.play.new} variant="primary" size="xl">
              <Icon name="candle" size={16} />
              Deal a tape
            </Button>
          </div>
          <p className="text-ink-dim mt-5 text-sm">No account needed. Sign in later and your rounds come with you.</p>
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

/** A result card, drawn rather than rendered from a round: what the end of a round looks like. */
function GradePreview() {
  const rows = [
    { label: 'You', note: 'Long at the bell, out at the take-profit', value: '$525.10', tone: 'gain' },
    { label: 'Best in hindsight', note: 'Long the low, out at the high', value: '$548.40', tone: 'accent' },
    { label: 'Worst in hindsight', note: 'Short the low, stopped at the high', value: '$451.60', tone: 'loss' },
  ] as const;
  return (
    <div className="border-rule bg-surface-2 shadow-e3 border px-6 pt-5 pb-4" aria-hidden>
      <div className="rule-double flex items-baseline justify-between pb-3">
        <span className="font-display text-ink-max text-xl">Graded</span>
        <span className="text-ink-dim text-xs">BTC/USDT · Tue 14:00</span>
      </div>
      <div className="mt-4 flex items-end gap-3">
        <span className="numeral text-ink-max text-7xl leading-none font-semibold">759</span>
        <span className="text-ink-dim pb-1.5">/ 1000</span>
        <span className="numeral text-gain-ink ml-auto pb-1.5 text-xl font-semibold">+$25.10</span>
      </div>
      <div className="bg-fill-2 relative mt-5 h-2">
        <div className="bg-accent h-full" style={{ width: '75.9%' }} />
        <div className="bg-rule absolute top-[-3px] h-[14px] w-0.5" style={{ left: '51.6%' }} />
      </div>
      <div className="text-ink-dim text-mini mt-1.5 flex justify-between">
        <span>Worst</span>
        <span>Sitting out: 516</span>
        <span>Best</span>
      </div>
      <dl className="divide-line mt-3 divide-y">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5">
            <dt>
              <div className={cx('text-sm font-semibold', row.tone === 'accent' ? 'text-accent-ink' : 'text-ink-hi')}>{row.label}</div>
              <div className="text-ink-dim text-mini">{row.note}</div>
            </dt>
            <dd className={cx('numeral text-sm font-semibold', row.tone === 'loss' ? 'text-loss-ink' : 'text-gain-ink')}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="border-line mt-1 flex items-center gap-4 border-t pt-3">
        <span className="text-ink-dim text-mini whitespace-nowrap">Duel, tape 3 of 10</span>
        <div className="flex flex-1 items-center gap-2">
          <div className="bg-fill-2 h-2 flex-1">
            <div className="bg-gain h-full" style={{ width: '100%' }} />
          </div>
          <div className="bg-fill-2 h-2 flex-1">
            <div className="bg-loss h-full" style={{ width: '46%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** What a gap between two grades costs in a duel, as the game scores it — printed like a rate card. */
function DamageCard() {
  const gaps = [100, 250, 500, 750, 900];
  return (
    <div className="border-rule bg-surface-2 shadow-e3 border px-6 pt-5 pb-3">
      <div className="rule-double flex items-baseline justify-between pb-3">
        <span className="font-display text-ink-max text-xl">What a gap costs in a duel</span>
        <span className="numeral text-ink-dim text-xs">of {DUEL_HEALTH}</span>
      </div>
      <dl className="divide-line divide-y">
        {gaps.map((gap) => (
          <div key={gap} className="flex flex-wrap items-baseline py-3">
            {/* Dot leaders, as on a rate card, carry the eye from the gap to its damage. */}
            <dt className="text-ink-hi flex min-w-0 flex-1 items-baseline gap-3 pr-3 text-sm font-semibold">
              A gap of {gap}
              <span aria-hidden className="border-line-strong min-w-4 flex-1 border-b-2 border-dotted" />
            </dt>
            <dd className="numeral text-ink-max text-lg font-semibold">−{damage(0, gap, DAMAGE_K)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-ink-dim pt-2 pb-1 text-xs">Close players play long duels; a mismatch is over in two tapes.</p>
    </div>
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
