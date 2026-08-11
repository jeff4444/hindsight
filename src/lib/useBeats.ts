'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from './useTween';

export interface Beats {
  /** Index of the last beat that has fired, or -1 before the first. */
  index: number;
  /** `true` once beat `i` has fired. The normal call form. */
  at: (i: number) => boolean;
  /** Milliseconds since the sequence started, for anything needing sub-beat progress. */
  elapsed: number;
  done: boolean;
}

/**
 * Sequenced entrance, as one clock.
 *
 * The debrief is five facts that only mean something in order — the verdict, the axes, the shape
 * of what was possible, where you landed inside it, and why. Played simultaneously they read as a
 * page loading. Played on five independent `setTimeout`s they drift apart under load and read as
 * five unrelated animations. One origin, integer beats.
 *
 * rAF rather than `setTimeout` deliberately: this runs on the same frame as `useTween`'s count-up
 * and, on the play route, alongside `useRevealLoop`. A timer that fires between frames produces a
 * beat that lands one frame off the number it is meant to introduce, which is exactly the seam
 * this exists to remove.
 *
 * Under reduced motion every beat has already fired on the first render. The content is the
 * content; only the choreography was decoration.
 */
export function useBeats(times: readonly number[], deps: unknown[] = []): Beats {
  const reduced = useReducedMotion();
  const last = times.length - 1;
  const frame = useRef<number | null>(null);
  const key = [times.join(':'), ...deps.map(String)].join('|');

  const [run, setRun] = useState(() => ({ key, index: -1, elapsed: 0 }));

  // Resetting during render rather than in an effect. This is React's documented way to adjust
  // state when an input changes, and it matters here: an effect-based reset paints one frame of
  // the previous, fully-composed sequence before restarting, which on a replay is a visible flash
  // of the answer before the animation that reveals it.
  if (run.key !== key) setRun({ key, index: -1, elapsed: 0 });

  useEffect(() => {
    if (reduced) return;

    const origin = performance.now();
    const tick = (now: number) => {
      const elapsed = now - origin;
      let index = -1;
      for (let i = 0; i < times.length; i++) if (elapsed >= times[i]) index = i;
      setRun((prev) => (prev.key === key && prev.index === index ? prev : { key, index, elapsed }));
      if (index < last) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);

  // Reduced motion is a derived override, not a stored one: there is no state to get wrong, and
  // toggling the preference mid-sequence resolves immediately.
  const index = reduced ? last : run.index;

  return {
    index,
    elapsed: reduced ? (times[last] ?? 0) : run.elapsed,
    at: (i: number) => index >= i,
    done: index >= last,
  };
}

/** The house rhythm. `beats(5)` → [0, 220, 440, 660, 880]. Use literals only to break it. */
export function beats(count: number, unit = 220): number[] {
  return Array.from({ length: count }, (_, i) => i * unit);
}
