'use client';

import { useEffect, useRef, useState } from 'react';
import { DEMO_LEAD_IN, demoBars } from '@/lib/demo-bars';
import { CANDLE } from '@/lib/palette';
import { useReducedMotion } from '@/lib/useTween';
import { cx } from '../ui';

/**
 * The mechanic, running.
 *
 * The old hero was a 3x3 grid of generated avatars. Whatever else that showed, it did not show a
 * chart — which is a strange thing for the front page of a chart game to omit, and it left the
 * one genuinely unusual thing about the product (that the future arrives one candle at a time
 * against a bracket you already committed) entirely to prose.
 *
 * **Drawn as SVG rather than with the real chart engine.** `lightweight-charts` is ~50kB and would
 * become the landing page's largest contentful paint, in exchange for fidelity nobody is checking
 * at this size. Everything that communicates the mechanic — candles in the product's own two
 * colours, a stop and a target committed before the reveal, the future arriving bar by bar, a
 * running R — is a few hundred bytes of geometry. The real engine stays where it is played.
 *
 * The loop: place (rails settle) → seal → reveal 60 bars → score → hold → reset. About 12s.
 */

const BARS = demoBars();
const TOTAL_REVEAL = BARS.length - DEMO_LEAD_IN;

const W = 720;
const H = 420;
const PAD = { top: 18, right: 16, bottom: 16, left: 16 };

/** Beats of one cycle, in ms from the start. */
const PLACE_MS = 1800;
const SEAL_MS = 500;
const REVEAL_MS = 4600;
const SCORE_MS = 2400;
const RESET_MS = 900;
const CYCLE = PLACE_MS + SEAL_MS + REVEAL_MS + SCORE_MS + RESET_MS;

export function HeroReveal({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(reduced ? PLACE_MS + SEAL_MS + REVEAL_MS + 400 : 0);

  // Paused off-screen: this runs a frame loop, and a marquee animating below the fold is pure
  // battery cost. Under reduced motion it never starts at all and simply renders the resolved
  // frame, which is the state that carries the most information anyway.
  useEffect(() => {
    if (reduced) return;
    const node = host.current;
    if (!node) return;

    let raf = 0;
    let origin = 0;
    let running = false;

    const tick = (now: number) => {
      if (!origin) origin = now;
      setT((now - origin) % CYCLE);
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !running) {
          running = true;
          origin = 0;
          raf = requestAnimationFrame(tick);
        } else if (!entry.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  /* ------------------------------------------------------------- phase */

  const sealed = t >= PLACE_MS;
  const revealT = Math.min(Math.max(t - PLACE_MS - SEAL_MS, 0), REVEAL_MS);
  const revealed = Math.min(TOTAL_REVEAL, Math.floor((revealT / REVEAL_MS) * TOTAL_REVEAL));
  const scoring = t >= PLACE_MS + SEAL_MS + REVEAL_MS;
  const resetting = t >= CYCLE - RESET_MS;

  /* ------------------------------------------------------------ geometry */

  const entry = BARS[DEMO_LEAD_IN - 1].c;
  // A bracket that loses on the way and wins in the end, which is the shape worth showing.
  const stop = entry * 0.972;
  const target = entry * 1.058;

  // The camera widens as the future arrives, exactly as the real one does.
  const shown = DEMO_LEAD_IN + revealed;
  const from = Math.round(lerp(DEMO_LEAD_IN - 46, 0, easeOut(revealed / TOTAL_REVEAL)));
  const to = Math.max(shown + 2, DEMO_LEAD_IN + 4);
  const visible = BARS.slice(from, to);

  let lo = Math.min(stop, ...visible.map((b) => b.l));
  let hi = Math.max(target, ...visible.map((b) => b.h));
  const padY = (hi - lo) * 0.1;
  lo -= padY;
  hi += padY;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + ((i - from) / Math.max(1, to - from)) * plotW;
  const y = (p: number) => PAD.top + (1 - (p - lo) / Math.max(1e-9, hi - lo)) * plotH;
  const bw = Math.max(1.5, (plotW / Math.max(1, to - from)) * 0.62);

  const last = BARS[shown - 1];
  const risk = entry - stop;
  const r = last ? (last.c - entry) / risk : 0;
  const hitTarget = revealed > 0 && BARS.slice(DEMO_LEAD_IN, shown).some((b) => b.h >= target);
  const finalR = hitTarget ? (target - entry) / risk : r;

  return (
    <div
      ref={host}
      className={cx(
        'border-line bg-surface-1 shadow-well relative overflow-hidden rounded-2xl border',
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={cx('block w-full transition-opacity duration-500', resetting ? 'opacity-0' : 'opacity-100')}
        role="img"
        aria-label="A demonstration: eighty candles of history, a stop and a target committed, then sixty candles of future arriving one at a time."
      >
        <defs>
          <linearGradient id="hero-vignette" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.30 0.02 265)" stopOpacity="0.5" />
            <stop offset="60%" stopColor="transparent" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#hero-vignette)" />

        {/* the region the future will fill */}
        {sealed && (
          <rect
            x={x(DEMO_LEAD_IN - 0.5)}
            y={PAD.top}
            width={Math.max(0, x(to) - x(DEMO_LEAD_IN - 0.5))}
            height={plotH}
            fill="oklch(1 0 0 / 0.018)"
          />
        )}

        {/* risk and reward bands, once the bracket is committed */}
        {sealed && (
          <>
            <rect x={PAD.left} y={y(entry)} width={plotW} height={Math.max(0, y(stop) - y(entry))} fill="var(--color-short-wash)" />
            <rect x={PAD.left} y={y(target)} width={plotW} height={Math.max(0, y(entry) - y(target))} fill="var(--color-long-wash)" />
          </>
        )}

        {/* candles */}
        {visible.map((bar, i) => {
          const index = from + i;
          const up = bar.c >= bar.o;
          const colour = up ? CANDLE.up : CANDLE.down;
          const future = index >= DEMO_LEAD_IN;
          const bodyTop = y(Math.max(bar.o, bar.c));
          const bodyH = Math.max(1, y(Math.min(bar.o, bar.c)) - bodyTop);
          return (
            <g key={index} opacity={future ? 1 : 0.92}>
              <line x1={x(index)} x2={x(index)} y1={y(bar.h)} y2={y(bar.l)} stroke={colour} strokeWidth={1} />
              <rect x={x(index) - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={colour} />
            </g>
          );
        })}

        {/* the bracket */}
        <Rail y={y(entry)} w={W} colour="var(--color-ink-faint)" dashed label="ENTRY" show />
        <Rail y={y(stop)} w={W} colour="var(--color-short)" label="STOP" show={t > 300} sealed={sealed} />
        <Rail y={y(target)} w={W} colour="var(--color-long)" label="TARGET" show={t > 600} sealed={sealed} />

        {/* running R, then the score */}
        {revealed > 0 && (
          <text
            x={W - PAD.right}
            y={PAD.top + 20}
            textAnchor="end"
            className="numeral"
            fontSize={scoring ? 44 : 26}
            fontWeight={640}
            fill={finalR >= 0 ? 'var(--color-long-ink)' : 'var(--color-short-ink)'}
            style={{ transition: 'font-size 400ms var(--ease-entrance)' }}
          >
            {finalR >= 0 ? '+' : ''}
            {finalR.toFixed(2)}R
          </text>
        )}
        {scoring && (
          <text x={W - PAD.right} y={PAD.top + 42} textAnchor="end" fontSize={11} letterSpacing={1.4} fill="var(--color-ink-dim)">
            {hitTarget ? 'TARGET HIT' : 'MARKED TO MARKET'}
          </text>
        )}
      </svg>

      <div className="border-line-faint text-ink-dim flex items-center justify-between border-t px-4 py-2.5 text-xs">
        <span>{sealed ? (scoring ? 'Scored against 98 brackets' : `Revealing ${revealed}/${TOTAL_REVEAL}`) : 'Place a stop and a target'}</span>
        <span className="numeral text-ink-faint">demo · synthetic path</span>
      </div>
    </div>
  );
}

function Rail({
  y,
  w,
  colour,
  label,
  show,
  dashed,
  sealed,
}: {
  y: number;
  w: number;
  colour: string;
  label: string;
  show: boolean;
  dashed?: boolean;
  sealed?: boolean;
}) {
  if (!show) return null;
  return (
    <g>
      <line
        x1={PAD.left}
        x2={w - PAD.right}
        y1={y}
        y2={y}
        stroke={colour}
        strokeWidth={sealed ? 2 : 1.5}
        strokeDasharray={dashed ? '4 4' : undefined}
      />
      <text x={PAD.left + 4} y={y - 5} fontSize={10} letterSpacing={1.2} fill={colour} className="numeral">
        {label}
      </text>
    </g>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 2);
