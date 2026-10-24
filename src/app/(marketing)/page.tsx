import Link from 'next/link';
import { routes } from '@/lib/routes';
import { MODES } from '@/lib/modes';
import { PANEL } from '@/lib/panel';
import { Button, PersonaAvatar, cx } from '@/components/ui';
import { ChartArt } from '@/components/ui/ChartArt';
import { Icon, type IconName } from '@/components/ui/icons';
import { TryChart } from '@/components/marketing/TryChart';

export const dynamic = 'force-dynamic';

/**
 * The front door.
 *
 * It leads with the game itself — a chart you can call right here — because the loop is the
 * pitch and no paragraph about it competes. Then, in order: how a round goes, how scoring works
 * in one picture, the Panel, the ways to play, and one short promise about honesty with a door to
 * the full methods. The old page was eight bands of the same template arguing with its reader;
 * this one shows them.
 */
export default function LandingPage() {
  return (
    <div className="overflow-hidden">
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pt-14 pb-20 md:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <div>
          <div className="eyebrow text-gold-ink">A daily game about reading charts</div>
          <h1 className="font-display text-ink-max mt-4 text-[3.25rem] leading-[0.98] md:text-7xl">
            Every chart has already happened.
          </h1>
          <p className="text-ink-lo mt-6 max-w-lg text-lg leading-relaxed md:text-xl">
            Real markets, names and dates hidden. Call the trade, watch the next sixty hours play out, and see how your
            call ranks against every trade you could have made.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button href={routes.play.daily} variant="primary" size="xl">
              <Icon name="play" size={16} />
              Play today&rsquo;s daily
            </Button>
            <Button href={routes.learn.index} variant="secondary" size="xl">
              How it works
            </Button>
          </div>
          <p className="text-ink-dim mt-5 text-sm">Five charts · about six minutes · no account needed</p>
        </div>
        <TryChart />
      </section>

      {/* How a round goes */}
      <section className="border-line-faint bg-surface-1 border-y">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-ink-max max-w-2xl text-4xl leading-tight md:text-5xl">Read. Call. Reveal. Review.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            <Step n={1} icon="eye" title="Read" body="Eighty hours of a real market. No ticker, no date, the price indexed to 100 — just the chart." />
            <Step n={2} icon="arrow-up" title="Call" body="Long, short, or sit out. Set where you are wrong and where you take profit, in ATR and R." />
            <Step n={3} icon="play" title="Reveal" body="Lock it in and the next sixty hours arrive one candle at a time. The future is fog until then." />
            <Step n={4} icon="sparkle" title="Review" body="Your score, the best trade in hindsight, what the chart actually was, and what the Panel did." />
          </div>
        </div>
      </section>

      {/* Scoring in one picture */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2">
        <div>
          <div className="eyebrow text-ink-dim">Scoring</div>
          <h2 className="font-display text-ink-max mt-3 text-4xl leading-tight md:text-5xl">A good trade, not a lucky one.</h2>
          <p className="text-ink-lo mt-5 text-lg leading-relaxed">
            One trade is mostly luck. So Hindsight ranks yours against all 98 trades that were possible on that exact
            chart — both sides, seven stops, seven targets. Your score is how many of them you beat.
          </p>
          <p className="text-ink-lo mt-4 text-lg leading-relaxed">
            Win with a reckless bracket and it shows. Lose with a sound one and that shows too. Sitting out is scored like
            any trade — and on most charts, it ranks well.
          </p>
        </div>
        <ScoringPicture />
      </section>

      {/* The Panel */}
      <section className="border-line-faint bg-surface-1 border-y">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <div className="eyebrow text-ink-dim">The Panel</div>
              <h2 className="font-display text-ink-max mt-3 text-4xl leading-tight md:text-5xl">Seven schools, one coin, no oracle.</h2>
              <p className="text-ink-lo mt-5 text-lg leading-relaxed">
                After every chart, seven trading schools show what their published rules would have done — and they
                disagree, because competent traders do. Beside them sits a coin flip. Beat them over enough charts and it
                means something.
              </p>
              <Link href={routes.learn.methods} className="text-ink-hi decoration-gold-line hover:decoration-gold mt-5 inline-block underline underline-offset-4">
                Meet the Panel
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {PANEL.map((persona) => (
                <div key={persona.engine} className="border-line bg-surface-2 rounded-2xl border p-4">
                  <PersonaAvatar persona={persona} size={40} />
                  <div className="text-ink-max mt-3 text-sm font-semibold">{persona.name}</div>
                  <div className="text-ink-dim mt-1 line-clamp-3 text-xs leading-relaxed">{persona.style}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Modes */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="eyebrow text-ink-dim">Ways to play</div>
        <h2 className="font-display text-ink-max mt-3 max-w-2xl text-4xl leading-tight md:text-5xl">One a day, or as many as you like.</h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODES.map((mode) => (
            <Link
              key={mode.id}
              href={mode.href}
              className="press lift border-line bg-surface-2 hover:border-line-strong group flex flex-col rounded-2xl border p-5 transition-colors"
            >
              <span className={cx('grid h-10 w-10 place-items-center rounded-xl ring-1', mode.id === 'daily' ? 'bg-gold text-on-gold ring-gold' : 'bg-fill-2 text-ink-hi ring-line')}>
                <Icon name={mode.icon} size={18} />
              </span>
              <span className="text-ink-max mt-4 font-semibold">{mode.name}</span>
              <span className="text-ink-lo mt-1 text-sm leading-relaxed">{mode.tagline}</span>
              <span className="numeral text-ink-dim mt-auto pt-4 text-xs">{mode.length}</span>
            </Link>
          ))}
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
            <Promise title="The future never reaches your browser early." body="The candles you have not seen are sent only after you lock in. There is nothing to scroll ahead to and nothing to inspect." />
            <Promise title="Real charts, including the ones that failed." body="Coins that were delisted are in the library too, so the charts do not quietly drift upward." />
            <Promise title="The coin flip is on the scoreboard." body="Every method on the Panel is measured against it, in public. Most do not beat it." />
          </ul>
        </div>
      </section>

      {/* Final call */}
      <section className="mx-auto max-w-6xl px-5 py-24 text-center">
        <h2 className="font-display text-ink-max mx-auto max-w-2xl text-5xl leading-tight md:text-6xl">Today&rsquo;s daily is waiting.</h2>
        <p className="text-ink-lo mt-4 text-lg">Five charts. Same for everyone. About six minutes.</p>
        <div className="mt-8 flex justify-center">
          <Button href={routes.play.daily} variant="primary" size="xl">
            <Icon name="play" size={16} />
            Play today&rsquo;s daily
          </Button>
        </div>
        <p className="text-ink-dim mt-4 text-sm">No account needed. Sign in later and everything comes with you.</p>
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

/**
 * Scoring, drawn: 98 outcomes sorted worst to best, the player's marked, par in the middle, the
 * best in hindsight in gold. A static illustration of the strip the review shows after every chart.
 */
function ScoringPicture() {
  const values = Array.from({ length: 98 }, (_, i) => {
    const t = i / 97;
    return t < 0.55 ? -1 + t * 0.6 : (t - 0.55) * 7 - 0.5 + (t > 0.9 ? (t - 0.9) * 25 : 0);
  });
  const max = Math.max(...values.map(Math.abs));
  const you = 71;
  return (
    <div className="border-line bg-surface-2 rounded-3xl border p-6">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow text-ink-dim">Every possible trade</span>
        <span className="numeral text-ink-dim text-xs">98 trades</span>
      </div>
      <div className="relative mt-6 h-40">
        <div className="border-line absolute inset-x-0 top-1/2 border-t" />
        <div className="absolute inset-0 flex items-center gap-px">
          {values.map((value, i) => (
            <span key={i} className="relative flex h-full flex-1 items-center">
              <span
                className={cx('absolute inset-x-0 rounded-[1px]', i === 97 ? 'bg-gold' : value > 0 ? 'bg-long/70' : 'bg-short/55')}
                style={value >= 0 ? { bottom: '50%', height: `${(Math.abs(value) / max) * 48}%` } : { top: '50%', height: `${(Math.abs(value) / max) * 48}%` }}
              />
            </span>
          ))}
        </div>
        <div className="absolute inset-y-0" style={{ left: `${(you / 98) * 100}%` }}>
          <div className="bg-ink-max absolute inset-y-0 w-[3px] rounded-full" />
          <span className="text-ink-max absolute -top-5 -translate-x-1/2 text-xs font-semibold">You</span>
        </div>
        <div className="absolute inset-y-0" style={{ left: '50%' }}>
          <div className="bg-ink-lo absolute inset-y-2 w-0.5 rounded-full" />
          <span className="text-ink-lo absolute -bottom-5 -translate-x-1/2 text-xs">Par</span>
        </div>
      </div>
      <div className="mt-8 flex items-center justify-between gap-4">
        <div>
          <div className="numeral text-long-ink text-5xl font-semibold">72</div>
          <div className="text-ink-dim text-xs">your score — better than 72 of 100</div>
        </div>
        <div className="text-right">
          <div className="numeral text-gold-ink text-2xl font-semibold">+6.4R</div>
          <div className="text-ink-dim text-xs">best in hindsight</div>
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-xl opacity-70">
        <ChartArt seed={4242} width={480} height={60} fog={0} />
      </div>
    </div>
  );
}
