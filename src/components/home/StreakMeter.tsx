'use client';

import type { StreakView } from '@/core/streak';
import { cx, Chip } from '../ui';

/**
 * §10.3's streak, including the parts that make it humane.
 *
 * The document is blunt that a streak "works by making people anxious", and that the mitigations
 * are not optional garnish — two freezes up front, earn-back, and a gold perfect state that stops
 * freezes cheapening the achievement. All three are visible here, because a safety net nobody can
 * see does not reduce anxiety.
 *
 * The motion encodes the difference between them. A completed day pops in; a **frozen day never
 * animates** and is drawn as a dashed outline. A freeze is a mitigation, not a celebration, and
 * animating it the same way would tell the player they achieved something when they did not.
 *
 * The other thing this has to get right is *which day to point at*. Because each daily stays open
 * 48 hours, the day that rescues a run is `frontier + 1` — which on the last possible day is
 * **yesterday's** daily, not today's. Telling a player to "play today" then is simply wrong: it
 * starts a new run of one and lets the old one lapse tomorrow.
 */
export function StreakMeter({ streak, today }: { streak: StreakView; today: number }) {
  const cells = buildCells(streak, today);
  const rescueIsBacklog = streak.requiredDay !== null && streak.requiredDay < today;

  return (
    <div
      className={cx(
        'bg-surface-2 shadow-e1 relative overflow-hidden rounded-xl border p-4 md:p-5',
        streak.perfect ? 'border-gold-line' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-ink-dim">
            {streak.perfect ? 'Perfect streak' : 'Streak'}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cx(
                'numeral text-3xl font-semibold',
                streak.length === 0 ? 'text-ink-faint' : streak.perfect ? 'text-gold-ink' : 'text-ink-max',
              )}
            >
              {streak.length}
            </span>
            <span className="text-ink-dim text-sm">
              {streak.length === 1 ? 'day' : 'days'}
              {streak.longest > streak.length ? ` · best ${streak.longest}` : ''}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <Freezes remaining={streak.freezesRemaining} />
          {streak.perfect && streak.length > 0 && (
            <Chip tone="gold" className="eyebrow">
              No freezes used
            </Chip>
          )}
        </div>
      </div>

      {/* Fourteen cells across a 375px phone: at h-8 and gap-1 they were 20px wide and the row
          ran past the card. Shorter and tighter below sm, full height from there. */}
      <div className="mt-4 flex gap-0.5 sm:gap-1" data-stagger>
        {cells.map((cell, i) => (
          <div
            key={cell.day}
            style={{ '--i': i } as React.CSSProperties}
            title={cellTitle(cell)}
            className={cx(
              'h-6 min-w-0 flex-1 rounded-sm sm:h-8',
              cell.kind === 'done' && (streak.perfect ? 'bg-gold/70' : 'bg-long/70'),
              // A freeze is drawn, never celebrated.
              cell.kind === 'frozen' && 'border-info-line bg-info-bg border border-dashed',
              cell.kind === 'repaired' && 'bg-restraint-bg border-restraint-line border',
              cell.kind === 'today' && 'border-line-strong animate-breathe border border-dashed',
              cell.kind === 'missed' && 'bg-fill-1',
              cell.kind === 'future' && 'bg-fill-1/50',
            )}
          />
        ))}
      </div>

      <p className="text-ink-lo mt-3.5 text-sm leading-relaxed">
        {streak.length === 0 ? (
          <>Complete today&rsquo;s daily to start a streak. You get two freezes to spend on days you miss.</>
        ) : rescueIsBacklog ? (
          <>
            <span className="text-attention-ink font-medium">
              Play day #{streak.requiredDay} — yesterday&rsquo;s — to keep this alive.
            </span>{' '}
            Today&rsquo;s daily starts a new run instead; each one stays open 48 hours, so the gap
            is the one that closes first.
          </>
        ) : streak.atRisk ? (
          <>Today&rsquo;s daily is still open. It stays playable until day #{streak.deadlineDay}.</>
        ) : (
          <>Today is done. Come back tomorrow.</>
        )}
      </p>

      {streak.repair && (
        <div className="border-restraint-line bg-restraint-bg mt-3 rounded-md border p-3">
          <div className="eyebrow text-restraint-ink">Earn it back</div>
          <p className="text-ink-lo mt-1 text-sm leading-relaxed">
            Your run ended, but it is recoverable. Complete{' '}
            <span className="text-ink-hi numeral">
              {streak.repair.chartsRequired - streak.repair.chartsDone}
            </span>{' '}
            more charts and the run reattaches — passes count, because trading everything to save a
            streak is exactly the habit this product exists to break.
          </p>
          <div className="bg-fill-2 mt-2 h-1 overflow-hidden rounded-full">
            <div
              className="bg-restraint h-full rounded-full transition-[width] duration-(--dur-5) ease-(--ease-entrance)"
              style={{
                width: `${(streak.repair.chartsDone / streak.repair.chartsRequired) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Freezes({ remaining }: { remaining: number }) {
  return (
    <div className="flex items-center gap-1" title={`${remaining} streak freeze${remaining === 1 ? '' : 's'} left`}>
      {[0, 1].map((i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path
            d="M7 1v12M2 4l10 6M12 4L2 10"
            stroke={i < remaining ? 'var(--color-info)' : 'var(--color-ink-faint)'}
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity={i < remaining ? 1 : 0.4}
          />
        </svg>
      ))}
    </div>
  );
}

type Cell = { day: number; kind: 'done' | 'frozen' | 'repaired' | 'today' | 'missed' | 'future' };

/** The last fourteen days, which is long enough to show a habit forming and short enough to read. */
function buildCells(streak: StreakView, today: number): Cell[] {
  const cells: Cell[] = [];
  const start = today - 13;
  for (let day = start; day <= today; day++) {
    if (day === today) {
      cells.push({ day, kind: streak.todayDone ? 'done' : 'today' });
      continue;
    }
    const inRun =
      streak.runStart !== null && streak.frontier !== null && day >= streak.runStart && day <= streak.frontier;
    cells.push({ day, kind: inRun ? 'done' : 'missed' });
  }
  return cells;
}

function cellTitle(cell: Cell): string {
  const labels: Record<Cell['kind'], string> = {
    done: 'Completed',
    frozen: 'Covered by a freeze',
    repaired: 'Earned back',
    today: 'Today — still open',
    missed: 'Missed',
    future: '',
  };
  return `Daily #${cell.day} · ${labels[cell.kind]}`;
}
