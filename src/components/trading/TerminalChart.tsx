'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Bar } from '@/core/bars';
import { formatClock, formatTick } from '@/lib/clock';
import { CANDLE, CHART_CHROME, type CandleColours } from '@/lib/palette';
import type { SessionTime } from '@/lib/trading/types';
import { tapeSeconds } from '@/lib/trading/format';
import type { ChartSurface } from '../chart/surface';

/**
 * The trading terminal's chart.
 *
 * Separate from the game's `Chart` because the two make opposite promises. The game's chart hid the
 * instrument: an index of 100, no last-price label, a fixed 140-hour window and a camera that drove
 * the reveal. This one is a trading platform's chart — real prices on the axis with the last price
 * labelled, real volume, a series that grows a minute at a time and an axis the trader pans and
 * zooms freely.
 *
 * ## Time
 *
 * While a session is open the calendar date is withheld (§22.9), so candles are stamped into the
 * synthetic week of `src/lib/clock.ts`: the weekday and the time of day are true and the date is a
 * constant fiction. Once the session is over — or in a practice session that shows dates — the
 * candles carry their real UTC times and the axis prints real dates.
 *
 * ## Index space
 *
 * The drawing tools address the chart by an index and a price. Here the index is **minutes from the
 * start of the tape** (negative into history), so a trendline drawn on the 15-minute chart is still
 * on the same two moments after switching to the 4-hour one.
 */

export interface TerminalChartLoad {
  /** Hourly history, real prices. */
  hours: Bar[];
  /** One-minute history under the last hours, real prices. */
  minutes: Bar[];
  /** Tape minutes revealed so far, real prices. */
  tape: Bar[];
  time: SessionTime;
  tickSize: number;
  priceDecimals: number;
  timeframe: number;
}

export interface ChartMarker {
  /** Tape minute; −1 is the decision close. */
  at: number;
  side: 'buy' | 'sell';
  text: string;
  color?: string;
}

/** A study polyline, indexed by the displayed candle it belongs to. */
export interface StudyLine {
  points: { index: number; price: number }[];
  color: string;
  width?: number;
  dashed?: boolean;
  pane?: number;
}

export interface TerminalChartHandle extends ChartSurface {
  load(input: TerminalChartLoad): void;
  /** New tape minutes, appended in order. */
  append(minutes: Bar[]): void;
  setTimeframe(minutes: number): void;
  setTime(time: SessionTime): void;
  setMarkers(markers: ChartMarker[]): void;
  setStudies(lines: StudyLine[]): void;
  /** The candles currently drawn, for the studies to be computed on. */
  displayed(): Bar[];
  paneWidth(): number | null;
  zoomAt(anchorFraction: number, scale: number): void;
  setLogScale(enabled: boolean): void;
  scrollToNow(): void;
  setPalette(colours: CandleColours): void;
}

interface Stamped extends Bar {
  /** Open time, seconds. */
  t: number;
}

function monoStack(el: HTMLElement): string {
  const resolved = getComputedStyle(el).getPropertyValue('--font-mono').trim();
  return resolved || 'ui-monospace, SFMono-Regular, Menlo, monospace';
}

function merge(into: Stamped, bar: Bar): void {
  into.h = Math.max(into.h, bar.h);
  into.l = Math.min(into.l, bar.l);
  into.c = bar.c;
  into.v += bar.v;
}

function dateFormatter(seconds: number): string {
  const date = new Date(seconds * 1000);
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })} ${hh}:${mm}`;
}

export const TerminalChart = forwardRef<TerminalChartHandle, { className?: string }>(function TerminalChart(
  { className },
  ref,
) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null);
  const markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const studies = useRef<ISeriesApi<'Line'>[]>([]);
  const colours = useRef<CandleColours>(CANDLE);

  const hours = useRef<Stamped[]>([]);
  const minutes = useRef<Stamped[]>([]);
  /** Index in `minutes` of tape minute 0. */
  const tapeOffset = useRef(0);
  const tapeStart = useRef(0);
  const time = useRef<SessionTime>({ kind: 'relative', weekday: 0, minuteOfDay: 0 });
  const timeframe = useRef(60);
  const series = useRef<Stamped[]>([]);
  const markers = useRef<ChartMarker[]>([]);

  const tfSeconds = () => timeframe.current * 60;
  const bucketOf = (t: number) => Math.floor(t / tfSeconds()) * tfSeconds();

  /** The source candles for the current timeframe, oldest first. */
  const source = (): Stamped[] => {
    if (timeframe.current < 60) return minutes.current;
    return [...hours.current, ...minutes.current.slice(tapeOffset.current)];
  };

  const rebuild = () => {
    const out: Stamped[] = [];
    for (const bar of source()) {
      const bucket = bucketOf(bar.t);
      const last = out[out.length - 1];
      if (last && last.t === bucket) merge(last, bar);
      else out.push({ ...bar, t: bucket });
    }
    series.current = out;
  };

  const point = (bar: Stamped) => ({
    time: bar.t as UTCTimestamp,
    open: bar.o,
    high: bar.h,
    low: bar.l,
    close: bar.c,
  });
  const volumePoint = (bar: Stamped) => ({
    time: bar.t as UTCTimestamp,
    value: bar.v,
    color: bar.c >= bar.o ? colours.current.upVolume : colours.current.downVolume,
  });

  const draw = () => {
    candles.current?.setData(series.current.map(point));
    volume.current?.setData(series.current.map(volumePoint));
    drawMarkers();
  };

  const drawMarkers = () => {
    if (!markerApi.current) return;
    const first = series.current[0]?.t ?? 0;
    const items: SeriesMarker<Time>[] = markers.current
      .map((marker) => {
        const t = bucketOf(tapeStart.current + Math.max(-1, marker.at) * 60);
        return {
          time: Math.max(first, t) as UTCTimestamp,
          position: marker.side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
          shape: marker.side === 'buy' ? ('arrowUp' as const) : ('arrowDown' as const),
          color: marker.color ?? (marker.side === 'buy' ? colours.current.up : colours.current.down),
          text: marker.text,
        };
      })
      .sort((a, b) => (a.time as number) - (b.time as number));
    markerApi.current.setMarkers(items);
  };

  const applyTimeFormat = () => {
    const api = chart.current;
    if (!api) return;
    if (time.current.kind === 'relative') {
      api.applyOptions({
        timeScale: { tickMarkFormatter: (t: Time) => formatTick(t as number) },
        localization: { timeFormatter: (t: Time) => formatClock(t as number) },
      });
    } else {
      api.applyOptions({
        timeScale: { tickMarkFormatter: undefined },
        localization: { timeFormatter: (t: Time) => dateFormatter(t as number) },
      });
    }
  };

  /** Logical position of a moment, in candles of the current timeframe. */
  const logicalOf = (seconds: number): number | null => {
    const first = series.current[0];
    if (!first) return null;
    return (seconds - first.t) / tfSeconds() - 0.5;
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
      rightPriceScale: { borderColor: CHART_CHROME.border, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: {
        borderColor: CHART_CHROME.border,
        rightOffset: 12,
        barSpacing: 7,
        minBarSpacing: 0.5,
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
      },
      crosshair: {
        mode: 0,
        vertLine: { color: CHART_CHROME.crosshair, width: 1, style: 3 },
        horzLine: { color: CHART_CHROME.crosshair, width: 1, style: 3 },
      },
    });

    const candleSeries = api.addSeries(CandlestickSeries, {
      upColor: colours.current.up,
      downColor: colours.current.down,
      borderUpColor: colours.current.up,
      borderDownColor: colours.current.down,
      wickUpColor: colours.current.up,
      wickDownColor: colours.current.down,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const volumeSeries = api.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    api.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });

    let stale = false;
    void document.fonts?.ready.then(() => {
      if (stale || !container.current) return;
      api.applyOptions({ layout: { fontFamily: monoStack(container.current) } });
    });

    chart.current = api;
    candles.current = candleSeries;
    volume.current = volumeSeries;
    markerApi.current = createSeriesMarkers(candleSeries, []);
    applyTimeFormat();

    return () => {
      stale = true;
      markerApi.current = null;
      candles.current = null;
      volume.current = null;
      studies.current = [];
      chart.current = null;
      api.remove();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    load(input) {
      time.current = input.time;
      timeframe.current = input.timeframe;
      tapeStart.current = tapeSeconds(input.time, 0);
      const start = tapeStart.current;
      hours.current = input.hours.map((bar, i) => ({ ...bar, t: start - (input.hours.length - i) * 3600 }));
      const history = input.minutes.map((bar, i) => ({ ...bar, t: start - (input.minutes.length - i) * 60 }));
      tapeOffset.current = history.length;
      minutes.current = [...history, ...input.tape.map((bar, i) => ({ ...bar, t: start + i * 60 }))];
      candles.current?.applyOptions({
        priceFormat: { type: 'price', precision: input.priceDecimals, minMove: input.tickSize },
      });
      applyTimeFormat();
      rebuild();
      draw();
      const count = series.current.length;
      chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 140), to: count + 12 });
    },

    append(next) {
      if (next.length === 0) return;
      const start = tapeStart.current;
      const tapeCount = minutes.current.length - tapeOffset.current;
      const stamped = next.map((bar, i) => ({ ...bar, t: start + (tapeCount + i) * 60 }));
      minutes.current.push(...stamped);

      // Fold the new minutes into the candles they belong to and redraw only those.
      const out = series.current;
      let firstChanged = out.length;
      for (const bar of stamped) {
        const bucket = bucketOf(bar.t);
        const last = out[out.length - 1];
        if (last && last.t === bucket) {
          merge(last, bar);
          firstChanged = Math.min(firstChanged, out.length - 1);
        } else {
          out.push({ ...bar, t: bucket });
          firstChanged = Math.min(firstChanged, out.length - 1);
        }
      }
      for (let i = firstChanged; i < out.length; i++) {
        candles.current?.update(point(out[i]));
        volume.current?.update(volumePoint(out[i]));
      }
    },

    setTimeframe(next) {
      if (next === timeframe.current) return;
      const scale = chart.current?.timeScale();
      const range = scale?.getVisibleRange();
      timeframe.current = next;
      rebuild();
      draw();
      // Keep the same stretch of time on screen across the switch.
      if (scale && range) {
        const from = logicalOf(range.from as number);
        const to = logicalOf(range.to as number);
        if (from !== null && to !== null) scale.setVisibleLogicalRange({ from, to: to + 2 });
      }
    },

    setTime(next) {
      // Only the labelling changes when the dates are revealed: the candles keep their positions.
      const offset = tapeSeconds(next, 0) - tapeStart.current;
      time.current = next;
      if (offset !== 0) {
        tapeStart.current += offset;
        for (const bar of hours.current) bar.t += offset;
        for (const bar of minutes.current) bar.t += offset;
        rebuild();
        draw();
      }
      applyTimeFormat();
    },

    setMarkers(next) {
      markers.current = next;
      drawMarkers();
    },

    setStudies(lines) {
      const api = chart.current;
      if (!api) return;
      for (const line of studies.current) api.removeSeries(line);
      studies.current = [];
      const bars = series.current;
      const wantsLower = lines.some((line) => (line.pane ?? 0) > 0);
      for (const line of lines) {
        const points = line.points
          .filter((p) => p.index >= 0 && p.index < bars.length && Number.isFinite(p.price))
          .sort((a, b) => a.index - b.index);
        if (points.length < 2) continue;
        const pane = line.pane ?? 0;
        const added = api.addSeries(
          LineSeries,
          {
            color: line.color,
            lineWidth: (line.width ?? 1) as 1 | 2 | 3 | 4,
            lineStyle: line.dashed ? LineStyle.Dashed : LineStyle.Solid,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
            ...(pane === 0 ? { autoscaleInfoProvider: () => null } : {}),
          },
          pane,
        );
        // One value per candle: a level's two endpoints on the same candle would collide.
        const seen = new Set<number>();
        added.setData(
          points
            .filter((p) => (seen.has(p.index) ? false : (seen.add(p.index), true)))
            .map((p) => ({ time: bars[p.index].t as UTCTimestamp, value: p.price })),
        );
        studies.current.push(added);
      }
      if (!wantsLower && api.panes().length > 1) {
        try {
          api.removePane(1);
        } catch {
          // Already gone.
        }
      }
    },

    displayed() {
      return series.current;
    },

    indexToX(index) {
      const logical = logicalOf(tapeStart.current + index * 60);
      if (logical === null) return null;
      return chart.current?.timeScale().logicalToCoordinate(logical as never) ?? null;
    },

    xToIndex(x) {
      const first = series.current[0];
      const logical = chart.current?.timeScale().coordinateToLogical(x);
      if (!first || logical === null || logical === undefined) return null;
      const seconds = first.t + ((logical as number) + 0.5) * tfSeconds();
      return Math.round((seconds - tapeStart.current) / 60);
    },

    priceToY(price) {
      return candles.current?.priceToCoordinate(price) ?? null;
    },

    yToPrice(y) {
      const price = candles.current?.coordinateToPrice(y);
      return typeof price === 'number' ? price : null;
    },

    paneWidth() {
      const width = chart.current?.timeScale().width();
      return width && width > 0 ? width : null;
    },

    zoomAt(anchorFraction, scale) {
      const timeScale = chart.current?.timeScale();
      const range = timeScale?.getVisibleLogicalRange();
      if (!timeScale || !range) return;
      const anchor = range.from + (range.to - range.from) * anchorFraction;
      timeScale.setVisibleLogicalRange({
        from: anchor + (range.from - anchor) * scale,
        to: anchor + (range.to - anchor) * scale,
      });
    },

    setLogScale(enabled) {
      chart.current?.priceScale('right').applyOptions({
        mode: enabled ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
      });
    },

    scrollToNow() {
      chart.current?.timeScale().scrollToRealTime();
    },

    setPalette(next) {
      if (colours.current === next) return;
      colours.current = next;
      candles.current?.applyOptions({
        upColor: next.up,
        downColor: next.down,
        borderUpColor: next.up,
        borderDownColor: next.down,
        wickUpColor: next.up,
        wickDownColor: next.down,
      });
      draw();
    },
  }));

  return <div ref={container} className={className} />;
});
