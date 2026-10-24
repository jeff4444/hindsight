'use client';

import { useEffect, useRef, useState } from 'react';
import { cx } from '../ui';

/**
 * §3.2's deliberation clock.
 *
 * Naked runs 90 seconds and Blackout 20, and §3.2 gives the reason plainly: "Unlimited time plus
 * multi-timeframe zoom is the trading equivalent of driving down the road: the player willing to
 * spend four minutes wins, and willingness to spend four minutes is not a skill worth ranking."
 *
 * Three things this is careful about.
 *
 * **The server owns the deadline.** What arrives is a remaining duration, not a timestamp, and the
 * commit is checked against the server's own clock again. This display cannot make a late commit
 * land or an early one fail; it can only tell the player what is happening.
 *
 * **It is a requestAnimationFrame loop, not a setInterval.** The app has no intervals anywhere, and
 * an interval in a background tab drifts against wall time in exactly the way a countdown must not.
 * The elapsed time is measured against `performance.now()` rather than accumulated, so a throttled
 * or backgrounded tab resumes showing the true remaining time rather than a stale one.
 *
 * **It does not animate under reduced motion, but it still counts.** The ring is decoration; the
 * number is the content. §5's policy is that content keeps moving.
 */
export function DecisionClock({
  remainingMs,
  onExpire,
  className,
}: {
  /** As issued. The component tracks its own elapsed time from mount rather than trusting updates. */
  remainingMs: number;
  onExpire: () => void;
  className?: string;
}) {
  const [left, setLeft] = useState(remainingMs);
  const fired = useRef(false);

  useEffect(() => {
    const start = performance.now();
    const from = remainingMs;
    let frame = 0;

    const tick = () => {
      // Measured, never accumulated: a throttled tab that misses 400 frames still resumes on the
      // correct second rather than 400 frames behind.
      const next = Math.max(0, from - (performance.now() - start));
      setLeft(next);
      if (next <= 0) {
        if (!fired.current) {
          fired.current = true;
          onExpire();
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [remainingMs, onExpire]);

  const seconds = Math.ceil(left / 1000);
  // Urgency is stated in absolute seconds, not in a fraction of the limit: five seconds left feels
  // the same whether the ruleset gave you ninety or twenty. Coral, never gold: running out of time
  // is not the best outcome of anything.
  const critical = left <= 5_000;
  const urgent = left <= 10_000;
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;

  return (
    <span
      className={cx(
        'numeral inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular-nums ring-1 transition-colors',
        critical
          ? 'bg-short-bg text-short-ink ring-short-line'
          : urgent
            ? 'text-ink-max ring-line-strong bg-fill-2'
            : 'text-ink-hi ring-line bg-fill-1',
        className,
      )}
      // A countdown that only exists visually is invisible to a screen reader until it has already
      // run out. Polite rather than assertive so it does not interrupt on every tick.
      role="timer"
      aria-live={urgent ? 'polite' : 'off'}
      aria-label={`${seconds} seconds left to decide`}
      title="This ruleset is timed, so a slow read cannot beat a good one."
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 1.5M10 2h4" />
      </svg>
      {m}:{String(sec).padStart(2, '0')}
    </span>
  );
}

/**
 * The same clock, as a line draining across the top edge of the chart.
 *
 * The pill in the top bar is the number; this is the feeling. It lives inside the frame, at z-20,
 * as a sibling of the rail layer — width is the only thing that changes, and it is never a
 * transform. It tracks its own elapsed time from mount, exactly as the pill does, so the two agree
 * to the frame without sharing state; only the pill fires the expiry.
 */
export function ClockLine({ totalMs, remainingMs }: { totalMs: number; remainingMs: number }) {
  const [left, setLeft] = useState(remainingMs);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const next = Math.max(0, remainingMs - (performance.now() - start));
      setLeft(next);
      if (next > 0) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [remainingMs]);

  const fraction = totalMs > 0 ? Math.max(0, Math.min(1, left / totalMs)) : 0;
  const critical = left <= 5_000;

  return (
    <div aria-hidden className="bg-fill-1 pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px]">
      <div
        className={cx('h-full transition-colors', critical ? 'bg-short' : left <= 10_000 ? 'bg-ink-max' : 'bg-ink-lo')}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
