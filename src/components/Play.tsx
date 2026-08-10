'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bar } from '@/core/bars';
import { LEAD_IN_BARS } from '@/core/config';
import { fromBase64, unpackDetail } from '@/core/pack';
import { TICK_SIZE, toTick } from '@/core/normalize';
import { clockAt, decisionClockSeconds, formatClock } from '@/lib/clock';
import { DISPLAY_TIER, TIERS } from '@/lib/resolution';
import type { RevealPayload, RoundPayload, RoundResult } from '@/lib/api-types';
import {
  finalView,
  focusView,
  placementView,
  priceExtent,
  revealTarget,
  settled,
  step,
  type View,
} from '@/lib/camera';
import { Chart, type ChartHandle } from './Chart';
import { ResultCard } from './ResultCard';
import { TradeOverlay, type Rail } from './TradeOverlay';

type Phase = 'loading' | 'placing' | 'committing' | 'revealing' | 'done' | 'error';

/** Milliseconds per revealed candle. */
const SPEEDS = [
  { label: '0.5x', ms: 150 },
  { label: '1x', ms: 78 },
  { label: '2x', ms: 38 },
  { label: '4x', ms: 18 },
];
const DEFAULT_SPEED = 1;

/** Vertical headroom kept reachable for the rails, in ATR. */
const RAIL_HEADROOM_ATR = 3.5;

export function Play() {
  const chart = useRef<ChartHandle>(null);
  const issued = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [stop, setStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [revealTotal, setRevealTotal] = useState(0);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [paused, setPaused] = useState(false);
  const [hitFlash, setHitFlash] = useState<'target' | 'stop' | null>(null);
  const [tier, setTier] = useState<number>(DISPLAY_TIER);

  // Mutable mirrors for the animation loop, which must not re-subscribe every frame.
  const reveal = useRef<Bar[]>([]);
  const shown = useRef<Bar[]>([]);
  /** Every minute of the window the client is allowed to hold, lead-in first. */
  const minutes = useRef<Bar[]>([]);
  const railsRef = useRef<number[]>([]);
  const revealedRef = useRef(0);
  const speedRef = useRef(DEFAULT_SPEED);
  const pausedRef = useRef(false);
  const resultRef = useRef<RoundResult | null>(null);
  const tierRef = useRef(DISPLAY_TIER);
  const frame = useRef<number | null>(null);

  // Mirrored into refs so the animation loop reads the live value without being torn down
  // and rebuilt every time the player nudges a control.
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // The resolution is the player's, and nothing else sets it — not the zoom, not the reveal.
  useEffect(() => {
    tierRef.current = tier;
    chart.current?.setTier(tier);
  }, [tier]);

  const stopLoop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => stopLoop, [stopLoop]);

  /* --------------------------------------------------------------- issuing */

  const load = useCallback(async () => {
    stopLoop();
    setPhase('loading');
    setError(null);
    setResult(null);
    resultRef.current = null;
    setRevealed(0);
    setRevealTotal(0);
    setPaused(false);
    setSpeed(DEFAULT_SPEED);
    setHitFlash(null);
    revealedRef.current = 0;
    reveal.current = [];
    chart.current?.clearMarks();
    chart.current?.setPrice(null);

    const response = await fetch('/api/round', { method: 'POST' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Could not reach the server.' }));
      setError(body.error ?? 'Could not issue a round.');
      setPhase('error');
      return;
    }

    const payload: RoundPayload = await response.json();
    setRound(payload);

    const openStop = toTick(payload.entry - payload.atr);
    const openTarget = toTick(payload.entry + payload.atr);
    shown.current = [...payload.bars];
    railsRef.current = [openStop, openTarget];

    // Before setBars: the clock decides what timestamp each bar maps to.
    chart.current?.setClock(payload.startDayOfWeek, payload.startHourUtc);
    chart.current?.setBars(payload.bars);
    // The one-minute detail behind the lead-in. Only the past — the reveal's minutes arrive
    // with the reveal itself (§12.1).
    minutes.current = payload.detail ? unpackDetail(fromBase64(payload.detail)) : [];
    chart.current?.setDetail(minutes.current, LEAD_IN_BARS);
    chart.current?.setTier(tierRef.current);
    // Autoscale to the visible candles, widened so the rails stay reachable however far the
    // player drags them. This is what makes zooming feel like a chart rather than a picture.
    chart.current?.setGuard({
      min: payload.entry - payload.atr * RAIL_HEADROOM_ATR,
      max: payload.entry + payload.atr * RAIL_HEADROOM_ATR,
    });
    chart.current?.setPrice(null);
    chart.current?.setLogical(placementView());
    chart.current?.setInteractive(true);

    // Rails open at one ATR either side — a neutral 1:1 that expresses no view. The player has
    // to move something to say anything. When the ladder arrives this is the Assist mod and
    // carries a scoring penalty; in Phase 0 it is just a starting position.
    setStop(openStop);
    setTarget(openTarget);
    setPhase('placing');
  }, [stopLoop]);

  useEffect(() => {
    if (issued.current) return;
    issued.current = true;
    void load();
  }, [load]);

  /* --------------------------------------------------------------- dragging */

  const onDrag = useCallback(
    (rail: Rail, rawPrice: number) => {
      if (!round || phase !== 'placing') return;

      const price = toTick(rawPrice);
      const entry = round.entry;
      if (Math.abs(price - entry) < TICK_SIZE) return; // a level on the entry is not an order

      // Direction is implied by the stop's side of the entry, so dragging a rail across the
      // entry flips the trade. The other rail reflects, which keeps the reward-to-risk the
      // player had already chosen instead of silently producing an invalid bracket.
      if (rail === 'stop') {
        const flipped = price < entry !== stop < entry;
        const nextTarget = flipped ? toTick(entry + (entry - target)) : target;
        setStop(price);
        if (flipped) setTarget(nextTarget);
        railsRef.current = [price, nextTarget];
      } else {
        const flipped = price > entry !== target > entry;
        const nextStop = flipped ? toTick(entry + (entry - stop)) : stop;
        setTarget(price);
        if (flipped) setStop(nextStop);
        railsRef.current = [nextStop, price];
      }
    },
    [round, phase, stop, target],
  );

  const resetView = useCallback(() => {
    chart.current?.setLogical(placementView());
  }, []);

  /* ---------------------------------------------------------------- reveal */

  const runReveal = useCallback(() => {
    const total = reveal.current.length;
    const chartApi = chart.current;
    if (!chartApi || total === 0) return;

    revealedRef.current = 0;
    setRevealed(0);
    chartApi.setInteractive(false);

    // Seed the camera wherever the player left the chart, so the cut to the close-up is a move
    // from their view rather than a jump from an assumed one.
    const logical = chartApi.getLogical();
    const price = chartApi.getPrice();
    const opening = focusView();
    const camera: View = {
      from: logical?.from ?? opening.from,
      to: logical?.to ?? opening.to,
      ...(price ?? priceExtent(shown.current, opening.from, opening.to, railsRef.current)),
    };

    let last = performance.now();
    let carry = 0;

    const tick = (now: number) => {
      // Clamped so a backgrounded tab does not dump a hundred bars in one frame.
      const dt = Math.min(now - last, 64);
      last = now;

      if (revealedRef.current < total && !pausedRef.current) {
        carry += dt;
        const perBar = SPEEDS[speedRef.current].ms;
        while (carry >= perBar && revealedRef.current < total) {
          carry -= perBar;
          const index = revealedRef.current;
          const bar = reveal.current[index];
          chartApi.revealHour(bar, LEAD_IN_BARS + index);
          shown.current.push(bar);
          revealedRef.current = index + 1;

          const outcome = resultRef.current;
          if (outcome && outcome.outcome !== 'pass' && outcome.exitBarIndex === index) {
            chartApi.markExit(
              index,
              outcome.outcome === 'target' ? 'target' : outcome.outcome === 'stop' ? 'stop' : 'close',
              outcome.outcome === 'target' ? '#26a69a' : '#ef5350',
            );
            if (outcome.outcome === 'target' || outcome.outcome === 'stop') {
              setHitFlash(outcome.outcome);
            }
          }
        }
        setRevealed(revealedRef.current);
      }

      const done = revealedRef.current >= total;
      const target = done
        ? finalView(shown.current, railsRef.current)
        : revealTarget(revealedRef.current, total, shown.current, railsRef.current);

      step(camera, target, dt);
      chartApi.setLogical({ from: camera.from, to: camera.to });
      chartApi.setPrice({ min: camera.min, max: camera.max });

      if (done && settled(camera, target)) {
        // Hand the chart back: autoscale returns, the resolution unfreezes, and the player can
        // zoom into the result down to the minute.
        chartApi.setPrice(null);
        chartApi.setInteractive(true);
        setPhase('done');
        frame.current = null;
        return;
      }

      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
  }, []);

  /* -------------------------------------------------------------- committing */

  const submit = useCallback(
    async (body: { stop: number; target: number } | { pass: true }) => {
      if (!round || phase !== 'placing') return;
      setPhase('committing');

      const response = await fetch(`/api/round/${round.roundId}/order`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({ error: 'Could not commit.' }));
        setError(failure.error ?? 'Could not commit the order.');
        setPhase('error');
        return;
      }

      const payload: RevealPayload = await response.json();
      setResult(payload.result);
      resultRef.current = payload.result;
      reveal.current = payload.revealBars;
      setRevealTotal(payload.revealBars.length);
      railsRef.current =
        payload.result.stop !== null && payload.result.target !== null
          ? [payload.result.stop, payload.result.target]
          : [];

      if (payload.detail) {
        minutes.current = [...minutes.current, ...unpackDetail(fromBase64(payload.detail))];
        chart.current?.setDetail(minutes.current, LEAD_IN_BARS);
      }

      setPhase('revealing');
      runReveal();
    },
    [round, phase, runReveal],
  );

  const skip = useCallback(() => {
    if (phase !== 'revealing') return;
    const chartApi = chart.current;
    if (!chartApi) return;

    for (let i = revealedRef.current; i < reveal.current.length; i++) {
      chartApi.revealHour(reveal.current[i], LEAD_IN_BARS + i);
      shown.current.push(reveal.current[i]);
    }
    const outcome = resultRef.current;
    if (outcome && outcome.outcome !== 'pass' && outcome.exitBarIndex !== null) {
      chartApi.markExit(
        outcome.exitBarIndex,
        outcome.outcome === 'target' ? 'target' : 'stop',
        outcome.outcome === 'target' ? '#26a69a' : '#ef5350',
      );
    }
    revealedRef.current = reveal.current.length;
    setRevealed(reveal.current.length);
    setPaused(false);
  }, [phase]);

  /** Re-run the reveal on the same chart. No server round trip; nothing is re-scored. */
  const replay = useCallback(() => {
    if (!round || (phase !== 'done' && phase !== 'revealing')) return;
    stopLoop();
    chart.current?.clearMarks();
    chart.current?.setBars(round.bars);
    chart.current?.setDetail(minutes.current, LEAD_IN_BARS);
    shown.current = [...round.bars];
    setHitFlash(null);
    setPaused(false);
    setPhase('revealing');
    runReveal();
  }, [round, phase, runReveal, stopLoop]);

  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();

      if (phase === 'placing') {
        if (event.key === 'Enter') void submit({ stop, target });
        if (key === 'p') void submit({ pass: true });
        if (key === 'r') resetView();
      }
      if (phase === 'revealing') {
        if (event.key === ' ') {
          event.preventDefault();
          setPaused((value) => !value);
        }
        if (key === 's') skip();
      }
      if (phase === 'done') {
        if (event.key === 'Enter') void load();
        if (key === 'r') replay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, stop, target, submit, skip, load, replay, resetView]);

  /** The outcome flash fades itself out. */
  useEffect(() => {
    if (!hitFlash) return;
    const timer = setTimeout(() => setHitFlash(null), 900);
    return () => clearTimeout(timer);
  }, [hitFlash]);

  /* -------------------------------------------------------------- rendering */

  const risk = round ? Math.abs(round.entry - stop) : 0;
  const reward = round ? Math.abs(target - round.entry) : 0;
  const rr = risk > 0 ? reward / risk : 0;
  const stopAtr = round && round.atr > 0 ? risk / round.atr : 0;
  const isLong = round ? stop < round.entry : true;
  const locked = phase !== 'placing';

  // The decision bar is the last lead-in candle, so its clock is the origin plus 79 hours.
  const decisionSeconds = round
    ? decisionClockSeconds(round.startDayOfWeek, round.startHourUtc, LEAD_IN_BARS)
    : 0;
  const decisionClock = clockAt(decisionSeconds);
  const decisionClockLabel = formatClock(decisionSeconds);

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-[0.2em] text-slate-200">HINDSIGHT</h1>
          <span className="text-[10px] tracking-widest text-slate-600">PHASE 0</span>
        </div>
        {round && (
          <div className="flex items-center gap-2 text-[11px]">
            {/* §3.1: volatility scale is never hidden, at any tier. */}
            <span className="rounded bg-sky-500/10 px-2 py-1 font-mono text-sky-300 ring-1 ring-sky-500/25">
              1 ATR = {round.atr.toFixed(2)} units
            </span>
            {/*
              * Weekday and hour of the decision bar. Session and weekend structure is readable
              * information; the date it belongs to is not released (§12.2, src/lib/clock.ts).
              */}
            <span
              className={`rounded px-2 py-1 font-mono ring-1 ${
                decisionClock.weekend
                  ? 'bg-amber-500/10 text-amber-300 ring-amber-500/25'
                  : 'bg-white/5 text-slate-300 ring-white/10'
              }`}
              title={decisionClock.weekend ? 'Weekend — thinner books' : 'Weekday'}
            >
              {decisionClockLabel} UTC
            </span>
            <label className="relative flex items-center">
              <span className="sr-only">Chart resolution</span>
              <select
                value={tier}
                onChange={(event) => setTier(Number(event.target.value))}
                title={
                  'Chart resolution. The hour is the decision timeframe: it fixes the entry, ' +
                  'the ATR and how long the trade runs. Fills resolve on the 1-minute path ' +
                  'whichever timeframe you pick.'
                }
                className={`cursor-pointer appearance-none rounded py-1 pl-2 pr-6 font-mono ring-1 transition-colors focus:outline-none focus:ring-2 ${
                  tier === DISPLAY_TIER
                    ? 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10'
                    : 'bg-violet-500/10 text-violet-300 ring-violet-500/25 hover:bg-violet-500/20'
                }`}
              >
                {TIERS.map((option) => (
                  <option key={option.minutes} value={option.minutes} className="bg-slate-900">
                    {option.label}
                    {option.minutes === DISPLAY_TIER ? '  ·  decision' : ''}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-1.5 text-[8px] text-slate-500">
                ▼
              </span>
            </label>
            <span className="hidden rounded bg-white/5 px-2 py-1 font-mono text-slate-400 sm:inline">
              tick {round.tickSize}
            </span>
          </div>
        )}
      </header>

      <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-lg border border-white/10 bg-slate-950/40">
        <Chart ref={chart} className="absolute inset-0" />

        {round && phase !== 'loading' && phase !== 'error' && (
          <TradeOverlay
            chart={chart}
            entry={round.entry}
            stop={phase === 'placing' ? stop : (result?.stop ?? stop)}
            target={phase === 'placing' ? target : (result?.target ?? target)}
            locked={locked}
            hidden={result?.outcome === 'pass'}
            onDrag={onDrag}
          />
        )}

        {/* A brief wash of the outcome colour when the level is touched. */}
        {hitFlash && (
          <div
            className={`pointer-events-none absolute inset-0 z-20 hs-flash ${
              hitFlash === 'target' ? 'bg-emerald-400/20' : 'bg-rose-500/20'
            }`}
          />
        )}

        {/* bottom-9 keeps this clear of the time axis, which now occupies the bottom strip. */}
        {phase === 'placing' && (
          <div className="pointer-events-none absolute bottom-9 left-1/2 z-20 -translate-x-1/2 hs-fade rounded-full bg-slate-950/70 px-3 py-1 text-[10px] tracking-wide text-slate-500 ring-1 ring-white/5">
            scroll to zoom · drag to pan · pick a timeframe above · drag the rails to set your bracket
          </div>
        )}

        {phase === 'loading' && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/60 text-sm text-slate-500">
            <span className="hs-pulse">dealing a chart…</span>
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 z-20 grid place-items-center p-6 text-center">
            <div>
              <p className="text-sm text-rose-300">{error}</p>
              <button
                onClick={() => void load()}
                className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      {(phase === 'placing' || phase === 'committing') && round && (
        <div className="hs-rise flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-slate-900/60 p-3">
          <div className="flex gap-4 font-mono text-xs tabular-nums text-slate-400">
            <span>
              <span className="text-slate-600">side </span>
              <span className={isLong ? 'text-emerald-400' : 'text-rose-400'}>
                {isLong ? 'long' : 'short'}
              </span>
            </span>
            <span>
              <span className="text-slate-600">stop </span>
              {stopAtr.toFixed(2)} ATR
            </span>
            <span>
              <span className="text-slate-600">R:R </span>1:{rr.toFixed(2)}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={resetView}
              disabled={phase === 'committing'}
              className="rounded-md border border-white/10 px-2.5 py-2 text-xs text-slate-500 transition hover:bg-white/5 hover:text-slate-300 disabled:opacity-40"
              title="Reset zoom"
            >
              Reset view <kbd className="ml-1 text-[10px] text-slate-600">R</kbd>
            </button>
            <button
              onClick={() => void submit({ pass: true })}
              disabled={phase === 'committing'}
              className="rounded-md border border-white/15 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 disabled:opacity-40"
            >
              Pass <kbd className="ml-1 text-[10px] text-slate-600">P</kbd>
            </button>
            <button
              onClick={() => void submit({ stop, target })}
              disabled={phase === 'committing'}
              className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white active:scale-[0.98] disabled:opacity-60"
            >
              {phase === 'committing' ? 'Committing…' : 'Commit'}
              {phase !== 'committing' && (
                <kbd className="ml-1 text-[10px] text-slate-500">⏎</kbd>
              )}
            </button>
          </div>
        </div>
      )}

      {phase === 'revealing' && (
        <div className="hs-rise flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/60 p-3">
          <button
            onClick={() => setPaused((value) => !value)}
            className="w-16 rounded-md border border-white/15 px-2 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
          >
            {paused ? 'Play' : 'Pause'}
          </button>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-sky-400/70 transition-[width] duration-100 ease-linear"
              style={{ width: `${revealTotal ? (revealed / revealTotal) * 100 : 0}%` }}
            />
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-500">
            {revealed}/{revealTotal}
          </span>
          <div className="flex gap-0.5">
            {SPEEDS.map((option, index) => (
              <button
                key={option.label}
                onClick={() => setSpeed(index)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                  speed === index
                    ? 'bg-white/10 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            onClick={skip}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5"
          >
            Skip <kbd className="ml-1 text-[10px] text-slate-600">S</kbd>
          </button>
        </div>
      )}

      {phase === 'done' && result && (
        <ResultCard result={result} onNext={() => void load()} onReplay={replay} />
      )}
    </div>
  );
}
