import Link from 'next/link';
import type { BoardRow } from '@/lib/leaderboards';
import { routes } from '@/lib/routes';
import { MarketSignature } from '../ui/MarketSignature';
import { cx } from '../ui';

/**
 * A board: rank, face, handle, figure. The top row is gold — first place is the best outcome, and
 * the only board position that gets the colour — and the viewer's own row is marked wherever it
 * falls. Every row links to the player's profile.
 */
export function Leaderboard({
  rows,
  format,
  detail,
  viewerId,
  empty,
}: {
  rows: BoardRow[];
  format: (value: number) => string;
  detail?: (row: BoardRow) => string | null;
  viewerId?: string | null;
  empty: React.ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <ol data-stagger className="border-line bg-surface-2 divide-line-faint divide-y overflow-hidden rounded-2xl border">
      {rows.map((row, i) => {
        const you = viewerId === row.userId;
        return (
          // Rows settle in from the top of the board down.
          <li key={row.userId} style={{ '--i': i } as React.CSSProperties}>
            <Link
              href={routes.profile(row.handle)}
              className={cx('hover:bg-fill-1 flex items-center gap-4 px-4 py-3 transition-colors sm:px-5', you && 'bg-gold-bg')}
            >
              <span
                className={cx(
                  'numeral w-7 shrink-0 text-center text-sm font-semibold',
                  i === 0 ? 'text-gold-ink' : i < 3 ? 'text-ink-hi' : 'text-ink-dim',
                )}
              >
                {i + 1}
              </span>
              <MarketSignature seed={row.avatarSeed} accent={row.avatarAccent} size={32} ring={i === 0 ? 'gold' : 'accent'} />
              <span className="min-w-0 flex-1">
                <span className="text-ink-max block truncate text-sm font-semibold">
                  @{row.handle}
                  {you && <span className="text-gold-ink ml-2 text-xs font-medium">you</span>}
                </span>
                {detail && detail(row) && <span className="text-ink-dim block truncate text-xs">{detail(row)}</span>}
              </span>
              <span className={cx('numeral text-base font-semibold', i === 0 ? 'text-gold-ink' : 'text-ink-max')}>{format(row.value)}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
