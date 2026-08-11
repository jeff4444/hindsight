'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartHandle } from '../Chart';
import { measureReadout } from '@/lib/toolOverlays';

/**
 * The modal pointer layer: measuring and drawing.
 *
 * **Why modal, and why that is not a compromise.** `ChartFrame` documents that the rails are
 * full-width pointer targets and that "anything interactive lying across the frame cuts a dead
 * stripe through the drag". A drawing surface *is* a thing lying across the frame. So it takes
 * pointer events only while a tool is selected, and is `pointer-events-none` otherwise — which is
 * also how every charting application a trader has used behaves: pick the tool, then drag.
 *
 * Drawings live in pixel-free chart space — a bar index and a price — and are re-projected every
 * frame from the chart's own scales, exactly as `TradeOverlay` re-projects the rails. Nothing here
 * caches a pixel, so a drawing cannot drift away from the axis it was drawn against while the
 * player zooms.
 *
 * Rendered as SVG rather than as chart series because these are the player's marks, not the
 * product's: they need to be selectable, deletable and visibly different from an annotation the
 * app computed.
 */

export type DrawTool = 'measure' | 'trendline' | 'level' | 'channel' | 'fib';

export interface Anchor {
  index: number;
  price: number;
}

export interface Drawing {
  id: number;
  tool: Exclude<DrawTool, 'measure'>;
  from: Anchor;
  to: Anchor;
  /** The third point of a parallel channel: how far the second rail sits from the first. */
  offset?: number;
}

/** §6's Fibonacci retracements. The one set with a number the literature actually supplies. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

interface Props {
  chart: React.RefObject<ChartHandle | null>;
  /** Null when no tool is selected, which is when this layer is inert. */
  tool: DrawTool | null;
  drawings: Drawing[];
  onCommit: (drawing: Omit<Drawing, 'id'>) => void;
  /** Snap an anchor to the nearest wick. §6 calls magnet mode cheap and materially useful. */
  magnet: boolean;
  bars: { h: number; l: number }[];
  atr: number;
  /** Distance from entry to the placed stop, for the R readout. Null before one exists. */
  risk: number | null;
  onDelete: (id: number) => void;
}

interface Live {
  from: Anchor;
  to: Anchor;
}

export function DrawLayer({
  chart,
  tool,
  drawings,
  onCommit,
  magnet,
  bars,
  atr,
  risk,
  onDelete,
}: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<Live | null>(null);
  const dragging = useRef(false);
  /**
   * A mirror of `live`, so the commit can be decided *outside* a state updater.
   *
   * React double-invokes updater functions in development to surface exactly this: an `onCommit`
   * called from inside `setLive(current => …)` fires twice and produces two identical drawings
   * stacked on each other. They look like one line, so nothing on screen says anything is wrong —
   * only a count does.
   */
  const liveRef = useRef<Live | null>(null);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  /**
   * Pointer position → chart space, with magnet applied.
   *
   * Magnet snaps the *price* to the nearest of the bar's own high and low rather than to a grid:
   * a level is worth drawing where price actually turned, and a trader placing one by hand is
   * aiming at a wick. It never snaps the index, because the index is already discrete.
   */
  const toAnchor = useCallback(
    (clientX: number, clientY: number): Anchor | null => {
      const el = layer.current;
      const api = chart.current;
      if (!el || !api) return null;
      const bounds = el.getBoundingClientRect();
      const index = api.xToIndex(clientX - bounds.left);
      const price = api.yToPrice(clientY - bounds.top);
      if (index === null || price === null) return null;

      if (!magnet || index < 0 || index >= bars.length) return { index, price };
      const bar = bars[index];
      const candidates = [bar.h, bar.l];
      const nearest = candidates.reduce((best, value) =>
        Math.abs(value - price) < Math.abs(best - price) ? value : best,
      );
      // Only snap when the wick is genuinely close, or the magnet drags every mark to an extreme.
      return { index, price: Math.abs(nearest - price) <= atr * 0.35 ? nearest : price };
    },
    [chart, magnet, bars, atr],
  );

  // Selecting a different tool, or none, drops the measurement with it.
  const [measuredWith, setMeasuredWith] = useState(tool);
  if (tool !== measuredWith) {
    setMeasuredWith(tool);
    setLive(null);
  }

  useEffect(() => {
    const el = layer.current;
    if (!el || tool === null) return;

    const onDown = (event: PointerEvent) => {
      const anchor = toAnchor(event.clientX, event.clientY);
      if (!anchor) return;
      el.setPointerCapture(event.pointerId);
      dragging.current = true;
      liveRef.current = { from: anchor, to: anchor };
      setLive(liveRef.current);
      event.preventDefault();
    };

    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      const anchor = toAnchor(event.clientX, event.clientY);
      if (!anchor) return;
      const next = liveRef.current ? { ...liveRef.current, to: anchor } : null;
      liveRef.current = next;
      setLive(next);
    };

    const onUp = (event: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      el.releasePointerCapture(event.pointerId);
      const current = liveRef.current;
      const moved =
        current !== null &&
        (current.from.index !== current.to.index || current.from.price !== current.to.price);

      if (tool === 'measure') {
        // The measurement **stays on release**. The first version cleared it, on the theory that a
        // ruler you have to dismiss is a ruler you stop using — which had it backwards: the whole
        // point of the readout is to be read, and a number that disappears the instant you let go
        // cannot be. It is replaced by the next drag and cleared when the tool is put down, which
        // is what every charting tool a trader has used does.
        setLive(moved ? current : null);
        return;
      }

      if (moved && current) onCommit({ tool, from: current.from, to: current.to });
      setLive(null);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [tool, toAnchor, onCommit]);

  /**
   * Re-project everything every frame.
   *
   * The same discipline as `TradeOverlay`: prices and indices are the state, pixels are derived,
   * and nothing is cached across a frame. That is what keeps a drawing welded to the candles while
   * the chart is being zoomed under it.
   */
  useEffect(() => {
    let frame = 0;

    const project = (anchor: Anchor) => {
      const api = chart.current;
      if (!api) return null;
      const x = api.indexToX(anchor.index);
      const y = api.priceToY(anchor.price);
      return x === null || y === null ? null : { x, y };
    };

    const tick = () => {
      const root = svg.current;
      if (root) {
        const parts: string[] = [];
        const all: { tool: DrawTool; from: Anchor; to: Anchor; id?: number; offset?: number }[] = [
          ...drawings,
          ...(live ? [{ tool, from: live.from, to: live.to } as const] : []),
        ].filter(
          (d): d is { tool: DrawTool; from: Anchor; to: Anchor; id?: number; offset?: number } =>
            d.tool !== null,
        );

        for (const drawing of all) {
          const a = project(drawing.from);
          const b = project(drawing.to);
          if (!a || !b) continue;
          const colour = drawing.id === undefined ? '#f8fafc' : '#a78bfa';

          if (drawing.tool === 'level') {
            parts.push(
              `<line x1="0" y1="${b.y}" x2="100%" y2="${b.y}" stroke="${colour}" stroke-width="1.5" />`,
            );
          } else if (drawing.tool === 'fib') {
            for (const level of FIB_LEVELS) {
              const y = a.y + (b.y - a.y) * level;
              parts.push(
                `<line x1="${Math.min(a.x, b.x)}" y1="${y}" x2="${Math.max(a.x, b.x)}" y2="${y}" stroke="${colour}" stroke-width="1" stroke-opacity="0.75" />`,
                `<text x="${Math.min(a.x, b.x) + 4}" y="${y - 3}" fill="${colour}" font-size="10" font-family="ui-monospace, monospace">${(level * 100).toFixed(1)}</text>`,
              );
            }
          } else if (drawing.tool === 'channel') {
            const dy = drawing.offset ?? 0;
            const api = chart.current;
            const shift =
              api && dy !== 0 ? (api.priceToY(drawing.from.price + dy) ?? a.y) - a.y : 0;
            parts.push(
              `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${colour}" stroke-width="1.5" />`,
              `<line x1="${a.x}" y1="${a.y + shift}" x2="${b.x}" y2="${b.y + shift}" stroke="${colour}" stroke-width="1.5" stroke-opacity="0.6" />`,
            );
          } else if (drawing.tool === 'measure') {
            const read = measureReadout(drawing.from.price, drawing.to.price, atr, risk);
            const bars = Math.abs(drawing.to.index - drawing.from.index);
            const up = read.delta >= 0;
            parts.push(
              `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" fill="${up ? '#22c55e' : '#ef4444'}" fill-opacity="0.12" stroke="${up ? '#22c55e' : '#ef4444'}" stroke-width="1" />`,
              `<text x="${Math.max(a.x, b.x) + 6}" y="${b.y}" fill="#f8fafc" font-size="11" font-family="ui-monospace, monospace">` +
                `${read.delta >= 0 ? '+' : ''}${read.delta.toFixed(2)}  ${read.atr >= 0 ? '+' : ''}${read.atr.toFixed(2)} ATR` +
                `${read.r === null ? '' : `  ${read.r >= 0 ? '+' : ''}${read.r.toFixed(2)}R`}` +
                `  ${read.percent >= 0 ? '+' : ''}${read.percent.toFixed(2)}%  ${bars} bars` +
                `</text>`,
            );
          } else {
            parts.push(
              `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${colour}" stroke-width="1.5" />`,
            );
          }
        }

        root.innerHTML = parts.join('');
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chart, drawings, live, tool, atr, risk]);

  return (
    <div
      ref={layer}
      className="absolute inset-0 z-20"
      style={{
        // The whole modality, in one line. Inert unless a tool is selected, so the rails keep every
        // pixel of their drag area the rest of the time.
        pointerEvents: tool === null ? 'none' : 'auto',
        cursor: tool === null ? 'default' : 'crosshair',
        touchAction: tool === null ? 'auto' : 'none',
      }}
    >
      <svg ref={svg} className="pointer-events-none h-full w-full" />
      {drawings.length > 0 && tool === null && (
        <button
          type="button"
          onClick={() => drawings.forEach((drawing) => onDelete(drawing.id))}
          className="text-ink-dim hover:text-ink pointer-events-auto absolute right-2 bottom-2 rounded bg-black/40 px-2 py-1 font-mono text-[11px]"
        >
          clear {drawings.length} drawing{drawings.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
