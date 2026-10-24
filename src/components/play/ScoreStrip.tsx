'use client';

import type { CSSProperties } from 'react';
import { cx } from '../ui';

/**
 * Every possible trade, in one line.
 *
 * The 98 outcomes the chart allowed, sorted worst to best, as ticks along a strip — losers coral,
 * winners mint, their height their size. Four markers say where things landed: you, par (the
 * middle), sitting out (0R), and the best in hindsight (gold, at the far right by construction).
 *
 * It replaces two visualisations — a 98-rung ladder and a pair of 7×7 heat grids — as the first
 * thing a player sees. The grids still exist, under Details, for the player who wants to know
 * whether the money was in wide stops or tight ones. This answers the only question that matters
 * between charts: how good was that, against what was possible?
 */
export function ScoreStrip({
  distribution,
  playerR,
  passed,
  className,
}: {
  distribution: number[];
  /** Null when the round has no R (a pass is 0, not null). */
  playerR: number | null;
  passed: boolean;
  className?: string;
}) {
  if (distribution.length < 2) return null;
  const sorted = [...distribution].sort((a, b) => a - b);
  const n = sorted.length;
  const maxAbs = Math.max(...sorted.map(Math.abs), 1e-9);

  /** Fractional rank of a value among the sorted outcomes, 0–1. */
  const rankOf = (value: number) => {
    let below = 0;
    let equal = 0;
    for (const x of sorted) {
      if (x < value) below++;
      else if (x === value) equal++;
    }
    return (below + equal / 2) / n;
  };

  const you = playerR === null ? null : rankOf(passed ? 0 : playerR);
  const sitOut = rankOf(0);
  const par = 0.5;

  return (
    <figure className={cx('w-full', className)} aria-label="Where your trade ranked among every possible trade">
      <div className="relative h-16">
        {/* zero line */}
        <div className="border-line absolute inset-x-0 top-1/2 border-t" />
        {/* the outcomes */}
        <div className="absolute inset-0 flex items-center gap-px">
          {sorted.map((value, i) => {
            const h = Math.max(2, (Math.abs(value) / maxAbs) * 28);
            const best = i === n - 1;
            return (
              <span key={i} className="relative flex h-full flex-1 items-center">
                {/* Each bar grows out of the zero line, worst to best, so the strip sweeps up to
                    the gold one rather than appearing whole. */}
                <span
                  className={cx(
                    'absolute inset-x-0 rounded-[1px]',
                    value >= 0 ? 'grow-up' : 'grow-down',
                    best ? 'bg-gold' : value > 0 ? 'bg-long/70' : value < 0 ? 'bg-short/55' : 'bg-ink-dim',
                  )}
                  style={{ ...(value >= 0 ? { bottom: '50%', height: h } : { top: '50%', height: h }), ['--i' as string]: i } as CSSProperties}
                />
              </span>
            );
          })}
        </div>
        {/* markers */}
        <Marker at={par} label="Par" tone="text-ink-lo" line="bg-ink-lo" position="bottom" />
        {!passed && <Marker at={sitOut} label="Sit out" tone="text-restraint-ink" line="bg-restraint" position="bottom" faint />}
        {/* "You" starts at par and slides to where the trade actually ranked. */}
        {you !== null && <Marker at={you} label={passed ? 'You · sat out' : 'You'} tone="text-ink-max" line="bg-ink-max" position="top" strong travel />}
      </div>
      <figcaption className="text-ink-dim mt-5 flex justify-between text-mini">
        <span>Worst possible</span>
        <span className="text-gold-ink">Best in hindsight</span>
      </figcaption>
    </figure>
  );
}

function Marker({
  at,
  label,
  tone,
  line,
  position,
  strong,
  faint,
  travel,
}: {
  at: number;
  label: string;
  tone: string;
  line: string;
  position: 'top' | 'bottom';
  strong?: boolean;
  faint?: boolean;
  travel?: boolean;
}) {
  const clamped = Math.min(Math.max(at, 0), 1);
  // Labels near either end are pinned inward so they never overflow the strip.
  const align = clamped < 0.12 ? 'left-0' : clamped > 0.88 ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div className={cx('pointer-events-none absolute inset-y-0', travel && 'from-par')} style={{ left: `${clamped * 100}%` }}>
      <div className={cx('absolute inset-y-1 -ml-px w-0.5 rounded-full', line, faint && 'opacity-60', strong && 'w-[3px]')} />
      <span
        className={cx(
          'absolute text-mini font-semibold whitespace-nowrap',
          tone,
          align,
          position === 'top' ? '-top-4' : '-bottom-4',
          faint && 'font-medium',
        )}
      >
        {label}
      </span>
    </div>
  );
}
