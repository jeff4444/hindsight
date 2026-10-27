'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Bar } from '@/core/bars';
import type { Benchmark, PanelRun, SessionReview as Review, WireBar } from '@/lib/trading/types';
import { formatPct, formatPrice, formatQty, formatReplayTime, formatUsd } from '@/lib/trading/format';
import { personaFor } from '@/lib/panel';
import { sessionCard } from '@/lib/share';
import { Button, Chip, Panel, PersonaAvatar, Stat, cx } from '../ui';
import { Icon } from '../ui/icons';
import { DataTable, type Column } from '../ui/data-table';
import { TerminalChart, type ChartMarker, type TerminalChartHandle } from './TerminalChart';
import { EquityCurve } from './EquityCurve';

/**
 * After the bell: what happened, what it was, and what everyone else did with it.
 *
 * The market's identity and dates come off the screen the moment the session is over (§22.9), and
 * the review leads with them — the claim the product makes is that this was a real market, and the
 * trader can now check. Then the statement, the whole tape with every fill on it, the best that
 * could have been done at your size, and each school's session on the same candles with your money.
 */

function toBars(wire: readonly WireBar[], unit: number): Bar[] {
  return wire.map(([o, h, l, c, v]) => ({ o: o * unit, h: h * unit, l: l * unit, c: c * unit, v }));
}

const ink = (value: number) => (value > 0 ? 'text-long-ink' : value < 0 ? 'text-short-ink' : 'text-ink-hi');

function dateRange(review: Review): string | null {
  const { startMs, endMs } = review.identity;
  if (startMs === null || endMs === null) return null;
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${fmt(startMs)} – ${fmt(endMs)} UTC`;
}

export function SessionReview({ review, actions }: { review: Review; actions?: ReactNode }) {
  const chart = useRef<TerminalChartHandle | null>(null);
  const [overlay, setOverlay] = useState<string | null>(null);
  const instrument = review.instrument;
  const unit = Math.pow(10, instrument.tickExp);
  const s = review.summary;

  useEffect(() => {
    chart.current?.load({
      hours: toBars(review.chart.hours, unit),
      minutes: toBars(review.chart.minutes, unit),
      tape: toBars(review.tape, unit),
      time: review.time,
      tickSize: instrument.tickSize,
      priceDecimals: instrument.priceDecimals,
      timeframe: 60,
    });
  }, [review, unit, instrument]);

  useEffect(() => {
    const own: ChartMarker[] = review.fills.map((fill) => ({
      at: fill.at,
      side: fill.side,
      text: `${fill.side === 'buy' ? 'B' : 'S'} ${formatQty(fill.qty, instrument)}`,
    }));
    const school = review.panel.find((run) => run.code === overlay);
    const persona = school ? personaFor(school.code) : null;
    const theirs: ChartMarker[] = school
      ? school.fills.map((fill) => ({
          at: fill.at,
          side: fill.side,
          text: persona?.short ?? school.code,
          color: persona?.colour,
        }))
      : [];
    chart.current?.setMarkers([...own, ...theirs]);
  }, [review, overlay, instrument]);

  const best = review.benchmarks.bestLong && review.benchmarks.bestShort
    ? review.benchmarks.bestLong.pnl >= review.benchmarks.bestShort.pnl
      ? review.benchmarks.bestLong
      : review.benchmarks.bestShort
    : (review.benchmarks.bestLong ?? review.benchmarks.bestShort);
  const captured = best && best.pnl > 0 ? s.pnl / best.pnl : null;

  const tripColumns: Column<Review['trips'][number]>[] = [
    { key: 'side', header: 'Trade', cell: (t) => <Chip tone={t.side === 'long' ? 'long' : 'short'}>{t.side === 'long' ? 'Long' : 'Short'}</Chip> },
    { key: 'open', header: 'Opened', cell: (t) => <span className="numeral text-ink-lo">{formatReplayTime(review.time, t.openedAt)}</span>, hideBelow: 'md' },
    { key: 'entry', header: 'Entry', numeric: true, cell: (t) => formatPrice(t.entryAvg, instrument) },
    { key: 'exit', header: 'Exit', numeric: true, cell: (t) => formatPrice(t.exitAvg, instrument) },
    { key: 'size', header: 'Size', numeric: true, hideBelow: 'sm', cell: (t) => `${formatQty(t.maxQty, instrument)} ${instrument.base}` },
    { key: 'mfe', header: 'Best moment', numeric: true, hideBelow: 'md', cell: (t) => <span className="text-long-ink">{formatUsd(t.mfe, { sign: true })}</span> },
    { key: 'mae', header: 'Worst moment', numeric: true, hideBelow: 'md', cell: (t) => <span className="text-short-ink">{formatUsd(t.mae, { sign: true })}</span> },
    { key: 'fees', header: 'Fees', numeric: true, hideBelow: 'lg', cell: (t) => formatUsd(t.fees) },
    { key: 'net', header: 'Net P&L', numeric: true, cell: (t) => <span className={ink(t.net)}>{formatUsd(t.net, { sign: true })}</span> },
  ];

  const panel = useMemo(() => [...review.panel].sort((a, b) => b.pnl - a.pnl), [review.panel]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="eyebrow text-gold-ink">Session review</div>
          <h1 className="text-ink-max mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            {review.identity.symbol} <span className="text-ink-dim text-lg font-normal">· {review.identity.venue}</span>
          </h1>
          <p className="text-ink-lo mt-1 text-sm">
            {review.identity.synthetic
              ? 'A synthetic demo market — not real price action.'
              : (dateRange(review) ??
                (review.identity.embargoedUntil
                  ? `Today's market: the dates are revealed when the daily rolls over.`
                  : 'Real Binance price action.'))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions}
          <CopyCard review={review} />
        </div>
      </div>

      <Panel tone="hero" pad="md" className="grid gap-5 md:grid-cols-[1.1fr_2fr]">
        <div>
          <div className="eyebrow text-ink-dim">Session P&L</div>
          <div className={cx('numeral mt-1 text-4xl font-semibold', ink(s.pnl))}>{formatUsd(s.pnl, { sign: true })}</div>
          <div className={cx('numeral mt-1 text-sm', ink(s.pnl))}>{formatPct(s.returnPct, { sign: true })} on {formatUsd(s.startingEquity)}</div>
          <div className="text-ink-dim mt-3 text-xs">
            Equity {formatUsd(s.startingEquity)} → {formatUsd(s.endingEquity)}
            {s.bankrupt && <span className="text-short-ink"> · liquidated</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Trades" value={s.trades} size="md" />
          <Stat label="Win rate" value={s.winRate === null ? '—' : formatPct(s.winRate, { decimals: 0 })} size="md" />
          <Stat label="Profit factor" value={s.profitFactor === null ? '—' : s.profitFactor.toFixed(2)} size="md" />
          <Stat label="Max drawdown" value={formatPct(s.maxDrawdown)} size="md" tone={s.maxDrawdown > 0.1 ? 'short' : 'neutral'} />
          <Stat label="Fees paid" value={formatUsd(s.fees)} size="md" />
          <Stat
            label="Worst-case fills"
            value={s.ambiguousFills}
            size="md"
            hint="Fills in a minute that could have gone two ways; the simulator took the worse one."
          />
        </div>
      </Panel>

      <Panel pad="none" className="overflow-hidden">
        <div className="border-line-faint flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="text-ink-hi text-sm font-medium">The whole tape, with your fills</div>
          {overlay && (
            <button type="button" onClick={() => setOverlay(null)} className="text-ink-lo hover:text-ink-hi text-xs">
              Hide {personaFor(overlay)?.name ?? overlay}
            </button>
          )}
        </div>
        <div data-theme="dark" className="bg-surface-0 relative h-[22rem]">
          <TerminalChart ref={chart} className="absolute inset-0" />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <Panel pad="md">
          <div className="text-ink-hi mb-3 text-sm font-medium">Equity through the session</div>
          <EquityCurve values={review.equityCurve} label="Equity at each hour of the session" />
        </Panel>
        <Panel pad="md" className="flex flex-col gap-3">
          <div className="text-ink-hi text-sm font-medium">Against what was possible</div>
          <p className="text-ink-dim text-xs">At your size, {formatUsd(review.benchmarks.sizeBasis)}, with the same fees.</p>
          <BenchmarkRow label="Buy and hold" benchmark={review.benchmarks.buyAndHold} />
          {review.benchmarks.bestLong && <BenchmarkRow label="Best long in hindsight" benchmark={review.benchmarks.bestLong} gold />}
          {review.benchmarks.bestShort && <BenchmarkRow label="Best short in hindsight" benchmark={review.benchmarks.bestShort} gold />}
          {captured !== null && (
            <div className="border-line-faint border-t pt-3 text-sm">
              <span className="text-ink-lo">You took </span>
              <span className={cx('numeral font-semibold', ink(captured))}>{formatPct(captured, { decimals: 0 })}</span>
              <span className="text-ink-lo"> of the best single trade.</span>
            </div>
          )}
        </Panel>
      </div>

      <Panel pad="none">
        <div className="border-line-faint border-b px-4 py-3 text-sm font-medium">Your trades</div>
        <DataTable columns={tripColumns} rows={review.trips} rowKey={(t, i) => `${t.openedAt}-${i}`} empty="You did not trade this market." />
      </Panel>

      <Panel pad="none">
        <div className="border-line-faint border-b px-4 py-3">
          <div className="text-sm font-medium">The schools on this market</div>
          <p className="text-ink-dim mt-0.5 text-xs">Each one traded these same candles by its own published rules, starting with your equity. Tap one to put its fills on the chart.</p>
        </div>
        <ul className="divide-line-faint divide-y">
          {panel.map((run) => (
            <PanelRow key={run.code} run={run} active={overlay === run.code} onToggle={() => setOverlay(overlay === run.code ? null : run.code)} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function BenchmarkRow({ label, benchmark, gold }: { label: string; benchmark: Benchmark; gold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={cx('text-sm', gold ? 'text-gold-ink' : 'text-ink-lo')}>{label}</span>
      <span className={cx('numeral text-sm font-semibold', ink(benchmark.pnl))}>
        {formatUsd(benchmark.pnl, { sign: true })} <span className="text-mini font-normal">({formatPct(benchmark.returnPct, { sign: true })})</span>
      </span>
    </div>
  );
}

function PanelRow({ run, active, onToggle }: { run: PanelRun; active: boolean; onToggle: () => void }) {
  const persona = personaFor(run.code);
  const traded = run.trades > 0;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        className={cx('hover:bg-fill-1 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', active && 'bg-fill-1')}
      >
        {persona && <PersonaAvatar persona={persona} size={34} muted={!traded} />}
        <div className="min-w-0 flex-1">
          <div className="text-ink-hi text-sm font-medium">{persona?.name ?? run.code}</div>
          <div className="text-ink-dim truncate text-xs">
            {traded
              ? `${run.trades} ${run.trades === 1 ? 'trade' : 'trades'}, ${run.wins} won`
              : 'Sat this market out — its rules never fired.'}
          </div>
        </div>
        <div className="text-right">
          <div className={cx('numeral text-sm font-semibold', ink(run.pnl))}>{traded ? formatUsd(run.pnl, { sign: true }) : '—'}</div>
          <div className="numeral text-ink-dim text-mini">{traded ? formatPct(run.returnPct, { sign: true }) : ''}</div>
        </div>
      </button>
    </li>
  );
}

/** The spoiler-free card (`src/lib/share.ts`), to the clipboard. */
function CopyCard({ review }: { review: Review }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    const card = sessionCard({
      daily: review.daily,
      symbol: review.identity.symbol,
      returnPct: review.summary.returnPct,
      trips: review.trips.map((trip) => trip.net),
      maxDrawdown: review.summary.maxDrawdown,
      bankrupt: review.summary.bankrupt,
    });
    try {
      await navigator.clipboard.writeText(card);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <Button variant="ghost" onClick={() => void copy()}>
      <Icon name={state === 'copied' ? 'check' : 'share'} size={15} />
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy result'}
    </Button>
  );
}
