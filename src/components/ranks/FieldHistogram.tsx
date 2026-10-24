import { cx } from '../ui';

/**
 * Today's field, as ten bars: how many players scored 0–9, 10–19 … 90–100 on the daily, with the
 * viewer's own bar lit. The sentence beside it does the arithmetic — "you beat 64% of 1,203
 * players" — so the chart is the shape and the words are the number.
 */
export function FieldHistogram({
  histogram,
  players,
  you,
  compact,
}: {
  histogram: number[];
  players: number;
  you: { beaten: number; mean: number } | null;
  compact?: boolean;
}) {
  const max = Math.max(...histogram, 1);
  const yourBucket = you ? Math.min(9, Math.floor(you.mean * 10)) : null;
  const share = you && players > 1 ? Math.round((you.beaten / (players - 1)) * 100) : null;

  return (
    <figure className="w-full">
      {share !== null && (
        <figcaption className="text-ink-hi mb-3 text-sm">
          You beat <span className="numeral text-gold-ink font-semibold">{share}%</span> of{' '}
          <span className="numeral">{(players - 1).toLocaleString()}</span> other players today.
        </figcaption>
      )}
      {share === null && (
        <figcaption className="text-ink-lo mb-3 text-sm">
          <span className="numeral text-ink-hi">{players.toLocaleString()}</span> {players === 1 ? 'player has' : 'players have'} finished today.
        </figcaption>
      )}
      <div className={cx('flex items-end gap-1', compact ? 'h-16' : 'h-28')} aria-hidden>
        {histogram.map((count, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={cx('rounded-t-md transition-[height]', i === yourBucket ? 'bg-gold' : 'bg-fill-3')}
              style={{ height: `${Math.max(4, (count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="text-ink-dim mt-1.5 flex justify-between text-mini">
        <span>0</span>
        <span>score</span>
        <span>100</span>
      </div>
    </figure>
  );
}
