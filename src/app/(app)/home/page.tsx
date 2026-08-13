import { Suspense } from 'react';
import Link from 'next/link';
import { currentViewer, getDailyState, getStreak, getPlayerStats, getRating, listTapes } from '@/lib/viewer';
import { StreakMeter } from '@/components/home/StreakMeter';
import { DailyCard } from '@/components/home/DailyCard';
import { TapeCard } from '@/components/home/TapeCard';
import { RankedCard } from '@/components/home/RankedCard';
import { Button, EmptyState, Eyebrow, Gated, Panel, SectionHeader, Skeleton, Stat } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Today.
 *
 * Deliberately not called a dashboard. §8.4 and §10.4 both reserve that word for the per-theme
 * diagnostic — "you are 1740 overall but 1490 on failed breakouts" — which is the *paid* tier and
 * does not exist until the council does. Squatting the name now would make the real thing sound
 * like a repeat.
 *
 * What this is instead: one obvious next action, the streak that makes coming back mean something,
 * and a way into the tapes. Nothing on it is a vanity metric.
 *
 * Every section fetches its own data behind its own Suspense boundary. This page used to await a
 * `Promise.all` of four Supabase queries before rendering a single byte, and with no `loading.tsx`
 * anywhere in the app that meant the primary signed-in route showed a blank white-on-black screen
 * for the whole round trip. The daily is deliberately first in the tree so it streams first: it is
 * the one obvious next action, and it is what the player came here to press.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <Suspense fallback={<GreetingSkeleton />}>
        <Greeting />
      </Suspense>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Suspense fallback={<Skeleton className="h-64" />}>
          <DailySection />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-64" />}>
          <StreakSection />
        </Suspense>
      </div>

      <section className="mt-4">
        <Suspense fallback={<Skeleton className="h-32" />}>
          <RankedSection />
        </Suspense>
      </section>

      <section className="mt-10">
        <SectionHeader eyebrow="Runs" title="Reps, against the clock and against other people" />
        <RunsSection />
      </section>

      <section className="mt-10">
        <SectionHeader
          eyebrow="Tapes"
          title="Practice, unlimited"
          action={
            <Link
              href="/tapes"
              className="text-ink-lo hover:text-ink-hi text-sm font-medium transition-colors"
            >
              All tapes →
            </Link>
          }
        />
        <Suspense fallback={<TapesSkeleton />}>
          <TapesSection />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <RecordSection />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

async function Greeting() {
  const viewer = await currentViewer();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Eyebrow>{greeting()}</Eyebrow>
        <h1 className="text-ink-max mt-1 text-2xl font-semibold">
          {viewer.profile ? (viewer.profile.displayName ?? viewer.profile.handleDisplay) : 'Welcome'}
        </h1>
      </div>
      {!viewer.profile && (
        <Button as="a" href="/sign-in" variant="secondary">
          Save your progress
        </Button>
      )}
    </div>
  );
}

function GreetingSkeleton() {
  return (
    <div>
      <Skeleton className="h-3 w-16 rounded" />
      <Skeleton className="mt-2 h-8 w-44" />
    </div>
  );
}

async function DailySection() {
  const viewer = await currentViewer();
  const daily = await getDailyState(viewer);
  return <DailyCard daily={daily} />;
}

async function StreakSection() {
  const viewer = await currentViewer();
  const streak = await getStreak(viewer);

  if (!streak) {
    return (
      <Panel className="flex flex-col justify-between" pad="sm">
        <div>
          <Eyebrow>Daily streak</Eyebrow>
          <p className="text-ink-lo mt-2 text-sm leading-relaxed">
            Streaks need an account to live in. You get two freezes up front, and a broken run can
            be earned back — so missing a day costs you something, but not everything.
          </p>
        </div>
        <Button as="a" href="/sign-in" variant="secondary" className="mt-4 self-start">
          Start a daily streak
        </Button>
      </Panel>
    );
  }

  return <StreakMeter streak={streak} today={streak.today} />;
}

async function RankedSection() {
  const viewer = await currentViewer();
  const rating = await getRating(viewer);
  return (
    <RankedCard
      rating={rating.rating}
      rd={rating.rd}
      attempts={rating.attempts}
      showable={rating.showable}
      signedIn={Boolean(viewer.profile)}
    />
  );
}

/**
 * §10.1's two rep generators.
 *
 * They sit above the tapes because they are what the tapes are *for*: every unanswered question in
 * this product is waiting on volume — calibration will not speak until 30 forecasts (§18), the style
 * fingerprint until 152 rounds (§17.4) — and one chart a day cannot produce that.
 *
 * Not a server component: neither card reads anything. A run's state lives on the run, and the run
 * does not exist until the player starts one.
 */
function RunsSection() {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-stagger>
      <RunCard
        href="/play?mode=storm"
        eyebrow="Storm"
        title="Three minutes"
        body="A point for every chart where you beat the median bracket, and combo bonuses at 5, 12, 20 and 30. Stopping out costs ten seconds. The clock only runs while you are deciding — watching the reveal is free."
        cta="Start a Storm"
      />
      <RunCard
        href="/play?mode=streak"
        eyebrow="Streak"
        title="Until you are wrong"
        body="Untimed, and it ends on the first result below the median. You get one skip, and it does not come back — which is what makes standing aside a decision rather than a strategy."
        cta="Start a Streak"
      />
      <RunCard
        href="/versus"
        eyebrow="Versus"
        title="The same charts as someone else"
        body="A duel is a link: two health bars, and damage equal to the gap between your two readings of a chart. Nobody has to be online at the same time — each chart resolves as the second of you finishes it."
        cta="Open a duel"
      />
      <RunCard
        href="/versus"
        eyebrow="Race"
        title="One sequence, everyone who ran it"
        body="Up to ten runners on the same charts, each against their own clock, with everyone who ran it before you on the board. Scored on how well you read them, not how many you got through."
        cta="Open a race"
      />
    </div>
  );
}

function RunCard({
  href,
  eyebrow,
  title,
  body,
  cta,
}: {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Panel pad="md" className="flex flex-col justify-between">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="text-ink-max mt-1 text-lg font-semibold">{title}</h3>
        <p className="text-ink-lo mt-2 text-sm leading-relaxed">{body}</p>
      </div>
      <Button as="a" href={href} variant="secondary" className="mt-4 self-start">
        {cta}
      </Button>
    </Panel>
  );
}

async function TapesSection() {
  const tapes = await listTapes();
  const featured = tapes.filter((t) => !t.lockedReason).slice(0, 3);
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
        <Skeleton key={i} className="h-40" />
      ))}
    </div>
  );
}

async function RecordSection() {
  const viewer = await currentViewer();
  const stats = await getPlayerStats(viewer);

  // A brand-new player used to get nothing here at all — the section simply vanished, which reads
  // as a page that has not finished loading rather than as a record that has not started.
  if (stats.rounds === 0) {
    return (
      <section className="mt-10">
        <EmptyState
          icon="distribution"
          title="You have not read a chart here yet"
          body="Place a bracket on one and this becomes your record. Ten rounds is where a percentile starts to mean anything."
          action={
            <Button as="a" href="/play" variant="primary" size="lg">
              Play your first chart
            </Button>
          }
        />
      </section>
    );
  }

  return (
    <section className="mt-10">
      <Eyebrow>Your record</Eyebrow>
      <div className="mt-3 flex flex-wrap gap-x-10 gap-y-4">
        <Stat label="Rounds" value={stats.rounds} />
        <Stat label="Traded" value={stats.traded} />
        <Stat label="Passed" value={stats.passed} tone="restraint" />
        <div>
          <Eyebrow>Mean percentile</Eyebrow>
          <div className="mt-1">
            <Gated sample={stats.rounds} min={10}>
              <span className="numeral text-ink-hi text-xl font-semibold">
                {stats.meanPercentile === null ? '—' : Math.round(stats.meanPercentile * 100)}
              </span>
            </Gated>
          </div>
        </div>
      </div>
    </section>
  );
}

function greeting(): string {
  const hour = new Date().getUTCHours();
  if (hour < 5) return 'Late session';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}
