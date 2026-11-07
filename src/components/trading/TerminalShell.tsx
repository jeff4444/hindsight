'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Bar } from '@/core/bars';
import { atr } from '@/core/atr';
import type { ToolCode } from '@/core/tiers';
import type { TradeDriver } from '@/lib/trading/driver';
import type { OpenRequest, SessionOp } from '@/lib/trading/schemas';
import type { SessionDelta, WireBar } from '@/lib/trading/types';
import { formatPrice, formatQty, formatUsd, priceInput } from '@/lib/trading/format';
import { overlaysFor } from '@/lib/toolOverlays';
import { useStudySettings } from '@/lib/studySettings';
import { useHotkeys } from '@/lib/useHotkeys';
import { candlesFor, chromeFor, overlayInk } from '@/lib/palette';
import { Button, EmptyState, cx } from '../ui';
import { Dialog, useThemeSnapshot, useToast } from '../ui/client';
import { Icon } from '../ui/icons';
import { InstrumentRail } from '../play/InstrumentRail';
import { StudiesPanel } from '../play/StudiesPanel';
import { DrawLayer, type Drawing, type DrawTool } from '../play/DrawLayer';
import { TerminalChart, type ChartMarker, type TerminalChartHandle } from './TerminalChart';
import { OrderLinesOverlay, type ChartLine } from './OrderLinesOverlay';
import { OrderTicket, draftToOp, emptyDraft, quoteDraft, type TicketDraft } from './OrderTicket';
import { AccountStrip, AccountTabs } from './AccountPanels';
import { MarketHeader } from './MarketHeader';
import { useTradeSession } from './useTradeSession';

/**
 * The trading terminal.
 *
 * Laid out the way an exchange lays one out: the market and the replay transport across the top,
 * the chart in the middle with the drawing tools down its left side and the order ticket down its
 * right, and the account underneath — a strip of the numbers that move and the tabs a trader keeps
 * open. On a phone it stacks, and the ticket becomes a sheet behind two big Buy and Sell buttons.
 *
 * It renders on the always-dark stage, like the chart it is built around.
 */

/** Studies the terminal offers. Geometry, stop algorithms and the profile are tick-space tools of the
 *  anonymous chart and do not apply to a real price axis. */
const TERMINAL_TOOLS: ToolCode[] = ['trendline', 'level', 'channel', 'fib', 'magnet', 'logScale', 'ma', 'bollinger', 'keltner', 'donchian', 'rsi', 'macd'];

const DEFAULT_TIMEFRAME = 15;
const NO_BARS: Bar[] = [];

let orderCounter = 0;
function newOrderId(): string {
  orderCounter += 1;
  return `o${Date.now().toString(36)}${orderCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

function toBars(wire: readonly WireBar[], unit: number): Bar[] {
  return wire.map(([o, h, l, c, v]) => ({ o: o * unit, h: h * unit, l: l * unit, c: c * unit, v }));
}

export function TerminalShell({
  driver,
  start,
  exit,
  onClosed,
  closedAction,
  className,
}: {
  driver: TradeDriver;
  start: { sessionId: string } | { request: OpenRequest };
  /** The way out, top left: a link back to Markets, or nothing on the landing page. */
  exit?: ReactNode;
  onClosed?: (sessionId: string) => void;
  /** What the "market closed" card offers. */
  closedAction?: (sessionId: string) => ReactNode;
  className?: string;
}) {
  const toast = useToast();
  const chart = useRef<TerminalChartHandle | null>(null);
  const [timeframe, setTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [draft, setDraft] = useState<TicketDraft>(emptyDraft);
  const [sheet, setSheet] = useState(false);
  const [tool, setTool] = useState<DrawTool | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [studiesOpen, setStudiesOpen] = useState(false);
  const [activeTools, setActiveTools] = useState<ToolCode[]>([]);
  const [studySettings, setStudySettings, resetStudySettings] = useStudySettings();
  const [logScale, setLogScale] = useState(false);
  const { palette, theme } = useThemeSnapshot();
  const nextDrawing = useRef(1);

  // Studies are recomputed from the candles on the chart whenever those change, which happens
  // outside React (a minute appended, a timeframe switched), so they are refreshed imperatively.
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

  const unitRef = useRef(1);
  const session = useTradeSession(driver, start, {
    onBars: (bars, reset) => {
      const api = chart.current;
      if (!api) return;
      if (reset) return; // handled by the load effect below, which reads the whole tape
      api.append(toBars(bars, unitRef.current));
      refreshStudies();
    },
    onNotice: (message, tone) => toast(message, tone),
    onClosed: (delta: SessionDelta) => onClosed?.(delta.sessionId),
  });
  const { open, delta, tape, act, busy } = session;

  const instrument = open?.instrument ?? null;
  const unit = instrument ? Math.pow(10, instrument.tickExp) : 1;
  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);

  // Load the chart once the session arrives (and again if the server ever resends the tape).
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !chart.current) return;
    const key = `${open.sessionId}`;
    if (loaded.current === key) return;
    loaded.current = key;
    chart.current.load({
      hours: toBars(open.chart.hours, unit),
      minutes: toBars(open.chart.minutes, unit),
      tape: toBars(tape, unit),
      time: open.time,
      tickSize: open.instrument.tickSize,
      priceDecimals: open.instrument.priceDecimals,
      timeframe,
    });
    refreshStudies();
    // Loading is keyed by the session; later candles arrive through `onBars`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit]);

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

  // Fill markers.
  const fills = delta?.fills;
  useEffect(() => {
    if (!fills || !instrument) return;
    const markers: ChartMarker[] = fills.map((fill) => ({
      at: fill.at,
      side: fill.side,
      text: `${fill.side === 'buy' ? 'B' : 'S'} ${formatQty(fill.qty, instrument)}`,
    }));
    chart.current?.setMarkers(markers);
  }, [fills, instrument]);

  /** The measure tool reads out in ATR of the hourly history, the volatility the trader walked in on. */
  const hourlyAtr = useMemo(() => (open ? (atr(toBars(open.chart.hours.slice(-81), unit)) ?? 0) : 0), [open, unit]);

  const lastPrice = useMemo(() => {
    if (!open) return 0;
    const last = tape.length > 0 ? tape[tape.length - 1][3] : open.chart.refClose;
    return last * unit;
  }, [open, tape, unit]);

  const closed = delta?.status === 'closed';
  const account = delta?.account ?? null;
  const position = delta?.position ?? null;

  const send = useCallback((op: SessionOp) => void act(op), [act]);

  const submit = useCallback(() => {
    if (!instrument || !account) return;
    const quote = quoteDraft(draft, lastPrice, instrument, account, position);
    const op = draftToOp(draft, quote, newOrderId());
    if (!op) return;
    void act(op).then((result) => {
      if (result && !result.rejected) {
        setDraft((current) => ({ ...current, qty: '', tpOn: false, slOn: false, tp: '', sl: '', reduceOnly: false }));
        setSheet(false);
      }
    });
  }, [act, draft, lastPrice, instrument, account, position]);

  const snap = useCallback(
    (price: number) => {
      if (!instrument) return price;
      return Number((Math.round(price / instrument.tickSize) * instrument.tickSize).toFixed(instrument.priceDecimals));
    },
    [instrument],
  );

  // The lines on the chart.
  const lines = useMemo<ChartLine[]>(() => {
    if (!instrument || !delta) return [];
    const out: ChartLine[] = [];
    const fmt = (value: number) => formatPrice(value, instrument);
    if (position) {
      out.push({
        id: 'position',
        price: position.avgPrice,
        label: `${position.side === 'long' ? 'Long' : 'Short'} ${formatQty(position.qty, instrument)} @ ${fmt(position.avgPrice)}`,
        detail: formatUsd(position.unrealizedPnl, { sign: true }),
        detailTone: position.unrealizedPnl >= 0 ? 'long' : 'short',
        tone: position.side === 'long' ? 'long' : 'short',
        onClose: closed ? undefined : () => send({ op: 'close-position', fraction: 1 }),
      });
      if (position.liquidationPrice !== null && position.liquidationPrice > 0) {
        out.push({ id: 'liquidation', price: position.liquidationPrice, label: `Liquidation ${fmt(position.liquidationPrice)}`, tone: 'attention', style: 'dashed' });
      }
    }
    for (const order of delta.orders) {
      const price = order.type === 'stop' ? order.stopPrice : order.price;
      if (price === null) continue;
      const role = order.role === 'take-profit' ? 'TP' : order.role === 'stop-loss' ? 'SL' : order.type === 'stop' ? 'STOP' : 'LIMIT';
      const pnl =
        position && (order.role === 'take-profit' || order.role === 'stop-loss')
          ? (position.side === 'long' ? 1 : -1) * (price - position.avgPrice) * Math.min(order.qty, position.qty)
          : null;
      out.push({
        id: order.id,
        price,
        label: `${role} ${order.side === 'buy' ? 'BUY' : 'SELL'} ${formatQty(order.qty, instrument)} @ ${fmt(price)}`,
        detail: pnl !== null ? formatUsd(pnl, { sign: true }) : order.status === 'pending' ? 'waits for entry' : undefined,
        detailTone: pnl !== null ? (pnl >= 0 ? 'long' : 'short') : undefined,
        tone: order.role === 'take-profit' ? 'long' : order.role === 'stop-loss' ? 'short' : order.side === 'buy' ? 'long' : 'short',
        style: order.status === 'pending' ? 'dashed' : 'solid',
        draggable: !closed,
        onDrop: (next) =>
          send(order.type === 'stop' ? { op: 'modify', orderId: order.id, stopPrice: next } : { op: 'modify', orderId: order.id, price: next }),
        onClose: closed ? undefined : () => send({ op: 'cancel', orderId: order.id }),
      });
    }
    // The ticket's draft, as lines to drag — only while one is being written, so a placed order is
    // not drawn twice.
    if (draft.type !== 'market' && draft.price && draft.qty) {
      const price = Number.parseFloat(draft.price.replace(/,/g, ''));
      if (Number.isFinite(price)) {
        out.push({
          id: 'draft-entry',
          price,
          label: `New ${draft.side === 'buy' ? 'buy' : 'sell'} ${draft.type} @ ${fmt(price)}`,
          tone: 'info',
          style: 'dashed',
          draggable: true,
          onDrag: (next) => setDraft((d) => ({ ...d, price: priceInput(next, instrument) })),
        });
      }
    }
    if (draft.tpOn && draft.tp) {
      const price = Number.parseFloat(draft.tp.replace(/,/g, ''));
      if (Number.isFinite(price)) {
        out.push({ id: 'draft-tp', price, label: `New TP @ ${fmt(price)}`, tone: 'long', style: 'dashed', draggable: true, onDrag: (next) => setDraft((d) => ({ ...d, tp: priceInput(next, instrument) })) });
      }
    }
    if (draft.slOn && draft.sl) {
      const price = Number.parseFloat(draft.sl.replace(/,/g, ''));
      if (Number.isFinite(price)) {
        out.push({ id: 'draft-sl', price, label: `New SL @ ${fmt(price)}`, tone: 'short', style: 'dashed', draggable: true, onDrag: (next) => setDraft((d) => ({ ...d, sl: priceInput(next, instrument) })) });
      }
    }
    return out;
  }, [instrument, delta, position, draft, closed, send]);

  useHotkeys(
    {
      ' ': (event) => {
        event.preventDefault();
        if (!delta || closed) return;
        send({ op: delta.clock.paused ? 'play' : 'pause' });
      },
      ArrowRight: () => {
        if (!closed) send({ op: 'step', minutes: Math.min(timeframe, 1440) });
      },
      b: () => setDraft((d) => ({ ...d, side: 'buy' })),
      s: () => setDraft((d) => ({ ...d, side: 'sell' })),
      Escape: () => {
        setTool(null);
        setDraft(emptyDraft());
      },
      z: (event) => {
        if (event.metaKey || event.ctrlKey) setDrawings((all) => all.slice(0, -1));
      },
    },
    Boolean(open),
  );

  if (session.error && !open) {
    return (
      <div className="bg-surface-0 text-ink grid min-h-dvh place-items-center p-6">
        <EmptyState icon="alert" title="That market did not open." body={session.error} action={exit} />
      </div>
    );
  }

  const ticket =
    instrument && account ? (
      <OrderTicket
        draft={draft}
        onDraft={(next) => setDraft((d) => ({ ...d, ...next }))}
        onSubmit={submit}
        last={lastPrice}
        instrument={instrument}
        account={account}
        position={position}
        disabled={closed || account.bankrupt}
        busy={busy}
      />
    ) : null;

  const toolsGranted = TERMINAL_TOOLS;

  return (
    <div className={cx('bg-surface-0 text-ink flex min-h-dvh flex-col lg:h-dvh lg:min-h-0', className)}>
      {open && delta && instrument ? (
        <MarketHeader
          instrument={instrument}
          time={open.time}
          clock={delta.clock}
          tape={tape}
          refClose={open.chart.refClose}
          tickExp={instrument.tickExp}
          purpose={open.purpose}
          ranked={open.ranked}
          closed={closed}
          timeframe={timeframe}
          onTimeframe={setTimeframe}
          onAct={send}
          busy={busy}
          exit={exit}
        />
      ) : (
        <div className="border-line-faint flex h-14 items-center gap-3 border-b px-4">
          {exit}
          <span className="text-ink-dim text-sm">Opening the market…</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <div className="border-line-faint hidden flex-col items-center gap-2 border-r p-1.5 lg:flex">
              <InstrumentRail granted={toolsGranted} tool={tool} onTool={setTool} className="flex-col" />
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

            <div className="bg-surface-1 relative h-[46dvh] min-h-[18rem] flex-1 lg:h-auto">
              <TerminalChart ref={chart} className="absolute inset-0" />
              <OrderLinesOverlay chart={chart} lines={lines} snap={snap} />
              <DrawLayer
                chart={chart}
                tool={tool}
                drawings={drawings}
                onCommit={(drawing) => {
                  setDrawings((all) => [...all, { ...drawing, id: nextDrawing.current++ }]);
                  if (tool === 'measure') return;
                }}
                magnet={false}
                bars={NO_BARS}
                atr={hourlyAtr}
                risk={null}
                onDelete={(id) => setDrawings((all) => all.filter((d) => d.id !== id))}
                indexPerBar={timeframe}
              />
              {closed && delta && (
                <div className="absolute inset-0 z-30 grid place-items-center p-4">
                  <div className="bg-surface-2 border-rule shadow-e3 w-full max-w-sm rounded-2xl border p-5 text-center">
                    <div className="eyebrow text-accent-ink">Market closed</div>
                    <div className={cx('numeral mt-2 text-3xl font-semibold', delta.account.sessionPnl >= 0 ? 'text-long-ink' : 'text-short-ink')}>
                      {formatUsd(delta.account.sessionPnl, { sign: true })}
                    </div>
                    <p className="text-ink-lo mt-1 text-sm">
                      {delta.trips.length} {delta.trips.length === 1 ? 'trade' : 'trades'} · equity {formatUsd(delta.account.equity)}
                    </p>
                    <div className="mt-4 flex justify-center gap-2">{closedAction?.(delta.sessionId)}</div>
                  </div>
                </div>
              )}
              {!open && (
                <div className="absolute inset-0 z-30 grid place-items-center">
                  <span className="text-ink-dim text-sm">Loading the tape…</span>
                </div>
              )}
            </div>
          </div>

          {account && <AccountStrip account={account} className="border-line-faint border-t" />}
          {instrument && delta && open && (
            <AccountTabs
              className="border-line-faint min-h-[12rem] border-t lg:h-60"
              instrument={instrument}
              time={open.time}
              position={position}
              orders={delta.orders}
              history={delta.history}
              fills={delta.fills}
              trips={delta.trips}
              closed={closed}
              onClose={(fraction) => send({ op: 'close-position', fraction })}
              onReverse={() => {
                if (!position) return;
                send({
                  op: 'place',
                  clientOrderId: newOrderId(),
                  side: position.side === 'long' ? 'sell' : 'buy',
                  type: 'market',
                  qty: position.qty * 2,
                });
              }}
              onCancel={(orderId) => send({ op: 'cancel', orderId })}
              onCancelAll={() => send({ op: 'cancel-all' })}
            />
          )}
        </div>

        <aside className="border-line-faint hidden w-[20rem] shrink-0 overflow-y-auto border-l p-4 lg:block">
          <div className="eyebrow text-ink-dim mb-3">Place an order</div>
          {ticket}
        </aside>
      </div>

      {/* The phone's ticket: two big buttons and a sheet. */}
      <div className="border-line-faint bg-surface-1 sticky bottom-0 z-40 grid grid-cols-2 gap-2 border-t p-3 lg:hidden">
        <Button
          size="lg"
          disabled={!ticket || closed}
          className="!bg-long !text-surface-0"
          onClick={() => {
            setDraft((d) => ({ ...d, side: 'buy' }));
            setSheet(true);
          }}
        >
          Buy
        </Button>
        <Button
          size="lg"
          disabled={!ticket || closed}
          className="!bg-short !text-surface-0"
          onClick={() => {
            setDraft((d) => ({ ...d, side: 'sell' }));
            setSheet(true);
          }}
        >
          Sell
        </Button>
      </div>
      <Dialog open={sheet} onClose={() => setSheet(false)} title={instrument ? `Trade ${instrument.display}` : 'Trade'} placement="bottom">
        {ticket}
      </Dialog>

      <StudiesPanel
        open={studiesOpen}
        onClose={() => setStudiesOpen(false)}
        granted={toolsGranted}
        active={activeTools}
        onToggle={(code) => setActiveTools((all) => (all.includes(code) ? all.filter((t) => t !== code) : [...all, code]))}
        settings={studySettings}
        onSettings={setStudySettings}
        onResetSettings={resetStudySettings}
      />
    </div>
  );
}
