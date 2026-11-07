'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Bar } from '@/core/bars';
import { atr } from '@/core/atr';
import type { ToolCode } from '@/core/tiers';
import type { GameDriver } from '@/lib/game/driver';
import type { RoundIntent, RoundPlayed, RoundView, TradeLine } from '@/lib/game/types';
import type { WireBar } from '@/lib/trading/types';
import { formatPrice, formatReplayTime, formatUsd, priceInput } from '@/lib/trading/format';
import { TIMEFRAMES } from '@/lib/timeframe';
import { overlaysFor } from '@/lib/toolOverlays';
import { useStudySettings } from '@/lib/studySettings';
import { useHotkeys } from '@/lib/useHotkeys';
import { HINDSIGHT_ACCENT, candlesFor, chromeFor, overlayInk, type ChartTheme } from '@/lib/palette';
import { Button, Chip, EmptyState, IconButton, Segmented, cx } from '../ui';
import { Select, useThemeSnapshot, useToast } from '../ui/client';
import { Icon } from '../ui/icons';
import { InstrumentRail } from '../play/InstrumentRail';
import { StudiesPanel } from '../play/StudiesPanel';
import { DrawLayer, type Drawing, type DrawTool } from '../play/DrawLayer';
import { TerminalChart, type ChartMarker, type TerminalChartHandle } from '../trading/TerminalChart';
import { OrderLinesOverlay, type ChartLine } from '../trading/OrderLinesOverlay';
import { RoundTicket, emptyRoundDraft, type RoundDraft } from './RoundTicket';
import { RoundResult } from './RoundResult';

/**
 * A round, start to finish (docs/rules.md §23.1).
 *
 * Two phases on one chart. **Reading**: the history and nothing after it, the drawing tools and
 * studies down the left, and the ticket down the right, whose entry, target and stop are lines on
 * the chart to drag. **The tape**: once the trade is locked in the server sends the whole tape —
 * the result is already decided, so there is nothing left to protect — and the replay plays it here,
 * at whatever speed the player likes, with the trade's fills marked as the tape reaches them. When
 * it ends the result card gives the grade, and the best and worst trades the tape allowed are drawn
 * where they happened.
 */

const TOOLS: ToolCode[] = ['trendline', 'level', 'channel', 'fib', 'magnet', 'logScale', 'ma', 'bollinger', 'keltner', 'donchian', 'rsi', 'macd'];
const DEFAULT_TIMEFRAME = 15;
const NO_BARS: Bar[] = [];
/** Tape minutes per second. The default plays the 60-hour tape in a minute. */
const SPEEDS = [15, 60, 240, 960];
const SPEED_LABEL: Record<number, string> = { 15: '15m/s', 60: '1h/s', 240: '4h/s', 960: '16h/s' };
const FRAME_MS = 50;

/** The best trade is drawn in the pen; the worst in the axis ink, on whichever stock is printing. */
const BEST_INK: Record<ChartTheme, string> = { light: HINDSIGHT_ACCENT, dark: '#8f97f2' };

function toBars(wire: readonly WireBar[], unit: number): Bar[] {
  return wire.map(([o, h, l, c, v]) => ({ o: o * unit, h: h * unit, l: l * unit, c: c * unit, v }));
}

function tradeMarkers(trade: TradeLine | null, shown: number, prefix: string, color?: string): ChartMarker[] {
  if (!trade) return [];
  const out: ChartMarker[] = [];
  const long = trade.direction === 'long';
  if (trade.entry && trade.entry.at < shown) {
    out.push({ at: trade.entry.at, side: long ? 'buy' : 'sell', text: `${prefix}${long ? 'Long' : 'Short'}`, color });
  }
  if (trade.exit && trade.exit.at < shown) {
    const reason = trade.exit.reason === 'take-profit' ? 'TP' : trade.exit.reason === 'stop-loss' ? 'SL' : trade.exit.reason === 'liquidation' ? 'Out' : 'Close';
    out.push({ at: trade.exit.at, side: long ? 'sell' : 'buy', text: `${prefix}${reason}`, color });
  }
  return out;
}

export function RoundShell({
  driver,
  start,
  onDealt,
  exit,
  actions,
  className,
}: {
  driver: GameDriver;
  start: { roundId: string } | { deal: true };
  /** Called once a fresh round is dealt, so the page can put it in the address bar. */
  onDealt?: (roundId: string) => void;
  /** The way out, top left. */
  exit?: ReactNode;
  /** What the result card offers once the tape has played. */
  actions?: (played: RoundPlayed) => ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const chart = useRef<TerminalChartHandle | null>(null);
  const [view, setView] = useState<RoundView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<RoundDraft>(() => emptyRoundDraft(500));
  const [timeframe, setTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [tool, setTool] = useState<DrawTool | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [studiesOpen, setStudiesOpen] = useState(false);
  const [activeTools, setActiveTools] = useState<ToolCode[]>([]);
  const [studySettings, setStudySettings, resetStudySettings] = useStudySettings();
  const [logScale, setLogScale] = useState(false);
  const { palette, theme } = useThemeSnapshot();
  const nextDrawing = useRef(1);

  // The replay: how many tape minutes are on the chart, and whether more are coming.
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [resultOpen, setResultOpen] = useState(true);
  const shownRef = useRef(0);

  const studies = useRef({ activeTools, studySettings, theme });
  const refreshStudies = useCallback(() => {
    const api = chart.current;
    if (!api) return;
    const { activeTools: tools, studySettings: settings, theme: ink } = studies.current;
    if (tools.length === 0) {
      api.setStudies([]);
      return;
    }
    const bars = api.displayed();
    // Overlays are authored for carbon; on paper each is printed a few steps darker, same hue.
    const lines = overlaysFor(tools, { bars, atr: atr(bars.slice(-80)) ?? 0, settings });
    api.setStudies(lines.map((line) => ({ ...line, color: overlayInk(line.color, ink) })));
  }, []);
  useEffect(() => {
    studies.current = { activeTools, studySettings, theme };
    refreshStudies();
  }, [activeTools, studySettings, theme, refreshStudies]);

  // Load the round. Dealing happens once, even under a development double render.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const load = 'deal' in start ? driver.deal() : driver.round(start.roundId);
    load
      .then((round) => {
        setView(round);
        setDraft(emptyRoundDraft(round.stake));
        if (round.status === 'locked') {
          // A round already played opens on its result, with the whole tape drawn.
          shownRef.current = round.tape.length;
          setShown(round.tape.length);
        }
        if ('deal' in start) onDealt?.(round.roundId);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The round could not be loaded.'));
  }, [driver, start, onDealt]);

  const instrument = view?.instrument ?? null;
  const unit = instrument ? Math.pow(10, instrument.tickExp) : 1;
  const played = view?.status === 'locked' ? view : null;
  const total = played?.tape.length ?? 0;
  const done = played !== null && shown >= total;

  // Draw the history once the round arrives; the tape is added by the replay.
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!view || !chart.current || loaded.current === view.roundId) return;
    loaded.current = view.roundId;
    chart.current.load({
      hours: toBars(view.chart.hours, unit),
      minutes: toBars(view.chart.minutes, unit),
      tape: view.status === 'locked' ? toBars(view.tape.slice(0, shownRef.current), unit) : [],
      time: view.time,
      tickSize: view.instrument.tickSize,
      priceDecimals: view.instrument.priceDecimals,
      timeframe,
    });
    refreshStudies();
    // Loading is keyed by the round; later minutes arrive through the replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, unit]);

  useEffect(() => {
    chart.current?.setPalette(candlesFor(palette, theme));
    chart.current?.setChrome(chromeFor(theme));
  }, [palette, theme]);
  useEffect(() => {
    chart.current?.setTimeframe(timeframe);
    refreshStudies();
  }, [timeframe, refreshStudies]);
  useEffect(() => {
    chart.current?.setLogScale(logScale);
  }, [logScale]);

  // The replay's clock: a few frames a second, each appending the minutes it has reached.
  useEffect(() => {
    if (!played || !playing) return;
    const timer = window.setInterval(() => {
      const from = shownRef.current;
      const to = Math.min(played.tape.length, from + Math.max(1, Math.round((speed * FRAME_MS) / 1000)));
      if (to > from) {
        chart.current?.append(toBars(played.tape.slice(from, to), unit));
        shownRef.current = to;
        setShown(to);
        refreshStudies();
      }
      if (to >= played.tape.length) setPlaying(false);
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [played, playing, speed, unit, refreshStudies]);

  // Skipping redraws the chart once with the whole tape: appending thousands of minutes a candle at
  // a time is what the replay does a few at a time, and is slow all at once.
  const skipToEnd = useCallback(() => {
    if (!played) return;
    if (shownRef.current < played.tape.length) {
      chart.current?.load({
        hours: toBars(played.chart.hours, unit),
        minutes: toBars(played.chart.minutes, unit),
        tape: toBars(played.tape, unit),
        time: played.time,
        tickSize: played.instrument.tickSize,
        priceDecimals: played.instrument.priceDecimals,
        timeframe,
      });
      shownRef.current = played.tape.length;
      setShown(played.tape.length);
      refreshStudies();
    }
    setPlaying(false);
  }, [played, unit, timeframe, refreshStudies]);

  // Markers: the trade's fills as the tape reaches them; the best, the worst and the opponent once
  // it has ended.
  useEffect(() => {
    if (!played) {
      chart.current?.setMarkers([]);
      return;
    }
    const markers = [...tradeMarkers(played.mine, shown, '')];
    if (done) {
      markers.push(...tradeMarkers(played.best, total, 'Best ', BEST_INK[theme]));
      markers.push(...tradeMarkers(played.worst, total, 'Worst ', chromeFor(theme).axis));
      if (played.opponent?.trade) markers.push(...tradeMarkers(played.opponent.trade, total, `${played.opponent.label.name}: `));
    }
    chart.current?.setMarkers(markers.sort((a, b) => a.at - b.at));
  }, [played, shown, done, total, theme]);

  const lock = useCallback(
    (intent: RoundIntent) => {
      if (!view || view.status !== 'reading') return;
      setBusy(true);
      driver
        .lock(view.roundId, intent)
        .then((result) => {
          shownRef.current = 0;
          setShown(0);
          setView(result);
          setResultOpen(true);
          setPlaying(true);
        })
        .catch((reason: unknown) => toast(reason instanceof Error ? reason.message : 'That did not lock in.', 'error'))
        .finally(() => setBusy(false));
    },
    [driver, view, toast],
  );

  const snap = useCallback(
    (price: number) => (instrument ? Number((Math.round(price / instrument.tickSize) * instrument.tickSize).toFixed(instrument.priceDecimals)) : price),
    [instrument],
  );

  const last = view ? view.chart.refClose * unit : 0;

  // The lines on the chart: the draft while reading, the locked order while the tape plays, and a
  // school's levels once it has ended.
  const lines = useMemo<ChartLine[]>(() => {
    if (!view || !instrument) return [];
    const fmt = (value: number) => formatPrice(value, instrument);
    const out: ChartLine[] = [];
    if (view.status === 'reading') {
      const parse = (text: string) => {
        const value = Number.parseFloat(text.replace(/,/g, ''));
        return Number.isFinite(value) ? value : null;
      };
      const entry = draft.type === 'market' ? null : parse(draft.price);
      if (entry !== null) {
        out.push({
          id: 'draft-entry',
          price: entry,
          label: `${draft.side === 'buy' ? 'Buy' : 'Sell'} ${draft.type} @ ${fmt(entry)}`,
          tone: 'info',
          style: 'dashed',
          draggable: true,
          onDrag: (next) => setDraft((d) => ({ ...d, price: priceInput(next, instrument) })),
        });
      }
      const tp = draft.tpOn ? parse(draft.tp) : null;
      if (tp !== null) {
        out.push({ id: 'draft-tp', price: tp, label: `TP @ ${fmt(tp)}`, tone: 'long', style: 'dashed', draggable: true, onDrag: (next) => setDraft((d) => ({ ...d, tp: priceInput(next, instrument) })) });
      }
      const sl = draft.slOn ? parse(draft.sl) : null;
      if (sl !== null) {
        out.push({ id: 'draft-sl', price: sl, label: `SL @ ${fmt(sl)}`, tone: 'short', style: 'dashed', draggable: true, onDrag: (next) => setDraft((d) => ({ ...d, sl: priceInput(next, instrument) })) });
      }
      return out;
    }
    const mine = view.mine;
    if (mine) {
      const filled = mine.entry !== null && mine.entry.at < shown;
      const closed = mine.exit !== null && mine.exit.at < shown;
      if (filled && mine.entry) {
        out.push({ id: 'entry', price: mine.entry.price, label: `${mine.direction === 'long' ? 'Long' : 'Short'} @ ${fmt(mine.entry.price)}`, tone: mine.direction === 'long' ? 'long' : 'short' });
      } else if (mine.order.price !== null && !done) {
        out.push({ id: 'entry', price: mine.order.price, label: `${mine.entryType === 'stop' ? 'Stop' : 'Limit'} ${mine.direction === 'long' ? 'buy' : 'sell'} @ ${fmt(mine.order.price)}`, tone: 'info', style: 'dashed' });
      }
      if (!closed) {
        if (mine.order.takeProfit !== null) out.push({ id: 'tp', price: mine.order.takeProfit, label: `TP @ ${fmt(mine.order.takeProfit)}`, tone: 'long', style: filled ? 'solid' : 'dashed' });
        if (mine.order.stopLoss !== null) out.push({ id: 'sl', price: mine.order.stopLoss, label: `SL @ ${fmt(mine.order.stopLoss)}`, tone: 'short', style: filled ? 'solid' : 'dashed' });
      }
    }
    if (done && view.opponent?.read) {
      for (const level of view.opponent.read.levels) {
        out.push({ id: `read-${level.name}`, price: level.price, label: `${view.opponent.label.name}: ${level.name}`, tone: 'neutral', style: 'dashed' });
      }
    }
    return out;
  }, [view, instrument, draft, shown, done]);

  // What the trade is worth as the tape plays.
  const live = useMemo(() => {
    if (!played) return null;
    const mine = played.mine;
    if (!mine || !mine.entry || mine.entry.at >= shown) return { value: played.stake, state: mine ? (mine.entry ? 'waiting' : 'never') : 'out' } as const;
    if (mine.exit && mine.exit.at < shown) return { value: mine.result, state: 'closed' } as const;
    const close = shown > 0 ? played.tape[shown - 1][3] * unit : last;
    const dir = mine.direction === 'long' ? 1 : -1;
    const notional = mine.order.size;
    return { value: played.stake + dir * notional * (close / mine.entry.price - 1), state: 'open' } as const;
  }, [played, shown, unit, last]);

  const hourlyAtr = useMemo(() => (view ? (atr(toBars(view.chart.hours.slice(-81), unit)) ?? 0) : 0), [view, unit]);

  useHotkeys(
    {
      ' ': (event) => {
        event.preventDefault();
        if (played && !done) setPlaying((p) => !p);
      },
      Escape: () => setTool(null),
      z: (event) => {
        if (event.metaKey || event.ctrlKey) setDrawings((all) => all.slice(0, -1));
      },
    },
    Boolean(view),
  );

  if (error && !view) {
    return (
      <div className="bg-surface-0 text-ink grid min-h-dvh place-items-center p-6">
        <EmptyState icon="alert" title="That round did not open." body={error} action={exit} />
      </div>
    );
  }

  const timeLabel = view ? formatReplayTime(view.time, played ? Math.max(-1, shown - 1) : -1) : '';

  return (
    <div className={cx('bg-surface-0 text-ink flex min-h-dvh flex-col lg:h-dvh lg:min-h-0', className)}>
      <header className="border-line-faint flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2 lg:px-4">
        <div className="flex min-w-0 items-center gap-3">
          {exit}
          {view && instrument ? (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-ink-max text-base font-semibold tracking-tight">{instrument.display}</span>
                {view.duel ? (
                  <Chip size="sm" tone="accent">
                    Tape {view.duel.index + 1} of {view.duel.tapes} · vs {view.duel.opponent.name}
                  </Chip>
                ) : (
                  <Chip size="sm" tone="info">
                    Training
                  </Chip>
                )}
                {view.synthetic && <Chip size="sm">Synthetic</Chip>}
              </div>
              <div className="text-ink-dim text-mini truncate">
                {played ? `Tape · ${timeLabel}` : `Reading · the bell rings ${timeLabel}`} · {formatUsd(view.stake, { decimals: 0 })} stake
              </div>
            </div>
          ) : (
            <span className="text-ink-dim text-sm">Dealing a tape…</span>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="hidden lg:inline-flex">
            <Segmented label="Chart timeframe" value={timeframe} onChange={setTimeframe} options={TIMEFRAMES.map((tf) => ({ value: tf.minutes, label: tf.label }))} />
          </span>
          <span className="contents lg:hidden">
            <Select label="Chart timeframe" value={timeframe} onChange={setTimeframe} options={TIMEFRAMES.map((tf) => ({ value: tf.minutes, label: tf.label }))} />
          </span>
          {played && (
            <div className="ring-line flex items-center gap-1 rounded-md p-1 ring-1 ring-inset">
              <IconButton
                icon={playing ? 'pause' : 'play'}
                label={playing ? 'Pause the tape' : 'Play the tape'}
                size="sm"
                variant={playing ? 'secondary' : 'primary'}
                disabled={done}
                onClick={() => setPlaying((p) => !p)}
              />
              <IconButton icon="skip-forward" label="Skip to the end of the tape" size="sm" disabled={done} onClick={skipToEnd} />
              <Select label="Replay speed" value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: SPEED_LABEL[s] }))} />
            </div>
          )}
          {played && (
            <div className="hidden w-28 items-center gap-2 md:flex" title={`${shown} of ${total} minutes`}>
              <div className="bg-fill-2 h-1.5 flex-1 overflow-hidden">
                <div className="bg-accent h-full" style={{ width: `${total > 0 ? (shown / total) * 100 : 0}%` }} />
              </div>
              <span className="numeral text-ink-dim text-mini">{total > 0 ? Math.round((shown / total) * 100) : 0}%</span>
            </div>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1">
          <div className="border-line-faint hidden flex-col items-center gap-2 border-r p-1.5 lg:flex">
            <InstrumentRail granted={TOOLS} tool={tool} onTool={setTool} className="flex-col" />
            <button
              type="button"
              onClick={() => setStudiesOpen(true)}
              aria-label={activeTools.length > 0 ? `Studies, ${activeTools.length} on` : 'Studies'}
              className="text-ink-lo hover:text-ink-hi hover:bg-fill-2 relative grid h-9 w-9 place-items-center rounded-md"
            >
              <Icon name="activity" size={17} />
              {activeTools.length > 0 && (
                <span className="bg-info text-surface-0 numeral absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-bold">
                  {activeTools.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setLogScale((v) => !v)}
              aria-pressed={logScale}
              aria-label="Log scale"
              className={cx('hover:bg-fill-2 grid h-9 w-9 place-items-center rounded-md', logScale ? 'text-info-ink' : 'text-ink-lo hover:text-ink-hi')}
            >
              <Icon name="log-scale" size={17} />
            </button>
            <button
              type="button"
              onClick={() => chart.current?.scrollToNow()}
              aria-label="Scroll to the latest candle"
              className="text-ink-lo hover:text-ink-hi hover:bg-fill-2 grid h-9 w-9 place-items-center rounded-md"
            >
              <Icon name="chevron-right" size={17} />
            </button>
            {drawings.length > 0 && (
              <button
                type="button"
                onClick={() => setDrawings([])}
                aria-label="Clear drawings"
                className="text-ink-lo hover:text-short-ink hover:bg-fill-2 grid h-9 w-9 place-items-center rounded-md"
              >
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>

          <div className="bg-surface-1 relative h-[52dvh] min-h-[18rem] flex-1 lg:h-auto">
            <TerminalChart ref={chart} className="absolute inset-0" />
            <OrderLinesOverlay chart={chart} lines={lines} snap={snap} />
            <DrawLayer
              chart={chart}
              tool={tool}
              drawings={drawings}
              onCommit={(drawing) => setDrawings((all) => [...all, { ...drawing, id: nextDrawing.current++ }])}
              magnet={false}
              bars={NO_BARS}
              atr={hourlyAtr}
              risk={null}
              onDelete={(id) => setDrawings((all) => all.filter((d) => d.id !== id))}
              indexPerBar={timeframe}
            />
            {played && done && resultOpen && (
              <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto p-4">
                <RoundResult played={played} onClose={() => setResultOpen(false)} actions={actions?.(played)} />
              </div>
            )}
            {!view && (
              <div className="absolute inset-0 z-30 grid place-items-center">
                <span className="text-ink-dim text-sm">Dealing a tape…</span>
              </div>
            )}
          </div>
        </div>

        <aside className="border-line-faint w-full shrink-0 overflow-y-auto border-t p-4 lg:w-[20rem] lg:border-l lg:border-t-0">
          {view && instrument && view.status === 'reading' && (
            <>
              <div className="eyebrow text-ink-dim mb-1">Your trade</div>
              <p className="text-ink-lo mb-3 text-xs">
                Read the history, draw what you see, then place one trade. The next 60 hours play the moment you lock in.
              </p>
              <RoundTicket
                draft={draft}
                onDraft={(next) => setDraft((d) => ({ ...d, ...next }))}
                onLock={lock}
                onSitOut={() => lock({ kind: 'sit-out' })}
                last={last}
                stake={view.stake}
                instrument={instrument}
                busy={busy}
              />
            </>
          )}
          {played && instrument && live && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="eyebrow text-ink-dim mb-1">Your round</div>
                <div className={cx('numeral text-3xl font-semibold', live.value >= played.stake ? 'text-long-ink' : 'text-short-ink')}>
                  {formatUsd(live.value)}
                </div>
                <p className="text-ink-lo mt-1 text-xs">
                  {live.state === 'out'
                    ? 'You sat this one out. Watching what you passed on.'
                    : live.state === 'never'
                      ? 'Your entry never filled.'
                      : live.state === 'waiting'
                        ? 'Waiting for your entry to fill.'
                        : live.state === 'open'
                          ? 'In the trade.'
                          : `Closed${played.mine?.exit ? ` at ${played.mine.exit.reason === 'take-profit' ? 'the take-profit' : played.mine.exit.reason === 'stop-loss' ? 'the stop-loss' : played.mine.exit.reason === 'liquidation' ? 'the whole stake' : 'the end of the tape'}` : ''}.`}
                </p>
              </div>
              {played.mine && (
                <dl className="text-mini grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-ink-dim">Direction</dt>
                  <dd className="text-ink-hi text-right capitalize">{played.mine.direction}</dd>
                  <dt className="text-ink-dim">Size</dt>
                  <dd className="numeral text-ink-hi text-right">{formatUsd(played.mine.order.size)}</dd>
                  <dt className="text-ink-dim">Entry</dt>
                  <dd className="numeral text-ink-hi text-right">
                    {played.mine.entryType === 'market' ? 'At the bell' : `${played.mine.entryType} @ ${formatPrice(played.mine.order.price ?? 0, instrument)}`}
                  </dd>
                  <dt className="text-ink-dim">Take-profit</dt>
                  <dd className="numeral text-ink-hi text-right">{played.mine.order.takeProfit !== null ? formatPrice(played.mine.order.takeProfit, instrument) : '—'}</dd>
                  <dt className="text-ink-dim">Stop-loss</dt>
                  <dd className="numeral text-ink-hi text-right">{played.mine.order.stopLoss !== null ? formatPrice(played.mine.order.stopLoss, instrument) : '—'}</dd>
                </dl>
              )}
              {!done ? (
                <Button variant="secondary" block onClick={skipToEnd}>
                  <Icon name="skip-forward" size={14} />
                  Skip to the result
                </Button>
              ) : (
                !resultOpen && (
                  <Button variant="primary" block onClick={() => setResultOpen(true)}>
                    Show the result
                  </Button>
                )
              )}
              {played.rejected && <p className="text-attention-ink text-xs">Played as a sit-out: {played.rejected}</p>}
            </div>
          )}
        </aside>
      </div>

      <StudiesPanel
        open={studiesOpen}
        onClose={() => setStudiesOpen(false)}
        granted={TOOLS}
        active={activeTools}
        onToggle={(code) => setActiveTools((all) => (all.includes(code) ? all.filter((t) => t !== code) : [...all, code]))}
        settings={studySettings}
        onSettings={setStudySettings}
        onResetSettings={resetStudySettings}
      />
    </div>
  );
}
