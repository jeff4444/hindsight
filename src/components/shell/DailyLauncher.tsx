import Link from 'next/link';
import { currentViewer, getDailyState } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { Skeleton, cx } from '../ui';
import { Icon } from '../ui/icons';

/**
 * The way into today's daily, from anywhere in the app.
 *
 * Gold while there is a daily to play, because it is the one thing to do next on any screen. Once
 * it is done it quiets to an outline and points at the score instead: the call to action is spent,
 * and a gold button that leads somewhere optional would be lying about what matters.
 *
 * Streamed rather than awaited in the layout: one more Supabase round trip, and the rail around it
 * does not need the answer to paint.
 */
export async function DailyLauncher() {
  const viewer = await currentViewer();
  const daily = await getDailyState(viewer);
  const done = daily.complete;
  const started = daily.played > 0 && !done;

  if (done) {
    return (
      <Link
        href={routes.today}
        className="press border-line hover:bg-fill-1 flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-colors lg:flex-row lg:gap-3 lg:px-3"
      >
        <Icon name="check" size={16} className="text-long-ink" />
        <span className="text-micro text-ink-lo font-medium lg:hidden">Done</span>
        <span className="hidden min-w-0 lg:block">
          <span className="text-ink-hi block text-sm font-semibold">Daily done</span>
          <span className="text-ink-dim block text-xs">
            {daily.percentile !== null ? (
              <>
                Score <span className="numeral text-ink-lo">{Math.round(daily.percentile * 100)}</span> · back tomorrow
              </>
            ) : (
              'Back tomorrow'
            )}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={routes.play.daily}
      className="press bg-gold text-on-gold shadow-key hover:bg-gold-hover flex flex-col items-center gap-2 rounded-xl px-2 py-2.5 transition-colors lg:items-stretch lg:px-3.5 lg:py-3"
    >
      <span className="flex items-center justify-center gap-2 lg:justify-between">
        <span className="flex items-center gap-2">
          <Icon name="play" size={15} />
          <span className="hidden text-sm font-semibold lg:inline">{started ? 'Resume daily' : "Today's daily"}</span>
        </span>
        <span className="numeral hidden text-xs font-medium opacity-70 lg:inline">
          {daily.played}/{daily.total}
        </span>
      </span>
      <span className="text-micro font-semibold lg:hidden">Daily</span>
      <span className="flex items-center gap-1" aria-label={`${daily.played} of ${daily.total} charts done`}>
        {Array.from({ length: daily.total }, (_, i) => (
          <span key={i} className={cx('h-1 flex-1 rounded-full', i < daily.played ? 'bg-on-gold' : 'bg-on-gold/20')} />
        ))}
      </span>
    </Link>
  );
}

export function DailyLauncherSkeleton() {
  return <Skeleton className="h-[3.75rem] w-full rounded-xl lg:h-[4.25rem]" />;
}
