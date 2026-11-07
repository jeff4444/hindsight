import Link from 'next/link';
import { GLOSSARY, type TermId } from '@/lib/glossary';
import { routes } from '@/lib/routes';
import { FEE_SCHEDULE } from '@/core/trading/costs';
import { DAMAGE_K, DUEL_HEALTH, DUEL_TAPES, MIN_MOVE, ROUND_STAKE_USDT, damage } from '@/core/game';
import { formatUsd } from '@/lib/trading/format';
import { Button } from '@/components/ui';
import { Icon, type IconName } from '@/components/ui/icons';

export const metadata = { title: 'How it works' };

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/**
 * How it works, in six short sections: the plain-language version of the rulebook's §23. Every
 * number on the page comes from the constants the game is played by, so the explanation cannot
 * drift from the behaviour.
 */
export default function LearnPage() {
  const stake = formatUsd(ROUND_STAKE_USDT, { decimals: 0 });
  return (
    <div className="mx-auto max-w-4xl space-y-14">
      <header>
        <div className="eyebrow text-ink-dim">Learn</div>
        <h1 className="font-display text-ink-max mt-2 text-[2.75rem] leading-none md:text-6xl">How Hindsight works</h1>
        <p className="text-ink-lo mt-4 max-w-2xl text-lg leading-relaxed">
          A real market from the past. One trade on a fresh {stake}, locked in before the next sixty hours play. Then a grade
          out of 1000, against the best and the worst trade that stretch of market allowed. Play it alone, against a friend,
          or against a school that shows its working.
        </p>
      </header>

      <Section n={1} icon="candle" title="The tape" lede="Real pair, real prices, no date.">
        <p>
          Every round is a real stretch of a real Binance spot market, including coins that were later delisted. You see the
          pair, its prices and volume, and about two weeks of history before the moment you decide. You never get a tape you
          have already played, and only tapes that moved at least {MIN_MOVE * 100}% one way or the other are dealt.
        </p>
        <p>
          What you do not see is the date. The weekday and time of day are real; the calendar date is revealed with your
          grade, so nobody can look up what happens next.
        </p>
      </Section>

      <Section n={2} icon="lock" title="One trade" lede={`${stake}, every round. Nothing carries over.`}>
        <ul className="grid gap-3 sm:grid-cols-3">
          <Fact term="market" body="Enter at the bell: the last close, at the price on offer." />
          <Fact term="limit" body="Rests at your price, and fills if the tape trades through it." />
          <Fact term="stop" body="Waits beyond the market, and fills when the tape breaks out to it." />
        </ul>
        <p>
          Draw your levels, then size the trade in dollars up to {stake}, long or short, and attach a{' '}
          <strong>take-profit</strong> and a <strong>stop-loss</strong> if you want them. Or <strong>sit out</strong>: that is
          a move too, and it is graded like any other.
        </p>
        <p>
          When you lock in, nothing can be changed. Then the tape plays, at whatever speed you like, and you watch your trade
          live. There is no leverage, and a round can never lose more than its {stake}.
        </p>
      </Section>

      <Section n={3} icon="activity" title="Fills and costs" lede="Filled against the real minute bars.">
        <p>
          Limits fill when the minute&rsquo;s range reaches them. Stops fill at the trigger plus slippage, or at the open if the
          market gapped past them. When one minute could have hit both your stop and your target, nobody can know which came
          first, so the worse one is taken.
        </p>
        <dl className="border-line bg-surface-2 divide-line-faint divide-y overflow-hidden rounded-2xl border">
          <Row label="Maker fee (limit orders)" value={pct(FEE_SCHEDULE.makerBps)} note="Binance spot, published" />
          <Row label="Taker fee (market and stop orders)" value={pct(FEE_SCHEDULE.takerBps)} note="Binance spot, published" />
          <Row label="Spread" value={`${FEE_SCHEDULE.halfSpreadBps * 2} bp`} note="Ours — the archive has trades, not quotes" />
          <Row label="Stop slippage" value={`${FEE_SCHEDULE.stopSlippageBps} bp`} note="Ours" />
        </dl>
      </Section>

      <Section n={4} icon="oracle" title="The grade" lede="Out of 1000, against what was possible.">
        <p>
          Once the tape has played, Hindsight finds the <strong>best</strong> trade it allowed — buying the bottom of its
          biggest rise and selling the top, or shorting the top of its biggest fall — and the <strong>worst</strong>, the
          same moves the wrong way round. Both are real orders, filled and charged like yours.
        </p>
        <p>
          Your grade is where your result falls between them: 1000 is the best trade, 0 the worst. Sitting out scores a
          little over 500, because it pays no fees. That is the bar a trade has to clear to have been worth taking. A quiet
          tape and a wild one both run from 0 to 1000, so every round counts the same.
        </p>
      </Section>

      <Section n={5} icon="swords" title="Duels" lede={`${DUEL_HEALTH} points each, ${DUEL_TAPES} tapes.`}>
        <p>
          Send a friend a link. You both play the same {DUEL_TAPES} tapes, in your own time. On each one, whoever graded lower
          loses points, and the bigger the gap the harder it hits: a gap of 250 costs {damage(0, 250, DAMAGE_K)}, a gap of 500
          costs {damage(0, 500, DAMAGE_K)}, a gap of 750 costs {damage(0, 750, DAMAGE_K)}.
        </p>
        <p>
          Knock them to zero, or have more points left after {DUEL_TAPES} tapes. You never see their trade on a tape until you
          have locked in your own.
        </p>
      </Section>

      <Section n={6} icon="bot" title="Schools" lede="Opponents that show their working.">
        <p>
          A school reads every tape once, before you meet it there, under a published playbook: it draws its levels, then
          places one trade or sits out. In a duel its trade plays live beside yours, and when the tape ends you can read what
          it saw, why it traded, and where it put its stop and target.
        </p>
        <p>
          A school earns its place only by beating sitting out on tapes it was never built on, and its record is printed
          whichever way that goes.
        </p>
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
        <Door href={routes.learn.rulebook('23-the-game')} icon="rules" title="The rulebook" body="Every rule the game is played by, in full — how tapes are dealt, how a round fills, how it is graded, and how a duel is scored." />
        <Door href={routes.schools} icon="bot" title="Schools" body="The schools you can duel, their playbooks word for word, and their record against sitting out." />
      </section>

      <div className="flex justify-center pb-6">
        <Button href={routes.play.new} variant="primary" size="lg">
          <Icon name="candle" size={15} />
          Deal a tape
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
