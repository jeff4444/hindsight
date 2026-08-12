'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bar } from '@/core/bars';
import { MANAGE_MS_PER_BAR, REVEAL_BARS } from '@/core/config';
import { toTick } from '@/core/normalize';
import type { RoundPayload } from '@/lib/api-types';
import { Chart, type ChartHandle } from '../Chart';
import { Button, Eyebrow, Panel, Stat, cx, toneInk } from '../ui';

/**
 * §10.1's Manage mode: the candles advance and you are still deciding.
 *
 * ## Why this is not the Naked surface with a timer
 *
 * In Naked the decision is over before the reveal starts, so the client holds the whole window and
 * animates it locally. Manage cannot work that way — §6 forbids future data reaching the client
 * before the decisions that depend on it, and here the decisions run the length of the reveal. **No
 * amount of care in this file would fix that**: whatever it chose to draw, the bytes would be in the
 * tab.
 *
 * So this surface is a thin client over a server clock. It knows only the bars the server has
 * released, it asks for more on an interval, and it never advances a candle on its own authority. If
 * the poll stalls, the chart stops — which is the correct behaviour, because the position is frozen
 * on the server too.
 *
 * ## Why the stop is stepped and not dragged
 *
 * The bracket surface drags two rails, and that is right when nothing is moving. Here the candles
 * arrive every second, so a drag is a moving target in the literal sense — and the one action that
 * must never be ambiguous is the stop, because a stop that lands a tick lower is a different R.
 *
 * The controls are therefore discrete and named: tighten by a quarter of an ATR, jump to breakeven,
 * take half off, close. Each is a thing the player *meant*, which is also what makes the action log
 * a readable record of the round afterwards.
 *
 * **The stop can only ever tighten**, here and on the server. This surface disables the control
 * rather than letting the request fail, but the rule is enforced where it matters: R is the initial
 * risk (§4.1), and a stop walked away from entry would change the denominator after the fact.
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

/** One quarter of an ATR: fine enough to be a real choice, coarse enough to be a deliberate one. */
const STEP_ATR = 0.25;

export function ManageSurface({ tape = 'open' }: { tape?: string }) {
  const chart = useRef<ChartHandle>(null);
  const issued = useRef(false);

  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [stop, setStop] = useState(0);
  const [state, setState] = useState<ManageState | null>(null);

  const entry = round?.entry ?? 0;
  const atr = round?.atr ?? 1;
  const isLong = stop < entry;

  /* --------------------------------------------------------------- issuance */

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setState(null);
    try {
      const response = await fetch(`/api/round?tape=${encodeURIComponent(tape)}`, { method: 'POST' });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Could not start a round.');
      const payload: RoundPayload = await response.json();
      setRound(payload);
      setStop(toTick(payload.entry - payload.atr));
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

  // The lead-in, then whatever the server has released. Never more.
  useEffect(() => {
    if (!round || !chart.current) return;
    chart.current.setClock(round.startDayOfWeek, round.startHourUtc);
    chart.current.setBars([...round.bars, ...(state?.bars ?? [])]);
  }, [round, state?.bars]);

  useEffect(() => {
    if (!chart.current || !round) return;
    const lastIndex = round.bars.length + (state?.bars.length ?? 0) - 1;
    chart.current.setOverlays([
      {
        points: [
          { index: 0, price: entry },
          { index: Math.max(0, lastIndex), price: entry },
        ],
        color: 'rgba(148,163,184,0.7)',
        dashed: true,
      },
      {
        points: [
          { index: 0, price: state?.stop ?? stop },
          { index: Math.max(0, lastIndex), price: state?.stop ?? stop },
        ],
        color: 'rgba(248,113,113,0.9)',
        width: 2,
      },
    ]);
  }, [round, state?.bars.length, state?.stop, stop, entry]);

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
        // A 409 is usually the server telling us the position closed while a click was in flight.
        // That is not an error state for the player — the next tick will carry the result.
        if (response.status !== 409) setError(payload.error ?? 'Something went wrong.');
        return;
      }
      setState(payload as ManageState);
      if ((payload as ManageState).done) setPhase('done');
    },
    [round],
  );

  // Poll rather than push. The server is authoritative about how far the reveal has got, so the
  // client's job is to ask — and asking four times a candle keeps the chart honest without a socket.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => void send({ op: 'tick' }), MANAGE_MS_PER_BAR / 4);
    return () => clearInterval(id);
  }, [phase, send]);

  /* -------------------------------------------------------------- the moves */

  const open = async () => {
    setPhase('running');
    await send({ op: 'open', stop });
  };

  const currentStop = state?.stop ?? stop;
  const risk = Math.abs(entry - currentStop);
  const tighten = () => {
    const next = toTick(isLong ? currentStop + STEP_ATR * atr : currentStop - STEP_ATR * atr);
    // Never past the entry by a step — breakeven is its own button, and overshooting it would close
    // the position at a profit the player did not ask for.
    const clamped = isLong ? Math.min(next, entry) : Math.max(next, entry);
    void send({ op: 'stop', price: clamped });
  };

  const running = phase === 'running' && !state?.done;
  const revealed = state?.revealed ?? 0;

  if (phase === 'error') {
    return (
      <Panel pad="md" className="mx-auto mt-10 max-w-md text-center">
        <p className="text-ink-lo text-sm">{error}</p>
        <Button className="mt-4" onClick={() => void load()}>
          Try again
        </Button>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Eyebrow>Manage</Eyebrow>
          <p className="text-ink-lo mt-0.5 max-w-prose text-sm leading-relaxed">
            No target. The candles advance on the server’s clock and you decide when to leave —
            scored against 98 management policies, not against 98 brackets.
          </p>
        </div>
        {running && (
          <span className="numeral text-ink-lo text-xs">
            {revealed}/{REVEAL_BARS}
          </span>
        )}
      </div>

      {/* `Chart` renders a bare div, so it takes its size from what it is given — without an
          explicit height here it lays out at zero and draws an axis with no candles under it. */}
      <div className="border-line bg-surface-1 h-[clamp(22rem,52dvh,40rem)] overflow-hidden rounded-2xl border">
        <Chart ref={chart} className="h-full w-full" />
      </div>

      {phase === 'placing' && (
        <Panel pad="md" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Stat label="Side" value={isLong ? 'long' : 'short'} mono={false} />
            <Stat label="Stop" value={`${(risk / atr).toFixed(2)} ATR`} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setStop(toTick(stop - STEP_ATR * atr))}>
              Stop lower
            </Button>
            <Button variant="secondary" onClick={() => setStop(toTick(stop + STEP_ATR * atr))}>
              Stop higher
            </Button>
            <Button variant="primary" onClick={() => void open()} disabled={risk === 0}>
              Open the position
            </Button>
          </div>
        </Panel>
      )}

      {running && (
        <Panel pad="md" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Stat label="Stop" value={currentStop.toFixed(2)} />
            <Stat label="Risk" value={`${(risk / atr).toFixed(2)} ATR`} />
            <Stat label="Half off" value={state?.events.some((e) => e.action.kind === 'partial') ? 'yes' : 'no'} mono={false} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={tighten} disabled={risk === 0}>
              Tighten
            </Button>
            <Button
              variant="secondary"
              onClick={() => void send({ op: 'stop', price: toTick(entry) })}
              disabled={currentStop === toTick(entry)}
            >
              Breakeven
            </Button>
            <Button
              variant="secondary"
              onClick={() => void send({ op: 'partial' })}
              disabled={state?.events.some((e) => e.action.kind === 'partial')}
            >
              Take half
            </Button>
            <Button variant="primary" onClick={() => void send({ op: 'exit' })}>
              Close
            </Button>
          </div>
        </Panel>
      )}

      {phase === 'done' && state?.result && (
        <Panel pad="md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Eyebrow tone={state.result.rMultiple > 0 ? 'long' : 'short'}>
                {state.result.outcome === 'stop' ? 'Stopped out' : 'Closed'}
              </Eyebrow>
              <p className={cx('numeral mt-0.5 text-3xl font-semibold', toneInk(state.result.rMultiple > 0 ? 'long' : 'short'))}>
                {state.result.rMultiple >= 0 ? '+' : ''}
                {state.result.rMultiple.toFixed(2)}R
              </p>
            </div>
            {state.score?.percentile !== null && state.score !== undefined && (
              <div className="text-right">
                <Eyebrow>Percentile</Eyebrow>
                <p className="numeral text-ink-max mt-0.5 text-3xl font-semibold">
                  {Math.round((state.score.percentile ?? 0) * 100)}
                </p>
              </div>
            )}
            <Button variant="primary" size="lg" onClick={() => void load()}>
              Next chart
            </Button>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Stat label="Direction" value={state.result.direction} index={0} mono={false} />
            <Stat label="Trailed" value={state.result.trailed ? 'yes' : 'no'} index={1} mono={false} />
            <Stat label="Scaled out" value={state.result.scaledOut ? 'yes' : 'no'} index={2} mono={false} />
            <Stat
              label="Par"
              value={state.score?.parR === null || state.score?.parR === undefined ? '—' : `${state.score.parR.toFixed(2)}R`}
              index={3}
            />
          </dl>

          {/*
            The sentence that keeps the two ladders apart. Manage's par is 0.367R above the bracket
            grid's, so a managed result read against the Naked distribution would look better than it
            is — see §17. Saying which distribution this percentile came from is the whole point.
          */}
          <p className="text-ink-faint mt-4 max-w-prose text-xs leading-relaxed">
            Ranked against the 98 management policies that were available on this chart — trailing at
            one, two and three ATR, breakeven, scaling out, and holding to the end — not against the
            98 brackets Naked scores. The two distributions have different medians, so the numbers are
            not interchangeable and this one is not part of your Naked rating.
          </p>
        </Panel>
      )}
    </div>
  );
}
