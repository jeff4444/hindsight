'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cx } from '../ui';
import { Icon } from '../ui/icons';
import type { TerminalChartHandle } from './TerminalChart';

/**
 * Orders and the position, drawn on the chart as lines you can take hold of.
 *
 * The same technique `TradeOverlay` established for the bracket rails: HTML rather than canvas
 * primitives, re-projected from the chart's own scale every frame so a line cannot drift from the
 * axis it is drawn against, and a hit box well wider than the line so a phone can catch it. What is
 * new is that there can be any number of lines and they mean different things:
 *
 * - the **position**, at its average price, with its quantity and live P&L, and a ✕ to close it;
 * - each **working order** — limit, stop, take-profit, stop-loss — draggable to a new price;
 * - the **draft** the ticket is building, draggable to set its price;
 * - the **liquidation** level, dashed and inert.
 *
 * A drag previews locally and commits on release, so the order is modified once rather than on
 * every pixel.
 */

export type LineTone = 'long' | 'short' | 'neutral' | 'gold' | 'info' | 'attention';

export interface ChartLine {
  id: string;
  price: number;
  label: string;
  /** A second figure on the label: quantity, P&L. */
  detail?: string;
  detailTone?: LineTone;
  tone: LineTone;
  style?: 'solid' | 'dashed';
  draggable?: boolean;
  onDrop?: (price: number) => void;
  onDrag?: (price: number) => void;
  onClose?: () => void;
}

/** Which line a press at `y` belongs to: the nearest one, so overlapping hit boxes stay fair. */
export function nearestLine(y: number, ys: readonly (number | null)[]): number {
  let best = -1;
  let distance = Infinity;
  ys.forEach((candidate, index) => {
    if (candidate === null) return;
    const d = Math.abs(candidate - y);
    if (d < distance) {
      distance = d;
      best = index;
    }
  });
  return best;
}

const TONE: Record<LineTone, { line: string; pill: string; ink: string }> = {
  long: { line: 'bg-long', pill: 'bg-long-bg ring-long-line', ink: 'text-long-ink' },
  short: { line: 'bg-short', pill: 'bg-short-bg ring-short-line', ink: 'text-short-ink' },
  neutral: { line: 'bg-ink-dim', pill: 'bg-surface-2 ring-line-strong', ink: 'text-ink-hi' },
  gold: { line: 'bg-gold', pill: 'bg-gold-bg ring-gold-line', ink: 'text-gold-ink' },
  info: { line: 'bg-info', pill: 'bg-info-bg ring-info-line', ink: 'text-info-ink' },
  attention: { line: 'bg-attention', pill: 'bg-attention-bg ring-attention-line', ink: 'text-attention-ink' },
};

export function OrderLinesOverlay({
  chart,
  lines,
  snap,
}: {
  chart: React.RefObject<TerminalChartHandle | null>;
  lines: ChartLine[];
  /** Round a dragged price to the tick. */
  snap: (price: number) => number;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const current = useRef(lines);
  /** Prices being dragged, by line id, so the line follows the pointer before the order moves. */
  const dragging = useRef(new Map<string, number>());

  useEffect(() => {
    current.current = lines;
  }, [lines]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const width = chart.current?.paneWidth() ?? null;
      current.current.forEach((line, index) => {
        const el = rows.current[index];
        if (!el) return;
        const price = dragging.current.get(line.id) ?? line.price;
        const y = chart.current?.priceToY(price);
        const height = layer.current?.clientHeight ?? 0;
        if (y === null || y === undefined || y < -8 || y > height + 8) {
          el.style.visibility = 'hidden';
          return;
        }
        el.style.top = `${y}px`;
        if (width) el.style.width = `${width}px`;
        el.style.visibility = 'visible';
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [chart]);

  // A wheel over a line's hit box would otherwise never reach the canvas. Forward it.
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const bounds = el.getBoundingClientRect();
      if (bounds.width === 0) return;
      event.preventDefault();
      chart.current?.zoomAt((event.clientX - bounds.left) / bounds.width, Math.exp(event.deltaY * 0.001));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [chart]);

  const startDrag = useCallback(
    (pressed: number) => (event: React.PointerEvent<HTMLDivElement>) => {
      const bounds = layer.current?.getBoundingClientRect();
      if (!bounds) return;
      // Pick the nearest draggable line to the press, not whichever box is on top.
      const ys = current.current.map((line) => (line.draggable ? (chart.current?.priceToY(line.price) ?? null) : null));
      const index = nearestLine(event.clientY - bounds.top, ys);
      const line = current.current[index >= 0 ? index : pressed];
      if (!line?.draggable) return;
      event.preventDefault();
      event.stopPropagation();
      const el = event.currentTarget;
      const pointerId = event.pointerId;
      try {
        el.setPointerCapture(pointerId);
      } catch {
        // The window listeners carry the drag regardless.
      }
      let last = line.price;

      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const box = layer.current?.getBoundingClientRect();
        if (!box) return;
        const y = Math.min(Math.max(moveEvent.clientY - box.top, 0), box.height);
        const price = chart.current?.yToPrice(y);
        if (typeof price !== 'number' || !(price > 0)) return;
        last = snap(price);
        dragging.current.set(line.id, last);
        line.onDrag?.(last);
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
        const moved = dragging.current.get(line.id);
        dragging.current.delete(line.id);
        if (moved !== undefined && moved !== line.price) line.onDrop?.(moved);
        else if (last !== line.price) line.onDrop?.(last);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [chart, snap],
  );

  return (
    // z-10 sits above the canvas (which lightweight-charts paints at z-index 2) and below the
    // frame's own veils. The layer passes the pointer through; only hit boxes take it.
    <div ref={layer} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {lines.map((line, index) => {
        const tone = TONE[line.tone];
        return (
          <div
            key={line.id}
            ref={(node) => {
              rows.current[index] = node;
            }}
            data-line={line.id}
            className="invisible absolute left-0 h-0"
          >
            <div
              className={cx(
                'absolute inset-x-0 top-0 h-px',
                line.style === 'dashed' ? 'border-t border-dashed bg-transparent' : tone.line,
                line.style === 'dashed' && tone.ink,
              )}
              style={line.style === 'dashed' ? { borderColor: 'currentColor' } : undefined}
            />
            {line.draggable && (
              <div
                onPointerDown={startDrag(index)}
                className="pointer-events-auto absolute inset-x-0 -top-2 h-4 cursor-ns-resize touch-none"
                aria-hidden
              />
            )}
            <div
              onPointerDown={line.draggable ? startDrag(index) : undefined}
              className={cx(
                'absolute left-2 -top-3 flex h-6 items-center gap-1.5 rounded-md px-2 text-mini font-medium ring-1 whitespace-nowrap',
                tone.pill,
                tone.ink,
                line.draggable ? 'pointer-events-auto cursor-ns-resize touch-none' : line.onClose ? 'pointer-events-auto' : '',
              )}
            >
              {line.draggable && <Icon name="grid" size={10} className="opacity-60" />}
              <span>{line.label}</span>
              {line.detail && (
                <span className={cx('numeral', line.detailTone ? TONE[line.detailTone].ink : 'text-ink-lo')}>{line.detail}</span>
              )}
              {line.onClose && (
                <button
                  type="button"
                  aria-label={`Close: ${line.label}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={line.onClose}
                  className="hover:bg-fill-3 -mr-1 grid h-4 w-4 place-items-center rounded"
                >
                  <Icon name="x" size={10} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
