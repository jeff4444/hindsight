import Link from 'next/link';
import { currentViewer, getDailyState, getStreak, getPlayerStats, listTapes } from '@/lib/viewer';
import { StreakMeter } from '@/components/home/StreakMeter';
import { DailyCard } from '@/components/home/DailyCard';
import { TapeCard } from '@/components/home/TapeCard';
import { Button, Eyebrow, Panel } from '@/components/ui';

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
 */
export default async function HomePage() {
  const viewer = await currentViewer();
  const [daily, streak, stats, tapes] = await Promise.all([
    getDailyState(viewer),
    getStreak(viewer),
    getPlayerStats(viewer),
    listTapes(),
  ]);
  const today = daily.day;
  const featured = tapes.filter((t) => !t.lockedReason).slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>{greeting()}</Eyebrow>
          <h1 className="text-ink-max mt-1 text-xl font-semibold">
            {viewer.profile ? (viewer.profile.displayName ?? viewer.profile.handleDisplay) : 'Welcome'}
          </h1>
        </div>
        {!viewer.profile && (
          <Button as="a" href="/sign-in" variant="secondary">
            Save your progress
          </Button>
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <DailyCard daily={daily} />
        {streak ? (
          <StreakMeter streak={streak} today={today} />
        ) : (
          <Panel className="flex flex-col justify-between p-4">
            <div>
              <Eyebrow>Streak</Eyebrow>
              <p className="text-ink-lo mt-2 text-sm leading-relaxed">
                Streaks need an account to live in. You get two freezes up front, and a broken run
                can be earned back — so missing a day costs you something, but not everything.
              </p>
            </div>
            <Button as="a" href="/sign-in" variant="secondary" className="mt-4 self-start">
              Start a streak
            </Button>
          </Panel>
        )}
      </div>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <Eyebrow>Tapes</Eyebrow>
            <h2 className="text-ink-max mt-1 text-base font-semibold">Practice, unlimited</h2>
          </div>
          <Link href="/tapes" className="text-ink-lo hover:text-ink-hi text-xs font-medium transition-colors">
            All tapes →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-stagger>
          {featured.map((tape, i) => (
            <TapeCard key={tape.slug} tape={tape} index={i} />
          ))}
        </div>
      </section>

      {stats.rounds > 0 && (
        <section className="mt-10">
          <Eyebrow>Your record</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
            <Figure label="Rounds" value={String(stats.rounds)} />
            <Figure label="Traded" value={String(stats.traded)} />
            <Figure label="Passed" value={String(stats.passed)} />
            <Figure
              label="Mean percentile"
              value={
                stats.rounds < 10
                  ? `needs ${10 - stats.rounds} more`
                  : stats.meanPercentile === null
                    ? '—'
                    : String(Math.round(stats.meanPercentile * 100))
              }
              muted={stats.rounds < 10}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Figure({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        className={`mt-0.5 font-mono tabular-nums ${muted ? 'text-ink-faint text-xs' : 'text-ink-hi text-lg'}`}
      >
        {value}
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getUTCHours();
  if (hour < 5) return 'Late session';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}
