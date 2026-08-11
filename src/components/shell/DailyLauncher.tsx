import { currentViewer, getDailyState } from '@/lib/viewer';
import { Skeleton } from '../ui';
import { Icon } from '../ui/icons';

/**
 * The way into the game, from anywhere.
 *
 * Streamed rather than awaited in the layout: this is one more Supabase round trip, and the rail
 * around it does not need the answer to paint. The pips only appear once the query lands, and
 * their absence for a beat is not something anybody notices — a nav that arrives 200ms late is.
 */
export async function DailyLauncher() {
  const viewer = await currentViewer();
  const daily = await getDailyState(viewer);
  const done = daily.complete;
  const started = daily.played > 0 && !done;

  return (
    <a
      href={done ? '/tapes' : '/play'}
      className="press bg-surface-inv text-ink-inv shadow-key hover:bg-white flex flex-col items-center gap-1.5 rounded-lg px-2 py-2.5 transition-colors lg:items-stretch lg:px-3"
    >
      <span className="flex items-center justify-center gap-2 lg:justify-start">
        <Icon name="play" size={16} />
        <span className="hidden text-sm font-semibold lg:inline">
          {done ? 'Play a tape' : started ? 'Resume daily' : "Play today's daily"}
        </span>
      </span>
      {/* Always "Play" in the compact rail, even when it points at /tapes: the collapsed label sits
          directly above the Tapes destination, and two adjacent controls reading "Tapes" that go to
          the same place is a puzzle rather than a shortcut. */}
      <span className="text-micro font-medium lg:hidden">Play</span>

      {!done && (
        <span className="flex items-center gap-1" aria-label={`${daily.played} of ${daily.total} charts done`}>
          {Array.from({ length: daily.total }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i < daily.played ? 'bg-ink-inv' : 'bg-ink-inv/25'}`}
            />
          ))}
        </span>
      )}
    </a>
  );
}

export function DailyLauncherSkeleton() {
  return <Skeleton className="h-[3.75rem] w-full lg:h-[3.5rem]" />;
}
