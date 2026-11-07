import Link from 'next/link';
import { routes } from '@/lib/routes';
import { DUEL_HEALTH, DUEL_TAPES, ROUND_STAKE_USDT } from '@/core/game';
import { formatUsd } from '@/lib/trading/format';
import { Button, cx } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

/**
 * The front door.
 *
 * It leads with a grade, because the grade is the game (docs/rules.md §23): one trade on a fresh
 * $500, played over sixty hours of real market, scored against the best and worst that stretch
 * allowed. Then, in order: how a round goes, what the grade measures, the three ways to play, and
 * the promises that keep a replay honest.
 */
export default function LandingPage() {
  const stake = formatUsd(ROUND_STAKE_USDT, { decimals: 0 });
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-14 pb-20 md:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-14">
        <div>
          <div className="eyebrow text-gold-ink">A trading game on real market history</div>
          <h1 className="font-display text-ink-max mt-4 text-[3.25rem] leading-[0.98] md:text-7xl">One trade. Sixty hours. Graded.</h1>
          <p className="text-ink-lo mt-6 max-w-lg text-lg leading-relaxed md:text-xl">
            Read a real market up to a moment in its past. Draw your levels, place one trade on a fresh {stake}, and lock it in.
            Then the tape plays — and you are graded out of 1000 against the best and the worst trade it allowed.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href={routes.play.new} variant="primary" size="xl">
              <Icon name="candle" size={16} />
              Deal a tape
            </Button>
            <Button href="/demo" variant="secondary" size="xl">
              Try a round
            </Button>
          </div>
          <p className="text-ink-dim mt-5 text-sm">No sign-up · no money · a few minutes a round</p>
        </div>
        <GradePreview />
      </section>

      {/* How a round goes */}
      <section className="border-line-faint bg-surface-1 border-y">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="eyebrow text-ink-dim">A round</div>
          <h2 className="font-display text-ink-max mt-3 max-w-2xl text-4xl leading-tight md:text-5xl">Read. Lock in. Watch. Graded.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            <Step n={1} icon="candle" title="Read" body="Two weeks of a real pair's history, with the date held back. Draw on it, add your studies." />
            <Step n={2} icon="lock" title="Lock in" body={`Long or short, up to ${stake}, entry at the bell or resting on the tape, with a take-profit and stop. Or sit out.`} />
            <Step n={3} icon="play" title="Watch" body="The next sixty hours play at the speed you like. Nothing can be changed: you find out what your read was worth." />
            <Step n={4} icon="oracle" title="Graded" body="Out of 1000, against the best and worst trade the tape allowed — both drawn on the chart where they happened." />
          </div>
        </div>
      </section>

      {/* Three ways */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="eyebrow text-ink-dim">Three ways to play</div>
        <h2 className="font-display text-ink-max mt-3 max-w-2xl text-4xl leading-tight md:text-5xl">Alone, against a friend, or against a school.</h2>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <Way icon="candle" title="Training grounds" body="Just you and the tape. Your grade is your score; your average is your record." href={routes.play.new} gold />
          <Way
            icon="swords"
            title="Duel a friend"
            body={`Send a link. ${DUEL_TAPES} tapes, ${DUEL_HEALTH} points each; the lower grade on every tape takes damage, and a bigger gap hits harder.`}
            href={routes.play.index}
          />
          <Way icon="bot" title="Duel a school" body="A school reads every tape under a published playbook, plays its trade live beside yours, then shows you why." href={routes.schools} />
        </div>
      </section>

      {/* Promises */}
      <section className="border-line-faint bg-surface-1 border-y">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2">
          <div>
            <div className="eyebrow text-ink-dim">The rules</div>
            <h2 className="font-display text-ink-max mt-3 text-4xl leading-tight">No hindsight, except the kind you earn.</h2>
            <Link href={routes.learn.rulebook('23-the-game')} className="text-ink-hi decoration-gold-line hover:decoration-gold mt-5 inline-block underline underline-offset-4">
              Read the rulebook
            </Link>
          </div>
          <ul className="space-y-6">
            <Promise title="Not one minute ahead" body="The tape never reaches your browser until your trade is locked in. There is nothing to scroll to or inspect." />
            <Promise title="No date until the grade" body="The weekday and time are real; the calendar date arrives with your result, so nothing can be looked up." />
            <Promise title="Never the same tape twice" body="You are only dealt tapes you have not played, and in a duel, tapes neither of you has." />
            <Promise title="Graded against what was possible" body="Not against luck, and not against a crowd: against the best and worst real orders on that exact stretch of market." />
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <h2 className="font-display text-ink-max mx-auto max-w-2xl text-5xl leading-tight md:text-6xl">Your first tape is waiting.</h2>
        <div className="mt-8 flex justify-center gap-3">
          <Button href={routes.play.new} variant="primary" size="xl">
            Deal a tape
          </Button>
          <Button href={routes.learn.index} variant="secondary" size="xl">
            How it works
          </Button>
        </div>
      </section>
    </div>
  );
}

/** A result card, drawn rather than rendered from a round: what the end of a round looks like. */
function GradePreview() {
  const rows = [
    { label: 'You', note: 'Long at the bell → take-profit', value: '$525.10', tone: 'long' },
    { label: 'Best in hindsight', note: 'Long the low → the high', value: '$548.40', tone: 'gold' },
    { label: 'Worst in hindsight', note: 'Short the low → stopped at the high', value: '$451.60', tone: 'short' },
  ] as const;
  return (
    <div className="border-line bg-surface-2 shadow-e3 rounded-3xl border p-6" aria-hidden>
      <div className="eyebrow text-gold-ink">Graded</div>
      <div className="mt-1 flex items-end gap-3">
        <span className="numeral text-ink-max text-7xl font-semibold leading-none">759</span>
        <span className="text-ink-dim pb-1.5">/ 1000</span>
        <span className="numeral text-long-ink ml-auto pb-1.5 text-xl font-semibold">+$25.10</span>
      </div>
      <div className="bg-fill-2 relative mt-5 h-2 overflow-hidden rounded-full">
        <div className="bg-gold h-full rounded-full" style={{ width: '75.9%' }} />
        <div className="bg-ink-dim absolute top-0 h-full w-0.5" style={{ left: '51.6%' }} />
      </div>
      <div className="text-ink-dim text-mini mt-1 flex justify-between">
        <span>Worst</span>
        <span>Sitting out: 516</span>
        <span>Best</span>
      </div>
      <div className="divide-line-faint mt-4 divide-y">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-2.5">
            <div>
              <div className={cx('text-sm font-medium', row.tone === 'gold' ? 'text-gold-ink' : 'text-ink-hi')}>{row.label}</div>
              <div className="text-ink-dim text-mini">{row.note}</div>
            </div>
            <span className={cx('numeral text-sm font-semibold', row.tone === 'short' ? 'text-short-ink' : 'text-long-ink')}>{row.value}</span>
          </div>
        ))}
      </div>
      <div className="border-line-faint mt-4 flex items-center gap-4 border-t pt-4">
        <span className="text-ink-dim text-mini">Duel, tape 3 of 10</span>
        <div className="flex flex-1 items-center gap-2">
          <div className="bg-fill-2 h-2 flex-1 overflow-hidden rounded-full">
            <div className="bg-long h-full" style={{ width: '100%' }} />
          </div>
          <div className="bg-fill-2 h-2 flex-1 overflow-hidden rounded-full">
            <div className="bg-short h-full" style={{ width: '46%' }} />
          </div>
        </div>
      </div>
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
