import { Suspense } from 'react';
import {
  currentViewer,
  getForecasts,
  getPercentileSeries,
  getPlayerStats,
  getRating,
  getRatingSeries,
  getStreak,
  getStyleRounds,
} from '@/lib/viewer';
import { divisionProgress, isPlaced, roundsToPlacement } from '@/core/divisions';
import { routes } from '@/lib/routes';
import { Button, DivisionBadge, EmptyState, PageHeader, ProgressBar, Skeleton, Sparkline, scoreTone } from '@/components/ui';
import { MarketSignature } from '@/components/ui/MarketSignature';
import { Term } from '@/components/ui/client';
import { StyleProfile } from '@/components/profile/StyleProfile';
import { CalibrationCurve } from '@/components/profile/CalibrationCurve';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your progress' };

const SAMPLE_MIN = 10;

/**
 * Your progress: where you stand, how you are trending, how calibrated you are, and who you trade
 * like. Private to you; the public profile shows a subset.
 *
 * Every figure waits for its sample and says how far away that is, instead of a lock and "0/30".
 */
export default function YouPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Suspense fallback={<Skeleton className="h-28 rounded-3xl" />}>
        <Header />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-96 rounded-3xl" />}>
        <Body />
      </Suspense>
    </div>
  );
}

async function Header() {
  const viewer = await currentViewer();
  const profile = viewer.profile;
  const streak = profile ? await getStreak(viewer) : null;

  if (!profile) {
    return (
      <PageHeader
        eyebrow="You"
        title="Your progress"
        lede="Everything you play on this device is recorded. Sign in to keep it, get rated and start a streak."
        actions={
          <Button href={routes.signIn(routes.you)} variant="primary">
            Save your progress
          </Button>
        }
      />
    );
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex items-center gap-4">
        <MarketSignature seed={profile.avatarSeed} accent={profile.avatarAccent} size={64} ring={streak?.perfect ? 'gold' : 'accent'} />
        <div>
          <div className="eyebrow text-ink-dim">Your progress</div>
          <h1 className="font-display text-ink-max mt-1 text-4xl leading-none md:text-5xl">{profile.displayName ?? `@${profile.handleDisplay}`}</h1>
          <div className="text-ink-dim mt-1.5 text-sm">
            @{profile.handleDisplay}
            {streak && streak.length > 0 ? ` · ${streak.length}-day streak` : ''}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button href={routes.profile(profile.handle)} variant="secondary">
          Public profile
        </Button>
        <Button href={routes.settings} variant="ghost">
          Settings
        </Button>
      </div>
    </header>
  );
}

async function Body() {
  const viewer = await currentViewer();
  const [stats, series, styleRounds, forecasts, rating, ratingSeries] = await Promise.all([
    getPlayerStats(viewer),
    getPercentileSeries(viewer, 30),
    getStyleRounds(viewer),
    getForecasts(viewer),
    getRating(viewer),
    getRatingSeries(viewer),
  ]);

  if (stats.rounds === 0) {
    return (
      <EmptyState
        icon="candle"
        title="Nothing to show yet"
        body="Play a chart and this starts filling in: your scores, your rating, how calibrated you are, and which school you trade like."
        action={
          <Button href={routes.play.daily} variant="secondary" size="lg">
            Play today&rsquo;s daily
          </Button>
        }
        className="fog"
      />
    );
  }

  const ready = stats.rounds >= SAMPLE_MIN;
  const placed = rating.rating !== null && rating.rd !== null && isPlaced(rating.attempts, rating.rd);
  const progress = placed ? divisionProgress(rating.rating!) : null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-stagger>
        <Tile index={0} label="Charts played" value={String(stats.rounds)} sub={`traded ${stats.traded} · sat out ${stats.passed}`} />
        <Tile
          index={1}
          label={<Term id="score">Average score</Term>}
          value={ready && stats.meanPercentile !== null ? String(Math.round(stats.meanPercentile * 100)) : '—'}
          sub={ready ? 'across every chart' : `${SAMPLE_MIN - stats.rounds} more charts to show this`}
        />
        <Tile
          index={2}
          label="Best"
          value={stats.rounds >= 5 && stats.bestPercentile !== null ? String(Math.round(stats.bestPercentile * 100)) : '—'}
          sub={stats.rounds >= 5 ? 'single chart' : `${5 - stats.rounds} more charts`}
        />
        <Tile index={3} label={<Term id="sitOut">Sat out</Term>} value={`${Math.round((stats.passed / stats.rounds) * 100)}%`} sub="of your decisions" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border-line bg-surface-2 rounded-3xl border p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="eyebrow text-ink-dim">
              <Term id="rating">Rating</Term>
            </h2>
            {placed && <span className="numeral text-ink-hi text-lg font-semibold">{Math.round(rating.rating!)}</span>}
          </div>
          <div className="mt-3">
            {progress ? <DivisionBadge division={progress.division} size="lg" /> : <DivisionBadge division={null} placing={roundsToPlacement(rating.attempts)} size="lg" />}
          </div>
          {progress && (
            <>
              <ProgressBar value={progress.progress} max={1} tone="gold" size="sm" className="mt-4" label="Progress to the next division" />
              <p className="text-ink-dim mt-2 text-xs">{progress.next ? `Next: ${progress.next.name}` : 'The top of the ladder.'}</p>
            </>
          )}
          {ratingSeries.length >= 2 ? (
            <div className="mt-5">
              <Sparkline values={ratingSeries} width={520} height={72} tone="gold" className="h-18 w-full" />
              <div className="text-ink-dim mt-1 flex justify-between text-mini">
                <span>{ratingSeries.length} rated charts ago</span>
                <span>now</span>
              </div>
            </div>
          ) : (
            <p className="text-ink-lo mt-4 text-sm">
              {viewer.userId ? 'Your rating line starts with your first rated chart.' : 'Sign in to get a rating.'}
            </p>
          )}
        </section>

        <section className="border-line bg-surface-2 rounded-3xl border p-5 md:p-6">
          <h2 className="eyebrow text-ink-dim">Recent scores</h2>
          {series.length >= 2 ? (
            <>
              <div className="numeral text-ink-max mt-3 text-4xl font-semibold">{Math.round(series[series.length - 1] * 100)}</div>
              <div className="text-ink-dim text-xs">your latest chart</div>
              <Sparkline
                values={series.map((v) => v * 100)}
                width={520}
                height={72}
                tone={stats.meanPercentile !== null ? scoreTone(stats.meanPercentile * 100) : 'neutral'}
                className="mt-4 h-18 w-full"
              />
              <div className="text-ink-dim mt-1 flex justify-between text-mini">
                <span>{series.length} charts ago</span>
                <span>latest</span>
              </div>
            </>
          ) : (
            <p className="text-ink-lo mt-3 text-sm">A couple more charts and your trend appears here.</p>
          )}
        </section>
      </div>

      <CalibrationCurve forecasts={forecasts} />
      <StyleProfile rounds={styleRounds} />
    </>
  );
}

function Tile({ label, value, sub, index }: { label: React.ReactNode; value: string; sub: string; index: number }) {
  return (
    <div className="border-line bg-surface-2 rounded-2xl border p-5" style={{ '--i': index } as React.CSSProperties}>
      <div className="text-ink-dim text-xs font-medium">{label}</div>
      <div className="numeral text-ink-max mt-2 text-3xl font-semibold">{value}</div>
      <div className="text-ink-dim mt-1 text-xs">{sub}</div>
    </div>
  );
}

