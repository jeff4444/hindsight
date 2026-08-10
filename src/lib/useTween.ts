'use client';

import { useEffect, useRef, useState } from 'react';
import { easeOutCubic } from './camera';

/**
 * Whether the viewer has asked for less motion.
 *
 * One source of truth, shared with CSS: the stylesheet keys off `data-motion` on `<html>` with the
 * media query as the fallback, and this reads the same pair. Two independent notions of "reduced"
 * drift, and the drift shows up as an animation that half-plays.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => {
      const explicit = document.documentElement.dataset.motion;
      setReduced(explicit === 'reduced' || (explicit !== 'full' && query.matches));
    };
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, []);

  return reduced;
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
