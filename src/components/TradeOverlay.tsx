'use client';

import { useEffect, useRef } from 'react';
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

  const startDrag = (rail: Rail) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (locked) return;
    event.preventDefault();
    // Keep the drag off the chart underneath, which would otherwise pan with it.
    event.stopPropagation();

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
  };

  return (
    // z-10 is load-bearing: lightweight-charts paints its canvases at z-index 2 inside the
    // nearest stacking context, so an overlay at the default z-index renders visibly on top of
    // the chart while sitting underneath it for hit-testing. The rails look right and cannot
    // be grabbed.
    <div
      ref={layer}
      className={`pointer-events-none absolute inset-0 z-10 overflow-hidden transition-opacity duration-500 ${
        hidden ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        ref={riskEl}
        className="absolute inset-x-0 bg-rose-500/[0.07]"
        style={{ visibility: 'hidden' }}
      />
      <div
        ref={rewardEl}
        className="absolute inset-x-0 bg-emerald-500/[0.07]"
        style={{ visibility: 'hidden' }}
      />

      <div
        ref={entryEl}
        className="absolute inset-x-0 top-0 -translate-y-1/2"
        style={{ visibility: 'hidden' }}
      >
        <div className="border-t border-dashed border-slate-400/60" />
        <span className="absolute -top-2.5 left-2 bg-slate-950/80 px-1.5 text-[10px] font-medium tracking-wider text-slate-400">
          ENTRY {entry.toFixed(2)}
        </span>
      </div>

      <RailControl
        innerRef={stopEl}
        label="STOP"
        price={stop}
        colour="rose"
        locked={locked}
        onPointerDown={startDrag('stop')}
      />
      <RailControl
        innerRef={targetEl}
        label="TARGET"
        price={target}
        colour="emerald"
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
  colour,
  locked,
  onPointerDown,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  label: string;
  price: number;
  colour: 'rose' | 'emerald';
  locked: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const line = colour === 'rose' ? 'bg-rose-500' : 'bg-emerald-500';
  const chip =
    colour === 'rose'
      ? 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
      : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40';

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
        className={`absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 transition-[height,opacity] duration-200 ${line} ${
          locked ? 'opacity-80' : 'group-hover:h-[3px]'
        }`}
      />
      <span
        className={`relative ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ring-1 transition-transform duration-200 ${chip} ${
          locked ? '' : 'group-hover:scale-105'
        }`}
      >
        {label} {price.toFixed(2)}
      </span>
      {!locked && (
        <span className="relative ml-1.5 hidden text-[10px] text-slate-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 sm:inline">
          drag
        </span>
      )}
    </div>
  );
}
