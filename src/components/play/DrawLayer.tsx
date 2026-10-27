'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartSurface } from '../chart/surface';
import { TOOL_COLOUR, measureReadout } from '@/lib/toolOverlays';

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
 * ## Removing one drawing rather than all of them
 *
 * The only way to remove a mark used to be a button that deleted every mark: draw five lines, get
 * one wrong, lose five. Selection is the obvious fix and it is not available here — selecting needs
 * the pointer, and the pointer belongs to the rails whenever a tool is *not* armed.
 *
 * So the handle appears where the pointer is already ours. While an instrument is held, hovering a
 * drawing lifts it and puts a small ✕ at its midpoint; that ✕ is the one element inside this layer
 * that takes pointer events of its own. It cannot cut a stripe through a rail drag, because during
 * a rail drag this whole layer is inert.
 *
 * Undo covers the rest, and covers it better: the mistake a player actually makes is the mark they
 * just drew, and `⌘Z` removes it without aiming at anything. Drawings are append-only within a
 * round, so undo is "delete the last one" and needs no history stack.
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
  /** The third point of a parallel channel: how far the second rail sits from the first, in price. */
  offset?: number;
}

/** §6's Fibonacci retracements. The one set with a number the literature actually supplies. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** How close the pointer must be to a mark, in pixels, to pick it up. */
const HIT_SLOP = 7;

interface Props {
  chart: React.RefObject<ChartSurface | null>;
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
  /** Index units per candle, for the measure's bar count. The terminal's index is minutes. */
  indexPerBar?: number;
}

interface Live {
  from: Anchor;
  to: Anchor;
}

/** Distance from a point to a segment, in pixels. The whole of hit-testing. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
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
  indexPerBar = 1,
}: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [live, setLive] = useState<Live | null>(null);
  /**
   * A channel's first rail, waiting for its width.
   *
   * §3.2 calls the channel "a parallel channel from three points" and the shipped version collected
   * two: `offset` was in the type, was rendered, and was never once set by an interaction — so
   * every channel drew its two rails exactly on top of each other and looked like a trendline with
   * a heavier stroke. Now the drag sets the rail and the next move sets the width.
   */
  const [pending, setPending] = useState<Live | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
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
  const pendingRef = useRef<Live | null>(null);
  useEffect(() => {
    liveRef.current = live;
    pendingRef.current = pending;
  }, [live, pending]);

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

  /** Which committed drawing is under this pointer, if any. */
  const hitTest = useCallback(
    (clientX: number, clientY: number): number | null => {
      const el = layer.current;
      const api = chart.current;
      if (!el || !api) return null;
      const bounds = el.getBoundingClientRect();
      const px = clientX - bounds.left;
      const py = clientY - bounds.top;

      let best: { id: number; distance: number } | null = null;
      for (const drawing of drawings) {
        const ax = api.indexToX(drawing.from.index);
        const ay = api.priceToY(drawing.from.price);
        const bx = api.indexToX(drawing.to.index);
        const by = api.priceToY(drawing.to.price);
        if (ax === null || ay === null || bx === null || by === null) continue;

        let distance: number;
        if (drawing.tool === 'level') {
          distance = Math.abs(py - by);
        } else if (drawing.tool === 'fib') {
          // Any of its rungs counts, which is what the eye is aiming at anyway.
          distance = Math.min(
            ...FIB_LEVELS.map((level) =>
              Math.abs(py - (ay + (by - ay) * level)) +
              (px < Math.min(ax, bx) || px > Math.max(ax, bx) ? 1e4 : 0),
            ),
          );
        } else {
          distance = distanceToSegment(px, py, ax, ay, bx, by);
          if (drawing.tool === 'channel' && drawing.offset) {
            const shifted = api.priceToY(drawing.from.price + drawing.offset);
            if (shifted !== null) {
              const shift = shifted - ay;
              distance = Math.min(
                distance,
                distanceToSegment(px, py, ax, ay + shift, bx, by + shift),
              );
            }
          }
        }

        if (distance <= HIT_SLOP && (best === null || distance < best.distance)) {
          best = { id: drawing.id, distance };
        }
      }
      return best?.id ?? null;
    },
    [chart, drawings],
  );

  // Selecting a different tool, or none, drops the measurement and any half-built channel with it.
  const [measuredWith, setMeasuredWith] = useState(tool);
  if (tool !== measuredWith) {
    setMeasuredWith(tool);
    setLive(null);
    setPending(null);
    setHovered(null);
  }

  useEffect(() => {
    const el = layer.current;
    if (!el || tool === null) return;

    const onDown = (event: PointerEvent) => {
      // The delete handle is the one thing inside this layer that owns its own clicks.
      const handle = (event.target as Element | null)?.closest?.('[data-delete]');
      if (handle) {
        onDelete(Number(handle.getAttribute('data-delete')));
        setHovered(null);
        event.preventDefault();
        return;
      }

      const anchor = toAnchor(event.clientX, event.clientY);
      if (!anchor) return;

      // Second click of a channel: the width is already being previewed, so this commits it.
      const base = pendingRef.current;
      if (tool === 'channel' && base) {
        onCommit({ tool: 'channel', from: base.from, to: base.to, offset: anchor.price - base.from.price });
        setPending(null);
        setLive(null);
        event.preventDefault();
        return;
      }

      // Capture is an optimisation — it keeps a drag alive past the frame's edge — and it must not
      // be able to fail the whole interaction. `setPointerCapture` throws for a pointer the browser
      // no longer considers active, which a fast release or a synthetic event can both produce.
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* the drag still works, it just stops at the edge */
      }
      dragging.current = true;
      liveRef.current = { from: anchor, to: anchor };
      setLive(liveRef.current);
      event.preventDefault();
    };

    const onMove = (event: PointerEvent) => {
      if (!dragging.current) {
        // Not drawing: light up whatever is under the pointer so it can be removed.
        const base = pendingRef.current;
        if (tool === 'channel' && base) {
          const anchor = toAnchor(event.clientX, event.clientY);
          if (anchor) setLive({ from: base.from, to: { ...base.to, price: anchor.price } });
          return;
        }
        setHovered(hitTest(event.clientX, event.clientY));
        return;
      }
      const anchor = toAnchor(event.clientX, event.clientY);
      if (!anchor) return;
      const next = liveRef.current ? { ...liveRef.current, to: anchor } : null;
      liveRef.current = next;
      setLive(next);
    };

    const onUp = (event: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        /* never captured, or already released */
      }
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

      if (!current) {
        setLive(null);
        return;
      }

      // A level is one price and needs no distance. Its own label has always read "click to place a
      // horizontal level" while the code demanded a drag, so a plain click committed nothing at all
      // and the tool looked broken to anyone who did what it said.
      if (tool === 'level') {
        onCommit({ tool: 'level', from: current.to, to: current.to });
        setLive(null);
        return;
      }

      if (!moved) {
        setLive(null);
        return;
      }

      // A channel keeps its rail and waits for a width.
      if (tool === 'channel') {
        setPending(current);
        setLive(current);
        return;
      }

      onCommit({ tool, from: current.from, to: current.to });
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
  }, [tool, toAnchor, onCommit, onDelete, hitTest]);

  /**
   * Re-project everything every frame.
   *
   * The same discipline as `TradeOverlay`: prices and indices are the state, pixels are derived,
   * and nothing is cached across a frame. That is what keeps a drawing welded to the candles while
   * the chart is being zoomed under it.
   *
   * The loop idles when there is nothing to draw. It used to run unconditionally for the whole
   * round — sixty frames a second of `innerHTML = ''` on a chart with no marks and no tool.
   */
  useEffect(() => {
    if (drawings.length === 0 && live === null) {
      if (svg.current) svg.current.innerHTML = '';
      return;
    }

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
          // The player's own marks are near-white; every computed overlay is a hue. That is the
          // whole legend: colour is the app talking, white is you.
          const committed = drawing.id !== undefined;
          const lit = committed && drawing.id === hovered;
          const colour = committed ? TOOL_COLOUR.mark : TOOL_COLOUR.markLive;
          const width = lit ? 2.5 : 1.5;

          if (drawing.tool === 'level') {
            parts.push(
              `<line x1="0" y1="${b.y}" x2="100%" y2="${b.y}" stroke="${colour}" stroke-width="${width}" />`,
            );
          } else if (drawing.tool === 'fib') {
            for (const level of FIB_LEVELS) {
              const y = a.y + (b.y - a.y) * level;
              parts.push(
                `<line x1="${Math.min(a.x, b.x)}" y1="${y}" x2="${Math.max(a.x, b.x)}" y2="${y}" stroke="${colour}" stroke-width="${lit ? 1.8 : 1}" stroke-opacity="0.75" />`,
                `<text x="${Math.min(a.x, b.x) + 4}" y="${y - 3}" fill="${colour}" font-size="10" font-family="ui-monospace, monospace">${(level * 100).toFixed(1)}</text>`,
              );
            }
          } else if (drawing.tool === 'channel') {
            const dy = drawing.offset ?? 0;
            const api = chart.current;
            const shift =
              api && dy !== 0 ? (api.priceToY(drawing.from.price + dy) ?? a.y) - a.y : 0;
            parts.push(
              `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${colour}" stroke-width="${width}" />`,
              `<line x1="${a.x}" y1="${a.y + shift}" x2="${b.x}" y2="${b.y + shift}" stroke="${colour}" stroke-width="${width}" stroke-opacity="0.6" />`,
            );
          } else if (drawing.tool === 'measure') {
            const read = measureReadout(drawing.from.price, drawing.to.price, atr, risk);
            const spanned = Math.round(Math.abs(drawing.to.index - drawing.from.index) / indexPerBar);
            const label =
              `${read.delta >= 0 ? '+' : ''}${read.delta.toFixed(2)}  ` +
              `${read.atr >= 0 ? '+' : ''}${read.atr.toFixed(2)} ATR` +
              `${read.r === null ? '' : `  ${read.r >= 0 ? '+' : ''}${read.r.toFixed(2)}R`}` +
              `  ${read.percent >= 0 ? '+' : ''}${read.percent.toFixed(2)}%  ${spanned} bars`;
            // Flip to the left of the box when there is no room on the right, rather than running
            // the readout off the edge of the frame — which is where it always ended up, because a
            // measurement usually finishes at the right-hand side where the decision bar is.
            const frameWidth = root.clientWidth;
            const estimated = label.length * 6.2;
            const right = Math.max(a.x, b.x);
            const flip = right + 8 + estimated > frameWidth;
            parts.push(
              `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(b.x - a.x)}" height="${Math.abs(b.y - a.y)}" fill="${TOOL_COLOUR.mark}" fill-opacity="0.10" stroke="${TOOL_COLOUR.mark}" stroke-width="1" />`,
              `<text x="${flip ? Math.min(a.x, b.x) - 8 : right + 8}" y="${b.y}" text-anchor="${flip ? 'end' : 'start'}" fill="${TOOL_COLOUR.markLive}" font-size="11" font-family="var(--font-mono, ui-monospace), ui-monospace, monospace">${label}</text>`,
            );
          } else {
            parts.push(
              `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${colour}" stroke-width="${width}" />`,
            );
          }

          // The remove handle, on whichever mark the pointer is over.
          if (lit && drawing.id !== undefined) {
            const hx = drawing.tool === 'level' ? Math.min(b.x + 18, root.clientWidth - 16) : (a.x + b.x) / 2;
            const hy = drawing.tool === 'level' ? b.y : (a.y + b.y) / 2;
            parts.push(
              `<g data-delete="${drawing.id}" pointer-events="auto" style="cursor:pointer">` +
                `<circle cx="${hx}" cy="${hy}" r="9" fill="${TOOL_COLOUR.markLive}" />` +
                `<path d="M${hx - 3.2} ${hy - 3.2}L${hx + 3.2} ${hy + 3.2}M${hx + 3.2} ${hy - 3.2}L${hx - 3.2} ${hy + 3.2}" stroke="#0d0e14" stroke-width="1.8" stroke-linecap="round" />` +
                `</g>`,
            );
          }
        }

        root.innerHTML = parts.join('');
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chart, drawings, live, tool, atr, risk, hovered, indexPerBar]);

  return (
    <div
      ref={layer}
      className="absolute inset-0 z-20"
      style={{
        // The whole modality, in one line. Inert unless a tool is selected, so the rails keep every
        // pixel of their drag area the rest of the time.
        pointerEvents: tool === null ? 'none' : 'auto',
        cursor: tool === null ? 'default' : hovered !== null ? 'pointer' : 'crosshair',
        touchAction: tool === null ? 'auto' : 'none',
      }}
    >
      <svg ref={svg} className="pointer-events-none h-full w-full" />
    </div>
  );
}
