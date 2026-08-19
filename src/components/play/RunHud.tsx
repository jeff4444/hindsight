'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STORM_SPEC } from '@/core/run';
import type { RunState } from '@/lib/api-types';
import { Button, Chip, Eyebrow, Panel, cx } from '../ui';

/**
 * §10.1's Storm and Streak, on screen.
 *
 * Two modes, one strip: whatever the run is counting sits in the header where the daily's pips sit,
 * because a player mid-run needs the state at a glance and the chart owns everything below it.
 *
 * ## The clock only runs while you are deciding
 *
 * Storm's budget is decision time, so the display freezes the moment a round is committed and does
 * not move again until the next chart is placed — the reveal and the debrief are free. That is not a
 * courtesy: under a wall clock the fastest strategy was to commit and skip the reveal, and skipping
 * the reveal means never seeing the outcome, which is the whole product. See `src/core/run.ts`.
 *
 * The count here is a *display of the server's last word*, not the clock itself. Every commit comes
 * back with what the server charged, and this resets to it. A tab that is throttled, asleep or
 * tampered with can show the wrong number for one round and cannot change the score.
 */
export function RunHud({ run, deciding }: { run: RunState; deciding: boolean }) {
  if (run.mode === 'streak') {
    return (
      <div className="flex items-center gap-2">
        <Eyebrow className="hidden sm:block">Streak</Eyebrow>
        <span className="numeral text-ink-max text-lg leading-none font-semibold">{run.length}</span>
        <span className="text-ink-faint text-xs">in a row</span>
        {/* The skip is a resource, so it is shown as one: present or spent, never a number to
            interpret. It is also the only thing standing between this mode and being farmed by
            passing — par_r is negative on 95% of charts and a pass is 0R. */}
        <Chip tone={run.skipsLeft > 0 ? 'info' : 'neutral'}>
          {run.skipsLeft > 0 ? '1 skip' : 'no skip'}
        </Chip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <RunClock key={run.remainingMs} remainingMs={run.remainingMs} deciding={deciding} />
      <span className="numeral text-ink-max text-lg leading-none font-semibold">{run.score}</span>
      {/* Gold, and only past one: a combo of one is just "you got this chart right", and a badge
          for it would make the ladder look like it pays from the first rung. */}
      {run.combo > 1 && (
        <Chip tone="gold" className="numeral">
          ×{run.combo}
        </Chip>
      )}
    </div>
  );
}

/**
 * Storm's clock, counting only while the player is deciding.
 *
 * A `requestAnimationFrame` loop measured against `performance.now()` rather than an interval, for
 * the reason `DecisionClock` gives: an interval in a background tab drifts against wall time in
 * exactly the way a countdown must not.
 */
function RunClock({ remainingMs, deciding }: { remainingMs: number; deciding: boolean }) {
  // Seeded from the prop and never reset in an effect: the parent remounts this on a new
  // `remainingMs` via `key`, which is the same thing without a render that renders the old value.
  const [left, setLeft] = useState(remainingMs);

  useEffect(() => {
    if (!deciding) return;

    const start = performance.now();
    const from = remainingMs;
    let frame = 0;
    const tick = () => {
      const next = Math.max(0, from - (performance.now() - start));
      setLeft(next);
      // No `onExpire`. The server decides when a run is over, on the commit that spends the last of
      // the budget — a client that could end a run could also end it early on someone else's turn.
      if (next > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [remainingMs, deciding]);

  const fraction = Math.max(0, Math.min(1, left / STORM_SPEC.durationMs));
  const seconds = Math.ceil(left / 1000);
  const urgent = left <= 30_000;
  const critical = left <= 10_000;

  return (
    <span
      className={cx(
        'text-mini inline-flex items-center gap-1.5 rounded px-2 py-1 font-mono tabular-nums ring-1 transition-colors',
        critical
          ? 'text-loss-ink ring-loss/40 bg-loss/10'
          : urgent
            ? 'text-attention-ink ring-attention/40 bg-attention/10'
            : 'text-ink-lo ring-line-faint',
        // Frozen is a state worth seeing: it is the answer to "why is my clock not moving?", and
        // the answer is that watching the reveal is free.
        !deciding && 'opacity-60',
      )}
      title={deciding ? 'Deciding — the clock is running' : 'The reveal is free'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 9}
          strokeDashoffset={2 * Math.PI * 9 * (1 - fraction)}
          transform="rotate(-90 12 12)"
        />
      </svg>
      <span>
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </span>
    </span>
  );
}

/**
 * The end of a run.
 *
 * Both modes report *charts seen* beside the score, which is the number that says whether the score
 * came from reading well or from standing aside: a Storm of twenty charts and four points is a
 * player who passed sixteen times, and the surface should not let that read as a good run.
 */
export function RunSummary({ run, onAgain }: { run: RunState; onAgain: () => void }) {
  const storm = run.mode === 'storm';
  return (
    <Panel pad="lg" className="mx-auto mt-6 max-w-md text-center">
      <Eyebrow>{storm ? 'Storm over' : 'Streak broken'}</Eyebrow>

      <p className="numeral text-ink-max mt-3 text-5xl font-semibold">
        {storm ? run.score : run.bestLength}
      </p>
      <p className="text-ink-lo mt-1 text-sm">
        {storm
          ? `points from ${run.charts} chart${run.charts === 1 ? '' : 's'}`
          : `in a row, over ${run.charts} chart${run.charts === 1 ? '' : 's'}`}
      </p>

      {storm && run.bestCombo > 1 && (
        <p className="text-ink-faint mt-3 text-xs">
          Best run of <span className="numeral text-ink-lo">{run.bestCombo}</span> in a row.
        </p>
      )}

      <p className="text-ink-faint mx-auto mt-5 max-w-prose text-xs leading-relaxed">
        {storm
          ? 'A point for every chart where you beat the median of the 98 enumerated brackets, plus the rung at 5, 12, 20 and 30. Standing aside scores nothing — the median bracket loses money on 95% of charts, so a pass would otherwise be free points.'
          : 'The run ended on the first result below the median of the 98 enumerated brackets. One skip per run, and it does not come back.'}
      </p>

      <div className="mt-6 flex items-center justify-center gap-2">
        <Button onClick={onAgain} variant="primary" size="lg">
          Again
        </Button>
        <Button as="a" href="/home" variant="secondary" size="lg">
          Home
        </Button>
      </div>

      <p className="text-ink-faint mt-4 text-xs">
        Every chart here counts everywhere else —{' '}
        <Link href="/stats" className="underline underline-offset-2">
          your record
        </Link>{' '}
        does not care which mode it was played in.
      </p>
    </Panel>
  );
}
