'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { easeOutCubic } from './camera';
import { getMotionSnapshot, SERVER_MOTION, subscribeMotion } from './motion';

/**
 * Whether the viewer has asked for less motion.
 *
 * One source of truth, shared with CSS: the stylesheet keys off `data-motion` on <html> with the
 * media query as the fallback, and `lib/motion.ts` owns reading both. This used to be a `useState`
 * seeded in an effect that only re-ran on `matchMedia` change — so it observed the media query and
 * not the attribute, and the attribute is the half a player can actually control. Changing the
 * setting updated the CSS instantly and left every React consumer on the old value until the
 * operating system preference happened to change.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => getMotionSnapshot().reduced,
    () => SERVER_MOTION.reduced,
  );
}

/**
 * A 0 → 1 progress value, run once on mount.
 *
 * One clock, so things that should arrive together do. That is not a stylistic preference: on the
 * debrief the headline percentile counts up while the player's marker sweeps to its position on
 * the distribution, and those two are the same fact stated twice. Driven by separate timers they
 * land a frame or two apart and the screen reads as two unrelated animations instead of one.
 *
 * Under reduced motion it returns 1 immediately — the number is the content, so it is shown, just
 * without the travel.
 */
export function useTween(durationMs: number, deps: unknown[] = []): number {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) return;

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      setT(easeOutCubic(progress));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs, reduced, ...deps]);

  // Derived rather than written: under reduced motion the tween never runs, and the final value
  // is simply what the hook reports.
  return reduced ? 1 : t;
}

/**
 * A number that counts up to its value.
 *
 * Three call sites hand-rolled `useTween` plus a `Math.round` plus a sign and a fixed precision,
 * and got a slightly different answer each time about what to show on the first frame.
 */
export function useCountUp(
  value: number | null,
  { ms = 620, decimals = 0, sign = false, deps = [] }: { ms?: number; decimals?: number; sign?: boolean; deps?: unknown[] } = {},
): string {
  const t = useTween(ms, [value, ...deps]);
  if (value === null) return '—';
  const current = value * t;
  const text = current.toFixed(decimals);
  // `+0.00` is wrong and `-0.00` is worse. Only a genuinely positive number gets a plus.
  return sign && current > 0 ? `+${text}` : text;
}
