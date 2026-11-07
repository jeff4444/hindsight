import Link from 'next/link';
import { currentViewer } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { getChipState } from '@/lib/game/server/queries';
import { Skeleton } from '../ui';
import { Icon } from '../ui/icons';

/**
 * The record, from anywhere in the app, and the one thing to do next (docs/rules.md §23).
 *
 * Set in the masthead like a paper's price box: the average grade and the rounds behind it as a
 * small ledger readout, then the pen's button — back to a round left half-read, or a fresh tape.
 * Streamed rather than awaited in the layout, so the masthead paints before the query lands.
 */
export async function AccountChip() {
  const viewer = await currentViewer();
  const owner = viewer.userId ?? viewer.sessionId;
  const { openRoundId, rounds, meanGrade } = await getChipState(owner);

  return (
    <div className="flex items-center gap-4">
      <div className="hidden flex-col items-end leading-tight xl:flex">
        <span className="eyebrow text-ink-dim">Average grade</span>
        <span className="flex items-baseline gap-2">
          <span className="numeral text-ink-max text-sm font-semibold">{meanGrade ?? '—'}</span>
          <span className="numeral text-mini text-ink-dim font-medium">{rounds === 1 ? '1 round' : `${rounds} rounds`}</span>
        </span>
      </div>
      <Link
        href={openRoundId ? routes.play.round(openRoundId) : routes.play.new}
        className="btn-key bg-accent text-on-accent border-rule hover:bg-accent-hover flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-semibold whitespace-nowrap"
      >
        <Icon name={openRoundId ? 'play' : 'candle'} size={15} />
        <span className="hidden xl:inline">{openRoundId ? 'Back to your tape' : 'Deal a tape'}</span>
        <span className="xl:hidden">{openRoundId ? 'Resume' : 'Play'}</span>
      </Link>
    </div>
  );
}

export function AccountChipSkeleton() {
  return <Skeleton className="h-10 w-32 rounded-md xl:w-64" />;
}
