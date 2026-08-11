'use client';

import { Button, cx } from '../ui';
import { Mark } from '../ui/icons';
import { Chart, type ChartHandle } from '../Chart';
import { TradeOverlay, type Rail } from '../TradeOverlay';

/**
 * The chart and everything painted over it.
 *
 * **The nesting in here is load-bearing and must not be changed.** One `relative overflow-hidden`
 * box; the canvas absolutely filling it; the rail layer absolutely filling it at `z-10`.
 *
 * Two separate mechanisms depend on the frame box and the canvas box being the same rectangle:
 * `TradeOverlay`'s drag reads `layer.getBoundingClientRect()` and hands the offset to
 * `chart.yToPrice`, and its wheel forwarding computes a zoom anchor the same way. Padding, a
 * border on an inner wrapper, or a negative margin offsets every drag by that amount.
 *
 * Nothing on or above this element may set `filter`, `backdrop-filter`, `transform`, `isolation`,
 * `will-change` or `opacity < 1`: each creates a stacking context, which puts the rail layer back
 * underneath the lightweight-charts canvas for hit-testing while still drawing it on top. The
 * rails then look perfect and cannot be grabbed. The ancestor chain is exactly four elements —
 * <html>, <body>, PlaySurface's root and this one — so it is short enough to check by eye, which
 * is now the only thing checking it.
 *
 * The corollary is the useful half, and it is what the reveal is built on: **children of this
 * element are siblings of the rail layer, not ancestors of it.** An absolutely-positioned overlay
 * at `z-20` or above may fade, scale and gradient freely. It must be `pointer-events-none` unless
 * it is a small cornered control, because the rails are full-width pointer targets and anything
 * interactive lying across the frame cuts a dead stripe through the drag.
 *
 * The frame is also given a fixed height by its caller rather than flexing. That is not cosmetic:
 * while it was `flex-1`, mounting the console below it shrank the chart mid-phase, and
 * lightweight-charts sized its internal table before the shrink and never gave the height back —
 * leaving the time axis laid out 56px below the frame's own bottom edge and clipped away entirely.
 */
export function ChartFrame({
  chartRef,
  entry,
  stop,
  target,
  locked,
  railsHidden,
  showRails,
  onDrag,
  hitFlash,
  hint,
  loading,
  error,
  onRetry,
  className,
  children,
}: {
  chartRef: React.RefObject<ChartHandle | null>;
  entry: number | null;
  stop: number;
  target: number;
  locked: boolean;
  railsHidden: boolean;
  showRails: boolean;
  onDrag: (rail: Rail, price: number) => void;
  hitFlash: 'target' | 'stop' | null;
  hint: React.ReactNode;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  className?: string;
  /** In-frame layers. Rendered above the rails; see the note above about pointer events. */
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        'border-line bg-surface-1 shadow-well relative overflow-hidden rounded-xl border',
        className,
      )}
    >
      <Chart ref={chartRef} className="absolute inset-0" />

      {/* Atmosphere. Sits above the canvas and below the z-10 rail layer, so the rails keep their
          full contrast and the pointer never touches this. A `filter` here would drop the rails
          behind the canvas; a background-image cannot. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-5"
        style={{
          background: 'radial-gradient(135% 115% at 50% 42%, transparent 52%, oklch(0 0 0 / 0.28) 100%)',
        }}
      />

      {showRails && entry !== null && (
        <TradeOverlay
          chart={chartRef}
          entry={entry}
          stop={stop}
          target={target}
          locked={locked}
          hidden={railsHidden}
          onDrag={onDrag}
        />
      )}

      {children}

      {/* A brief wash of the outcome colour when the level is touched. */}
      {hitFlash && (
        <div
          className={cx(
            'animate-flash pointer-events-none absolute inset-0 z-20',
            hitFlash === 'target' ? 'bg-long/20' : 'bg-short/20',
          )}
        />
      )}

      {/* bottom-9 keeps this clear of the time axis, which occupies the bottom strip. */}
      {hint && (
        <div className="bg-scrim text-ink-lo ring-line-faint animate-fade text-xs pointer-events-none absolute bottom-9 left-1/2 z-20 -translate-x-1/2 rounded-full px-3 py-1.5 ring-1">
          {hint}
        </div>
      )}

      {loading && (
        <div className="bg-scrim absolute inset-0 z-40 grid place-items-center" role="status">
          <div className="flex flex-col items-center gap-3">
            {/* The mark draws its own unrevealed candle in. It is the one loading state in the
                product and it says what the product is about. */}
            <Mark size={40} tone="duo" drawing />
            <span className="text-ink-dim animate-breathe text-sm">dealing a chart…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-scrim absolute inset-0 z-40 grid place-items-center p-6 text-center">
          <div>
            <p className="text-short-ink text-sm">{error}</p>
            <Button variant="secondary" onClick={onRetry} className="mt-3">
              Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
