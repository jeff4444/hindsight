'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bar } from '@/core/bars';
import { DEMO_LEAD_IN, demoBars } from '@/lib/demo-bars';
import { useReducedMotion } from '@/lib/useTween';
import { Button, ScoreRing, cx } from '../ui';
import { Icon } from '../ui/icons';

/**
 * The game, playable on the front page.
 *
 * A synthetic chart — deliberately not a corpus chart, so nothing a visitor sees here can be looked
 * up or recognised later — with the real loop: read it, pick a side, watch sixty candles arrive,
 * see the trade ranked against every one that was possible. Resolution walks the display candles
 * rather than the one-minute path the real game uses, so this is a demonstration of the idea and
 * says so; nothing here is scored or stored.
 */

const W = 720;
const H = 380;
const PAD = { top: 20, right: 18, bottom: 18, left: 14 };
const REVEAL = 60;
const STOP_ATR = 1;
const TARGET_R = 2;
const STOPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const TARGETS = [0.5, 1, 1.5, 2, 3, 5, 8];
const SEEDS = [20_260_811, 7_331, 90_210, 41_577, 123_456];

type Phase = 'read' | 'reveal' | 'result';
type Side = 'long' | 'short' | 'pass';

interface Outcome {
  r: number;
  exit: number | null;
  kind: 'target' | 'stop' | 'time' | 'pass';
}

function atrOf(bars: Bar[]): number {
  const recent = bars.slice(-14);
  return recent.reduce((sum, bar) => sum + (bar.h - bar.l), 0) / recent.length;
}

function resolveOn(path: Bar[], entry: number, side: 'long' | 'short', stopAtr: number, targetR: number, atr: number): Outcome {
  const sign = side === 'long' ? 1 : -1;
  const risk = stopAtr * atr;
  const stop = entry - sign * risk;
  const target = entry + sign * risk * targetR;
  for (let i = 0; i < path.length; i++) {
    const bar = path[i];
    const hitStop = side === 'long' ? bar.l <= stop : bar.h >= stop;
    const hitTarget = side === 'long' ? bar.h >= target : bar.l <= target;
    // Both in one candle: the stop, conservatively. The real game resolves this on minute bars.
    if (hitStop) return { r: -1, exit: i, kind: 'stop' };
    if (hitTarget) return { r: targetR, exit: i, kind: 'target' };
  }
  const last = path[path.length - 1].c;
  return { r: ((last - entry) * sign) / risk, exit: path.length - 1, kind: 'time' };
}

export function TryChart({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [seedIndex, setSeedIndex] = useState(0);
  const bars = useMemo(() => demoBars(SEEDS[seedIndex], DEMO_LEAD_IN + REVEAL), [seedIndex]);
  const lead = bars.slice(0, DEMO_LEAD_IN);
  const path = bars.slice(DEMO_LEAD_IN);
  const entry = lead[lead.length - 1].c;
  const atr = atrOf(lead);

  const [phase, setPhase] = useState<Phase>('read');
  const [side, setSide] = useState<Side | null>(null);
  const [revealed, setRevealed] = useState(0);
  const frame = useRef(0);

  const outcome: Outcome | null = useMemo(() => {
    if (!side) return null;
    if (side === 'pass') return { r: 0, exit: null, kind: 'pass' };
    return resolveOn(path, entry, side, STOP_ATR, TARGET_R, atr);
  }, [side, path, entry, atr]);

  // Every trade that was possible here: both sides, seven stops, seven targets.
  const grid = useMemo(() => {
    const cells: { side: 'long' | 'short'; stop: number; target: number; r: number }[] = [];
    for (const s of ['long', 'short'] as const)
      for (const stop of STOPS) for (const target of TARGETS) cells.push({ side: s, stop, target, r: resolveOn(path, entry, s, stop, target, atr).r });
    return cells;
  }, [path, entry, atr]);
  const best = useMemo(() => grid.reduce((a, b) => (b.r > a.r ? b : a)), [grid]);
  const score = useMemo(() => {
    if (!outcome) return null;
    const below = grid.filter((cell) => cell.r < outcome.r).length;
    const equal = grid.filter((cell) => cell.r === outcome.r).length;
    return Math.round(((below + equal / 2) / grid.length) * 100);
  }, [grid, outcome]);

  const call = useCallback(
    (choice: Side) => {
      if (phase !== 'read') return;
      setSide(choice);
      setPhase('reveal');
      if (reduced) {
        setRevealed(REVEAL);
        setPhase('result');
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const count = Math.min(REVEAL, Math.floor((now - start) / 70));
        setRevealed(count);
        if (count < REVEAL) frame.current = requestAnimationFrame(tick);
        else setTimeout(() => setPhase('result'), 350);
      };
      frame.current = requestAnimationFrame(tick);
    },
    [phase, reduced],
  );

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const again = () => {
    cancelAnimationFrame(frame.current);
    setSeedIndex((i) => (i + 1) % SEEDS.length);
    setSide(null);
    setRevealed(0);
    setPhase('read');
  };

  /* ----------------------------------------------------------- geometry */

  const shown = DEMO_LEAD_IN + revealed;
  const progress = revealed / REVEAL;
  const from = Math.round(DEMO_LEAD_IN - 52 + (0 - (DEMO_LEAD_IN - 52)) * progress * progress);
  const to = phase === 'read' ? DEMO_LEAD_IN + 14 : Math.max(shown + 3, DEMO_LEAD_IN + 14 + (REVEAL - 14) * progress);
  const visible = bars.slice(from, Math.min(shown, bars.length));

  const sign = side === 'short' ? -1 : 1;
  const risk = STOP_ATR * atr;
  const stopPrice = entry - sign * risk;
  const targetPrice = entry + sign * risk * TARGET_R;
  const bestSign = best.side === 'long' ? 1 : -1;
  const bestStop = entry - bestSign * best.stop * atr;
  const bestTarget = entry + bestSign * best.stop * atr * best.target;

  const prices = visible.flatMap((b) => [b.h, b.l]);
  if (side && side !== 'pass') prices.push(stopPrice, targetPrice);
  if (phase === 'result') prices.push(bestStop, bestTarget);
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + ((i - from) / Math.max(1, to - from)) * plotW;
  const y = (p: number) => PAD.top + (1 - (p - lo) / Math.max(1e-9, hi - lo)) * plotH;
  const bw = Math.max(1.5, (plotW / Math.max(1, to - from)) * 0.6);
  const now = x(shown - 0.5);

  const live = side && side !== 'pass' && revealed > 0 ? liveR(path, revealed, entry, side, risk, outcome) : null;

  return (
    <div data-theme="dark" className={cx('bg-surface-1 border-line text-ink overflow-hidden rounded-3xl border', className)}>
      <div className="border-line-faint flex items-center justify-between border-b px-4 py-3">
        <span className="text-ink-max text-sm font-semibold">Try one</span>
        <span className="numeral text-ink-dim text-xs">a demo chart · not scored</span>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="A practice chart: eighty candles of history, then sixty more revealed after you call it.">
          <defs>
            <pattern id="try-fog" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-ink-max)" strokeOpacity="0.08" strokeWidth="1.5" />
            </pattern>
          </defs>

          {/* the future, as fog */}
          {phase !== 'result' && now < W - PAD.right && (
            <>
              <rect x={now} y={PAD.top} width={W - PAD.right - now} height={plotH} fill="url(#try-fog)" />
              <line x1={now} x2={now} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--color-ink-dim)" strokeDasharray="3 4" />
              {phase === 'read' && (
                <text x={(now + W - PAD.right) / 2} y={H / 2} textAnchor="middle" fontSize="13" fill="var(--color-ink-dim)" className="numeral">
                  60h ahead
                </text>
              )}
            </>
          )}

          {side && side !== 'pass' && (
            <>
              <rect x={PAD.left} y={Math.min(y(entry), y(stopPrice))} width={plotW} height={Math.abs(y(stopPrice) - y(entry))} fill="var(--color-short-wash)" />
              <rect x={PAD.left} y={Math.min(y(entry), y(targetPrice))} width={plotW} height={Math.abs(y(targetPrice) - y(entry))} fill="var(--color-long-wash)" />
            </>
          )}

          {visible.map((bar, i) => {
            const index = from + i;
            const up = bar.c >= bar.o;
            const colour = up ? 'var(--color-long)' : 'var(--color-short)';
            const top = y(Math.max(bar.o, bar.c));
            return (
              <g key={index}>
                <line x1={x(index)} x2={x(index)} y1={y(bar.h)} y2={y(bar.l)} stroke={colour} strokeWidth="1" />
                <rect x={x(index) - bw / 2} y={top} width={bw} height={Math.max(1, y(Math.min(bar.o, bar.c)) - top)} fill={colour} />
              </g>
            );
          })}

          <line x1={PAD.left} x2={W - PAD.right} y1={y(entry)} y2={y(entry)} stroke="var(--color-ink-dim)" strokeDasharray="4 3" />
          {side && side !== 'pass' && (
            <>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(stopPrice)} y2={y(stopPrice)} stroke="var(--color-short)" strokeWidth="2" />
              <line x1={PAD.left} x2={W - PAD.right} y1={y(targetPrice)} y2={y(targetPrice)} stroke="var(--color-long)" strokeWidth="2" />
            </>
          )}
          {phase === 'result' && (
            <>
              <line x1={x(DEMO_LEAD_IN - 1)} x2={W - PAD.right} y1={y(bestTarget)} y2={y(bestTarget)} stroke="var(--color-gold)" strokeWidth="2" />
              <line x1={x(DEMO_LEAD_IN - 1)} x2={W - PAD.right} y1={y(bestStop)} y2={y(bestStop)} stroke="var(--color-gold)" strokeWidth="2" strokeDasharray="5 4" />
              <text x={W - PAD.right - 4} y={y(bestTarget) - 6} textAnchor="end" fontSize="12" fill="var(--color-gold-ink)">
                best in hindsight
              </text>
            </>
          )}

          {live !== null && phase === 'reveal' && (
            <text x={W - PAD.right - 6} y={PAD.top + 28} textAnchor="end" fontSize="30" fontWeight="600" className="numeral" fill={live >= 0 ? 'var(--color-long-ink)' : 'var(--color-short-ink)'}>
              {live >= 0 ? '+' : ''}
              {live.toFixed(2)}R
            </text>
          )}
        </svg>

        {phase === 'result' && outcome && score !== null && (
          <div className="bg-scrim animate-fade absolute inset-0 flex items-center justify-center p-4">
            <div className="animate-stamp flex flex-col items-center text-center">
              <ScoreRing score={score} size={112} />
              <div className={cx('numeral mt-3 text-3xl font-semibold', outcome.r > 0 ? 'text-gain-ink' : outcome.r < 0 ? 'text-loss-ink' : 'text-restraint-ink')}>
                {outcome.kind === 'pass' ? 'Sat out · 0.00R' : `${outcome.r >= 0 ? '+' : ''}${outcome.r.toFixed(2)}R`}
              </div>
              <p className="text-ink-lo mt-2 max-w-xs text-sm">
                Better than {score} of 100 trades you could have placed here. The gold lines were the best one.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-line-faint flex flex-wrap items-center gap-2 border-t p-3">
        {phase === 'read' && (
          <>
            <button type="button" onClick={() => call('long')} className="press bg-long-bg text-long-ink ring-long-line hover:bg-long/25 flex h-11 flex-1 items-center justify-center gap-2 rounded-full font-semibold ring-1">
              <Icon name="arrow-up" size={17} stroke={2} />
              Long
            </button>
            <button type="button" onClick={() => call('short')} className="press bg-short-bg text-short-ink ring-short-line hover:bg-short/25 flex h-11 flex-1 items-center justify-center gap-2 rounded-full font-semibold ring-1">
              <Icon name="arrow-down" size={17} stroke={2} />
              Short
            </button>
            <button type="button" onClick={() => call('pass')} className="press text-ink-lo ring-line hover:text-ink-hi h-11 rounded-full px-5 text-sm font-medium ring-1">
              Sit out
            </button>
          </>
        )}
        {phase === 'reveal' && <p className="text-ink-lo w-full py-2.5 text-center text-sm">Watching the next 60 hours…</p>}
        {phase === 'result' && (
          <>
            <Button variant="ghost" onClick={again}>
              <Icon name="rotate-ccw" size={15} />
              Another chart
            </Button>
            <Button href="/play/daily" variant="primary" className="ml-auto">
              Play today&rsquo;s daily
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function liveR(path: Bar[], revealed: number, entry: number, side: 'long' | 'short', risk: number, outcome: Outcome | null): number {
  if (outcome && outcome.exit !== null && revealed > outcome.exit) return outcome.r;
  const last = path[revealed - 1];
  return ((last.c - entry) * (side === 'long' ? 1 : -1)) / risk;
}
