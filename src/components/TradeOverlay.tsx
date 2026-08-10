'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ChartHandle } from './Chart';

/**
 * Draggable stop and target rails, as an HTML overlay rather than canvas primitives.
 *
 * §13.4: "drag-to-place price lines are not natively supported by the obvious charting
 * library: they need either a custom rendering primitive... or an HTML overlay, which is
 * likely the better answer on touch devices where a one-pixel canvas line is unhittable."
 *
 * So each rail is a 44px pointer target wrapped around a 2px line, driven by pointer events so
 * mouse, trackpad, pen and touch all take the same path. §16 keeps native apps out of scope
 * but requires the drag to be designed for touch from the start.
 */

export type Rail = 'stop' | 'target';

/**
 * Which rail a press at `y` is asking for.
 *
 * Each rail owns a 44px pointer box, and the two are siblings — so whenever their lines are closer
 * together than that, the boxes overlap and whichever is later in the DOM wins every press. TARGET
 * renders last, so a tight bracket left STOP simply ungrabbable. On a desktop the way out is to
 * zoom until they separate; on a phone at 1:1 R:R with a small ATR there is no way out at all.
 *
 * So the press picks by distance to the line rather than by paint order. Ties go to the stop,
 * because the stop is the rail that defines the risk and is the one worth protecting access to.
 *
 * Pure and exported so the overlapping case can be tested without a DOM — the bug it fixes was
 * invisible to every check that dispatched events at an element rather than at a coordinate.
 */
export function nearestRail(y: number, stopY: number, targetY: number): Rail {
  return Math.abs(y - stopY) <= Math.abs(y - targetY) ? 'stop' : 'target';
}

interface Props {
  chart: React.RefObject<ChartHandle | null>;
  entry: number;
  stop: number;
  target: number;
  locked: boolean;
  /** A pass has no bracket, so there is nothing to draw. */
  hidden?: boolean;
  onDrag: (rail: Rail, price: number) => void;
}

export function TradeOverlay({ chart, entry, stop, target, locked, hidden, onDrag }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const entryEl = useRef<HTMLDivElement>(null);
  const stopEl = useRef<HTMLDivElement>(null);
  const targetEl = useRef<HTMLDivElement>(null);
  const riskEl = useRef<HTMLDivElement>(null);
  const rewardEl = useRef<HTMLDivElement>(null);

  // Prices live in React state; pixel positions are recomputed every frame from the chart
  // itself. Nothing here duplicates the chart's own scale arithmetic, so the rails cannot
  // drift away from the axis they are drawn against — including while the reveal camera is
  // moving the axis underneath them.
  const prices = useRef({ entry, stop, target });
  useEffect(() => {
    prices.current = { entry, stop, target };
  }, [entry, stop, target]);

  useEffect(() => {
    let frame = 0;

    const place = (el: HTMLDivElement | null, price: number) => {
      const y = chart.current?.priceToY(price);
      if (el === null || y === null || y === undefined) return null;
      el.style.transform = `translateY(${y}px)`;
      el.style.visibility = 'visible';
      return y;
    };

    const band = (el: HTMLDivElement | null, a: number | null, b: number | null) => {
      if (!el || a === null || b === null) return;
      el.style.top = `${Math.min(a, b)}px`;
      el.style.height = `${Math.abs(a - b)}px`;
      el.style.visibility = 'visible';
    };

    const tick = () => {
      const { entry: e, stop: s, target: t } = prices.current;
      const entryY = place(entryEl.current, e);
      const stopY = place(stopEl.current, s);
      const targetY = place(targetEl.current, t);
      band(riskEl.current, entryY, stopY);
      band(rewardEl.current, entryY, targetY);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chart]);

  // The rails are full-width pointer targets, so a wheel event over one has the rail as its
  // target and never reaches the canvas underneath — leaving two 44px stripes across the chart
  // where zooming silently does nothing. Wheels that land on a rail bubble to this layer (the
  // layer itself is pointer-events:none, so nothing else reaches it) and are forwarded on.
  //
  // Registered natively rather than via onWheel because it must be non-passive to preventDefault.
  useEffect(() => {
    const el = layer.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      const bounds = el.getBoundingClientRect();
      if (bounds.width === 0) return;
      event.preventDefault();
      const anchor = (event.clientX - bounds.left) / bounds.width;
      // Matched to lightweight-charts' own wheel feel: about 1.1x per notch.
      chart.current?.zoomAt(anchor, Math.exp(event.deltaY * 0.001));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [chart]);

  /** Resolve a press to a rail in layer coordinates. See `nearestRail`. */
  const railAt = useCallback(
    (clientY: number, fallback: Rail): Rail => {
      const bounds = layer.current?.getBoundingClientRect();
      if (!bounds) return fallback;
      const y = clientY - bounds.top;
      const stopY = chart.current?.priceToY(prices.current.stop);
      const targetY = chart.current?.priceToY(prices.current.target);
      if (typeof stopY !== 'number' || typeof targetY !== 'number') return fallback;
      return nearestRail(y, stopY, targetY);
    },
    [chart],
  );

  const startDrag = useCallback(
    (pressed: Rail) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (locked) return;
      event.preventDefault();
      // Keep the drag off the chart underneath, which would otherwise pan with it.
      event.stopPropagation();

      const rail = railAt(event.clientY, pressed);
      const el = event.currentTarget;
      const pointerId = event.pointerId;

      // Pointer capture is an enhancement, not the mechanism. It keeps the events off the canvas
      // while the drag is live, but it silently does nothing for a pointer the browser does not
      // consider active — which is exactly what happens under synthetic input, and would leave a
      // drag that works by hand and fails every automated check. The listeners below go on the
      // window, so the drag holds either way, and equally when the pointer leaves the rail.
      try {
        el.setPointerCapture(pointerId);
      } catch {
        // Not capturable; the window listeners still carry the drag.
      }

      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const bounds = layer.current?.getBoundingClientRect();
        if (!bounds) return;
        // Clamped to the frame, so a rail can never be dragged to a price that is not on screen.
        // To place a wider stop, zoom out — which is how every real charting tool behaves.
        const y = Math.min(Math.max(moveEvent.clientY - bounds.top, 0), bounds.height);
        const price = chart.current?.yToPrice(y);
        if (typeof price === 'number') onDrag(rail, price);
      };

      const end = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          // Never captured.
        }
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [chart, locked, onDrag, railAt],
  );

  return (
    // z-10 is load-bearing: lightweight-charts paints its canvases at z-index 2 inside the
    // nearest stacking context, so an overlay at the default z-index renders visibly on top of
    // the chart while sitting underneath it for hit-testing. The rails look right and cannot
    // be grabbed.
    //
    // For the same reason nothing in the app may put a filter, backdrop-filter, transform,
    // isolation or opacity < 1 on an ancestor of this layer: any of them creates a new stacking
    // context and traps the overlay behind the canvas again.
    <div
      ref={layer}
      className={`pointer-events-none absolute inset-0 z-10 overflow-hidden transition-opacity duration-500 ${
        hidden ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        ref={riskEl}
        className="bg-short-wash absolute inset-x-0"
        style={{ visibility: 'hidden' }}
      />
      <div
        ref={rewardEl}
        className="bg-long-wash absolute inset-x-0"
        style={{ visibility: 'hidden' }}
      />

      <div
        ref={entryEl}
        className="absolute inset-x-0 top-0 -translate-y-1/2"
        style={{ visibility: 'hidden' }}
      >
        <div className="border-ink-faint border-t border-dashed" />
        <span className="bg-scrim text-ink-lo text-micro absolute -top-2.5 left-2 px-1.5 font-medium tracking-wider">
          ENTRY {entry.toFixed(2)}
        </span>
      </div>

      <RailControl
        innerRef={stopEl}
        label="STOP"
        price={stop}
        side="short"
        locked={locked}
        onPointerDown={startDrag('stop')}
      />
      <RailControl
        innerRef={targetEl}
        label="TARGET"
        price={target}
        side="long"
        locked={locked}
        onPointerDown={startDrag('target')}
      />
    </div>
  );
}

function RailControl({
  innerRef,
  label,
  price,
  side,
  locked,
  onPointerDown,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  label: string;
  price: number;
  side: 'short' | 'long';
  locked: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const line = side === 'short' ? 'bg-short' : 'bg-long';
  const chip =
    side === 'short'
      ? 'bg-short-bg text-short-ink ring-short-line'
      : 'bg-long-bg text-long-ink ring-long-line';

  return (
    <div
      ref={innerRef}
      onPointerDown={onPointerDown}
      className={[
        'group absolute inset-x-0 top-0 flex h-11 -translate-y-1/2 items-center',
        // touch-none stops the browser treating a vertical drag as a page scroll.
        locked ? '' : 'pointer-events-auto cursor-ns-resize touch-none',
      ].join(' ')}
      style={{ visibility: 'hidden' }}
    >
      <div
        className={`absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 transition-[height,opacity] duration-(--dur-2) ${line} ${
          locked ? 'opacity-90' : 'group-hover:h-[3px]'
        }`}
      />
      <span
        className={`text-micro relative ml-2 rounded px-1.5 py-0.5 font-semibold tracking-wider transition-transform duration-(--dur-2) ${chip} ${
          // The order is committed and the bracket is now immutable — the heavier ring is the
          // only tell the player gets that the rails have stopped being controls.
          locked ? 'ring-2' : 'ring-1 group-hover:scale-105'
        }`}
      >
        {label} {price.toFixed(2)}
      </span>
      {!locked && (
        <span className="text-micro text-ink-dim relative ml-1.5 hidden opacity-0 transition-opacity duration-(--dur-2) group-hover:opacity-100 sm:inline">
          drag
        </span>
      )}
    </div>
  );
}
