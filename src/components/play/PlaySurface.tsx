'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bar } from '@/core/bars';
import { LEAD_IN_BARS } from '@/core/config';
import { fromBase64, unpackDetail } from '@/core/pack';
import { TICK_SIZE, toTick } from '@/core/normalize';
import { clockAt, decisionClockSeconds, formatClock } from '@/lib/clock';
import { DISPLAY_TIER } from '@/lib/resolution';
import { useHotkeys } from '@/lib/useHotkeys';
import { useReducedMotion } from '@/lib/useTween';
import type {
  ChartProvenance,
  DailyPayload,
  RevealPayload,
  RoundPayload,
  RoundResult,
  ScorePayload,
} from '@/lib/api-types';
import { CAMERA_TAU_MS, placementView } from '@/lib/camera';
import { type ChartHandle } from '../Chart';
import { ResultCard } from '../ResultCard';
import { type Rail } from '../TradeOverlay';
import { Segmented } from '../ui';
import { ChartFrame } from './ChartFrame';
import { ChartMetaBar } from './ChartMetaBar';
import { DailySummary } from './DailySummary';
import { OrderReadout, PlacementBar } from './PlacementBar';
import { RevealTransport } from './RevealTransport';
import { DEFAULT_SPEED, useRevealLoop } from './useRevealLoop';

export type Phase =
  | 'loading'
  | 'placing'
  | 'committing'
  | 'revealing'
  | 'done'
  | 'summary'
  | 'error';
export type Mode = 'daily' | 'free';

/** Vertical headroom kept reachable for the rails, in ATR. */
const RAIL_HEADROOM_ATR = 3.5;

/**
 * The play surface.
 *
 * Everything stateful about a round lives here: the chart handle, the mutable mirrors the reveal
 * loop reads, the phase machine and the two fetches. The panels around it are presentational and
 * receive props, which is the whole point of the split — the loop is the part that is delicate,
 * and it is now the only part that is.
 */
export function PlaySurface() {
  const chart = useRef<ChartHandle>(null);
  const issued = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [stop, setStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [provenance, setProvenance] = useState<ChartProvenance | null>(null);
  const [score, setScore] = useState<ScorePayload | null>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [daily, setDaily] = useState<DailyPayload | null>(null);
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
  const modeRef = useRef<Mode>('daily');
  const frame = useRef<number | null>(null);
  const tauRef = useRef(CAMERA_TAU_MS);

  // The reveal still reveals under reduced motion; only the camera's glide is removed.
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    tauRef.current = reducedMotion ? 1 : CAMERA_TAU_MS;
  }, [reducedMotion]);

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

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const loop = useRevealLoop(
    {
      chart,
      reveal,
      shown,
      rails: railsRef,
      revealed: revealedRef,
      speed: speedRef,
      paused: pausedRef,
      result: resultRef,
      frame,
      tau: tauRef,
    },
    {
      onRevealed: setRevealed,
      onHit: setHitFlash,
      onSettled: () => setPhase('done'),
    },
  );

  const stopLoop = loop.stop;
  useEffect(() => stopLoop, [stopLoop]);

  /* --------------------------------------------------------------- issuing */

  const load = useCallback(async () => {
    stopLoop();
    setPhase('loading');
    setError(null);
    setResult(null);
    setProvenance(null);
    setScore(null);
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

    // The daily is a five-chart session (§10.1 plus §4.4's card); free play is unlimited.
    const response = await fetch(modeRef.current === 'daily' ? '/api/daily' : '/api/round', {
      method: 'POST',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Could not reach the server.' }));
      setError(body.error ?? 'Could not issue a round.');
      setPhase('error');
      return;
    }

    let payload: RoundPayload;
    if (modeRef.current === 'daily') {
      const session: DailyPayload = await response.json();
      setDaily(session);
      if (session.complete || !session.round) {
        setPhase('summary');
        return;
      }
      payload = session.round;
    } else {
      setDaily(null);
      payload = await response.json();
    }
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
    // carries a scoring penalty; for now it is just a starting position.
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

  const switchMode = useCallback(
    (next: Mode) => {
      if (next === mode) return;
      modeRef.current = next;
      setMode(next);
      void load();
    },
    [mode, load],
  );

  const resetView = useCallback(() => {
    chart.current?.setLogical(placementView());
  }, []);

  /* -------------------------------------------------------------- committing */

  const submit = useCallback(
    async (body: { stop: number; target: number } | { pass: true }) => {
      if (!round || phase !== 'placing') return;
      // Set before the await, so the placement bar's exit and the rail lock play during the
      // network round trip rather than after it. The animation costs nothing.
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
      setProvenance(payload.provenance ?? null);
      setScore(payload.score ?? null);
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
      loop.start();
    },
    [round, phase, loop],
  );

  const skip = useCallback(() => {
    if (phase !== 'revealing') return;
    loop.skip();
    setPaused(false);
  }, [phase, loop]);

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
    loop.start();
  }, [round, phase, loop, stopLoop]);

  /* ------------------------------------------------------------- keyboard */

  useHotkeys(
    {
      Enter: () => {
        if (phase === 'placing') void submit({ stop, target });
        if (phase === 'done') void load();
      },
      p: () => {
        if (phase === 'placing') void submit({ pass: true });
      },
      r: () => {
        if (phase === 'placing') resetView();
        if (phase === 'done') replay();
      },
      ' ': (event) => {
        if (phase !== 'revealing') return;
        event.preventDefault();
        setPaused((value) => !value);
      },
      s: () => {
        if (phase === 'revealing') skip();
      },
    },
    true,
  );

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

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-ink-hi tracking-wordmark text-sm font-semibold">HINDSIGHT</h1>
          <Segmented
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'free', label: 'Free play' },
            ]}
            value={mode}
            onChange={switchMode}
          />
          {mode === 'daily' && daily && (
            <span className="text-ink-dim text-mini font-mono">
              #{daily.day} · {Math.min(daily.played + 1, daily.total)}/{daily.total}
            </span>
          )}
        </div>
        {round && (
          <ChartMetaBar
            atr={round.atr}
            tickSize={round.tickSize}
            clockLabel={formatClock(decisionSeconds)}
            weekend={decisionClock.weekend}
            tier={tier}
            onTier={setTier}
          />
        )}
      </header>

      <ChartFrame
        chartRef={chart}
        entry={round?.entry ?? null}
        stop={phase === 'placing' ? stop : (result?.stop ?? stop)}
        target={phase === 'placing' ? target : (result?.target ?? target)}
        locked={locked}
        railsHidden={result?.outcome === 'pass'}
        showRails={Boolean(round) && phase !== 'loading' && phase !== 'error'}
        onDrag={onDrag}
        hitFlash={hitFlash}
        hint={
          phase === 'placing'
            ? 'scroll to zoom · drag to pan · pick a timeframe above · drag the rails to set your bracket'
            : null
        }
        loading={phase === 'loading'}
        error={phase === 'error' ? error : null}
        onRetry={() => void load()}
      />

      {(phase === 'placing' || phase === 'committing') && round && (
        <>
          {/* Below sm the readouts leave the bar so the two 44px targets get the width. */}
          <OrderReadout isLong={isLong} stopAtr={stopAtr} rr={rr} className="sm:hidden" />
          <PlacementBar
            isLong={isLong}
            stopAtr={stopAtr}
            rr={rr}
            busy={phase === 'committing'}
            onResetView={resetView}
            onPass={() => void submit({ pass: true })}
            onCommit={() => void submit({ stop, target })}
          />
        </>
      )}

      {phase === 'revealing' && (
        <RevealTransport
          revealed={revealed}
          total={revealTotal}
          paused={paused}
          speed={speed}
          onTogglePause={() => setPaused((value) => !value)}
          onSpeed={setSpeed}
          onSkip={skip}
        />
      )}

      {phase === 'summary' && daily && (
        <DailySummary daily={daily} onKeepPlaying={() => switchMode('free')} />
      )}

      {phase === 'done' && result && (
        <ResultCard
          result={result}
          provenance={provenance}
          score={score}
          nextLabel={daily && daily.played + 1 >= daily.total ? 'See your card' : 'Next chart'}
          onNext={() => void load()}
          onReplay={replay}
        />
      )}
    </div>
  );
}
