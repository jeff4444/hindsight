import { Suspense } from 'react';
import Link from 'next/link';
import {
  currentViewer,
  getDailyState,
  getPercentileSeries,
  getPlayerStats,
  getRating,
  getStreak,
  listTapes,
} from '@/lib/viewer';
import { dailyNumber } from '@/lib/daily';
import { routes } from '@/lib/routes';
import { DailyHero } from '@/components/home/DailyHero';
import { DivisionCard } from '@/components/home/DivisionCard';
import { QuickPlay } from '@/components/home/QuickPlay';
import { StreakMeter } from '@/components/home/StreakMeter';
import { TapeCard } from '@/components/home/TapeCard';
import { Button, EmptyState, Skeleton, Sparkline, scoreTone } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Today' };

/**
 * Today: one obvious next action, the streak that makes tomorrow matter, where you stand, and a
 * way to keep playing.
 *
 * It replaces seven stacked sections — and a daily button that appeared three times — with a
 * hierarchy: the daily is the hero, the streak and the ladder sit beside it, quick play under them,
 * then tapes, then your week. Every block streams behind its own Suspense boundary, and the daily
 * is first in the tree so it is first on screen.
 */
export default function TodayPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Suspense fallback={<Skeleton className="h-16 w-72" />}>
        <Greeting />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Suspense fallback={<Skeleton variant="fog" className="h-80 rounded-3xl" />}>
          <DailySection />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-80 rounded-3xl" />}>
          <StreakSection />
        </Suspense>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-56 rounded-3xl" />}>
          <LadderSection />
        </Suspense>
        <QuickPlay />
      </div>

      <section aria-labelledby="tapes-heading" className="pt-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow text-ink-dim">Practice</div>
            <h2 id="tapes-heading" className="text-ink-max mt-1.5 text-xl font-semibold tracking-tight md:text-2xl">
              Pick up a tape
            </h2>
          </div>
          <Link href={routes.tapes.index()} className="text-ink-lo hover:text-ink-hi text-sm font-medium">
            All tapes
          </Link>
        </div>
        <Suspense fallback={<TapesSkeleton />}>
          <TapesSection />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <WeekSection />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

async function Greeting() {
  const viewer = await currentViewer();
  const name = viewer.profile ? (viewer.profile.displayName ?? viewer.profile.handleDisplay) : null;
  const day = new Date().toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="eyebrow text-ink-dim">
          {day} · Daily #{todayNumber()}
        </div>
        <h1 className="font-display text-ink-max mt-2 text-[2.5rem] leading-none md:text-[3.25rem]">
          {greeting()}
          {name ? `, ${name}.` : '.'}
        </h1>
      </div>
      {!viewer.profile && (
        <Button href={routes.signIn()} variant="secondary">
          Save your progress
        </Button>
      )}
    </header>
  );
}

async function DailySection() {
  const viewer = await currentViewer();
  const daily = await getDailyState(viewer);
  return <DailyHero daily={daily} />;
}

async function StreakSection() {
  const viewer = await currentViewer();
  const streak = await getStreak(viewer);

  if (!streak) {
    return (
      <section className="border-line bg-surface-2 flex h-full flex-col rounded-3xl border p-5 md:p-6">
        <div className="eyebrow text-ink-dim">Daily streak</div>
        <p className="font-display text-ink-max mt-3 text-2xl leading-tight">Make it a habit.</p>
        <p className="text-ink-lo mt-1.5 text-sm leading-relaxed">
          Streaks live on an account. You get two freezes for the days life happens, and a broken run can be earned
          back.
        </p>
        <div className="fog border-line-faint mt-5 flex h-8 gap-1 rounded-lg border border-dashed" aria-hidden />
        <Button href={routes.signIn()} variant="secondary" className="mt-auto self-start">
          Start a streak
        </Button>
      </section>
    );
  }

  return <StreakMeter streak={streak} today={streak.today} />;
}

async function LadderSection() {
  const viewer = await currentViewer();
  const rating = await getRating(viewer);
  return (
    <DivisionCard
      rating={rating.rating}
      attempts={rating.attempts}
      showable={rating.showable}
      signedIn={Boolean(viewer.profile)}
    />
  );
}

async function TapesSection() {
  const tapes = await listTapes();
  const featured = tapes.filter((t) => !t.lockedReason && t.slug !== 'open').slice(0, 3);
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
      {featured.map((tape, i) => (
        <TapeCard key={tape.slug} tape={tape} index={i} />
      ))}
    </div>
  );
}

function TapesSkeleton() {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-56 rounded-2xl" />
      ))}
    </div>
  );
}

async function WeekSection() {
  const viewer = await currentViewer();
  const [stats, series] = await Promise.all([getPlayerStats(viewer), getPercentileSeries(viewer, 20)]);

  if (stats.rounds === 0) {
    return (
      <EmptyState
        icon="candle"
        title="Your first chart is waiting"
        body="Play one and this becomes your record: how your scores move, how often you trade, how often you sit out."
        action={
          <Button href={routes.play.daily} variant="secondary" size="lg">
            Play your first chart
          </Button>
        }
        className="fog"
      />
    );
  }

  const mean = stats.meanPercentile;
  return (
    <section aria-labelledby="week-heading" className="border-line bg-surface-2 rounded-3xl border p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="week-heading" className="eyebrow text-ink-dim">
            Your recent charts
          </h2>
          <p className="text-ink-lo mt-1.5 text-sm">
            {stats.rounds} played · traded {stats.traded} · sat out {stats.passed}
          </p>
        </div>
        <Link href={routes.you} className="text-ink-lo hover:text-ink-hi text-sm font-medium">
          Your progress
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <div className="numeral text-ink-max text-4xl font-semibold">
            {stats.rounds >= 10 && mean !== null ? Math.round(mean * 100) : '—'}
          </div>
          <div className="text-ink-dim mt-1 text-xs">
            {stats.rounds >= 10 ? 'average score' : `average score after ${10 - stats.rounds} more charts`}
          </div>
        </div>
        {series.length >= 2 && (
          <div className="min-w-48 flex-1">
            <Sparkline
              values={series.map((value) => value * 100)}
              width={520}
              height={56}
              tone={mean !== null ? scoreTone(mean * 100) : 'neutral'}
              className="h-14 w-full"
            />
            <div className="text-ink-dim mt-1 flex justify-between text-mini">
              <span>{series.length} charts ago</span>
              <span>latest</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Today's daily number. A helper rather than inline, so the clock read stays out of render. */
function todayNumber(): number {
  return dailyNumber(Date.now());
}

function greeting(): string {
  const hour = new Date().getUTCHours();
  if (hour < 5) return 'Late session';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
