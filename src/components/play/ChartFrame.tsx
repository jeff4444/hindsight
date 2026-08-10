'use client';

import { Button, cx } from '../ui';
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
 * And nothing on or above this element may set `filter`, `backdrop-filter`, `transform`,
 * `isolation`, `will-change` or `opacity < 1`: each creates a stacking context, which puts the
 * rail layer back underneath the lightweight-charts canvas for hit-testing while still drawing it
 * on top. The rails then look perfect and cannot be grabbed. That is why the design system has no
 * glass in it — the constraint is structural, not aesthetic.
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
}) {
  return (
    <div className="border-line bg-surface-1 relative min-h-[20rem] flex-1 overflow-hidden rounded-lg border">
      <Chart ref={chartRef} className="absolute inset-0" />

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
        <div className="bg-scrim text-ink-dim ring-line-faint animate-fade text-micro pointer-events-none absolute bottom-9 left-1/2 z-20 -translate-x-1/2 rounded-full px-3 py-1 tracking-wide ring-1">
          {hint}
        </div>
      )}

      {loading && (
        <div className="bg-scrim text-ink-dim absolute inset-0 z-20 grid place-items-center text-sm">
          <span className="animate-breathe">dealing a chart…</span>
        </div>
      )}

      {error && (
        <div className="bg-scrim absolute inset-0 z-20 grid place-items-center p-6 text-center">
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
