'use client';

import { cx } from '../ui';

/**
 * Five charts, at a glance.
 *
 * A "3/5" reads as a fraction; five pips read as a shape you are partway through. That matters
 * because §10.1's daily is a session rather than a score, and the thing a player wants to know
 * mid-round is how much is left, not what they have accumulated.
 */
export function DailyPips({ played, total, day }: { played: number; total: number; day: number }) {
  return (
    <div className="flex items-center gap-2" title={`Daily #${day}`}>
      <span className="text-ink-dim text-mini font-mono">#{day}</span>
      <div className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
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
