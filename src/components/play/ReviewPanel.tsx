'use client';

import type { Verdict } from '@/core/engines';
import type { ChartProvenance, RevealPayload, RoundResult, ScorePayload } from '@/lib/api-types';
import { sentences } from '@/lib/debrief';
import { STOP_ATR, TARGET_R, axisPosition } from '@/lib/grid';
import { bestBracket, verdictFor } from '@/lib/verdict';
import { AchievableField } from '../debrief/AchievableField';
import { Button, Chip, Disclosure, ScoreRing, cx } from '../ui';
import { Term } from '../ui/client';
import { Icon } from '../ui/icons';
import { PanelRow } from './PanelRow';
import { RevealCard } from './RevealCard';
import { ScoreStrip } from './ScoreStrip';

/**
 * The Review: what happened, how good it was, and why.
 *
 * Top to bottom, in the order a player wants it:
 *
 *   1. **The verdict** — one line in the serif (`lib/verdict.ts`).
 *   2. **The score** — a ring and the R beside it. One hero number, and it is the one that is not
 *      luck: how the trade ranked against everything that was possible.
 *   3. **Every possible trade** — the strip, with you, par, sitting out and the best in hindsight.
 *   4. **What it was** — the ticker and the date, turned over.
 *   5. **The Panel** — seven schools and a coin, as faces you can tap.
 *   6. **Details** — the diagnosis, the full grid, costs, excursion. Collapsed.
 *
 * It replaces a rail of eleven stacked sections whose headline competed with an always-visible
 * paragraph about coin flips and an open-by-default diagnosis. Nothing was removed; the hierarchy
 * was.
 */
export function ReviewPanel({
  result,
  score,
  provenance,
  verdicts,
  style,
  entry,
  atr,
  confidence,
  forfeited,
  showBest,
  onShowBest,
  persona,
  onPersona,
  nextLabel,
  onNext,
  onReplay,
  onShare,
  className,
}: {
  result: RoundResult;
  score: ScorePayload | null;
  provenance: ChartProvenance | null;
  verdicts: Verdict[];
  style: RevealPayload['style'];
  entry: number;
  atr: number | null;
  confidence: number | null;
  forfeited: boolean;
  showBest: boolean;
  onShowBest: (on: boolean) => void;
  persona: string | null;
  onPersona: (engine: string | null) => void;
  nextLabel: string;
  onNext: () => void;
  onReplay: () => void;
  onShare?: () => void;
  className?: string;
}) {
  const passed = result.outcome === 'pass';
  const r = passed ? 0 : result.rMultiple;
  const percentile = score?.percentile ?? null;
  const verdict = verdictFor(result, score);
  const best = score && atr ? bestBracket(score.distribution, entry, atr) : null;

  const risk = result.stop !== null ? Math.abs(entry - result.stop) : null;
  const stopAtr = risk !== null && atr ? risk / atr : null;
  const targetR = risk && result.target !== null ? Math.abs(result.target - entry) / risk : null;

  const outcome = forfeited
    ? { label: "Time's up", tone: 'short' as const }
    : passed
      ? { label: 'Sat out', tone: 'restraint' as const }
      : result.outcome === 'target'
        ? { label: 'Target hit', tone: 'long' as const }
        : result.outcome === 'stop'
          ? { label: 'Stopped out', tone: 'short' as const }
          : { label: 'Time ran out · marked to close', tone: 'neutral' as const };

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      {/* Children never shrink: in a scrolling column an overflow-hidden card collapses to nothing. */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain pb-4 lg:pr-1 [&>*]:shrink-0">
        {/* 1–2: the verdict and the score */}
        <section className="animate-rise">
          <div className="flex items-start gap-4">
            <ScoreRing score={percentile === null ? null : percentile * 100} size={104} thickness={7} />
            <div className="min-w-0 flex-1 pt-1">
              <Chip tone={outcome.tone} dot>
                {outcome.label}
              </Chip>
              <div
                className={cx(
                  'numeral mt-2 text-4xl font-semibold',
                  passed ? 'text-restraint-ink' : r === null ? 'text-ink-hi' : r > 0.005 ? 'text-gain-ink' : r < -0.005 ? 'text-loss-ink' : 'text-ink-hi',
                )}
              >
                {r === null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}`}
                <span className="text-ink-dim ml-1 text-xl font-medium">
                  <Term id="r">R</Term>
                </span>
              </div>
              {!passed && stopAtr !== null && targetR !== null && (
                <div className="numeral text-ink-dim mt-1 text-xs">
                  {result.direction} · stop {stopAtr.toFixed(2)} ATR · target {targetR.toFixed(1)}R
                </div>
              )}
            </div>
          </div>
          <h2 className="font-display text-ink-max mt-4 text-[1.875rem] leading-tight">{verdict.title}</h2>
          <p className="text-ink-lo mt-1 text-sm leading-relaxed">{verdict.body}</p>
          {forfeited && (
            <p className="text-short-ink mt-2 text-sm">
              The clock ran out before you locked in, so this chart scores as a forfeit.
            </p>
          )}
        </section>

        {/* 3: every possible trade */}
        {score && score.distribution.length > 1 && (
          <section className="animate-rise space-y-3 [animation-delay:60ms]">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="eyebrow text-ink-dim">
                <Term id="score">Against every possible trade</Term>
              </h3>
              <span className="numeral text-ink-dim text-xs">{score.distribution.length} trades</span>
            </div>
            <ScoreStrip distribution={score.distribution} playerR={r} passed={passed} />
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label={<Term id="par">Par</Term>} value={score.parR} />
              <MiniStat label="Sitting out" value={0} tone="restraint" />
              <MiniStat label={<Term id="hindsight">Best</Term>} value={best?.r ?? score.oracleR} tone="gold" />
            </div>
            {best && (
              <button
                type="button"
                aria-pressed={showBest}
                onClick={() => onShowBest(!showBest)}
                className={cx(
                  'press flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                  showBest ? 'border-gold bg-gold-bg' : 'border-gold-line hover:bg-gold-bg',
                )}
              >
                <span className="bg-gold text-on-gold grid h-8 w-8 shrink-0 place-items-center rounded-full">
                  <Icon name={showBest ? 'eye' : 'sparkle'} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-gold-ink block text-sm font-semibold">
                    {showBest ? 'Showing the best trade in hindsight' : 'Show the best trade in hindsight'}
                  </span>
                  <span className="numeral text-ink-lo block text-xs">
                    {best.direction} · stop {best.stopAtr} ATR · target {best.targetR}R → {best.r >= 0 ? '+' : ''}
                    {best.r.toFixed(2)}R
                  </span>
                </span>
              </button>
            )}
          </section>
        )}

        {/* 4: what it was */}
        {provenance && <RevealCard provenance={provenance} />}

        {/* 5: the panel */}
        <PanelRow
          verdicts={verdicts}
          playerDirection={passed ? null : (result.direction ?? null)}
          returns={style?.available ?? null}
          selected={persona}
          onSelect={onPersona}
          entry={entry}
          atr={atr}
        />

        {/* 6: details */}
        <div className="border-line-faint flex flex-col gap-3 border-t pt-4">
          {score && (
            <Disclosure label="Why it scored that" aside="breakdown">
              <ul className="flex flex-col gap-2">
                {sentences(score, result).map((line) => (
                  <li key={line} className="border-line text-ink flex gap-3 border-l-2 py-0.5 pl-3 text-sm leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}

          {score && score.distribution.length > 0 && (
            <Disclosure label="All 98 trades, by stop and target" aside="long · short">
              <AchievableField
                columns={1}
                distribution={score.distribution}
                direction={passed ? null : (result.direction ?? null)}
                stopIndex={stopAtr === null ? null : axisPosition(stopAtr, STOP_ATR)}
                targetIndex={targetR === null ? null : axisPosition(targetR, TARGET_R)}
                progress={1}
              />
            </Disclosure>
          )}

          {!passed && result.mfeR !== null && result.maeR !== null && (
            <Disclosure label="While it was open" aside="peak · dip">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label={<Term id="peak">Peak gain</Term>} value={result.mfeR} />
                <MiniStat label={<Term id="dip">Deepest dip</Term>} value={result.maeR} />
              </div>
              {result.windowMfeR !== null && result.windowMaeR !== null && (
                <p className="text-ink-lo mt-3 text-sm leading-relaxed">
                  Across the whole window the move was worth{' '}
                  <span className="numeral text-gain-ink">
                    {result.windowMfeR >= 0 ? '+' : ''}
                    {result.windowMfeR.toFixed(2)}R
                  </span>{' '}
                  your way and <span className="numeral text-loss-ink">{result.windowMaeR.toFixed(2)}R</span> against.
                  Managing the trade could have caught more of it — that is what Manage mode is for.
                </p>
              )}
            </Disclosure>
          )}

          {!passed && result.grossR !== null && result.rMultiple !== null && (
            <Disclosure label={<Term id="net">What it cost to trade</Term>} aside="fees">
              <p className="text-ink-lo text-sm leading-relaxed">
                <span className="numeral text-ink">
                  {result.grossR >= 0 ? '+' : ''}
                  {result.grossR.toFixed(2)}R
                </span>{' '}
                before costs,{' '}
                <span className="numeral text-ink">
                  {result.rMultiple >= 0 ? '+' : ''}
                  {result.rMultiple.toFixed(2)}R
                </span>{' '}
                after: the round trip took{' '}
                <span className="numeral text-loss-ink">{(result.grossR - result.rMultiple).toFixed(2)}R</span>. Costs
                grow as stops tighten, so this is the price of that choice.
              </p>
            </Disclosure>
          )}

          {confidence !== null && (
            <Disclosure label={<Term id="calibration">How sure you were</Term>} aside={`${Math.round(confidence * 100)}%`}>
              <p className="text-ink-lo text-sm leading-relaxed">
                You said {Math.round(confidence * 100)}% it would finish green, and it{' '}
                {r !== null && r > 0 ? 'did' : 'did not'}. One call means nothing on its own; over many, your
                calibration curve shows whether your 70% comes true 70% of the time.
              </p>
            </Disclosure>
          )}
        </div>
      </div>

      {/* The actions, always reachable. Opaque, never blurred: a backdrop-filter is the one
          decoration this screen cannot have near the chart. */}
      <div className="bg-surface-0 border-line-faint sticky bottom-0 z-10 flex shrink-0 items-center gap-2 border-t py-3 lg:static lg:border-t-0 lg:pb-0">
        <Button variant="ghost" size="md" onClick={onReplay} kbd="R" aria-label="Replay the reveal">
          <Icon name="rotate-ccw" size={15} />
          <span className="hidden sm:inline">Replay</span>
        </Button>
        {onShare && (
          <Button variant="ghost" size="md" onClick={onShare} aria-label="Share this chart">
            <Icon name="share" size={15} />
          </Button>
        )}
        <Button variant="primary" size="lg" block onClick={onNext} kbd="⏎">
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: React.ReactNode;
  value: number | null;
  tone?: 'restraint' | 'gold';
}) {
  const ink =
    tone === 'gold'
      ? 'text-gold-ink'
      : tone === 'restraint'
        ? 'text-restraint-ink'
        : value === null
          ? 'text-ink-hi'
          : value > 0.005
            ? 'text-gain-ink'
            : value < -0.005
              ? 'text-loss-ink'
              : 'text-ink-hi';
  return (
    <div className="bg-surface-2 border-line-faint rounded-xl border px-3 py-2.5">
      <div className="text-ink-dim text-xs">{label}</div>
      <div className={cx('numeral mt-0.5 text-base font-semibold', ink)}>
        {value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`}
      </div>
    </div>
  );
}
