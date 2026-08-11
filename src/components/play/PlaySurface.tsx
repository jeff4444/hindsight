'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Bar } from '@/core/bars';
import { fromBase64, unpackDetail } from '@/core/pack';
import { TICK_SIZE, toTick } from '@/core/normalize';
import { clockAt, decisionClockSeconds, formatClock } from '@/lib/clock';
import { DECISION_TF } from '@/lib/timeframe';
import { useHotkeys } from '@/lib/useHotkeys';
import { useReducedMotion } from '@/lib/useTween';
import { useBeats } from '@/lib/useBeats';
import type {
  ChartProvenance,
  DailyPayload,
  RankedPayload,
  RevealPayload,
  RoundPayload,
  RoundResult,
  ScorePayload,
} from '@/lib/api-types';
import { CAMERA_TAU_MS, DEFAULT_WINDOW, placementView, type Window } from '@/lib/camera';
import { type ChartHandle } from '../Chart';
import { ResultConsole } from './ResultConsole';
import { type Rail } from '../TradeOverlay';
import { Chip } from '../ui';
import { Dialog, Live } from '../ui/client';
import { Icon } from '../ui/icons';
import { ChartFrame } from './ChartFrame';
import { DailyCeremony } from './DailyCeremony';
import { OrderConsole, HotkeyHint } from './OrderConsole';
import { TransportConsole } from './TransportConsole';
import { TimeframeControl } from './TimeframeControl';
import { DailyPips } from './DailyPips';
import { DecisionClock } from './DecisionClock';
import {
  FrameControls,
  HotkeyLegend,
  InstrumentWatermark,
  LiveR,
  ScoreStage,
  runningR,
  type Running,
} from './layers';
import { RankedSummary } from './RankedSummary';
import { DEFAULT_SPEED, useRevealLoop } from './useRevealLoop';

export type Phase =
  | 'loading'
  | 'placing'
  | 'committing'
  | 'revealing'
  | 'done'
  | 'summary'
  | 'error';
export type Mode = 'daily' | 'tape' | 'ranked';

/** Vertical headroom kept reachable for the rails, in ATR. */
const RAIL_HEADROOM_ATR = 3.5;

/**
 * The beats of a commit, in milliseconds from the click.
 *
 *   0    the rails seal and the camera starts easing to the close-up
 *   320  a held beat — nothing moves, which is what makes the first candle land
 *   560  the transport arrives and the reveal begins
 *
 * One rAF clock rather than three timers: under load, independent `setTimeout`s drift apart and
 * the sequence reads as three unrelated animations instead of one move.
 */
const COMMIT_BEATS = [0, 320, 560] as const;

const EMPTY_RUNNING: Running = { r: null, mfe: 0, mae: 0, frozen: null };

/**
 * The play surface.
 *
 * Everything stateful about a round lives here: the chart handle, the mutable mirrors the reveal
 * loop reads, the phase machine and the two fetches. The panels around it are presentational and
 * receive props, which is the whole point of the split — the loop is the part that is delicate,
 * and it is now the only part that is.
 *
 * The layout is a three-row grid whose middle row — the chart — has a **fixed height per
 * breakpoint and never changes between phases**. That is load-bearing rather than tidy. While the
 * chart was `flex-1`, every console that mounted underneath it shrank the chart, and
 * lightweight-charts had already sized its internal table to the taller box: the time axis ended
 * up laid out below the frame's own bottom edge and clipped away. It also meant the chart resized
 * at the exact moment the reveal camera cut, which is the one frame in the product that must not
 * stutter. The console scrolls inside its own row instead.
 */
/** The issuance query for a tape round: the tape, plus whatever ruleset the launcher was set to. */
function tapeQuery(tape: string, ruleset: { tier?: string; mods?: string }) {
  const query = new URLSearchParams({ tape });
  if (ruleset.tier) query.set('tier', ruleset.tier);
  if (ruleset.mods) query.set('mods', ruleset.mods);
  return query.toString();
}

export function PlaySurface({
  mode,
  tape = 'open',
  fresh = false,
  tier,
  mods,
}: {
  mode: Mode;
  tape?: string;
  /** Ranked only: start a new session rather than resuming the last one. */
  fresh?: boolean;
  /**
   * Tape only: the ruleset `TapeLaunch` was set to, carried through the URL.
   *
   * Passed straight back to `/api/round`, which is where it is validated — `tierByCode` falls back
   * to the default for anything it does not recognise, so a hand-edited query string can pick a
   * different ruleset but not an invalid one. The daily and ranked rulesets are the server's to
   * choose and are deliberately not forwarded.
   */
  tier?: string;
  /** Tape only: §3.3's mods, comma-separated, layered on the tier. Validated server-side too. */
  mods?: string;
}) {
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
  const [daily, setDaily] = useState<DailyPayload | null>(null);
  const [ranked, setRanked] = useState<RankedPayload | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [revealTotal, setRevealTotal] = useState(0);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [paused, setPaused] = useState(false);
  const [hitFlash, setHitFlash] = useState<'target' | 'stop' | null>(null);
  const [touched, setTouched] = useState<'target' | 'stop' | null>(null);
  const [running, setRunning] = useState<Running>(EMPTY_RUNNING);
  const [hintShown, setHintShown] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [stageVisible, setStageVisible] = useState(false);
  /** The clock's full length, kept so the ring knows what fraction is left. */
  const [clockTotal, setClockTotal] = useState<number | null>(null);
  // Renamed from `tier` when the ladder landed: a tier is now a *ruleset*, and the thing this
  // selects is a drawing resolution.
  const [timeframe, setTimeframe] = useState<number>(DECISION_TF);

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
  const timeframeRef = useRef(DECISION_TF);
  const modeRef = useRef<Mode>(mode);
  const tapeRef = useRef(tape);
  const rulesetRef = useRef({ tier, mods });
  /** Set once from the URL: a fresh ranked session is asked for, not assumed. */
  const freshRef = useRef(false);
  const frame = useRef<number | null>(null);
  const tauRef = useRef(CAMERA_TAU_MS);
  const entryRef = useRef(0);
  /** What this round actually issued. A tier can grant 60, 80 or 300 candles of history. */
  const windowRef = useRef<Window>(DEFAULT_WINDOW);
  // The clock's expiry callback is created once and must not be rebuilt every render, or the
  // countdown would restart from the current remaining time on every state change.
  const phaseRef = useRef<Phase>('loading');
  const submitRef = useRef<(() => void) | null>(null);

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
    timeframeRef.current = timeframe;
    chart.current?.setTier(timeframe);
  }, [timeframe]);

  useEffect(() => {
    modeRef.current = mode;
    tapeRef.current = tape;
    freshRef.current = fresh;
    rulesetRef.current = { tier, mods };
  }, [mode, tape, fresh, tier, mods]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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
      window: windowRef,
    },
    {
      // The running R is computed here rather than inside the loop, so the loop stays the one
      // piece of this screen that only knows about bars and a camera.
      onRevealed: (count) => {
        setRevealed(count);
        setRunning(runningR(reveal.current, count, entryRef.current, resultRef.current));
      },
      onHit: (kind) => {
        setTouched(kind);
        if (!reducedMotion) setHitFlash(kind);
      },
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
    setTouched(null);
    setRunning(EMPTY_RUNNING);
    setStageVisible(false);
    setHintShown(true);
    revealedRef.current = 0;
    reveal.current = [];
    chart.current?.clearMarks();
    chart.current?.setPrice(null);

    // The daily is a five-chart session (§10.1 plus §4.4's card); free play is unlimited.
    //
    // The tape branch carries the ruleset the player chose on the tape page. Without it every tape
    // round came back at the default tier however the launcher was set, so the whole ladder was
    // unreachable outside ranked — the query string was built and then dropped on the floor.
    const endpoint =
      modeRef.current === 'daily'
        ? '/api/daily'
        : modeRef.current === 'ranked'
          ? '/api/ranked'
          : `/api/round?${tapeQuery(tapeRef.current, rulesetRef.current)}`;
    const response = await fetch(endpoint, { method: 'POST' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: 'Could not reach the server.' }));
      setError(body.error ?? 'Could not issue a round.');
      setPhase('error');
      return;
    }

    let payload: RoundPayload;
    if (modeRef.current === 'ranked') {
      const session: RankedPayload = await response.json();
      setRanked(session);
      setDaily(null);
      if (session.complete || !session.round) {
        setPhase('summary');
        return;
      }
      payload = session.round;
    } else if (modeRef.current === 'daily') {
      const session: DailyPayload = await response.json();
      setDaily(session);
      if (session.complete || !session.round) {
        setPhase('summary');
        return;
      }
      payload = session.round;
    } else {
      setDaily(null);
      setRanked(null);
      payload = await response.json();
    }
    freshRef.current = false;
    setRound(payload);
    entryRef.current = payload.entry;
    windowRef.current = { leadIn: payload.bars.length, reveal: payload.revealBarCount };

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
    chart.current?.setDetail(minutes.current, windowRef.current.leadIn);
    chart.current?.setTier(timeframeRef.current);
    // Autoscale to the visible candles, widened so the rails stay reachable however far the
    // player drags them. This is what makes zooming feel like a chart rather than a picture.
    chart.current?.setGuard({
      min: payload.entry - payload.atr * RAIL_HEADROOM_ATR,
      max: payload.entry + payload.atr * RAIL_HEADROOM_ATR,
    });
    chart.current?.setPrice(null);
    chart.current?.setLogical(placementView(windowRef.current));
    chart.current?.setInteractive(true);

    // Rails open at one ATR either side — a neutral 1:1 that expresses no view. The player has
    // to move something to say anything. When the ladder arrives this is the Assist mod and
    // carries a scoring penalty; for now it is just a starting position.
    // A stricter tier may not permit whatever was selected on the previous round, and leaving a
    // disallowed timeframe selected would draw candles the ruleset does not grant.
    if (!payload.timeframes.includes(timeframeRef.current)) {
      const fallback = payload.timeframes.includes(DECISION_TF)
        ? DECISION_TF
        : (payload.timeframes[0] ?? DECISION_TF);
      timeframeRef.current = fallback;
      setTimeframe(fallback);
      chart.current?.setTier(fallback);
    }

    setStop(openStop);
    setTarget(openTarget);
    setClockTotal(payload.clockMs);
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
      setHintShown(false);

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

  /**
   * The clock ran out.
   *
   * The order on screen is submitted rather than the round being abandoned. The server checks the
   * deadline against its own clock and marks the round forfeited if it was late — so this cannot
   * rescue a slow decision, it only stops a player sitting on an expired chart forever. Committing
   * is also the honest reading of "set and forget": the rails were where they were when time ran
   * out.
   */
  const onClockExpired = useCallback(() => {
    if (phaseRef.current !== 'placing') return;
    void submitRef.current?.();
  }, []);

  const resetView = useCallback(() => {
    chart.current?.setLogical(placementView(windowRef.current));
  }, []);

  /* -------------------------------------------------------------- committing */

  const submit = useCallback(
    async (body: { stop: number; target: number } | { pass: true }) => {
      if (!round || phase !== 'placing') return;
      // Set before the await, so the seal and the camera pre-roll play during the network round
      // trip rather than after it. The animation costs nothing and the latency is free.
      setPhase('committing');
      loop.prime();

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
        chart.current?.setDetail(minutes.current, windowRef.current.leadIn);
      }

      setPhase('revealing');
      loop.start();
    },
    [round, phase, loop],
  );

  useEffect(() => {
    submitRef.current = () => void submit({ stop, target });
  }, [submit, stop, target]);

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
    chart.current?.setDetail(minutes.current, windowRef.current.leadIn);
    shown.current = [...round.bars];
    setHitFlash(null);
    setTouched(null);
    setRunning(EMPTY_RUNNING);
    setStageVisible(false);
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
        if (phase !== 'placing') return;
        const allowed = (round?.mayPass ?? true) && (ranked ? ranked.mayPass : true);
        if (allowed) void submit({ pass: true });
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

  /**
   * The score lands on the chart, holds, and clears.
   *
   * It is deliberately transient. The R-multiple belongs to the chart — it is a number about the
   * trade that just resolved, and it means most while that trade is still the thing on screen —
   * but leaving it there would compete with the debrief for the rest of the round.
   */
  useEffect(() => {
    if (phase !== 'done' || !result) return;
    const show = setTimeout(() => setStageVisible(true), 80);
    const hide = setTimeout(() => setStageVisible(false), 2600);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [phase, result]);

  const beats = useBeats(COMMIT_BEATS, [phase === 'committing' || phase === 'revealing']);

  /**
   * What a screen reader is told, derived rather than stored.
   *
   * The whole state machine here is conveyed by animation, so without this a screen-reader user
   * gets silence between pressing Commit and arriving at a result. Deriving it from the phase and
   * the result — instead of pushing a string from each handler — means there is no way for the
   * announcement and the screen to disagree, and no setState in an effect to arrange it.
   */
  // Derived from `round` rather than read off `windowRef`, so this stays a pure render.
  const announcement = describe(
    phase,
    result,
    round ? { leadIn: round.bars.length, reveal: round.revealBarCount } : DEFAULT_WINDOW,
  );

  /* -------------------------------------------------------------- rendering */

  const risk = round ? Math.abs(round.entry - stop) : 0;
  const reward = round ? Math.abs(target - round.entry) : 0;
  const rr = risk > 0 ? reward / risk : 0;
  const stopAtr = round && round.atr > 0 ? risk / round.atr : 0;
  const isLong = round ? stop < round.entry : true;
  const locked = phase !== 'placing';
  const passed = result?.outcome === 'pass';

  // The decision bar is the last lead-in candle, so its clock is the origin plus 79 hours.
  const decisionSeconds = round
    ? decisionClockSeconds(round.startDayOfWeek, round.startHourUtc, round.bars.length)
    : 0;
  const decisionClock = clockAt(decisionSeconds);
  const tapeName = tape === 'open' ? 'The Open Tape' : tape.replace(/-/g, ' ');

  const stageR = result?.rMultiple;
  const stageTone = passed
    ? 'restraint'
    : stageR === null || stageR === undefined
      ? 'neutral'
      : stageR > 0.005
        ? 'gain'
        : stageR < -0.005
          ? 'loss'
          : 'neutral';

  return (
    <div
      className={[
        'mx-auto grid min-h-dvh w-full max-w-(--container-stage) grid-rows-[auto_auto_1fr] gap-2 p-2 sm:gap-3 sm:p-4',
        // A fixed stage per breakpoint. Never per phase — see the note on this component.
        '[--stage-h:clamp(17rem,50dvh,26rem)]',
        'sm:[--stage-h:clamp(20rem,54dvh,30rem)]',
        'lg:[--stage-h:clamp(24rem,58dvh,42rem)]',
        'xl:[--stage-h:clamp(28rem,60dvh,47.5rem)]',
      ].join(' ')}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        {/* The play surface had no heading at all, so the one screen the whole product is built
            around was absent from the document outline. It is visually redundant — the chart is
            self-evidently the chart — so it is a screen-reader-only h1 rather than a title bar
            taking vertical space away from the stage. */}
        <h1 className="sr-only">
          {mode === 'daily'
            ? daily
              ? `Daily #${daily.day}, chart ${Math.min(daily.played + 1, daily.total)} of ${daily.total}`
              : 'Today\u2019s daily'
            : tapeName}
        </h1>
        <div className="flex items-center gap-3">
          {/* The way out. During a round the chart owns the screen, so this is the only
              navigation on it — §3.1's clock is running and a nav rail is a distraction. */}
          <Link
            href={mode === 'tape' ? '/tapes' : '/home'}
            className="text-ink-dim hover:text-ink-hi press flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors"
          >
            <Icon name="arrow-left" size={14} />
            {mode === 'tape' ? 'Tapes' : 'Home'}
          </Link>
          {mode === 'ranked' && ranked ? (
            <DailyPips played={ranked.played} total={ranked.total} label="RANKED" />
          ) : mode === 'daily' && daily ? (
            <DailyPips played={daily.played} total={daily.total} day={daily.day} />
          ) : (
            <Chip tone="neutral" className="hidden sm:inline-flex">
              {tapeName}
            </Chip>
          )}
        </div>
        {round && (
          <div className="flex items-center gap-2">
            <TimeframeControl
              timeframe={timeframe}
              onTimeframe={setTimeframe}
              allowed={round.timeframes}
              tierCode={round.tier}
            />
            {phase === 'placing' && round.clockMs !== null && clockTotal !== null && (
              <DecisionClock
                totalMs={clockTotal}
                remainingMs={round.clockMs}
                onExpire={onClockExpired}
              />
            )}
          </div>
        )}
      </header>

      {/* No stage on the summary: there is no round to draw, and an empty chart frame above the
          ceremony reads as something that failed to load. The ceremony owns the screen. */}
      {phase !== 'summary' && (
      <ChartFrame
        className="h-(--stage-h)"
        chartRef={chart}
        entry={round?.entry ?? null}
        stop={phase === 'placing' ? stop : (result?.stop ?? stop)}
        target={phase === 'placing' ? target : (result?.target ?? target)}
        locked={locked}
        railsHidden={passed}
        showRails={Boolean(round) && phase !== 'loading' && phase !== 'error'}
        onDrag={onDrag}
        hitFlash={hitFlash}
        hint={
          phase === 'placing' && hintShown
            ? 'drag the rails to set your bracket · scroll to zoom · drag to pan'
            : null
        }
        loading={phase === 'loading'}
        error={phase === 'error' ? error : null}
        onRetry={() => void load()}
      >
        {round && phase !== 'loading' && phase !== 'error' && (
          <InstrumentWatermark
            atr={round.atr}
            tickSize={round.tickSize}
            clockLabel={formatClock(decisionSeconds)}
            weekend={decisionClock.weekend}
          />
        )}

        {/* The held beat. Nothing moves for 240ms, which is what makes the first candle land.
            The animation goes on the positioned overlay itself rather than on an inner span —
            an animating element inside the frame is safe precisely because it is positioned and
            therefore a sibling of the rail layer, and keeping the animation on that element makes
            the reason legible rather than leaving a bare animated child to be puzzled over. */}
        {phase === 'committing' && beats.at(1) && !beats.at(2) && (
          <div className="animate-fade eyebrow text-ink-dim pointer-events-none absolute inset-x-0 bottom-16 z-20 text-center">
            The next sixty hours
          </div>
        )}

        {/* Only while it is still running. Once the round is done the ScoreStage says it once,
            loudly, and the result console keeps it — three copies of the same R-multiple on one
            screen is what this layer was supposed to prevent. */}
        {phase === 'revealing' && (
          <LiveR r={running.r} mfe={running.mfe} mae={running.mae} frozen={running.frozen} passed={passed} />
        )}

        {phase === 'done' && result && (
          <ScoreStage
            show={stageVisible}
            label={passed ? 'Stood aside' : outcomeLabel(result.outcome)}
            value={
              passed || stageR === null || stageR === undefined
                ? '0.00R'
                : `${stageR >= 0 ? '+' : ''}${stageR.toFixed(2)}R`
            }
            tone={stageTone}
            detail={
              passed || result.mfeR === null
                ? null
                : `MFE ${result.mfeR >= 0 ? '+' : ''}${result.mfeR.toFixed(2)}R · MAE ${(result.maeR ?? 0).toFixed(2)}R`
            }
          />
        )}

        {(phase === 'placing' || phase === 'done') && (
          <FrameControls onResetView={resetView} onHelp={() => setHelpOpen(true)} />
        )}
      </ChartFrame>
      )}

      <section className="min-h-0 overflow-y-auto">
        {(phase === 'placing' || phase === 'committing') && round && (
          <>
            <OrderConsole
              isLong={isLong}
              stopAtr={stopAtr}
              rr={rr}
              busy={phase === 'committing'}
              mayPass={round.mayPass && (ranked ? ranked.mayPass : true)}
              passesLeft={ranked ? ranked.passesLeft : null}
              onPass={() => void submit({ pass: true })}
              onCommit={() => void submit({ stop, target })}
            />
            <HotkeyHint />
          </>
        )}

        {phase === 'revealing' && (
          <TransportConsole
            revealed={revealed}
            total={revealTotal}
            paused={paused}
            speed={speed}
            outcome={touched}
            onTogglePause={() => setPaused((value) => !value)}
            onSpeed={setSpeed}
            onSkip={skip}
          />
        )}

        {phase === 'summary' && daily && <DailyCeremony daily={daily} />}
        {phase === 'summary' && ranked && <RankedSummary ranked={ranked} />}

        {phase === 'done' && result && (
          <ResultConsole
            result={result}
            provenance={provenance}
            score={score}
            atr={round?.atr ?? null}
            nextLabel={daily && daily.played + 1 >= daily.total ? 'See your card' : 'Next chart'}
            onNext={() => void load()}
            onReplay={replay}
          />
        )}
      </section>

      <Live message={announcement} />

      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Keyboard"
        description="The loop is built to be played without the mouse leaving the chart."
      >
        <HotkeyLegend />
      </Dialog>
    </div>
  );
}

/**
 * The live-region text for a phase. Spelled out, because a reader says "R" better than "+2.4R".
 *
 * The counts are read off the round rather than written into the sentence: since the ladder, a
 * tier grants sixty, eighty or three hundred candles of history, so a hardcoded "eighty" was
 * simply a lie to the one person on the screen who cannot see how many there are.
 */
function describe(phase: Phase, result: RoundResult | null, window: Window): string | null {
  if (phase === 'placing')
    return `New chart. ${window.leadIn} candles of history. Place a stop and a target.`;
  if (phase === 'committing') return `Order sent. Revealing the next ${window.reveal} candles.`;
  if (phase !== 'done' || !result) return null;
  if (result.outcome === 'pass') return 'Passed. Zero R.';
  const r = result.rMultiple;
  const amount =
    r === null ? 'Not scored' : `${r >= 0 ? 'plus' : 'minus'} ${Math.abs(r).toFixed(2)} R`;
  return `${outcomeLabel(result.outcome)}. ${amount}.`;
}

function outcomeLabel(outcome: RoundResult['outcome']): string {
  if (outcome === 'target') return 'Target hit';
  if (outcome === 'stop') return 'Stopped out';
  if (outcome === 'pass') return 'Stood aside';
  return 'Neither — marked to market';
}
