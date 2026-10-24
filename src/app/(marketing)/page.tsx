import Link from 'next/link';
import { Button, Eyebrow, Panel, Tier } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { MarketSignature } from '@/components/ui/MarketSignature';
import { HeroReveal } from '@/components/marketing/HeroReveal';

/**
 * The front door.
 *
 * §2 sets the register: "The trading education market sells certainty. Hindsight sells
 * calibration." So this page does not promise anyone they will make money — it explains a
 * mechanic and shows the honest arithmetic behind it, which is the only claim the product can
 * actually defend.
 *
 * Two things changed structurally.
 *
 * **The hero shows the game.** It used to be nine generated avatars — which showed the identity
 * system and nothing about what you do here. The reveal is the product's one genuinely unusual
 * idea and it has to be seen moving.
 *
 * **The sections are bands rather than a stack of hairlines.** Five identically-spaced
 * `border-t py-14` blocks in a single column gave the page no rhythm at all; alternating
 * full-bleed surfaces do most of the work of making a long page readable.
 *
 * No redirect for a signed-in visitor. People link the landing page, a redirect makes it
 * uncacheable and produces a flash, and someone who arrives already signed in wants a resume
 * affordance rather than a bounce — the header has one.
 */
export default function Landing() {
  return (
    <>
      {/* ------------------------------------------------------------- hero */}
      <Band>
        <div className="grid items-center gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:py-24">
          <div data-stagger>
            <h1
              className="text-ink-max text-3xl font-semibold text-balance md:text-4xl xl:text-display"
              style={{ '--i': 0 } as React.CSSProperties}
            >
              You cannot learn to trade from a chart you can scroll.
            </h1>
            <p
              className="text-ink mt-6 max-w-prose text-lg md:text-xl"
              style={{ '--i': 1 } as React.CSSProperties}
            >
              Eighty candles, no ticker, no date. Place a stop and a target, then watch the next
              sixty play out. And then — this is the part nobody else does — you are scored against{' '}
              <em className="text-ink-max not-italic">every bracket that was placeable on that exact
              path</em>, not against whether you happened to profit.
            </p>
            <div
              className="mt-8 flex flex-wrap items-center gap-3"
              style={{ '--i': 2 } as React.CSSProperties}
            >
              <Button as="a" href="/play/daily" variant="primary" size="xl" glow="brand">
                Play today&rsquo;s daily
              </Button>
              <Button as="a" href="/tapes" variant="secondary" size="xl">
                Browse tapes
              </Button>
            </div>
            <p
              className="text-ink-dim numeral mt-5 text-xs"
              style={{ '--i': 3 } as React.CSSProperties}
            >
              1,000 charts · 98 outcomes scored per chart · no future data on the client · no
              account needed
            </p>
          </div>

          <HeroReveal />
        </div>
      </Band>

      {/* --------------------------------------------------- one round works */}
      <Band tone="raised">
        <div className="py-16">
          <Eyebrow>One round</Eyebrow>
          <h2 className="text-ink-max mt-2 max-w-prose text-2xl font-semibold text-balance md:text-3xl">
            Commit before you know, then watch it happen.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3" data-stagger>
            {STEPS.map((step, i) => (
              <Panel key={step.title} pad="md" style={{ '--i': i } as React.CSSProperties}>
                <span className="bg-fill-1 text-ink-hi grid h-10 w-10 place-items-center rounded-full">
                  <Icon name={step.icon} size={19} />
                </span>
                <h3 className="text-ink-hi mt-4 text-base font-semibold">{step.title}</h3>
                <p className="text-ink-lo mt-2 text-sm leading-relaxed">{step.body}</p>
              </Panel>
            ))}
          </div>
        </div>
      </Band>

      {/* ------------------------------------------------------ the moat */}
      <Band>
        <div className="py-16">
          <Eyebrow>Why a percentile and not a P&amp;L</Eyebrow>
          <h2 className="text-ink-max mt-2 max-w-prose text-2xl font-semibold text-balance md:text-3xl">
            A single result is mostly luck. The set of results is not.
          </h2>
          <p className="text-ink-lo mt-5 max-w-prose text-base leading-relaxed">
            Because every player gets the identical future, the set of outcomes is finite — so it is
            counted rather than estimated. Two directions, seven stop distances, seven targets: 98
            brackets, each resolved on the same one-minute path your own trade is. Your score is
            where you landed among them.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3" data-stagger>
            {FIGURES.map(([figure, label, body], i) => (
              <Panel key={label} pad="md" style={{ '--i': i } as React.CSSProperties}>
                <div className="numeral text-ink-max text-display-sm font-semibold">{figure}</div>
                <div className="eyebrow text-ink-dim mt-2">{label}</div>
                <p className="text-ink-lo mt-2.5 text-sm leading-relaxed">{body}</p>
              </Panel>
            ))}
          </div>
        </div>
      </Band>

      {/* ---------------------------------------------------------- honesty */}
      <Band tone="raised">
        <div className="grid gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <Eyebrow>The uncomfortable part</Eyebrow>
            <p className="text-ink-max mt-4 text-2xl font-semibold text-balance md:text-3xl">
              &ldquo;Passing everything scores a mean 61st percentile.&rdquo;
            </p>
            <p className="text-ink-dim mt-3 text-sm">
              We are telling you that up front, on the front page.
            </p>
          </div>
          <div>
            <p className="text-ink-lo max-w-prose text-base leading-relaxed">
              The grid is direction-symmetric, so half of it is always on the wrong side and stops
              at exactly −1R — which puts doing nothing above the median on 95% of charts. It never
              exceeds the 80th, so it is a baseline a reader has to beat, not a free win. No fixed
              bracket beats it either; the best one measured across the corpus manages 57.7th.
            </p>
            <Link
              href="/learn/rulebook"
              className="text-brand-ink mt-5 inline-flex items-center gap-1.5 text-base font-medium underline underline-offset-4"
            >
              The whole ruleset, including the parts that do not flatter us
              <Icon name="arrow-up-right" size={15} />
            </Link>
          </div>
        </div>
      </Band>

      {/* ----------------------------------------------------------- ladder */}
      <Band>
        <div className="py-16">
          <Eyebrow>The ruleset ladder</Eyebrow>
          <h2 className="text-ink-max mt-2 text-2xl font-semibold md:text-3xl">
            One tier exists today. Four do not.
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            {TIERS.map(([code, name, live]) => (
              <Tier
                key={code}
                code={code}
                name={name}
                state={live ? 'live' : 'soon'}
                className={live ? 'min-w-36' : 'min-w-32'}
              />
            ))}
          </div>
          <p className="text-ink-lo mt-6 max-w-prose text-sm leading-relaxed">
            Naked is the ranked standard: 80 candles, one timeframe, volume, an ATR badge, set and
            forget. Identity, hindsight and crutches get restricted; the price axis, the volatility
            badge and tick size never do — hiding those does not test skill, it randomises the
            result.
          </p>
        </div>
      </Band>

      {/* ------------------------------------------------------------- card */}
      <Band tone="raised">
        <div className="grid items-center gap-10 py-16 lg:grid-cols-2">
          <div>
            <Eyebrow>The share card</Eyebrow>
            <h2 className="text-ink-max mt-2 text-2xl font-semibold md:text-3xl">
              Nothing on it can spoil the chart.
            </h2>
            <p className="text-ink-lo mt-5 max-w-prose text-base leading-relaxed">
              A percentile, a bar, and how many of the five you were willing to trade. Never the
              R-multiple, the direction, the ticker or the date. Plain Unicode — no image, no link —
              so it survives being pasted anywhere.
            </p>
          </div>
          <pre className="border-line bg-surface-1 text-ink shadow-e1 self-center rounded-xl border p-6 font-mono text-base leading-relaxed">
            {'HINDSIGHT #412 · NTZ · 78th\n████████░░\ntraded 3 of 5'}
          </pre>
        </div>
      </Band>

      {/* ------------------------------------------------------- signatures */}
      <Band>
        <div className="py-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>Make it yours</Eyebrow>
              <h2 className="text-ink-max mt-2 text-2xl font-semibold md:text-3xl">
                A signature, generated from a seed.
              </h2>
              <p className="text-ink-lo mt-4 max-w-prose text-base leading-relaxed">
                Rerolled until one looks like you, and never uploaded. It gilds when your streak is
                perfect.
              </p>
            </div>
            <Button as="a" href="/sign-in" variant="secondary" size="lg">
              Claim one
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-5" data-stagger>
            {SEEDS.map((seed, i) => (
              <div key={seed} style={{ '--i': i } as React.CSSProperties}>
                <MarketSignature
                  seed={seed}
                  accent={ACCENTS[i % ACCENTS.length]}
                  size={64}
                  ring={i === 2 ? 'gold' : 'accent'}
                />
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* -------------------------------------------------------- final CTA */}
      <Band tone="raised">
        <div className="py-20 text-center">
          <h2 className="text-ink-max mx-auto max-w-2xl text-3xl font-semibold text-balance md:text-4xl">
            Today&rsquo;s daily is five charts. About six minutes.
          </h2>
          <div className="mt-8 flex justify-center">
            <Button as="a" href="/play/daily" variant="primary" size="xl" glow="brand">
              Start
            </Button>
          </div>
          <p className="text-ink-dim mt-4 text-sm">No account needed. Sign in later to keep it.</p>
        </div>
      </Band>
    </>
  );
}

/**
 * A full-bleed section.
 *
 * The alternation is what gives a long page rhythm. Doing it as a full-width surface with an inner
 * max-width, rather than as a hairline rule, means the eye gets a real boundary at any viewport.
 */
function Band({ tone = 'flush', children }: { tone?: 'flush' | 'raised'; children: React.ReactNode }) {
  return (
    <section className={tone === 'raised' ? 'bg-surface-1/60 border-line-faint border-y' : ''}>
      <div className="max-w-app mx-auto px-5">{children}</div>
    </section>
  );
}

const STEPS = [
  {
    icon: 'rail' as const,
    title: 'Place',
    body: 'Drag a stop and a target over eighty candles. Direction is implied by which side of the entry your stop sits on, so the bracket is the whole decision.',
  },
  {
    icon: 'candle' as const,
    title: 'Reveal',
    body: 'Sixty candles arrive one at a time against the bracket you already committed. You cannot move it, and you cannot scroll ahead.',
  },
  {
    icon: 'distribution' as const,
    title: 'Rank',
    body: 'Your result is placed among the 98 brackets that were possible on that exact path — with the oracle, the median, and what your stop would have survived.',
  },
];

const FIGURES: [string, string, string][] = [
  ['98', 'brackets enumerated per chart', 'Exact, not sampled. The same chart yields the same distribution forever.'],
  ['19R', 'median oracle', 'The best any stop and target could have done. It is a real bracket, not a ceiling.'],
  ['61st', 'percentile for passing', 'Restraint is scored. On most charts it beats most entries — and we publish that.'],
];

const TIERS: [string, string, boolean][] = [
  ['FD', 'Full Desk', false],
  ['NN', 'News Blind', false],
  ['NT', 'No Tools', false],
  ['NTZ', 'Naked', true],
  ['NTVZ', 'Blackout', false],
];

const SEEDS = [10_193, 4_402_919, 88_317, 1_337_244, 55_120, 902_355, 71_004, 660_918];
const ACCENTS = ['ember', 'signal', 'frost', 'moss', 'violet', 'slate'] as const;
