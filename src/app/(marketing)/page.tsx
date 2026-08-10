import Link from 'next/link';
import { currentViewer } from '@/lib/viewer';
import { Button, Chip, Eyebrow } from '@/components/ui';
import { MarketSignature } from '@/components/ui/MarketSignature';

export const dynamic = 'force-dynamic';

/**
 * The front door.
 *
 * §2 sets the register: "The trading education market sells certainty. Hindsight sells
 * calibration." So this page does not promise anyone they will make money — it explains a
 * mechanic and shows the honest arithmetic behind it, which is the only claim the product can
 * actually defend.
 *
 * There is no redirect for a signed-in visitor. People link the landing page, a redirect makes it
 * uncacheable and produces a flash, and someone who arrives here already signed in wants a resume
 * affordance rather than a bounce.
 */
export default async function Landing() {
  const viewer = await currentViewer();
  const signedIn = Boolean(viewer.profile);

  return (
    <div className="min-h-dvh">
      <header className="max-w-app mx-auto flex items-center justify-between px-5 py-5">
        <span className="text-ink-hi tracking-wordmark text-sm font-semibold">HINDSIGHT</span>
        <nav className="flex items-center gap-1.5">
          <Link
            href="/rules"
            className="text-ink-lo hover:text-ink-hi hidden h-9 items-center px-3 text-xs font-medium transition-colors sm:inline-flex"
          >
            Ruleset
          </Link>
          {signedIn ? (
            <Button as="a" href="/home" variant="primary">
              Your desk
            </Button>
          ) : (
            <>
              <Button as="a" href="/sign-in" variant="ghost">
                Sign in
              </Button>
              <Button as="a" href="/play" variant="primary">
                Play today
              </Button>
            </>
          )}
        </nav>
      </header>

      <main className="max-w-app mx-auto px-5">
        {/* ------------------------------------------------------------ hero */}
        <section className="grid items-center gap-10 py-12 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div data-stagger>
            <div style={{ '--i': 0 } as React.CSSProperties}>
              <Chip tone="info">GeoGuessr, for reading price</Chip>
            </div>
            <h1
              className="text-ink-max mt-5 text-3xl font-semibold text-balance xl:text-4xl"
              style={{ '--i': 1 } as React.CSSProperties}
            >
              You cannot learn to trade from a chart you can scroll.
            </h1>
            <p
              className="text-ink-lo mt-5 max-w-prose text-base"
              style={{ '--i': 2 } as React.CSSProperties}
            >
              You get eighty candles, no ticker and no date. Place a stop and a target, and watch
              the next sixty play out. Then — and this is the part nobody else does — you are
              scored against <em className="text-ink-hi not-italic">every bracket that was
              placeable on that exact path</em>, not against whether you happened to profit.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5" style={{ '--i': 3 } as React.CSSProperties}>
              <Button as="a" href="/play" variant="primary" size="lg">
                Play today&rsquo;s daily
              </Button>
              <Button as="a" href="/tapes" variant="secondary" size="lg">
                Browse tapes
              </Button>
            </div>
            <p className="text-ink-faint text-mini mt-4 font-mono" style={{ '--i': 4 } as React.CSSProperties}>
              1,000 charts · 98 outcomes scored per chart · no future data on the client · no account needed
            </p>
          </div>

          <HeroFigure />
        </section>

        {/* ------------------------------------------------- the moat, shown */}
        <section className="border-line-faint border-t py-14">
          <Eyebrow>Why a percentile and not a P&amp;L</Eyebrow>
          <h2 className="text-ink-max mt-2 max-w-prose text-xl font-semibold text-balance">
            A single result is mostly luck. The set of results is not.
          </h2>
          <p className="text-ink-lo mt-4 max-w-prose text-sm leading-relaxed">
            Because every player gets the identical future, the set of outcomes is finite — so it is
            counted rather than estimated. Two directions, seven stop distances, seven targets: 98
            brackets, each resolved on the same one-minute path your own trade is. Your score is
            where you landed among them.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3" data-stagger>
            {[
              ['98', 'brackets enumerated per chart', 'Exact, not sampled. The same chart yields the same distribution forever.'],
              ['19R', 'median oracle', 'The best any stop and target could have done. It is a real bracket, not a ceiling.'],
              ['61st', 'percentile for passing', 'Restraint is scored. On most charts it beats most entries — and we publish that.'],
            ].map(([figure, label, body], i) => (
              <div
                key={label}
                className="bg-surface-2 border-line shadow-panel rounded-lg border p-4"
                style={{ '--i': i } as React.CSSProperties}
              >
                <div className="text-ink-max font-mono text-2xl font-semibold tabular-nums">{figure}</div>
                <div className="eyebrow text-ink-dim mt-1">{label}</div>
                <p className="text-ink-lo mt-2 text-xs leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------- honesty */}
        <section className="border-line-faint border-t py-14">
          <Eyebrow>The uncomfortable part</Eyebrow>
          <h2 className="text-ink-max mt-2 max-w-prose text-xl font-semibold text-balance">
            Passing everything scores a mean 61st percentile. We are telling you that up front.
          </h2>
          <p className="text-ink-lo mt-4 max-w-prose text-sm leading-relaxed">
            The grid is direction-symmetric, so half of it is always on the wrong side and stops at
            exactly −1R — which puts doing nothing above the median on 95% of charts. It never
            exceeds the 80th, so it is a baseline a reader has to beat, not a free win. No fixed
            bracket beats it either; the best one measured across the corpus manages 57.7th.
            <br />
            <Link href="/rules" className="text-ink-hi mt-3 inline-block underline underline-offset-4">
              The whole ruleset, including the parts that do not flatter us →
            </Link>
          </p>
        </section>

        {/* ----------------------------------------------------------- ladder */}
        <section className="border-line-faint border-t py-14">
          <Eyebrow>The ruleset ladder</Eyebrow>
          <h2 className="text-ink-max mt-2 text-xl font-semibold">One tier exists today. Four do not.</h2>
          <div className="mt-6 flex flex-wrap gap-2">
            {[
              ['FD', 'Full Desk', false],
              ['NN', 'News Blind', false],
              ['NT', 'No Tools', false],
              ['NTZ', 'Naked', true],
              ['NTVZ', 'Blackout', false],
            ].map(([code, name, live]) => (
              <div
                key={code as string}
                className={
                  live
                    ? 'border-info-line bg-info-bg rounded-lg border px-4 py-3'
                    : 'border-line-faint rounded-lg border border-dashed px-4 py-3 opacity-55'
                }
              >
                <div className={live ? 'text-info-ink font-mono text-sm font-semibold' : 'text-ink-faint font-mono text-sm'}>
                  {code}
                </div>
                <div className={live ? 'text-ink-hi mt-0.5 text-xs' : 'text-ink-faint mt-0.5 text-xs'}>{name}</div>
                {!live && <div className="text-ink-faint text-micro mt-1">soon</div>}
              </div>
            ))}
          </div>
          <p className="text-ink-dim mt-4 max-w-prose text-xs leading-relaxed">
            Naked is the ranked standard: 80 candles, one timeframe, volume, an ATR badge, set and
            forget. §3.1 draws the line — identity, hindsight and crutches get restricted; the price
            axis, the volatility badge and tick size never do, because hiding those does not test
            skill, it randomises the result.
          </p>
        </section>

        {/* -------------------------------------------------------------- card */}
        <section className="border-line-faint grid gap-8 border-t py-14 lg:grid-cols-2">
          <div>
            <Eyebrow>The share card</Eyebrow>
            <h2 className="text-ink-max mt-2 text-xl font-semibold">Nothing on it can spoil the chart.</h2>
            <p className="text-ink-lo mt-4 max-w-prose text-sm leading-relaxed">
              A percentile, a bar, and how many of the five you were willing to trade. Never the
              R-multiple, the direction, the ticker or the date. Plain Unicode — no image, no link —
              so it survives being pasted anywhere.
            </p>
          </div>
          <pre className="border-line bg-surface-1 text-ink self-center rounded-lg border p-4 font-mono text-sm leading-relaxed">
            {'HINDSIGHT #412 · NTZ · 78th\n████████░░\ntraded 3 of 5'}
          </pre>
        </section>

        <section className="border-line-faint border-t py-16 text-center">
          <h2 className="text-ink-max text-2xl font-semibold text-balance">
            Today&rsquo;s daily is five charts. About six minutes.
          </h2>
          <div className="mt-6 flex justify-center">
            <Button as="a" href="/play" variant="primary" size="lg">
              Start
            </Button>
          </div>
          <p className="text-ink-faint mt-3 text-xs">No account needed. Sign in later to keep it.</p>
        </section>
      </main>

      <footer className="border-line-faint border-t">
        <div className="max-w-app text-ink-faint mx-auto flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs">
          <span>Historical price data from the public Binance archive.</span>
          <span>Not investment advice. Nothing here predicts anything.</span>
        </div>
      </footer>
    </div>
  );
}

/**
 * A wall of signatures.
 *
 * Deliberately not a screenshot of the chart: a static chart image cannot distinguish this product
 * from a bar-replay tool, and the reveal is the thing that has to be seen moving. These are real
 * generated avatars, which shows the identity system and gives the page something alive that costs
 * no data, no chart bundle and — crucially — carries no price path a player could learn from.
 */
function HeroFigure() {
  const seeds = [10_193, 4_402_919, 88_317, 1_337_244, 55_120, 902_355, 71_004, 660_918, 13_579];
  const accents = ['ember', 'signal', 'frost', 'moss', 'violet', 'slate'] as const;
  return (
    <div className="border-line bg-surface-1 rounded-xl border p-5">
      <div className="grid grid-cols-3 gap-4" data-stagger>
        {seeds.map((seed, i) => (
          <div key={seed} className="flex justify-center" style={{ '--i': i } as React.CSSProperties}>
            <MarketSignature seed={seed} accent={accents[i % accents.length]} size={84} ring="accent" />
          </div>
        ))}
      </div>
      <p className="text-ink-dim mt-5 text-center text-xs">
        Every player gets a market signature — generated from a seed you can reroll, never uploaded.
      </p>
    </div>
  );
}
