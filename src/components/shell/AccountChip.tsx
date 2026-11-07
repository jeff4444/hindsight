import Link from 'next/link';
import { currentViewer } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { getChipState } from '@/lib/game/server/queries';
import { Skeleton } from '../ui';
import { Icon } from '../ui/icons';

/**
 * The one thing to do next, from anywhere in the app: back to a round left half-read, or a fresh
 * tape — with the record so far underneath (docs/rules.md §23). Streamed rather than awaited in the
 * layout, so the rail paints before the query lands.
 */
export async function AccountChip() {
  const viewer = await currentViewer();
  const owner = viewer.userId ?? viewer.sessionId;
  const { openRoundId, rounds, meanGrade } = await getChipState(owner);

  return (
    <Link
      href={openRoundId ? routes.play.round(openRoundId) : routes.play.new}
      className="press bg-gold text-on-gold shadow-key hover:bg-gold-hover flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 transition-colors lg:items-stretch lg:px-3.5 lg:py-3"
    >
      <span className="flex items-center justify-center gap-2 lg:justify-between">
        <span className="flex items-center gap-2">
          <Icon name={openRoundId ? 'play' : 'candle'} size={15} />
          <span className="hidden text-sm font-semibold lg:inline">{openRoundId ? 'Back to your tape' : 'Deal a tape'}</span>
        </span>
        <Icon name="chevron-right" size={14} className="hidden opacity-70 lg:block" />
      </span>
      <span className="text-micro font-semibold lg:hidden">{openRoundId ? 'Resume' : 'Play'}</span>
      <span className="hidden items-baseline justify-between gap-2 lg:flex">
        <span className="numeral text-xs font-semibold">{rounds === 1 ? '1 round' : `${rounds} rounds`}</span>
        <span className="numeral text-mini font-medium opacity-80">{meanGrade !== null ? `avg ${meanGrade}` : 'no grade yet'}</span>
      </span>
    </Link>
  );
}

export function AccountChipSkeleton() {
  return <Skeleton className="h-[3.75rem] w-full rounded-xl lg:h-[4.25rem]" />;
}
