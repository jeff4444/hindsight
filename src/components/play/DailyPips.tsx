'use client';

import { cx } from '../ui';

/**
 * Five charts, at a glance.
 *
 * A "3/5" reads as a fraction; five pips read as a shape you are partway through. That matters
 * because §10.1's daily is a session rather than a score, and the thing a player wants to know
 * mid-round is how much is left, not what they have accumulated.
 *
 * The progress was conveyed by colour and width alone, which is exactly the pair a screen reader
 * cannot see and a colour-blind player may not distinguish — the played pip and the current one
 * differ only by hue and 8px. The group is a `progressbar` with real values, so the same fact is
 * available without looking at it.
 */
export function DailyPips({
  played,
  total,
  day,
  label,
}: {
  played: number;
  total: number;
  day?: number;
  /** Shown instead of the daily number — ranked sessions have no day. */
  label?: string;
}) {
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuenow={played}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${label ?? `Daily number ${day}`}, ${played} of ${total} charts played`}
    >
      <span className="numeral text-ink-dim text-xs">{label ?? `#${day}`}</span>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cx(
              'h-1.5 rounded-full transition-all duration-(--dur-3) ease-(--ease-entrance)',
              i < played ? 'bg-ink-hi w-4' : i === played ? 'bg-info w-6' : 'bg-fill-3 w-4',
            )}
          />
        ))}
      </div>
    </div>
  );
}
