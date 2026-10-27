'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OpenRequest, SessionOp } from '@/lib/trading/schemas';
import type { TradeDriver } from '@/lib/trading/driver';
import type { FillView, SessionDelta, SessionOpen, WireBar } from '@/lib/trading/types';
import { formatPrice, formatQty, formatUsd } from '@/lib/trading/format';

/**
 * One trading session, as the terminal sees it.
 *
 * Requests go out one at a time, in order — a cancel can never overtake the order it cancels —
 * and while the replay is playing the hook asks for new minutes a couple of times a second. Each
 * answer carries only the minutes the terminal does not have yet, and the hook hands those to the
 * chart as an append rather than a redraw.
 *
 * It also turns what changed into words: a fill becomes "Bought 0.25 BTC at 43,120.5", a refusal
 * becomes the reason, a liquidation becomes an alarm.
 */

export const POLL_MS = 450;

export interface TradeSessionApi {
  open: SessionOpen | null;
  delta: SessionDelta | null;
  /** Every tape minute revealed so far. */
  tape: WireBar[];
  busy: boolean;
  error: string | null;
  act: (op: SessionOp) => Promise<SessionDelta | null>;
}

export interface TradeSessionCallbacks {
  /** New tape minutes. `reset` means the chart should reload from `tape` instead of appending. */
  onBars?: (bars: WireBar[], reset: boolean) => void;
  onNotice?: (message: string, tone: 'neutral' | 'success' | 'error') => void;
  onClosed?: (delta: SessionDelta) => void;
}

function describeFill(fill: FillView, open: SessionOpen): string {
  const verb = fill.side === 'buy' ? 'Bought' : 'Sold';
  const what = `${formatQty(fill.qty, open.instrument)} ${open.instrument.base}`;
  const at = formatPrice(fill.price, open.instrument);
  const label: Record<string, string> = {
    'take-profit': 'Take-profit filled: ',
    'stop-loss': 'Stop-loss filled: ',
    liquidation: 'Liquidated: ',
    flatten: 'Session closed: ',
  };
  const realized = fill.realized !== 0 ? ` · ${formatUsd(fill.realized, { sign: true })}` : '';
  return `${label[fill.role] ?? ''}${verb} ${what} at ${at}${realized}`;
}

export function useTradeSession(
  driver: TradeDriver,
  start: { sessionId: string } | { request: OpenRequest } | null,
  callbacks: TradeSessionCallbacks = {},
): TradeSessionApi {
  const [open, setOpen] = useState<SessionOpen | null>(null);
  const [delta, setDelta] = useState<SessionDelta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tape, setTape] = useState<WireBar[]>([]);

  const tapeRef = useRef<WireBar[]>([]);
  const openRef = useRef<SessionOpen | null>(null);
  const lastFill = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);
  const closedRef = useRef(false);
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });

  const absorb = useCallback((next: SessionDelta) => {
    const current = tapeRef.current;
    const { from, data } = next.bars;
    if (data.length > 0 || from < current.length) {
      const reset = from !== current.length;
      const merged = [...current.slice(0, from), ...data];
      tapeRef.current = merged;
      setTape(merged);
      cb.current.onBars?.(reset ? merged : data, reset);
    }
    const session = openRef.current;
    if (session) {
      for (const fill of next.fills) {
        if (fill.n <= lastFill.current) continue;
        lastFill.current = fill.n;
        cb.current.onNotice?.(describeFill(fill, session), fill.role === 'liquidation' ? 'error' : 'success');
      }
    }
    if (next.rejected) cb.current.onNotice?.(next.rejected.text, 'error');
    if (next.away) cb.current.onNotice?.('Paused while you were away. Press play to carry on.', 'neutral');
    if (next.status === 'closed' && !closedRef.current) {
      closedRef.current = true;
      cb.current.onClosed?.(next);
    }
    setDelta(next);
  }, []);

  // Open or resume once.
  const startKey = start === null ? null : 'sessionId' in start ? start.sessionId : JSON.stringify(start.request);
  useEffect(() => {
    if (start === null) return;
    let cancelled = false;
    const load = 'sessionId' in start ? driver.resume(start.sessionId) : driver.open(start.request);
    load
      .then((session) => {
        if (cancelled) return;
        openRef.current = session;
        tapeRef.current = [];
        lastFill.current = session.fills.reduce((max, f) => Math.max(max, f.n), 0);
        closedRef.current = session.status === 'closed';
        setOpen(session);
        absorb(session);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'The session could not be opened.');
      });
    return () => {
      cancelled = true;
    };
    // `start` is identified by its key; the object itself is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver, startKey, absorb]);

  const act = useCallback(
    (op: SessionOp): Promise<SessionDelta | null> => {
      const session = openRef.current;
      if (!session) return Promise.resolve(null);
      inFlight.current += 1;
      if (op.op !== 'tick') setBusy(true);
      const run = chain.current.then(async () => {
        try {
          const next = await driver.act(session.sessionId, tapeRef.current.length, op);
          absorb(next);
          setError(null);
          return next;
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : 'That request failed.';
          if (op.op !== 'tick') cb.current.onNotice?.(message, 'error');
          setError(message);
          return null;
        } finally {
          inFlight.current -= 1;
          if (inFlight.current === 0) setBusy(false);
        }
      });
      chain.current = run;
      return run;
    },
    [driver, absorb],
  );

  // Ask for new minutes while the replay plays.
  const playing = delta !== null && delta.status === 'open' && !delta.clock.paused;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (inFlight.current === 0) void act({ op: 'tick' });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [playing, act]);

  // A hidden tab pauses the replay rather than leaving the market to run unwatched.
  useEffect(() => {
    if (!playing) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') void act({ op: 'pause' });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [playing, act]);

  return { open, delta, tape, busy, error, act };
}
