'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
  type AutoscaleInfo,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { aggregateByCount, type Bar } from '@/core/bars';
import { LEAD_IN_BARS, WINDOW_BARS } from '@/core/config';
import { formatClock, formatTick, timeOrigin } from '@/lib/clock';
import { CANDLE, CHART_CHROME } from '@/lib/palette';
import { DECISION_TF, timeframePhase, timeframePlan } from '@/lib/timeframe';

/**
 * Horizontal window, **in hours**, not in bar indices.
 *
 * This is the one decision that makes dynamic resolution tractable. The candle a given index
 * refers to changes the instant the resolution does — index 40 is hour 40 at the display tier
 * and hour 3⅓ at one minute — so a view expressed in indices silently means something
 * different after every switch. Hours are invariant, every tier divides sixty, and the
 * conversion is a single multiply. The camera in src/lib/camera.ts works in these units too,
 * and never has to know what resolution is on screen.
 */
export interface LogicalRange {
  from: number;
  to: number;
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface ChartHandle {
  /** The authoritative display-timeframe candles: the history the decision is made on. */
  setBars(bars: Bar[]): void;
  /**
   * Reveal one more display-timeframe hour.
   *
   * Only the candles this hour touches are updated, whatever resolution is on screen — one at
   * an hour or above, sixty at a minute — so §13.4's O(1) append survives the tier being the
   * player's choice rather than a constant.
   */
  revealHour(bar: Bar, hourIndex: number): void;

  /**
   * The one-minute detail behind the display bars, and how much of it may be drawn.
   *
   * `visibleHours` is what stops the future leaking out sideways during a reveal: once the
   * order is committed the client holds every minute, but only the hours already on screen may
   * be rendered.
   */
  setDetail(minutes: Bar[], visibleHours: number): void;

  /** Draw at this resolution, in minutes per candle. The player's choice; nothing overrides it. */
  setTier(tierMinutes: number): void;

  /**
   * Anchor the chart's clock: the weekday and hour its first visible candle opens on.
   *
   * Must be called before setBars, because it decides what timestamp each bar maps to.
   */
  setClock(dayOfWeek: number, hourUtc: number): void;

  setLogical(range: LogicalRange): void;
  getLogical(): LogicalRange | null;

  /**
   * Take manual control of the vertical range, or hand it back.
   *
   * `null` returns the scale to autoscaling against the visible candles — the behaviour of any
   * real charting tool, and what makes zooming feel alive. A range takes the camera off
   * autoscale so the reveal can be directed frame by frame.
   */
  setPrice(range: PriceRange | null): void;
  getPrice(): PriceRange | null;

  /**
   * A band the autoscale must always contain, whatever the candles are doing.
   *
   * Without it, a stop dragged below the visible candles would either vanish off-screen or
   * make the chart rubber-band on every pointer move. With it, the rails stay reachable and
   * the scale stays still while the player works.
   */
  setGuard(range: PriceRange | null): void;

  /** Pan and zoom. Off during the reveal so the camera move cannot be fought. */
  setInteractive(enabled: boolean): void;

  /**
   * Zoom about a point, given as a fraction across the frame.
   *
   * The rails are full-width pointer targets, so a wheel event over one never reaches the
   * canvas and the chart has two dead stripes where zooming does nothing. The overlay forwards
   * those wheels here rather than the rails eating them.
   */
  zoomAt(anchorFraction: number, scale: number): void;

  priceToY(price: number): number | null;
  yToPrice(y: number): number | null;
  markExit(index: number, text: string, color: string): void;
  clearMarks(): void;
}

const { up: UP, down: DOWN, upVolume: UP_VOLUME, downVolume: DOWN_VOLUME } = CANDLE;

/**
 * The mono stack, read from the resolved custom property rather than hardcoded.
 *
 * `createChart` needs a string at construction time, and next/font may not have loaded by then —
 * so this returns the fallback on a cold start and the effect below re-applies it once
 * `document.fonts.ready` settles. Without that second call the axis metrics stay measured against
 * the fallback face forever, and the price labels are laid out for a font that is not on screen.
 */
function monoStack(el: HTMLElement): string {
  const resolved = getComputedStyle(el).getPropertyValue('--font-mono').trim();
  return resolved || 'ui-monospace, SFMono-Regular, Menlo, monospace';
}

export const Chart = forwardRef<ChartHandle, { className?: string }>(function Chart(
  { className },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const forced = useRef<PriceRange | null>(null);
  const guard = useRef<PriceRange | null>(null);
  /** Last view in force, in hours, re-applied after a resize so it survives one. */
  const logical = useRef<LogicalRange | null>(null);

  /**
   * Seconds into the synthetic reference week that hour 0 opens on.
   *
   * Bars are stamped into a fixed fictional week rather than carrying their real timestamps, so
   * the library gets genuinely hour-spaced times to lay an axis out from while the calendar
   * date derivable from them is a constant. See src/lib/clock.ts.
   */
  const origin = useRef(0);

  const displayBars = useRef<Bar[]>([]);
  const minutes = useRef<Bar[]>([]);
  const visibleHours = useRef(0);
  const tier = useRef<number>(DECISION_TF);
  /** How many candles are currently on the series, so a reveal knows which tail to touch. */
  const drawn = useRef(0);

  /**
   * Opening time of candle `index` at the current resolution.
   *
   * Backing up by the phase is what puts 4h and 1d candles on clock boundaries rather than on
   * window boundaries. For every tier that divides an hour the phase is zero and this reduces
   * to the hour the candle opens on.
   */
  const timeframeBarTime = (index: number): UTCTimestamp => {
    const { unitMinutes } = timeframePlan(tier.current);
    const phase = timeframePhase(tier.current, origin.current);
    return (origin.current -
      phase * unitMinutes * 60 +
      index * tier.current * 60) as UTCTimestamp;
  };

  /** Which candle contains a given display-timeframe hour. */
  const timeframeIndexForHour = (hour: number): number => {
    const { unitMinutes } = timeframePlan(tier.current);
    const phase = timeframePhase(tier.current, origin.current);
    return Math.floor((phase * unitMinutes + hour * 60) / tier.current);
  };

  /** The candles to draw at the current resolution, limited to what has been revealed. */
  const seriesFor = (tierMinutes: number): Bar[] => {
    const { unitMinutes, group } = timeframePlan(tierMinutes);
    const phase = timeframePhase(tierMinutes, origin.current);

    const source =
      unitMinutes === 1
        ? minutes.current.slice(0, Math.max(0, Math.floor(visibleHours.current * 60)))
        : // The stored display candles are authoritative and full precision. Re-deriving them
          // from the Float32 detail would introduce a hair of drift at the timeframe the entry
          // and the ATR are taken from, for no gain at all.
          displayBars.current.slice(0, Math.max(0, Math.floor(visibleHours.current)));

    return aggregateByCount(source, group, phase);
  };

  const draw = () => {
    const bars = seriesFor(tier.current);

    candles.current?.setData(
      bars.map((bar, i) => ({
        time: timeframeBarTime(i),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
      })),
    );
    volume.current?.setData(
      bars.map((bar, i) => ({
        time: timeframeBarTime(i),
        value: bar.v,
        color: bar.c >= bar.o ? UP_VOLUME : DOWN_VOLUME,
      })),
    );
    drawn.current = bars.length;
  };

  const applyHours = (range: LogicalRange) => {
    logical.current = range;
    const perHour = 60 / tier.current;
    chart.current?.timeScale().setVisibleLogicalRange({
      from: range.from * perHour,
      to: range.to * perHour,
    });
  };

  useEffect(() => {
    if (!container.current) return;

    const api = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: CHART_CHROME.axis,
        fontFamily: monoStack(container.current),
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: CHART_CHROME.grid },
        horzLines: { color: CHART_CHROME.grid },
      },
      rightPriceScale: {
        borderColor: CHART_CHROME.border,
        // §3.1 keeps the normalised price axis at every tier — it is risk arithmetic, not a
        // crutch. The Blind Scale mod removes it; the default does not.
        visible: true,
        scaleMargins: { top: 0.1, bottom: 0.24 },
      },
      // The axis shows a weekday at midnight and an hour otherwise, and nothing else. Both
      // formatters below are overridden unconditionally, so no tick density the library
      // chooses — year, month, day-of-month — can put a date on screen (§12.2).
      timeScale: {
        visible: true,
        borderVisible: false,
        rightOffset: 0,
        // How wide a single candle may get. This has to clear the width the coarsest tier
        // needs: a 140-hour window is only six daily candles, and a cap tight enough to look
        // sensible at one minute pins those six against the right edge with the rest of the
        // frame empty.
        maxBarSpacing: 120,
        // Low enough that the reveal camera can still frame the whole window at one minute,
        // which is 8400 candles. Anything larger clamps the zoom-out and the camera silently
        // stops short of the full window at fine resolutions.
        minBarSpacing: 0.02,
        tickMarkFormatter: (time: Time) => formatTick(time as number),
      },
      localization: {
        timeFormatter: (time: Time) => formatClock(time as number),
      },
      crosshair: {
        mode: 0,
        vertLine: { color: CHART_CHROME.crosshair, width: 1, style: 3, labelVisible: false },
        horzLine: { color: CHART_CHROME.crosshair, width: 1, style: 3 },
      },
      handleScroll: false,
      handleScale: false,
    });

    const candleSeries = api.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: false,
      lastValueVisible: false,
      // Three-way vertical control, resolved in priority order:
      //   forced  — the reveal camera is driving; obey it exactly.
      //   guard   — autoscale to the visible candles, then widen to keep the rails on screen.
      //   neither — plain autoscale.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null): AutoscaleInfo | null => {
        if (forced.current) {
          return {
            priceRange: { minValue: forced.current.min, maxValue: forced.current.max },
          };
        }

        const base = original();
        // The guard is there so the rails stay reachable while the bracket is being placed,
        // and placement happens at the display timeframe. Enforcing it while zoomed finer
        // would pin several ATR of range around a window in which price moves a fraction of
        // one, flattening every candle into a horizontal line — which is the opposite of what
        // zooming in is for. Rails are clamped to the frame when dragged, so nothing can be
        // put somewhere it cannot be reached from.
        if (!guard.current || tier.current < DECISION_TF) return base;
        if (!base?.priceRange) {
          return {
            priceRange: { minValue: guard.current.min, maxValue: guard.current.max },
          };
        }

        return {
          ...base,
          priceRange: {
            minValue: Math.min(base.priceRange.minValue, guard.current.min),
            maxValue: Math.max(base.priceRange.maxValue, guard.current.max),
          },
        };
      },
    });

    const volumeSeries = api.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    api.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.84, bottom: 0 },
      visible: false,
    });

    // Records the view in hours so a resize can restore it — lightweight-charts stores zoom as
    // a bar spacing in pixels, so a resize silently changes how many bars are on screen.
    const onRangeChange = (next: { from: number; to: number } | null) => {
      if (!next) return;
      const perHour = 60 / tier.current;
      logical.current = { from: next.from / perHour, to: next.to / perHour };
    };
    api.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);

    const observer = new ResizeObserver(() =>
      requestAnimationFrame(() => {
        if (logical.current) applyHours(logical.current);
      }),
    );
    observer.observe(container.current);

    // next/font loads asynchronously, so `monoStack` above may have resolved to the fallback. The
    // library measures its axis labels once, at the width of whatever face was current — so
    // without this the price scale keeps a gutter sized for a font that is no longer drawn.
    let stale = false;
    void document.fonts?.ready.then(() => {
      if (stale || !container.current) return;
      api.applyOptions({ layout: { fontFamily: monoStack(container.current) } });
    });

    chart.current = api;
    candles.current = candleSeries;
    volume.current = volumeSeries;
    markers.current = createSeriesMarkers(candleSeries, []);

    return () => {
      stale = true;
      observer.disconnect();
      api.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange);
      markers.current = null;
      candles.current = null;
      volume.current = null;
      chart.current = null;
      forced.current = null;
      guard.current = null;
      logical.current = null;
      minutes.current = [];
      displayBars.current = [];
      api.remove();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    setClock(dayOfWeek, hourUtc) {
      origin.current = timeOrigin(dayOfWeek, hourUtc);
    },

    setBars(bars) {
      displayBars.current = [...bars];
      visibleHours.current = bars.length;
      draw();
    },

    setDetail(detail, hours) {
      minutes.current = detail;
      visibleHours.current = hours;
      draw();
    },

    revealHour(bar, hourIndex) {
      displayBars.current[hourIndex] = bar;
      visibleHours.current = hourIndex + 1;

      const bars = seriesFor(tier.current);
      // Redraw only the candles this hour touched: the one it is still filling, plus any it
      // completed. At an hour and above that is a single candle updated repeatedly as it forms;
      // at a minute it is the sixty this hour just added.
      const first = Math.max(0, Math.min(drawn.current - 1, timeframeIndexForHour(hourIndex)));
      for (let i = first; i < bars.length; i++) {
        candles.current?.update({
          time: timeframeBarTime(i),
          open: bars[i].o,
          high: bars[i].h,
          low: bars[i].l,
          close: bars[i].c,
        });
        volume.current?.update({
          time: timeframeBarTime(i),
          value: bars[i].v,
          color: bars[i].c >= bars[i].o ? UP_VOLUME : DOWN_VOLUME,
        });
      }
      drawn.current = bars.length;
    },

    setTier(tierMinutes) {
      if (tierMinutes === tier.current) return;
      const view = logical.current;
      tier.current = tierMinutes;
      draw();
      // The view is in hours, so it means the same thing before and after — which is the whole
      // reason for expressing it that way rather than in candle indices.
      if (view) applyHours(view);
    },

    setLogical(range) {
      applyHours(range);
    },

    getLogical() {
      const range = chart.current?.timeScale().getVisibleLogicalRange();
      if (!range) return null;
      const perHour = 60 / tier.current;
      return { from: range.from / perHour, to: range.to / perHour };
    },

    setPrice(range) {
      forced.current = range;
      // Setting the logical range is also what schedules a redraw, and a redraw is when the
      // autoscale provider above is consulted. Re-asserting the current range is therefore how
      // a purely vertical camera move reaches the screen.
      if (logical.current) applyHours(logical.current);
    },

    /** The visible range in price terms, read back off the axis rather than remembered. */
    getPrice() {
      const height = container.current?.clientHeight ?? 0;
      const top = candles.current?.coordinateToPrice(0);
      const bottom = candles.current?.coordinateToPrice(height);
      if (typeof top !== 'number' || typeof bottom !== 'number') return null;
      return { min: Math.min(top, bottom), max: Math.max(top, bottom) };
    },

    setGuard(range) {
      guard.current = range;
    },

    setInteractive(enabled) {
      chart.current?.applyOptions({
        handleScroll: enabled
          ? { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }
          : false,
        handleScale: enabled
          ? {
              mouseWheel: true,
              pinch: true,
              axisPressedMouseMove: { time: true, price: true },
              axisDoubleClickReset: { time: true, price: true },
            }
          : false,
      });
    },

    zoomAt(anchorFraction, scale) {
      const current = logical.current;
      if (!current) return;
      const anchor = current.from + (current.to - current.from) * anchorFraction;
      const next = {
        from: anchor + (current.from - anchor) * scale,
        to: anchor + (current.to - anchor) * scale,
      };
      // Bounds in hours. The lower one is about ten minutes, which is six candles at the
      // finest tier. The upper one is a little past the whole window: there is no resolution
      // coarser than the hour, so zooming further out only thins the candles below the width
      // they need to be readable, in exchange for showing more empty space.
      const span = next.to - next.from;
      if (span < 0.17 || span > WINDOW_BARS * 1.3) return;
      applyHours(next);
    },

    priceToY(price) {
      return candles.current?.priceToCoordinate(price) ?? null;
    },

    yToPrice(y) {
      const price = candles.current?.coordinateToPrice(y);
      return typeof price === 'number' ? price : null;
    },

    markExit(index, text, color) {
      // Snapped to the candle containing that hour, so it lands on a real bar even at 4h or 1d
      // where the exit hour is partway through one.
      markers.current?.setMarkers([
        {
          time: timeframeBarTime(timeframeIndexForHour(LEAD_IN_BARS + index)),
          position: 'aboveBar',
          color,
          shape: 'arrowDown',
          text,
        },
      ]);
    },

    clearMarks() {
      markers.current?.setMarkers([]);
    },
  }));

  return <div ref={container} className={className} />;
});
