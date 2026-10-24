'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  MatchPayload,
  RoundResult,
  RunState,
  ScorePayload,
} from '@/lib/api-types';
import { CAMERA_TAU_MS, DEFAULT_WINDOW, placementView, type Window } from '@/lib/camera';
import { candlesFor, HINDSIGHT_GOLD } from '@/lib/palette';
import { personaFor } from '@/lib/panel';
import { routes } from '@/lib/routes';
import { bestBracket } from '@/lib/verdict';
import { type ChartHandle, type Overlay } from '../Chart';
import { type Rail } from '../TradeOverlay';
import { Chip, cx } from '../ui';
import { Dialog, Live, useThemeSnapshot, useToast } from '../ui/client';
import { Icon } from '../ui/icons';
import { CallDock } from './CallDock';
import { ChartFrame } from './ChartFrame';
import { DailyCeremony } from './DailyCeremony';
import { TransportConsole } from './TransportConsole';
import { TimeframeControl } from './TimeframeControl';
import { DailyPips } from './DailyPips';
import { ClockLine, DecisionClock } from './DecisionClock';
import { RunHud, RunSummary } from './RunHud';
import { MatchHud, MatchSummary } from './MatchHud';
import {
  FogLayer,
  FrameControls,
  HotkeyLegend,
  InstrumentWatermark,
  LiveR,
  ScoreStage,
  runningR,
  type Running,
} from './layers';
import { PlayTopBar } from './PlayTopBar';
import { RankedSummary } from './RankedSummary';
import { ReviewPanel } from './ReviewPanel';
import { DEFAULT_SPEED, useRevealLoop } from './useRevealLoop';
import { InstrumentRail, INSTRUMENT_HOWTO, INSTRUMENT_LABEL } from './InstrumentRail';
import { StudiesPanel } from './StudiesPanel';
import type { Verdict } from '@/core/engines';
import { DrawLayer, type Drawing, type DrawTool } from './DrawLayer';
import { overlaysFor } from '@/lib/toolOverlays';
import { useStudySettings } from '@/lib/studySettings';
import type { ToolCode } from '@/core/tiers';

export type Phase =
  | 'loading'
  | 'placing'
  | 'committing'
  | 'revealing'
  | 'done'
  | 'summary'
  | 'error';
export type Mode = 'daily' | 'tape' | 'ranked' | 'storm' | 'streak' | 'duel' | 'race';

/** The run modes, which wrap ordinary rounds rather than replacing them. */
function isRun(mode: Mode): mode is 'storm' | 'streak' {
  return mode === 'storm' || mode === 'streak';
}

/** The match modes, which issue from a fixed sequence rather than choosing a chart. */
function isMatch(mode: Mode): mode is 'duel' | 'race' {
  return mode === 'duel' || mode === 'race';
}

/** Vertical headroom kept reachable for the rails, in ATR. */
const RAIL_HEADROOM_ATR = 3.5;

/**
 * The beats of a commit, in milliseconds from the click.
 *
 *   0    the rails seal and the camera starts easing to the close-up
 *   320  a held beat — nothing moves, which is what makes the first candle land
 *   560  the transport arrives and the reveal begins
 */
const COMMIT_BEATS = [0, 320, 560] as const;

const EMPTY_RUNNING: Running = { r: null, mfe: 0, mae: 0, frozen: null };

/** The bracket a fresh chart opens with once a side is picked, and the last one the player used. */
const DEFAULT_BRACKET = { stopAtr: 1, targetR: 2 };
const BRACKET_KEY = 'hs-bracket';

function storedBracket(): { stopAtr: number; targetR: number } {
  try {
    const raw = localStorage.getItem(BRACKET_KEY);
    if (!raw) return DEFAULT_BRACKET;
    const parsed = JSON.parse(raw) as { stopAtr?: unknown; targetR?: unknown };
    const stopAtr = typeof parsed.stopAtr === 'number' && parsed.stopAtr > 0 ? parsed.stopAtr : DEFAULT_BRACKET.stopAtr;
    const targetR = typeof parsed.targetR === 'number' && parsed.targetR > 0 ? parsed.targetR : DEFAULT_BRACKET.targetR;
    return { stopAtr, targetR };
  } catch {
    return DEFAULT_BRACKET;
  }
}

/** The issuance query for a tape round: the tape, plus whatever ruleset the launcher was set to. */
function tapeQuery(tape: string, ruleset: { tier?: string; mods?: string }) {
  const query = new URLSearchParams({ tape });
  if (ruleset.tier) query.set('tier', ruleset.tier);
  if (ruleset.mods) query.set('mods', ruleset.mods);
  return query.toString();
}

/**
 * The play surface — the stage.
 *
 * Everything stateful about a round lives here: the chart handle, the mutable mirrors the reveal
 * loop reads, the phase machine and the fetches. The panels around it are presentational.
 *
 * The loop is named on screen: **Read → Call → Reveal → Review.** The stage is always dark,
 * whatever the app theme — `data-theme="dark"` on the root re-scopes every token for this subtree,
 * because a chart is read against ink and the overlay palette is tuned for it.
 *
 * The chart's height is fixed per breakpoint and never changes between phases. That is load-bearing:
 * a chart that shrinks when a console mounts under it lays its time axis out below its own frame,
 * and it would resize at the exact moment the reveal camera cuts.
 *
 * Nothing in this file may carry a transform, filter, opacity, blur or isolation class:
 * `tests/stacking.test.ts` guards it, because any of them would put the drag rails behind the
 * canvas for hit-testing while still painting them on top.
 */
export function PlaySurface({
  mode,
  tape = 'open',
  fresh = false,
  tier,
  mods,
  match,
}: {
  mode: Mode;
  tape?: string;
  /** Ranked only: start a new session rather than resuming the last one. */
  fresh?: boolean;
  /** Tape only: the ruleset chosen on the tape page. Validated server-side. */
  tier?: string;
  /** Tape only: legacy mods, comma-separated. Validated server-side too. */
  mods?: string;
  /** Duel and race only: which match's sequence to play. */
  match?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const theme = useThemeSnapshot();
  const chart = useRef<ChartHandle>(null);
  const issued = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState<RoundPayload | null>(null);
  /** The player's side. Null until they pick one — nothing is drawn for them until then. */
  const [direction, setDirection] = useState<'long' | 'short' | null>(null);
  const [stop, setStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [nudge, setNudge] = useState(false);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [forfeited, setForfeited] = useState(false);
  const [provenance, setProvenance] = useState<ChartProvenance | null>(null);
  const [score, setScore] = useState<ScorePayload | null>(null);
  /** The Panel's reads, released with the reveal rather than at issuance. */
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  /** The stake. Null until the player makes one — an untouched control is not a forecast. */
  const [confidence, setConfidence] = useState<number | null>(null);
  const [style, setStyle] = useState<RevealPayload['style']>(null);
  const [daily, setDaily] = useState<DailyPayload | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [matchState, setMatchState] = useState<MatchPayload | null>(null);
  const [ranked, setRanked] = useState<RankedPayload | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [revealTotal, setRevealTotal] = useState(0);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [paused, setPaused] = useState(false);
  const [hitFlash, setHitFlash] = useState<'target' | 'stop' | null>(null);
  const [touched, setTouched] = useState<'target' | 'stop' | null>(null);
  const [running, setRunning] = useState<Running>(EMPTY_RUNNING);
  const [helpOpen, setHelpOpen] = useState(false);
  const [stageVisible, setStageVisible] = useState(false);
  const [clockTotal, setClockTotal] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState<number>(DECISION_TF);
  /** Review: whether the best trade in hindsight is drawn, and which persona's trade is. */
  const [showBest, setShowBest] = useState(false);
  const [persona, setPersona] = useState<string | null>(null);

  /* ------------------------------------------------------------------ tools */

  const [tool, setTool] = useState<DrawTool | null>(null);
  const [activeTools, setActiveTools] = useState<ToolCode[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [magnet, setMagnet] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [studiesOpen, setStudiesOpen] = useState(false);
  const nextDrawingId = useRef(1);

  const [studySettings, setStudySettings, resetStudySettings] = useStudySettings();

  // Mutable mirrors for the animation loop, which must not re-subscribe every frame.
  const reveal = useRef<Bar[]>([]);
  const shown = useRef<Bar[]>([]);
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
  const freshRef = useRef(false);
  const runRef = useRef<RunState | null>(null);
  const matchIdRef = useRef<string | undefined>(match);
  const matchRef = useRef<MatchPayload | null>(null);
  const frame = useRef<number | null>(null);
  const tauRef = useRef(CAMERA_TAU_MS);
  const entryRef = useRef(0);
  const windowRef = useRef<Window>(DEFAULT_WINDOW);
  const phaseRef = useRef<Phase>('loading');
  const submitRef = useRef<(() => void) | null>(null);
  /** Hours on screen — the lead-in plus whatever the reveal has shown. The fog starts here. */
  const knownRef = useRef(0);
  /**
   * What this chart did to a run, said once the reveal has played. Held back until then: the
   * commit's response already knows whether you beat par, and telling a player before the candles
   * arrive would spoil the one thing the reveal is for.
   */
  const runFeedback = useRef<{ message: string; tone: 'success' | 'error' | 'neutral' } | null>(null);

  const reducedMotion = useReducedMotion();
  useEffect(() => {
    tauRef.current = reducedMotion ? 1 : CAMERA_TAU_MS;
  }, [reducedMotion]);

  /** The bracket shape a first pick opens at: the last one this player used, remembered. */
  const [lastBracket, setLastBracket] = useState(DEFAULT_BRACKET);
  useEffect(() => {
    // Read after mount: localStorage does not exist on the server, and the first paint must match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastBracket(storedBracket());
  }, []);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    matchIdRef.current = match;
    matchRef.current = matchState;
  }, [match, matchState]);

  // The colour-blind palette reaches the canvas as well as the interface.
  useEffect(() => {
    chart.current?.setPalette(candlesFor(theme.palette));
  }, [theme.palette]);

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
      onRevealed: (count) => {
        setRevealed(count);
        knownRef.current = windowRef.current.leadIn + count;
        setRunning(runningR(reveal.current, count, entryRef.current, resultRef.current));
      },
      onHit: (kind) => {
        setTouched(kind);
        if (!reducedMotion) setHitFlash(kind);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(kind === 'target' ? [18, 40, 18] : 30);
      },
      onSettled: () => {
        setPhase('done');
        const feedback = runFeedback.current;
        runFeedback.current = null;
        if (feedback) toast(feedback.message, feedback.tone);
      },
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
    setForfeited(false);
    setProvenance(null);
    setScore(null);
    setVerdicts([]);
    setStyle(null);
    setConfidence(null);
    setDirection(null);
    setNudge(false);
    setShowBest(false);
    setPersona(null);
    resultRef.current = null;
    setRevealed(0);
    setRevealTotal(0);
    setPaused(false);
    setSpeed(DEFAULT_SPEED);
    setHitFlash(null);
    setTouched(null);
    setRunning(EMPTY_RUNNING);
    setStageVisible(false);
    revealedRef.current = 0;
    reveal.current = [];
    railsRef.current = [];
    chart.current?.clearMarks();
    chart.current?.setPrice(null);

    /*
     * A run is started here rather than on the page, because a run is a *sequence* of rounds and
     * this is the function that issues them. Storm and Survival are ordinary rounds with a run
     * attached: the same endpoint, the same commit, the same scoring.
     */
    if (isRun(modeRef.current)) {
      if (runRef.current && !runRef.current.alive) {
        setPhase('summary');
        return;
      }
      if (!runRef.current) {
        const started = await fetch('/api/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: modeRef.current, tape: tapeRef.current }),
        });
        if (!started.ok) {
          const body = await started.json().catch(() => ({ error: 'Could not reach the server.' }));
          setError(body.error ?? 'Could not start the run.');
          setPhase('error');
          return;
        }
        const state: RunState = await started.json();
        runRef.current = state;
        setRun(state);
      }
    }

    // A match's charts are not chosen, they are *next*: the sequence and its ruleset were fixed
    // when the match was opened, for everybody in it.
    if (isMatch(modeRef.current)) {
      if (matchRef.current?.complete) {
        setPhase('summary');
        return;
      }
      if (!matchIdRef.current) {
        setError('That match link is missing its id.');
        setPhase('error');
        return;
      }
    }

    // Ranked forwards `new=1` when a fresh session was asked for. Without it the server resumes
    // the last session — which, once that session was finished, meant "Another session" showed
    // the same summary again.
    const endpoint =
      modeRef.current === 'daily'
        ? '/api/daily'
        : modeRef.current === 'ranked'
          ? `/api/ranked${freshRef.current ? '?new=1' : ''}`
          : isMatch(modeRef.current)
            ? `/api/match/${matchIdRef.current}/round`
            : isRun(modeRef.current)
              ? `/api/round?${tapeQuery(tapeRef.current, rulesetRef.current)}&run=${runRef.current!.id}`
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
      freshRef.current = false;
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
    if (isMatch(modeRef.current)) {
      const seeded = (payload as RoundPayload & { match?: MatchPayload }).match ?? null;
      if (seeded) {
        matchRef.current = seeded;
        setMatchState(seeded);
      }
    }
    setRound(payload);
    entryRef.current = payload.entry;
    windowRef.current = { leadIn: payload.bars.length, reveal: payload.revealBarCount };
    knownRef.current = payload.bars.length;

    shown.current = [...payload.bars];

    // Before setBars: the clock decides what timestamp each bar maps to.
    chart.current?.setClock(payload.startDayOfWeek, payload.startHourUtc);
    chart.current?.setBars(payload.bars);
    // The one-minute detail behind the lead-in. Only the past — the reveal's minutes arrive with
    // the reveal itself.
    minutes.current = payload.detail ? unpackDetail(fromBase64(payload.detail)) : [];
    chart.current?.setDetail(minutes.current, windowRef.current.leadIn);
    chart.current?.setTier(timeframeRef.current);
    // What the ruleset grants, applied to the canvas. Blackout drew volume and Blind Scale drew a
    // price axis before this: the server sent the flags and nothing read them.
    chart.current?.setVolumeVisible(payload.volume);
    chart.current?.setPriceAxisVisible(payload.priceAxis);
    chart.current?.setGuard({
      min: payload.entry - payload.atr * RAIL_HEADROOM_ATR,
      max: payload.entry + payload.atr * RAIL_HEADROOM_ATR,
    });
    chart.current?.setPrice(null);
    chart.current?.setLogical(placementView(windowRef.current));
    chart.current?.setInteractive(true);

    if (!payload.timeframes.includes(timeframeRef.current)) {
      const fallback = payload.timeframes.includes(DECISION_TF)
        ? DECISION_TF
        : (payload.timeframes[0] ?? DECISION_TF);
      timeframeRef.current = fallback;
      setTimeframe(fallback);
      chart.current?.setTier(fallback);
    }

    setStop(payload.entry);
    setTarget(payload.entry);
    setClockTotal(payload.clockMs);
    setPhase('placing');
  }, [stopLoop]);

  useEffect(() => {
    if (issued.current) return;
    issued.current = true;
    void load();
  }, [load]);

  /* ---------------------------------------------------------------- calling */

  /** Place a bracket from its own units: stop in ATR, target in R. */
  const placeBracket = useCallback(
    (side: 'long' | 'short', stopAtr: number, targetR: number) => {
      if (!round) return;
      const sign = side === 'long' ? 1 : -1;
      const risk = Math.max(stopAtr * round.atr, TICK_SIZE);
      const nextStop = toTick(round.entry - sign * risk);
      const nextTarget = toTick(round.entry + sign * risk * targetR);
      setStop(nextStop);
      setTarget(nextTarget);
      railsRef.current = [nextStop, nextTarget];
    },
    [round],
  );

  const stopAtr = round && round.atr > 0 && direction ? Math.abs(round.entry - stop) / round.atr : lastBracket.stopAtr;
  const targetR = round && direction && Math.abs(round.entry - stop) > 0 ? Math.abs(target - round.entry) / Math.abs(round.entry - stop) : lastBracket.targetR;

  const remember = useCallback((next: { stopAtr: number; targetR: number }) => {
    setLastBracket(next);
    try {
      localStorage.setItem(BRACKET_KEY, JSON.stringify(next));
    } catch {
      // A preference; nothing breaks without it.
    }
  }, []);

  const pickDirection = useCallback(
    (side: 'long' | 'short') => {
      if (!round || phaseRef.current !== 'placing') return;
      setNudge(false);
      // Switching side keeps the bracket's shape; a first pick opens at the last one used.
      const shape = direction ? { stopAtr, targetR } : lastBracket;
      setDirection(side);
      placeBracket(side, shape.stopAtr, shape.targetR);
    },
    [round, direction, stopAtr, targetR, lastBracket, placeBracket],
  );

  const changeStopAtr = useCallback(
    (value: number) => {
      if (!direction) return;
      placeBracket(direction, value, targetR);
      remember({ stopAtr: value, targetR });
    },
    [direction, targetR, placeBracket, remember],
  );

  const changeTargetR = useCallback(
    (value: number) => {
      if (!direction) return;
      placeBracket(direction, stopAtr, value);
      remember({ stopAtr, targetR: value });
    },
    [direction, stopAtr, placeBracket, remember],
  );

  const onDrag = useCallback(
    (rail: Rail, rawPrice: number) => {
      if (!round || phase !== 'placing' || !direction) return;

      const price = toTick(rawPrice);
      const entry = round.entry;
      if (Math.abs(price - entry) < TICK_SIZE) return; // a level on the entry is not an order

      // Dragging a rail across the entry flips the trade, and the other rail reflects so the
      // reward-to-risk the player chose survives the flip.
      if (rail === 'stop') {
        const flipped = price < entry !== stop < entry;
        const nextTarget = flipped ? toTick(entry + (entry - target)) : target;
        setStop(price);
        if (flipped) {
          setTarget(nextTarget);
          setDirection(price < entry ? 'long' : 'short');
        }
        railsRef.current = [price, nextTarget];
      } else {
        const flipped = price > entry !== target > entry;
        const nextStop = flipped ? toTick(entry + (entry - stop)) : stop;
        setTarget(price);
        if (flipped) {
          setStop(nextStop);
          setDirection(price > entry ? 'long' : 'short');
        }
        railsRef.current = [nextStop, price];
      }
    },
    [round, phase, direction, stop, target],
  );

  const mayPass = Boolean(round?.mayPass) && (ranked ? ranked.mayPass : true);
  const passEndsRun = mode === 'streak' && run !== null && 'skipsLeft' in run && run.skipsLeft === 0;

  const resetView = useCallback(() => {
    chart.current?.setLogical(placementView(windowRef.current));
  }, []);

  /* -------------------------------------------------------------- committing */

  const submit = useCallback(
    async (body: { stop: number; target: number; confidence?: number } | { pass: true }) => {
      if (!round || phase !== 'placing') return;
      setPhase('committing');
      setTool(null);
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
      setForfeited(Boolean(payload.forfeited));
      setProvenance(payload.provenance ?? null);
      setScore(payload.score ?? null);
      setVerdicts(payload.council ?? []);
      setStyle(payload.style ?? null);
      if (payload.run) {
        const before = runRef.current;
        runRef.current = payload.run;
        setRun(payload.run);
        runFeedback.current = runMessage(before, payload.run, payload.result.outcome);
      }
      if (payload.match) {
        matchRef.current = payload.match;
        setMatchState(payload.match);
      }
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

  /** One commit path for the button, Enter and the clock, so the stake always travels with it. */
  const lockIn = useCallback(() => {
    if (phaseRef.current !== 'placing') return;
    if (!direction) {
      setNudge(true);
      return;
    }
    void submit({ stop, target, ...(confidence === null ? {} : { confidence }) });
  }, [direction, stop, target, confidence, submit]);

  const sitOut = useCallback(() => {
    if (phaseRef.current !== 'placing' || !mayPass) return;
    void submit({ pass: true });
  }, [mayPass, submit]);

  /**
   * The clock ran out. Whatever is on screen is sent — the server checks the deadline against its
   * own clock and marks the round forfeited, so this cannot rescue a slow decision; it only stops a
   * player sitting on an expired chart forever. With no side picked, sitting out is sent where it is
   * allowed, and a minimal bracket where it is not: the round is a forfeit either way.
   */
  useEffect(() => {
    submitRef.current = () => {
      if (direction) {
        void submit({ stop, target, ...(confidence === null ? {} : { confidence }) });
      } else if (mayPass) {
        void submit({ pass: true });
      } else if (round) {
        void submit({ stop: toTick(round.entry - round.atr), target: toTick(round.entry + round.atr) });
      }
    };
  }, [submit, direction, stop, target, confidence, mayPass, round]);

  const onClockExpired = useCallback(() => {
    if (phaseRef.current !== 'placing') return;
    submitRef.current?.();
  }, []);

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
    knownRef.current = round.bars.length;
    setHitFlash(null);
    setTouched(null);
    setRunning(EMPTY_RUNNING);
    setStageVisible(false);
    setPaused(false);
    setPhase('revealing');
    loop.start();
  }, [round, phase, loop, stopLoop]);

  const share = useCallback(async () => {
    if (!result) return;
    const percentile = score?.percentile ?? null;
    // Spoiler-free: a score and nothing about the chart's shape, side, size or identity.
    const text = `Hindsight · ${percentile === null ? 'a chart' : `scored ${Math.round(percentile * 100)}`} ${
      result.outcome === 'pass' ? '(sat out)' : ''
    }\nCan you beat it? ${typeof window !== 'undefined' ? window.location.origin : ''}`.trim();
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied — nothing in it spoils the chart', 'success');
      }
    } catch {
      // Dismissed share sheet; nothing to do.
    }
  }, [result, score, toast]);

  /* ------------------------------------------------------------- keyboard */

  const nudgeStop = useCallback(
    (delta: number) => {
      if (phase !== 'placing' || !direction) return;
      changeStopAtr(Math.min(6, Math.max(0.25, Math.round((stopAtr + delta) * 4) / 4)));
    },
    [phase, direction, stopAtr, changeStopAtr],
  );
  const nudgeTarget = useCallback(
    (delta: number) => {
      if (phase !== 'placing' || !direction) return;
      changeTargetR(Math.min(10, Math.max(0.5, Math.round((targetR + delta) * 2) / 2)));
    },
    [phase, direction, targetR, changeTargetR],
  );

  useHotkeys(
    {
      Enter: () => {
        if (phase === 'placing') lockIn();
        if (phase === 'done') void load();
      },
      l: () => pickDirection('long'),
      s: () => {
        if (phase === 'placing') pickDirection('short');
        if (phase === 'revealing') skip();
      },
      x: sitOut,
      p: sitOut,
      ArrowUp: (event) => {
        if (phase !== 'placing' || !direction) return;
        event.preventDefault();
        // The arrows move the stop line itself. Up tightens a long's stop and widens a short's.
        nudgeStop(direction === 'long' ? -0.25 : 0.25);
      },
      ArrowDown: (event) => {
        if (phase !== 'placing' || !direction) return;
        event.preventDefault();
        nudgeStop(direction === 'long' ? 0.25 : -0.25);
      },
      'shift+arrowup': (event) => {
        if (phase !== 'placing' || !direction) return;
        event.preventDefault();
        nudgeTarget(direction === 'long' ? 0.5 : -0.5);
      },
      'shift+arrowdown': (event) => {
        if (phase !== 'placing' || !direction) return;
        event.preventDefault();
        nudgeTarget(direction === 'long' ? -0.5 : 0.5);
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
      Escape: () => {
        if (tool) setTool(null);
        else if (persona) setPersona(null);
      },
      'mod+z': (event) => {
        if (phase !== 'placing' || drawings.length === 0) return;
        event.preventDefault();
        setDrawings((current) => current.slice(0, -1));
      },
      ...Object.fromEntries(
        (['measure', 'trendline', 'level', 'channel', 'fib'] as DrawTool[]).map((code, i) => [
          String(i + 1),
          () => {
            if (phase !== 'placing' && phase !== 'done') return;
            if (code !== 'measure' && !round?.tools.includes(code as ToolCode)) return;
            setTool((current) => (current === code ? null : code));
          },
        ]),
      ),
    },
    true,
  );

  /** The outcome flash fades itself out. */
  useEffect(() => {
    if (!hitFlash) return;
    const timer = setTimeout(() => setHitFlash(null), 900);
    return () => clearTimeout(timer);
  }, [hitFlash]);

  /** The nudge on Lock in with no side settles after a moment. */
  useEffect(() => {
    if (!nudge) return;
    const timer = setTimeout(() => setNudge(false), 2400);
    return () => clearTimeout(timer);
  }, [nudge]);

  /** The exit stamp lands on the chart, holds, and clears. */
  useEffect(() => {
    if (phase !== 'done' || !result) return;
    const show = setTimeout(() => setStageVisible(true), 80);
    const hide = setTimeout(() => setStageVisible(false), 2200);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [phase, result]);

  const beats = useBeats(COMMIT_BEATS, [phase === 'committing' || phase === 'revealing']);

  const announcement = describe(
    phase,
    result,
    round ? { leadIn: round.bars.length, reveal: round.revealBarCount } : DEFAULT_WINDOW,
    direction,
  );

  /* -------------------------------------------------------------- overlays */

  const best = round && score ? bestBracket(score.distribution, round.entry, round.atr) : null;
  const personaVerdict = persona ? verdicts.find((verdict) => verdict.engine === persona) : null;

  /**
   * Repaint everything drawn over the candles: the granted studies (computed from bars already on
   * the client, so nothing about the future is added), and in the review the best trade in
   * hindsight and whichever persona's trade is selected.
   */
  useEffect(() => {
    if (!round) return;
    const studies = overlaysFor(activeTools, {
      bars: round.bars,
      atr: round.atr,
      minutes: minutes.current.slice(0, round.bars.length * 60),
      minutesPerBar: 60,
      settings: studySettings,
    });
    const from = round.bars.length - 1;
    const to = round.bars.length + round.revealBarCount - 1;
    const bracketLines = (b: { stop: number; target: number }, color: string): Overlay[] => [
      { points: [{ index: from, price: b.target }, { index: to, price: b.target }], color, width: 2 },
      { points: [{ index: from, price: b.stop }, { index: to, price: b.stop }], color, width: 2, dashed: true },
    ];
    const review: Overlay[] = [];
    if (phase === 'done' && showBest && best) review.push(...bracketLines(best, HINDSIGHT_GOLD));
    if (phase === 'done' && personaVerdict?.bracket) {
      const colour = personaFor(personaVerdict.engine)?.colour ?? '#c9c2b6';
      review.push(...bracketLines(personaVerdict.bracket, colour));
    }
    chart.current?.setOverlays([...studies, ...review]);
  }, [round, activeTools, studySettings, phase, showBest, best, personaVerdict]);

  useEffect(() => {
    chart.current?.setLogScale(logScale);
  }, [logScale, round]);

  // A new chart is a new problem. Drawings, the held tool and studies are reset when the round
  // changes — during render, not in an effect, so the old drawings never paint over the new chart.
  const [drawnFor, setDrawnFor] = useState<string | undefined>(round?.roundId);
  if (round?.roundId !== drawnFor) {
    setDrawnFor(round?.roundId);
    setDrawings([]);
    setTool(null);
    setActiveTools((current) => current.filter((code) => round?.tools.includes(code) ?? false));
    setStudiesOpen(false);
  }

  /* -------------------------------------------------------------- rendering */

  const locked = phase !== 'placing';
  const passed = result?.outcome === 'pass';
  const decisionSeconds = round
    ? decisionClockSeconds(round.startDayOfWeek, round.startHourUtc, round.bars.length)
    : 0;
  const decisionClock = clockAt(decisionSeconds);
  const tapeName = tape === 'open' ? 'Shuffle' : tape.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

  const stageR = result?.rMultiple;
  const stageTone = forfeited
    ? 'loss'
    : passed
      ? 'restraint'
      : stageR === null || stageR === undefined
        ? 'neutral'
        : stageR > 0.005
          ? 'gain'
          : stageR < -0.005
            ? 'loss'
            : 'neutral';

  const studyTools = round?.tools.filter((code) => !['trendline', 'level', 'channel', 'fib', 'magnet', 'logScale'].includes(code)) ?? [];
  const title =
    mode === 'daily'
      ? daily
        ? `Daily #${daily.day}`
        : 'Daily'
      : mode === 'ranked'
        ? 'Ranked'
        : mode === 'storm'
          ? 'Storm'
          : mode === 'streak'
            ? 'Survival'
            : mode === 'duel'
              ? 'Duel'
              : mode === 'race'
                ? 'Race'
                : tapeName;
  const phaseLabel =
    phase === 'placing'
      ? direction
        ? 'Call · set your stop and target'
        : 'Read · then call it'
      : phase === 'committing' || phase === 'revealing'
        ? 'Reveal'
        : phase === 'done'
          ? 'Review'
          : null;
  const revealHours = round ? round.revealBarCount : 60;

  const nextLabel = matchState?.complete
    ? 'See the result'
    : run && !run.alive
      ? 'See your run'
      : daily && daily.played + 1 >= daily.total
        ? 'See your card'
        : ranked && ranked.played + 1 >= ranked.total
          ? 'See your session'
          : 'Next chart';

  const exit =
    mode === 'tape'
      ? { href: routes.tapes.show(tape), label: 'the tape' }
      : isMatch(mode)
        ? { href: match ? routes.versus.match(match) : routes.versus.index, label: 'the match' }
        : { href: routes.play.hub, label: 'Play' };

  return (
    <div data-theme="dark" className="bg-surface-0 text-ink min-h-dvh">
      <div
        className={[
          'mx-auto flex min-h-dvh w-full max-w-(--container-stage) flex-col gap-3 p-3 sm:p-4 lg:px-6',
          // A fixed stage per breakpoint. Never per phase — see the note on this component.
          '[--stage-h:clamp(18rem,48dvh,26rem)]',
          'sm:[--stage-h:clamp(20rem,52dvh,30rem)]',
          'lg:[--stage-h:clamp(24rem,60dvh,44rem)]',
          'xl:[--stage-h:clamp(28rem,64dvh,50rem)]',
        ].join(' ')}
      >
        <h1 className="sr-only">
          {mode === 'daily' && daily
            ? `Daily #${daily.day}, chart ${Math.min(daily.played + 1, daily.total)} of ${daily.total}`
            : isRun(mode)
              ? `${mode === 'storm' ? 'Storm' : 'Survival'}, chart ${(run?.charts ?? 0) + 1}`
              : isMatch(mode)
                ? `${mode === 'duel' ? 'Duel' : 'Race'}, chart ${(matchState?.charts ?? 0) + 1}`
                : title}
        </h1>

        <PlayTopBar
          exitHref={exit.href}
          exitLabel={exit.label}
          title={title}
          phaseLabel={phase === 'summary' ? null : phaseLabel}
          onHelp={() => setHelpOpen(true)}
          round={phase === 'summary' ? null : round}
          hud={
            isMatch(mode) && matchState ? (
              <MatchHud match={matchState} />
            ) : isRun(mode) && run ? (
              <RunHud run={run} deciding={phase === 'placing'} />
            ) : mode === 'ranked' && ranked ? (
              <DailyPips played={ranked.played} total={ranked.total} label="Ranked" />
            ) : mode === 'daily' && daily ? (
              <DailyPips played={daily.played} total={daily.total} />
            ) : null
          }
          timeframe={
            round && phase !== 'summary' && round.timeframes.length > 1 ? (
              <TimeframeControl timeframe={timeframe} onTimeframe={setTimeframe} allowed={round.timeframes} tierCode={round.tier} />
            ) : null
          }
          clock={
            phase === 'placing' && round && round.clockMs !== null && clockTotal !== null ? (
              <DecisionClock remainingMs={round.clockMs} onExpire={onClockExpired} />
            ) : null
          }
        />

        {phase !== 'summary' && (
          <div className={cx('flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4', phase === 'done' && 'lg:min-h-0')}>
            {round && (
              // On a phone, a rail holding only the ruler is a whole row spent on one icon, so it
              // waits for a ruleset that grants drawing tools. The ruler is still on desktop.
              <div
                className={cx(
                  'items-center gap-2 lg:flex lg:flex-col lg:items-stretch',
                  round.tools.some((code) => ['trendline', 'level', 'channel', 'fib'].includes(code)) ? 'flex' : 'hidden',
                )}
              >
                <InstrumentRail
                  granted={round.tools}
                  tool={tool}
                  onTool={setTool}
                  // The reveal drives the camera frame by frame; a pointer tool would fight it.
                  disabled={phase !== 'placing' && phase !== 'done'}
                />
                {studyTools.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStudiesOpen(true)}
                    disabled={phase !== 'placing'}
                    aria-label={activeTools.length > 0 ? `Studies, ${activeTools.length} on` : 'Studies'}
                    className="press bg-surface-1 border-line-faint text-ink-lo enabled:hover:text-ink-hi relative flex h-11 items-center gap-1.5 rounded-2xl border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed lg:h-auto lg:flex-col lg:py-2.5"
                  >
                    <Icon name="activity" size={18} />
                    <span className="lg:sr-only">Studies</span>
                    {activeTools.length > 0 && (
                      <span className="bg-info text-ink-inv numeral grid h-4 min-w-4 place-items-center rounded-full px-1 text-micro font-semibold">
                        {activeTools.length}
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <ChartFrame
                className="h-(--stage-h) w-full shrink-0"
                chartRef={chart}
                entry={round?.entry ?? null}
                stop={phase === 'placing' ? stop : (result?.stop ?? stop)}
                target={phase === 'placing' ? target : (result?.target ?? target)}
                locked={locked}
                railsHidden={passed}
                showRails={Boolean(round) && phase !== 'loading' && phase !== 'error'}
                bracket={phase !== 'placing' || direction !== null}
                entryLabel={phase === 'placing' && !direction ? 'Now · pick a side' : 'Entry'}
                stopLabel={`Stop −${stopAtr.toFixed(2)} ATR`}
                targetLabel={`Target +${targetR.toFixed(1)}R`}
                onDrag={onDrag}
                hitFlash={hitFlash}
                armed={(phase === 'placing' || phase === 'done') && tool !== null}
                hint={
                  (phase === 'placing' || phase === 'done') && tool !== null
                    ? `${INSTRUMENT_LABEL[tool]} · ${INSTRUMENT_HOWTO[tool]} · Esc to put it down`
                    : null
                }
                loading={phase === 'loading'}
                error={phase === 'error' ? error : null}
                onRetry={() => void load()}
              >
                {round && (
                  <FogLayer
                    chart={chart}
                    known={knownRef}
                    visible={phase === 'placing' || phase === 'committing' || phase === 'revealing'}
                    label={`${revealHours}h ahead`}
                  />
                )}
                {phase === 'placing' && round && round.clockMs !== null && clockTotal !== null && (
                  <ClockLine totalMs={clockTotal} remainingMs={round.clockMs} />
                )}
                {round && (
                  <DrawLayer
                    chart={chart}
                    tool={phase === 'placing' || phase === 'done' ? tool : null}
                    drawings={drawings}
                    magnet={magnet}
                    bars={round.bars}
                    atr={round.atr}
                    risk={round.entry && direction ? Math.abs(round.entry - stop) : null}
                    onCommit={(drawing) =>
                      setDrawings((current) => [...current, { ...drawing, id: nextDrawingId.current++ }])
                    }
                    onDelete={(id) => setDrawings((current) => current.filter((d) => d.id !== id))}
                  />
                )}
                {round && phase !== 'loading' && phase !== 'error' && (
                  <InstrumentWatermark
                    atr={round.atr}
                    tickSize={round.tickSize}
                    clockLabel={formatClock(decisionSeconds)}
                    weekend={decisionClock.weekend}
                  />
                )}

                {phase === 'committing' && beats.at(1) && !beats.at(2) && (
                  <div className="animate-fade font-display text-ink-hi pointer-events-none absolute inset-x-0 bottom-16 z-20 text-center text-2xl italic">
                    The next {revealHours} hours
                  </div>
                )}

                {phase === 'revealing' && (
                  <LiveR r={running.r} mfe={running.mfe} mae={running.mae} frozen={running.frozen} passed={passed} />
                )}

                {phase === 'done' && result && (
                  <ScoreStage
                    show={stageVisible}
                    label={forfeited ? "Time's up" : passed ? 'Sat out' : outcomeLabel(result.outcome)}
                    value={
                      passed || stageR === null || stageR === undefined
                        ? '0.00R'
                        : `${stageR >= 0 ? '+' : ''}${stageR.toFixed(2)}R`
                    }
                    tone={stageTone}
                    detail={
                      score?.percentile !== null && score?.percentile !== undefined
                        ? `Score ${Math.round(score.percentile * 100)}`
                        : null
                    }
                  />
                )}

                {(phase === 'placing' || phase === 'done') && (
                  <FrameControls
                    onResetView={resetView}
                    onHelp={() => setHelpOpen(true)}
                    magnet={round?.tools.includes('magnet') ? magnet : undefined}
                    onMagnet={round?.tools.includes('magnet') ? setMagnet : undefined}
                    logScale={round?.tools.includes('logScale') ? logScale : undefined}
                    onLogScale={round?.tools.includes('logScale') ? setLogScale : undefined}
                    onClear={() => setDrawings([])}
                    drawings={drawings.length}
                  />
                )}
              </ChartFrame>

              {(phase === 'placing' || phase === 'committing') && round && (
                <CallDock
                  direction={direction}
                  onDirection={pickDirection}
                  stopAtr={stopAtr}
                  targetR={targetR}
                  onStopAtr={changeStopAtr}
                  onTargetR={changeTargetR}
                  confidence={confidence}
                  onConfidence={setConfidence}
                  mayPass={mayPass}
                  passNote={
                    !round.mayPass
                      ? 'This chart has to be traded.'
                      : ranked && !ranked.mayPass
                        ? 'Both sit-outs in this session are spent.'
                        : ranked
                          ? `${ranked.passesLeft} sit-out${ranked.passesLeft === 1 ? '' : 's'} left this session`
                          : passEndsRun
                            ? 'Your one sit-out is spent — another ends the run.'
                            : null
                  }
                  passEndsRun={passEndsRun}
                  onPass={sitOut}
                  onCommit={lockIn}
                  busy={phase === 'committing'}
                  nudge={nudge}
                />
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
            </div>

            {phase === 'done' && result && round && (
              <ReviewPanel
                result={result}
                score={score}
                provenance={provenance}
                verdicts={verdicts}
                style={style}
                entry={round.entry}
                atr={round.atr}
                confidence={confidence}
                forfeited={forfeited}
                showBest={showBest}
                onShowBest={setShowBest}
                persona={persona}
                onPersona={setPersona}
                nextLabel={nextLabel}
                onNext={() => void load()}
                onReplay={replay}
                onShare={share}
                className="w-full lg:h-(--stage-h) lg:w-[25rem] lg:shrink-0"
              />
            )}
          </div>
        )}

        {phase === 'summary' && (
          <section className="mx-auto w-full max-w-3xl flex-1 py-4">
            {matchState && <MatchSummary match={matchState} onAgain={() => router.push(routes.versus.index)} />}
            {run && (
              <RunSummary
                run={run}
                onAgain={() => {
                  runRef.current = null;
                  setRun(null);
                  void load();
                }}
              />
            )}
            {daily && <DailyCeremony daily={daily} />}
            {ranked && <RankedSummary ranked={ranked} />}
            {!matchState && !run && !daily && !ranked && (
              <Chip tone="neutral">Nothing to show</Chip>
            )}
          </section>
        )}

        <Live message={announcement} />

        <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard" description="Every round can be played without a mouse.">
          <HotkeyLegend />
        </Dialog>

        {round && (
          <StudiesPanel
            open={studiesOpen}
            onClose={() => setStudiesOpen(false)}
            granted={round.tools}
            active={activeTools}
            onToggle={(code) =>
              setActiveTools((current) =>
                current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
              )
            }
            settings={studySettings}
            onSettings={setStudySettings}
            onResetSettings={resetStudySettings}
          />
        )}
      </div>
    </div>
  );
}

/** A run's change, in a few words: the "+1", "×5" and "−10s" Storm was missing per chart. */
function runMessage(
  before: RunState | null,
  after: RevealPayload['run'],
  outcome: RoundResult['outcome'],
): { message: string; tone: 'success' | 'error' | 'neutral' } | null {
  if (!after) return null;
  if (after.mode === 'storm') {
    const gained = before && before.mode === 'storm' ? after.score - before.score : after.beatMedian ? 1 : 0;
    if (after.beatMedian) {
      return { message: `+${gained}${after.combo > 1 ? ` · ×${after.combo} combo` : ''}`, tone: 'success' };
    }
    return outcome === 'stop'
      ? { message: 'Stopped out · −10 seconds', tone: 'error' }
      : { message: outcome === 'pass' ? 'Sat out · no point' : 'Below par · combo reset', tone: 'neutral' };
  }
  if (!after.alive) return { message: 'Below par — the run is over', tone: 'error' };
  if (outcome === 'pass') return { message: 'Sit-out spent', tone: 'neutral' };
  return { message: `${after.length} in a row`, tone: 'success' };
}

/** The live-region text for a phase. Spelled out, because a reader says "R" better than "+2.4R". */
function describe(
  phase: Phase,
  result: RoundResult | null,
  window: Window,
  direction: 'long' | 'short' | null,
): string | null {
  if (phase === 'placing')
    return direction
      ? `Going ${direction}. Set your stop and target, then lock in.`
      : `New chart. ${window.leadIn} candles of history. Go long, go short, or sit out.`;
  if (phase === 'committing') return `Locked in. Revealing the next ${window.reveal} candles.`;
  if (phase !== 'done' || !result) return null;
  if (result.outcome === 'pass') return 'Sat out. Zero R.';
  const r = result.rMultiple;
  const amount = r === null ? 'Not scored' : `${r >= 0 ? 'plus' : 'minus'} ${Math.abs(r).toFixed(2)} R`;
  return `${outcomeLabel(result.outcome)}. ${amount}.`;
}

function outcomeLabel(outcome: RoundResult['outcome']): string {
  if (outcome === 'target') return 'Target hit';
  if (outcome === 'stop') return 'Stopped out';
  if (outcome === 'pass') return 'Sat out';
  return 'Time ran out';
}
