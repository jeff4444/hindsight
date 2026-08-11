'use client';

import { cx } from '../ui';

/**
 * The percentile, stated literally.
 *
 * Every bracket that was placeable here, sorted best to worst, one rung each — and the player's
 * result slotted in at its rank. "78th percentile" is an abstraction; "your rung is the 22nd from
 * the top of 98" is the same fact as an object you can point at.
 *
 * It sits beside the field rather than instead of it because the two answer different questions.
 * The field says *where* the money was. This says *how much of it you got*, against everyone who
 * could have been standing where you were.
 */
export function PercentileLadder({
  distribution,
  playerR,
  passed,
  oracleR,
  parR,
  progress = 1,
  className,
}: {
  distribution: number[];
  playerR: number;
  passed: boolean;
  oracleR: number;
  parR: number | null;
  progress?: number;
  className?: string;
}) {
  if (distribution.length === 0) return null;

  const sorted = [...distribution].sort((a, b) => b - a);
  // Rank from the top: how many brackets did strictly better. A pass is scored at exactly 0R
  // against the same set, which is the whole point of §4.4 — so it ranks like any other entry.
  const beaten = sorted.filter((r) => r > playerR).length;
  const rank = beaten + 1;

  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const span = best - worst || 1;
  const shown = Math.round(sorted.length * progress);

  // Where a value sits vertically, 0 at the bottom rung and 1 at the top.
  const at = (value: number) => Math.min(Math.max((value - worst) / span, 0), 1);

  // The hairlines sit at the true position; the labels are pulled inside the box. The oracle is
  // by definition the top rung, so its label is centred exactly on the upper edge and half of it
  // lands in the caption above unless it is held back.
  const labelAt = (value: number) => Math.min(Math.max(at(value), 0.06), 0.9);

  const marks: { label: string; value: number; tone: string }[] = [
    { label: 'Oracle', value: oracleR, tone: 'text-gold-ink' },
    ...(parR !== null ? [{ label: 'Par', value: parR, tone: 'text-ink-dim' }] : []),
    { label: 'Passing', value: 0, tone: 'text-restraint-ink' },
  ];

  /**
   * Label positions, pushed apart so they stay readable.
   *
   * Par and Passing sit on top of each other whenever the median achievable outcome is near zero —
   * which is common, and is exactly the case the two labels exist to distinguish. The hairlines
   * stay at their true values; only the text moves.
   */
  const MIN_GAP = 0.075;
  const placed = marks
    .map((mark) => ({ ...mark, y: labelAt(mark.value) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].y - placed[i - 1].y < MIN_GAP) placed[i].y = placed[i - 1].y + MIN_GAP;
  }

  return (
    <figure className={cx('min-w-0', className)}>
      <figcaption className="eyebrow text-ink-dim mb-2">All 98, ranked</figcaption>

      <div className="relative flex h-56 gap-2">
        <div className="flex w-14 shrink-0 flex-col justify-end">
          {/* reference marks, positioned against the same scale as the rungs */}
          <div className="relative h-full">
            {placed.map((mark) => (
              <span
                key={mark.label}
                className={cx('eyebrow absolute right-0 -translate-y-1/2 whitespace-nowrap', mark.tone)}
                style={{ bottom: `${mark.y * 100}%` }}
              >
                {mark.label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Best rung at the top, so the column reads like the price axis beside it. */}
          <div className="flex h-full flex-col justify-between">
            {sorted.map((r, i) => {
              const isYou = i === beaten;
              return (
                <span
                  key={i}
                  className={cx(
                    'block shrink-0 rounded-full transition-opacity duration-(--dur-4)',
                    isYou
                      ? passed
                        ? 'bg-restraint h-[3px]'
                        : 'bg-info h-[3px]'
                      : r >= 0
                        ? 'bg-long/45 h-px'
                        : 'bg-short/45 h-px',
                  )}
                  style={{
                    // Rungs arrive top-down as the count-up runs, so the ladder fills toward the
                    // player's own rung rather than simply appearing complete.
                    opacity: i < shown ? 1 : 0,
                    // Longer rungs for better outcomes: the silhouette alone shows how steeply the
                    // achievable set falls away, before any number is read.
                    width: isYou ? '100%' : `${(48 + at(r) * 50).toFixed(0)}%`,
                  }}
                />
              );
            })}
          </div>

          {/* the marks' own hairlines, drawn over the rungs */}
          {marks.map((mark) => (
            <span
              key={mark.label}
              className="bg-line-strong pointer-events-none absolute inset-x-0 h-px"
              style={{ bottom: `${at(mark.value) * 100}%` }}
              aria-hidden
            />
          ))}

          <span
            className={cx(
              'numeral absolute right-0 -translate-y-1/2 rounded px-1.5 py-0.5 text-micro font-semibold ring-1',
              passed ? 'bg-restraint-bg text-restraint-ink ring-restraint-line' : 'bg-info-bg text-info-ink ring-info-line',
            )}
            style={{ bottom: `${labelAt(playerR) * 100}%` }}
          >
            you · {rank} of {sorted.length}
          </span>
        </div>
      </div>
    </figure>
  );
}
