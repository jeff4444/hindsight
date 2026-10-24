'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Bar } from '@/core/bars';

import type { RoundResult } from '@/lib/api-types';
import {
  finalView,
  focusView,
  priceExtent,
  revealTarget,
  settled,
  step,
  type View,
  type Window,
} from '@/lib/camera';
import { exitColour } from '@/lib/palette';
import type { ChartHandle } from '../Chart';

/**
 * The reveal.
 *
 * This is the one piece of motion in the product that is content rather than decoration, and it is
 * the reason the play surface is a client component at all. It was lifted out of `Play.tsx`
 * unchanged: same clamp, same carry accumulator, same exponential camera, same settle test. The
 * only edit is that what were closure variables are now passed-in refs, because the loop must read
 * live values without being torn down and rebuilt every time the player nudges a control.
 *
 * Nothing here converts a ref to state and nothing changes `CAMERA_TAU_MS`. Both would be visible
 * immediately: the first as a re-subscribe mid-reveal, the second as a camera that either snaps or
 * lags behind the bars it is supposed to be following.
 */

/** Milliseconds per revealed candle. */
export const SPEEDS = [
  { label: '0.5x', ms: 150 },
  { label: '1x', ms: 78 },
  { label: '2x', ms: 38 },
  { label: '4x', ms: 18 },
];
export const DEFAULT_SPEED = 1;

export interface RevealRefs {
  chart: React.RefObject<ChartHandle | null>;
  /** The future, held only after the order is committed. */
  reveal: React.RefObject<Bar[]>;
  /** Everything currently drawn, lead-in plus whatever has been revealed. */
  shown: React.RefObject<Bar[]>;
  rails: React.RefObject<number[]>;
  revealed: React.RefObject<number>;
  speed: React.RefObject<number>;
  paused: React.RefObject<boolean>;
  result: React.RefObject<RoundResult | null>;
  frame: React.RefObject<number | null>;
  /**
   * The camera's time constant, in ms.
   *
   * §5's reduced-motion policy keeps the reveal itself — it is the content, not decoration — but a
   * vestibular viewer still needs an out, and `prefers-reduced-motion` should not silently be it.
   * Passing ~1ms here makes the camera snap to each target instead of easing, so the bars still
   * arrive one at a time and nothing glides. `step` has always taken tau as a parameter; this just
   * stops defaulting it.
   */
  tau: React.RefObject<number>;
  /**
   * The candle counts this round actually issued.
   *
   * Not a constant since the ladder: a tier can grant 60, 80 or 300 candles of history, so the
   * decision bar's index — which every camera target and every `revealHour` call is relative to —
   * changes per round.
   */
  window: React.RefObject<Window>;
}

export interface RevealCallbacks {
  onRevealed: (count: number) => void;
  onHit: (kind: 'target' | 'stop') => void;
  onSettled: () => void;
}

export function useRevealLoop(refs: RevealRefs, callbacks: RevealCallbacks) {
  // Written after every commit rather than during render, so the loop always calls the current
  // closures without the hook itself having to depend on them. An effect with no dependency array
  // runs after each render, and both event handlers and rAF frames fire after commit — so by the
  // time anything below reads these, they are current.
  const cb = useRef(callbacks);
  const r = useRef(refs);
  useEffect(() => {
    cb.current = callbacks;
    r.current = refs;
  });

  const stop = useCallback(() => {
    const frame = r.current.frame;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  /**
   * The camera pre-roll, run the instant the player commits and before the server answers.
   *
   * `submit` sets the phase to `committing` before awaiting the network, so there is a hole of
   * however long the round trip takes in which the screen has been told something happened and
   * shows nothing. Easing to the close-up during that hole turns latency into a camera move: by
   * the time the future arrives the chart is already framed for it, and `start()` picks the camera
   * up wherever this left it because it seeds from `getLogical()` rather than from an assumption.
   *
   * Deliberately no bar work and no state — this only moves the view, so if the request fails the
   * chart is merely zoomed in and `load()` resets it.
   */
  const prime = useCallback(() => {
    const { chart, shown, rails, frame, tau, window: win } = r.current;
    const chartApi = chart.current;
    if (!chartApi) return;

    if (frame.current !== null) cancelAnimationFrame(frame.current);
    chartApi.setInteractive(false);

    const logical = chartApi.getLogical();
    const price = chartApi.getPrice();
    const opening = focusView(win.current);
    const target: View = {
      ...opening,
      ...priceExtent(shown.current, opening.from, opening.to, rails.current),
    };
    const camera: View = {
      from: logical?.from ?? opening.from,
      to: logical?.to ?? opening.to,
      ...(price ?? priceExtent(shown.current, opening.from, opening.to, rails.current)),
    };

    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      step(camera, target, dt, tau.current);
      chartApi.setLogical({ from: camera.from, to: camera.to });
      chartApi.setPrice({ min: camera.min, max: camera.max });
      // No settle test: `start()` cancels this the moment the reveal begins, and if the commit
      // fails the reset in `load()` ends it. Stopping early would leave the camera short of the
      // close-up with nothing scheduled to finish the move.
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    const { chart, reveal, shown, rails, revealed, speed, paused, result, frame, tau, window: win } = r.current;
    const total = reveal.current.length;
    const chartApi = chart.current;
    if (!chartApi || total === 0) return;

    // The pre-roll may still be running its own frame against the same slot.
    if (frame.current !== null) cancelAnimationFrame(frame.current);

    revealed.current = 0;
    cb.current.onRevealed(0);
    chartApi.setInteractive(false);

    // Seed the camera wherever the player left the chart, so the cut to the close-up is a move
    // from their view rather than a jump from an assumed one.
    const logical = chartApi.getLogical();
    const price = chartApi.getPrice();
    const opening = focusView(win.current);
    const camera: View = {
      from: logical?.from ?? opening.from,
      to: logical?.to ?? opening.to,
      ...(price ?? priceExtent(shown.current, opening.from, opening.to, rails.current)),
    };

    let last = performance.now();
    let carry = 0;

    const tick = (now: number) => {
      // Clamped so a backgrounded tab does not dump a hundred bars in one frame.
      const dt = Math.min(now - last, 64);
      last = now;

      if (revealed.current < total && !paused.current) {
        carry += dt;
        const perBar = SPEEDS[speed.current].ms;
        while (carry >= perBar && revealed.current < total) {
          carry -= perBar;
          const index = revealed.current;
          const bar = reveal.current[index];
          chartApi.revealHour(bar, win.current.leadIn + index);
          shown.current.push(bar);
          revealed.current = index + 1;

          const outcome = result.current;
          if (outcome && outcome.outcome !== 'pass' && outcome.exitBarIndex === index) {
            chartApi.markExit(
              index,
              outcome.outcome === 'target'
                ? 'target'
                : outcome.outcome === 'stop'
                  ? 'stop'
                  : 'close',
              exitColour(outcome.outcome),
            );
            if (outcome.outcome === 'target' || outcome.outcome === 'stop') {
              cb.current.onHit(outcome.outcome);
            }
          }
        }
        cb.current.onRevealed(revealed.current);
      }

      const done = revealed.current >= total;
      const view = done
        ? finalView(shown.current, rails.current, win.current)
        : revealTarget(revealed.current, total, shown.current, rails.current, win.current);

      step(camera, view, dt, tau.current);
      chartApi.setLogical({ from: camera.from, to: camera.to });
      chartApi.setPrice({ min: camera.min, max: camera.max });

      if (done && settled(camera, view)) {
        // Hand the chart back: autoscale returns, the resolution unfreezes, and the player can
        // zoom into the result down to the minute.
        chartApi.setPrice(null);
        chartApi.setInteractive(true);
        cb.current.onSettled();
        frame.current = null;
        return;
      }

      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
  }, []);

  /** Jump to the end without stopping the camera, which still eases into the final view. */
  const skip = useCallback(() => {
    const { chart, reveal, shown, revealed, result, window: win } = r.current;
    const chartApi = chart.current;
    if (!chartApi) return;

    for (let i = revealed.current; i < reveal.current.length; i++) {
      chartApi.revealHour(reveal.current[i], win.current.leadIn + i);
      shown.current.push(reveal.current[i]);
    }
    // The same marker, label and wash as a reveal played out — skipping is a speed, not a
    // different ending. It used to label a time exit "stop" and drop the outcome flash entirely.
    const outcome = result.current;
    if (outcome && outcome.outcome !== 'pass' && outcome.exitBarIndex !== null) {
      chartApi.markExit(
        outcome.exitBarIndex,
        outcome.outcome === 'target' ? 'target' : outcome.outcome === 'stop' ? 'stop' : 'close',
        exitColour(outcome.outcome),
      );
      if (outcome.outcome === 'target' || outcome.outcome === 'stop') cb.current.onHit(outcome.outcome);
    }
    revealed.current = reveal.current.length;
    cb.current.onRevealed(reveal.current.length);
  }, []);

  return { start, skip, stop, prime };
}
