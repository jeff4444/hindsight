'use client';

import { useEffect, useRef, useState } from 'react';
import { easeOutCubic } from '@/lib/camera';
import type { RoundResult } from '@/lib/api-types';

/**
 * The post-trade panel.
 *
 * Phase 0 shows the R-multiple and the excursions and nothing else — there is no achievable
 * distribution, no percentile and no council yet. §4.1 fixes the vocabulary: R is the initial
 * risk, the R-multiple is the outcome divided by it, and both terms are defined in-app rather
 * than assumed. §4.6 puts MFE and MAE on every result at every tier.
 */
export function ResultCard({
  result,
  onNext,
  onReplay,
}: {
  result: RoundResult;
  onNext: () => void;
  onReplay: () => void;
}) {
  const passed = result.outcome === 'pass';
  const r = result.rMultiple ?? 0;
  const counted = useCountUp(passed ? 0 : r, 620);
  const tone = passed
    ? 'text-slate-300'
    : r > 0
      ? 'text-emerald-400'
      : r < 0
        ? 'text-rose-400'
        : 'text-slate-300';

  return (
    <div className="hs-rise rounded-lg border border-white/10 bg-slate-900/60 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold tracking-widest text-slate-500">
            {passed ? 'PASSED' : outcomeLabel(result)}
          </div>
          <div className={`font-mono text-4xl font-semibold tabular-nums ${tone}`}>
            {counted >= 0 ? '+' : ''}
            {counted.toFixed(2)}R
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReplay}
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 active:scale-[0.98]"
          >
            Replay <kbd className="ml-1 text-[10px] text-slate-600">R</kbd>
          </button>
          <button
            onClick={onNext}
            className="rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white active:scale-[0.98]"
          >
            Next chart <kbd className="ml-1 text-[10px] text-slate-500">⏎</kbd>
          </button>
        </div>
      </div>

      {passed ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Restraint is a scored action. On a chart that went nowhere, passing beats most entries
          — but Phase&nbsp;0 has no achievable distribution to score it against yet, so this one
          just reads flat.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
            <Stat label="Direction" value={result.direction ?? '—'} delay={60} />
            <Stat label="Risk / unit" value={result.riskPerUnit?.toFixed(2) ?? '—'} delay={120} />
            <Stat
              label="MFE"
              value={fmtR(result.mfeR)}
              hint="best it showed while you held it"
              delay={180}
            />
            <Stat
              label="MAE"
              value={fmtR(result.maeR)}
              hint="worst it showed while you held it"
              delay={240}
            />
          </dl>

          <div className="mt-4 border-t border-white/5 pt-3">
            <div className="text-[10px] font-semibold tracking-widest text-slate-500">
              THE MANAGED CEILING
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Across the whole window the move was worth{' '}
              <span className="font-mono text-slate-200">{fmtR(result.windowMfeR)}</span> your way
              and <span className="font-mono text-slate-200">{fmtR(result.windowMaeR)}</span>{' '}
              against you. A set-and-forget bracket cannot capture that; managing the trade
              could have.
            </p>
          </div>

          {result.ambiguous && (
            <p className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] leading-relaxed text-amber-200/80">
              Stop and target were both touched inside a single one-minute bar, so even the
              resolution path cannot order them. Resolved stop-first and flagged — a round like
              this would be excluded from ranked play.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Run a number up to its value once, on mount.
 *
 * Purely decorative, and deliberately short: the R-multiple is the headline of the screen and
 * arriving at it reads better than appearing at it. Anything longer than about 600ms starts to
 * feel like the app is withholding the answer.
 */
function useCountUp(value: number, durationMs: number): number {
  const [shown, setShown] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    // Nothing to run up to; `shown` already starts at zero.
    if (value === 0) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      setShown(value * easeOutCubic(t));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs]);

  return shown;
}

function outcomeLabel(result: RoundResult): string {
  if (result.outcome === 'target') return 'TARGET HIT';
  if (result.outcome === 'stop') return 'STOPPED OUT';
  return 'NEITHER — MARKED TO MARKET';
}

function fmtR(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}

function Stat({
  label,
  value,
  hint,
  delay,
}: {
  label: string;
  value: string;
  hint?: string;
  delay: number;
}) {
  return (
    <div className="hs-rise" style={{ animationDelay: `${delay}ms` }}>
      <dt className="text-[10px] font-semibold tracking-widest text-slate-500" title={hint}>
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-slate-200">{value}</dd>
    </div>
  );
}
