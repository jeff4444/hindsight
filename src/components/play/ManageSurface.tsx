'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bar } from '@/core/bars';
import { MANAGE_MS_PER_BAR, REVEAL_BARS } from '@/core/config';
import { toTick } from '@/core/normalize';
import type { RoundPayload } from '@/lib/api-types';
import { useHotkeys } from '@/lib/useHotkeys';
import { candlesFor } from '@/lib/palette';
import { routes } from '@/lib/routes';
import { Chart, type ChartHandle } from '../Chart';
import { Button, Chip, Panel, ProgressBar, ScoreRing, cx } from '../ui';
import { Dialog, Term, useThemeSnapshot } from '../ui/client';
import { Icon } from '../ui/icons';
import { HotkeyLegend } from './layers';
import { PlayTopBar } from './PlayTopBar';

/**
 * Manage: open a trade, then run it bar by bar.
 *
 * The other half of trading. There is no target — the candles advance on the server's clock and the
 * player decides when to tighten, when to take half, when to leave. It scores against the 98
 * management policies that were possible on the chart, not the 98 brackets the other modes use, so
 * its numbers are not interchangeable with theirs and it has its own rating.
 *
 * It shares the stage's look and its top bar with the other modes now, and gets the same explicit
 * side choice: the old screen silently turned a long into a short when "Stop higher" crossed the
 * entry.
 */

interface ManageState {
  open: boolean;
  stop: number;
  revealed: number;
  bars: Bar[];
  events: { atPathIndex: number; action: { kind: string; price?: number } }[];
  done: boolean;
  result?: {
    outcome: string;
    direction: 'long' | 'short';
    rMultiple: number;
    trailed: boolean;
    scaledOut: boolean;
  };
  score?: {
    percentile: number | null;
    parR: number | null;
    gridBestR: number | null;
    distribution: number[];
  };
}

type Phase = 'loading' | 'placing' | 'running' | 'done' | 'error';

const STEP_ATR = 0.25;

export function ManageSurface({ tape = 'open' }: { tape?: string }) {
  const chart = useRef<ChartHandle>(null);
  const issued = useRef(false);
  const theme = useThemeSnapshot();

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [side, setSide] = useState<'long' | 'short' | null>(null);
  const [stopAtr, setStopAtr] = useState(1);
  const [state, setState] = useState<ManageState | null>(null);
  const [initialRisk, setInitialRisk] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  const entry = round?.entry ?? 0;
  const atr = round?.atr ?? 1;
  const placedStop = side ? toTick(side === 'long' ? entry - stopAtr * atr : entry + stopAtr * atr) : entry;

  /* --------------------------------------------------------------- issuance */

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setState(null);
    setSide(null);
    try {
      const response = await fetch(`/api/round?tape=${encodeURIComponent(tape)}`, { method: 'POST' });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Could not start a round.');
      const payload: RoundPayload = await response.json();
      setRound(payload);
      setPhase('placing');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start a round.');
      setPhase('error');
    }
  }, [tape]);

  useEffect(() => {
    if (issued.current) return;
    issued.current = true;
    void load();
  }, [load]);

  /* ------------------------------------------------------------ the drawing */

  const candles = candlesFor(theme.palette);
  useEffect(() => {
    chart.current?.setPalette(candles);
  }, [candles]);

  useEffect(() => {
    if (!round || !chart.current) return;
    chart.current.setClock(round.startDayOfWeek, round.startHourUtc);
    chart.current.setBars([...round.bars, ...(state?.bars ?? [])]);
    chart.current.setVolumeVisible(round.volume);
  }, [round, state?.bars]);

  useEffect(() => {
    if (!chart.current || !round) return;
    const lastIndex = Math.max(round.bars.length + REVEAL_BARS - 1, round.bars.length + (state?.bars.length ?? 0) - 1);
    const stop = state?.stop ?? placedStop;
    chart.current.setOverlays([
      {
        points: [
          { index: 0, price: entry },
          { index: lastIndex, price: entry },
        ],
        color: 'rgba(247,243,236,0.45)',
        dashed: true,
      },
      ...(side || state
        ? [
            {
              points: [
                { index: round.bars.length - 1, price: stop },
                { index: lastIndex, price: stop },
              ],
              color: candles.down,
              width: 2,
            },
          ]
        : []),
    ]);
  }, [round, state?.bars.length, state?.stop, state, placedStop, entry, side, candles.down]);

  /* ------------------------------------------------------------- the clock */

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      if (!round) return;
      const response = await fetch(`/api/round/${round.roundId}/manage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        if (response.status !== 409) setError(payload.error ?? 'Something went wrong.');
        return;
      }
      setState(payload as ManageState);
      if ((payload as ManageState).done) setPhase('done');
    },
    [round],
  );

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => void send({ op: 'tick' }), MANAGE_MS_PER_BAR / 4);
    return () => clearInterval(id);
  }, [phase, send]);

  /* -------------------------------------------------------------- the moves */

  const open = useCallback(async () => {
    if (!side || phase !== 'placing') return;
    setInitialRisk(Math.abs(entry - placedStop));
    setPhase('running');
    await send({ op: 'open', stop: placedStop });
  }, [side, phase, entry, placedStop, send]);

  const isLong = side === 'long';
  const currentStop = state?.stop ?? placedStop;
  const risk = Math.abs(entry - currentStop);
  const running = phase === 'running' && !state?.done;
  const revealed = state?.revealed ?? 0;
  const tookHalf = state?.events.some((e) => e.action.kind === 'partial') ?? false;
  const atBreakeven = currentStop === toTick(entry);

  const tighten = useCallback(() => {
    if (!running) return;
    const next = toTick(isLong ? currentStop + STEP_ATR * atr : currentStop - STEP_ATR * atr);
    const clamped = isLong ? Math.min(next, entry) : Math.max(next, entry);
    void send({ op: 'stop', price: clamped });
  }, [running, isLong, currentStop, atr, entry, send]);

  // Live R, marked to the last revealed close against the risk the trade opened with.
  const last = state?.bars[state.bars.length - 1];
  const liveR = running && last && initialRisk > 0 ? ((last.c - entry) * (isLong ? 1 : -1)) / initialRisk : null;

  useHotkeys({
    l: () => phase === 'placing' && setSide('long'),
    s: () => phase === 'placing' && setSide('short'),
    ArrowUp: (event) => {
      if (phase !== 'placing' || !side) return;
      event.preventDefault();
      setStopAtr((v) => Math.min(6, Math.max(0.25, v + (isLong ? -STEP_ATR : STEP_ATR))));
    },
    ArrowDown: (event) => {
      if (phase !== 'placing' || !side) return;
      event.preventDefault();
      setStopAtr((v) => Math.min(6, Math.max(0.25, v + (isLong ? STEP_ATR : -STEP_ATR))));
    },
    Enter: () => {
      if (phase === 'placing') void open();
      else if (phase === 'done') void load();
    },
    t: tighten,
    b: () => running && !atBreakeven && void send({ op: 'stop', price: toTick(entry) }),
    h: () => running && !tookHalf && void send({ op: 'partial' }),
    c: () => running && void send({ op: 'exit' }),
  });

  const result = state?.result;
  const percentile = state?.score?.percentile ?? null;

  return (
    <div data-theme="dark" className="bg-surface-0 text-ink min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-(--container-stage) flex-col gap-3 p-3 sm:p-4 lg:px-6">
        <h1 className="sr-only">Manage</h1>
        <PlayTopBar
          exitHref={tape === 'open' ? routes.play.hub : routes.tapes.show(tape)}
          exitLabel={tape === 'open' ? 'Play' : 'the tape'}
          title="Manage"
          phaseLabel={
            phase === 'placing' ? (side ? 'Set your stop, then open' : 'Read · then pick a side') : phase === 'running' ? 'Run it' : phase === 'done' ? 'Review' : null
          }
          round={round}
          onHelp={() => setHelpOpen(true)}
          hud={running ? <Chip tone="neutral" mono>{revealed}/{REVEAL_BARS}h</Chip> : null}
        />

        <div className="border-line-faint bg-surface-1 relative h-[clamp(20rem,56dvh,46rem)] overflow-hidden rounded-2xl border">
          <Chart ref={chart} className="absolute inset-0" />
          {phase === 'loading' && (
            <div className="bg-scrim absolute inset-0 z-40 grid place-items-center text-sm">Dealing a chart…</div>
          )}
          {phase === 'error' && (
            <div className="bg-scrim absolute inset-0 z-40 grid place-items-center p-6 text-center">
              <div>
                <p className="font-display text-ink-max text-2xl">That chart did not arrive.</p>
                <p className="text-ink-lo mt-2 text-sm">{error}</p>
                <Button className="mt-4" onClick={() => void load()}>
                  Try again
                </Button>
              </div>
            </div>
          )}
          {running && liveR !== null && (
            <div className="pointer-events-none absolute top-4 right-20 z-20 text-right">
              <div className="eyebrow text-ink-dim">Live</div>
              <div className={cx('numeral text-4xl font-semibold', liveR > 0 ? 'text-gain-ink' : liveR < 0 ? 'text-loss-ink' : 'text-ink-hi')}>
                {liveR >= 0 ? '+' : ''}
                {liveR.toFixed(2)}R
              </div>
              {tookHalf && <div className="text-ink-dim mt-1 text-mini">half taken</div>}
            </div>
          )}
          {running && (
            <div className="absolute inset-x-0 top-0 z-20">
              <ProgressBar value={revealed} max={REVEAL_BARS} size="xs" pace="live" tone="neutral" className="rounded-none" label="Candles revealed" />
            </div>
          )}
        </div>

        {phase === 'placing' && (
          <Panel tone="inset" pad="none" className="rounded-2xl p-3 sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-5">
              <div role="radiogroup" aria-label="Direction" className="grid grid-cols-2 gap-2 lg:flex">
                {(['long', 'short'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={side === option}
                    onClick={() => setSide(option)}
                    className={cx(
                      'press flex h-12 items-center justify-center gap-2 rounded-full px-5 text-base font-semibold ring-1 transition-colors lg:min-w-32',
                      side === option
                        ? option === 'long'
                          ? 'bg-long text-on-gold ring-long'
                          : 'bg-short text-on-gold ring-short'
                        : option === 'long'
                          ? 'bg-long-bg text-long-ink ring-long-line'
                          : 'bg-short-bg text-short-ink ring-short-line',
                    )}
                  >
                    <Icon name={option === 'long' ? 'arrow-up' : 'arrow-down'} size={18} stroke={2} />
                    {option === 'long' ? 'Long' : 'Short'}
                  </button>
                ))}
              </div>
              {side ? (
                <div className="flex items-center gap-3">
                  <span className="eyebrow text-ink-dim">Starting stop</span>
                  <div className="bg-surface-2 ring-line flex h-11 items-center rounded-full ring-1">
                    <button type="button" aria-label="Stop closer" onClick={() => setStopAtr((v) => Math.max(0.25, v - STEP_ATR))} className="press text-ink-lo hover:text-ink-hi grid h-11 w-10 place-items-center">
                      <Icon name="minus" size={16} />
                    </button>
                    <span className="numeral text-short-ink w-20 text-center font-semibold">{stopAtr.toFixed(2)} ATR</span>
                    <button type="button" aria-label="Stop further" onClick={() => setStopAtr((v) => Math.min(6, v + STEP_ATR))} className="press text-ink-lo hover:text-ink-hi grid h-11 w-10 place-items-center">
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                  <span className="text-ink-dim hidden text-xs sm:inline">No target — you decide when to leave.</span>
                </div>
              ) : (
                <p className="text-ink-lo text-sm">Pick a side, set where the trade is wrong, then run it bar by bar.</p>
              )}
              <Button variant="primary" size="lg" kbd="⏎" disabled={!side} onClick={() => void open()}>
                Open the trade
              </Button>
            </div>
          </Panel>
        )}

        {running && (
          <Panel tone="inset" pad="none" className="rounded-2xl p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <div className="col-span-2 mr-auto flex items-center gap-4 text-sm sm:col-span-1">
                <span className="text-ink-dim">
                  Stop <span className="numeral text-short-ink font-semibold">{(risk / atr).toFixed(2)} ATR</span> away
                </span>
              </div>
              <Button variant="secondary" size="lg" kbd="T" onClick={tighten} disabled={risk === 0}>
                Tighten
              </Button>
              <Button variant="secondary" size="lg" kbd="B" onClick={() => void send({ op: 'stop', price: toTick(entry) })} disabled={atBreakeven}>
                Breakeven
              </Button>
              <Button variant="secondary" size="lg" kbd="H" onClick={() => void send({ op: 'partial' })} disabled={tookHalf}>
                Take half
              </Button>
              <Button variant="primary" size="lg" kbd="C" onClick={() => void send({ op: 'exit' })}>
                Close it
              </Button>
            </div>
          </Panel>
        )}

        {phase === 'done' && result && (
          <Panel tone="hero" pad="none" className="animate-rise rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-5">
              <ScoreRing score={percentile === null ? null : percentile * 100} size={104} thickness={7} />
              <div className="min-w-0 flex-1">
                <Chip tone={result.outcome === 'stop' ? 'short' : 'neutral'} dot>
                  {result.outcome === 'stop' ? 'Stopped out' : 'You closed it'}
                </Chip>
                <div className={cx('numeral mt-2 text-4xl font-semibold', result.rMultiple > 0 ? 'text-gain-ink' : result.rMultiple < 0 ? 'text-loss-ink' : 'text-ink-hi')}>
                  {result.rMultiple >= 0 ? '+' : ''}
                  {result.rMultiple.toFixed(2)}
                  <span className="text-ink-dim ml-1 text-xl font-medium">
                    <Term id="r">R</Term>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip tone={result.direction === 'long' ? 'long' : 'short'}>{result.direction}</Chip>
                  <Chip tone={result.trailed ? 'info' : 'neutral'}>{result.trailed ? 'trailed the stop' : 'never trailed'}</Chip>
                  <Chip tone={result.scaledOut ? 'info' : 'neutral'}>{result.scaledOut ? 'took half' : 'held it all'}</Chip>
                  {state?.score?.parR !== null && state?.score?.parR !== undefined && (
                    <Chip>
                      <Term id="par">Par</Term> {state.score.parR >= 0 ? '+' : ''}
                      {state.score.parR.toFixed(2)}R
                    </Chip>
                  )}
                </div>
              </div>
              <Button variant="primary" size="lg" kbd="⏎" onClick={() => void load()}>
                Next chart
              </Button>
            </div>
            <p className="text-ink-dim mt-4 max-w-prose text-xs leading-relaxed">
              Ranked against the 98 ways this trade could have been managed — trailing at one, two or three ATR,
              breakeven, taking half, or holding to the end. Manage has its own rating; it never moves the other one.
            </p>
          </Panel>
        )}

        <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard" description="L / S to pick a side, ↑↓ for the stop, ⏎ to open. While it runs: T tighten, B breakeven, H take half, C close.">
          <HotkeyLegend />
        </Dialog>
      </div>
    </div>
  );
}
