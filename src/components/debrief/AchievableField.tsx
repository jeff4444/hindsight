'use client';

import type { CSSProperties } from 'react';
import { CELLS_PER_DIRECTION, GRID_CELLS, STOP_ATR, TARGET_R, cellIndex } from '@/lib/grid';
import { cx } from '../ui';

/**
 * The achievable set, with its coordinates put back.
 *
 * `ScorePayload.distribution` is not a bag of 98 numbers — it is a 2 x 7 x 7 matrix in a known
 * order: direction, then stop distance, then target. The old histogram binned it by value, which
 * threw every coordinate away and left the player with a shape and no way to read their own
 * position in it. This draws the matrix.
 *
 * What that buys, in one glance: whether the money was long or short at all, whether it was in
 * wide stops or tight ones, whether it needed a big target or a modest one — and where the
 * player's own bracket sat relative to all of it. A player who stopped out can see that the whole
 * long half was green and they were short; a player who won small can see the column two to their
 * right was worth four times as much. Neither is expressible as a histogram.
 *
 * Reading order matches a chart: targets increase upward, stops widen rightward.
 */
export function AchievableField({
  distribution,
  direction,
  stopIndex,
  targetIndex,
  progress = 1,
  columns = 2,
  className,
}: {
  distribution: number[];
  /** The player's side. `null` for a pass, which puts no crosshair on either grid. */
  direction: 'long' | 'short' | null;
  /** Fractional column, from `axisPosition`. `null` if the bracket sits off the enumerated grid. */
  stopIndex: number | null;
  targetIndex: number | null;
  /** 0–1, shared with the headline count-up so the field fills as the number lands. */
  progress?: number;
  /**
   * How many grids sit side by side.
   *
   * A prop rather than a `grid-cols-1` handed in through `className`: both would be
   * `grid-template-columns` utilities on the same element, and which one wins is decided by their
   * order in the generated stylesheet rather than by the caller — the same way `hidden` lost to
   * `inline-flex` and rendered the timeframe control twice. In a 26rem rail the two halves have to
   * stack, and that has to be a decision the call site can actually make.
   */
  columns?: 1 | 2;
  className?: string;
}) {
  // The stored array can be short of 98: `enumerateAchievable` skips a cell whose stop collapses
  // onto the entry at the published tick. The coordinates are only implied by position, so a short
  // array cannot be laid out on the grid at all — the ladder beside this still tells the truth.
  if (distribution.length !== GRID_CELLS) return null;

  const best = Math.max(...distribution);
  const worst = Math.min(...distribution);
  const oracleAt = distribution.indexOf(best);

  return (
    <div className={cx('grid gap-5', columns === 2 && 'sm:grid-cols-2', className)}>
      {(['long', 'short'] as const).map((side, d) => (
        <Half
          key={side}
          side={side}
          cells={distribution.slice(d * CELLS_PER_DIRECTION, (d + 1) * CELLS_PER_DIRECTION)}
          best={best}
          worst={worst}
          oracleCell={
            oracleAt >= d * CELLS_PER_DIRECTION && oracleAt < (d + 1) * CELLS_PER_DIRECTION
              ? oracleAt - d * CELLS_PER_DIRECTION
              : null
          }
          you={direction === side && stopIndex !== null && targetIndex !== null ? { stopIndex, targetIndex } : null}
          progress={progress}
        />
      ))}
    </div>
  );
}

function Half({
  side,
  cells,
  best,
  worst,
  oracleCell,
  you,
  progress,
}: {
  side: 'long' | 'short';
  cells: number[];
  best: number;
  worst: number;
  oracleCell: number | null;
  you: { stopIndex: number; targetIndex: number } | null;
  progress: number;
}) {
  const rows = [...TARGET_R].reverse(); // biggest target at the top, like a price axis

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex max-w-[19rem] items-baseline justify-between gap-2">
        <span className={cx('eyebrow', side === 'long' ? 'text-long-ink' : 'text-short-ink')}>{side}</span>
        <span className="text-ink-faint text-micro">target ▲ · stop ▶</span>
      </figcaption>

      <div className="flex gap-1.5">
        {/* target axis */}
        <div className="grid shrink-0 gap-0.5" style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map((t) => (
            <span key={t} className="numeral text-ink-faint flex items-center justify-end text-micro">
              {t}R
            </span>
          ))}
        </div>

        {/* Capped rather than fluid: seven `aspect-square` cells across an uncapped
            half give 90px cells, and the field ends up taller than everything else on the
            screen combined. ~34px is enough to read a colour and hit with a pointer. */}
        <div className="min-w-0 flex-1 max-w-60">
          <div
            className="relative grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${STOP_ATR.length}, minmax(0, 1fr))` }}
          >
            {rows.map((targetR, rowFromTop) =>
              STOP_ATR.map((stopAtr, s) => {
                const t = TARGET_R.length - 1 - rowFromTop;
                const r = cells[cellIndex(0, s, t)];
                return (
                  <div
                    key={`${stopAtr}-${targetR}`}
                    title={`stop ${stopAtr} ATR · target ${targetR}R → ${r >= 0 ? '+' : ''}${r.toFixed(2)}R`}
                    className={cx(
                      'aspect-square rounded-[2px] transition-colors duration-(--dur-4)',
                      oracleCell === cellIndex(0, s, t) && 'ring-gold-line ring-2',
                    )}
                    style={{ background: fillFor(r, best, worst, progress) }}
                  />
                );
              }),
            )}

            {you && <Crosshair stopIndex={you.stopIndex} targetIndex={you.targetIndex} />}
          </div>

          {/* stop axis */}
          <div
            className="mt-1 grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${STOP_ATR.length}, minmax(0, 1fr))` }}
          >
            {STOP_ATR.map((stopAtr) => (
              <span key={stopAtr} className="numeral text-ink-faint text-center text-micro">
                {stopAtr}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

/**
 * Where the player actually was.
 *
 * Positioned in fractional cell coordinates rather than snapped to the nearest cell: the rails are
 * dragged to arbitrary prices, and snapping would tell a player their stop was at 2 ATR when it
 * was at 2.6 — on the exact screen whose job is to show them that the difference mattered.
 */
function Crosshair({ stopIndex, targetIndex }: { stopIndex: number; targetIndex: number }) {
  // Cell centres, as a percentage of the grid box. Column i spans [i/7, (i+1)/7].
  const left = ((stopIndex + 0.5) / STOP_ATR.length) * 100;
  const bottom = ((targetIndex + 0.5) / TARGET_R.length) * 100;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ '--x': `${left}%`, '--y': `${bottom}%` } as CSSProperties}
      aria-hidden
    >
      <span className="bg-ink-max/50 absolute left-0 h-px w-full" style={{ bottom: 'var(--y)' }} />
      <span className="bg-ink-max/50 absolute top-0 h-full w-px" style={{ left: 'var(--x)' }} />
      <span
        className="border-ink-max absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2"
        style={{ left: 'var(--x)', bottom: 'var(--y)' }}
      />
    </div>
  );
}

/**
 * A cell's fill.
 *
 * Flat, never a gradient: a gradient inside a data mark makes its value ambiguous, and this is a
 * product about reading precise levels. Normalised against this chart's own best and worst rather
 * than a fixed scale, so a quiet chart is still legible instead of uniformly grey — the question
 * the field answers is "where was the money *here*", not "was this chart big".
 */
function fillFor(r: number, best: number, worst: number, progress: number): string {
  const floor = 0.06;
  const ceiling = 0.8;
  if (r > 0) {
    const share = best > 0 ? Math.min(r / best, 1) : 0;
    const pct = (floor + share * (ceiling - floor)) * progress * 100;
    return `color-mix(in oklab, var(--color-long) ${pct.toFixed(1)}%, transparent)`;
  }
  if (r < 0) {
    const share = worst < 0 ? Math.min(r / worst, 1) : 0;
    const pct = (floor + share * (ceiling - floor)) * progress * 100;
    return `color-mix(in oklab, var(--color-short) ${pct.toFixed(1)}%, transparent)`;
  }
  return 'var(--color-fill-1)';
}
