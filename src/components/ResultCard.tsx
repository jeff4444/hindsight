'use client';

import type { ChartProvenance, RoundResult, ScorePayload } from '@/lib/api-types';
import { useTween } from '@/lib/useTween';
import { Debrief } from './Debrief';
import { Button, Chip, Eyebrow, Stat, toneInk } from './ui';

/**
 * The post-trade panel.
 *
 * §4.1 fixes the vocabulary: R is the initial risk, the R-multiple is the outcome divided by it,
 * and both terms are defined in-app rather than assumed. §4.6 puts MFE and MAE on every result at
 * every tier — and distinguishes the excursion during the trade's life from the excursion across
 * the whole window, which is the managed ceiling a set-and-forget bracket cannot reach.
 */
export function ResultCard({
  result,
  provenance,
  score,
  nextLabel = 'Next chart',
  onNext,
  onReplay,
}: {
  result: RoundResult;
  provenance: ChartProvenance | null;
  score: ScorePayload | null;
  nextLabel?: string;
  onNext: () => void;
  onReplay: () => void;
}) {
  const passed = result.outcome === 'pass';
  const r = result.rMultiple ?? 0;
  // Deliberately short. The R-multiple is the headline of the screen and arriving at it reads
  // better than appearing at it, but anything past about 600ms feels like the app is withholding
  // the answer.
  const counted = (passed ? 0 : r) * useTween(620, [r, passed]);
  const tone = passed ? 'neutral' : r > 0 ? 'long' : r < 0 ? 'short' : 'neutral';

  return (
    <div className="bg-surface-2 border-line shadow-panel animate-rise rounded-lg border p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <Eyebrow>{passed ? 'Passed' : outcomeLabel(result)}</Eyebrow>
          <div className={`font-mono text-3xl font-semibold tabular-nums ${toneInk(tone)}`}>
            {counted >= 0 ? '+' : ''}
            {counted.toFixed(2)}R
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" onClick={onReplay} kbd="R">
            Replay
          </Button>
          <Button variant="primary" size="lg" onClick={onNext} kbd="⏎">
            {nextLabel}
          </Button>
        </div>
      </div>

      {passed ? (
        <p className="text-ink-lo mt-3 text-xs leading-relaxed">
          Restraint is a scored action (§4.4). It is measured as 0R against the same 98 brackets any
          trade would have been measured against — so on a chart whose median outcome was negative,
          standing aside legitimately beat most of the entries available.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4" data-stagger>
            <Stat label="Direction" value={result.direction ?? '—'} index={0} />
            <Stat label="Risk / unit" value={result.riskPerUnit?.toFixed(2) ?? '—'} index={1} />
            <Stat
              label="MFE"
              value={fmtR(result.mfeR)}
              hint="best it showed while you held it"
              index={2}
            />
            <Stat
              label="MAE"
              value={fmtR(result.maeR)}
              hint="worst it showed while you held it"
              index={3}
            />
          </dl>

          <div className="border-line-faint mt-4 border-t pt-3">
            <Eyebrow>The managed ceiling</Eyebrow>
            <p className="text-ink-lo mt-1 text-xs leading-relaxed">
              Across the whole window the move was worth{' '}
              <span className="text-ink-hi font-mono">{fmtR(result.windowMfeR)}</span> your way and{' '}
              <span className="text-ink-hi font-mono">{fmtR(result.windowMaeR)}</span> against you.
              A set-and-forget bracket cannot capture that; managing the trade could have.
            </p>
          </div>

          {result.ambiguous && (
            <p className="border-attention-line bg-attention-bg text-attention-ink text-mini mt-3 rounded border p-2 leading-relaxed">
              Stop and target were both touched inside a single one-minute bar, so even the
              resolution path cannot order them. Resolved stop-first and flagged — a round like
              this would be excluded from ranked play.
            </p>
          )}
        </>
      )}

      {score && <Debrief score={score} result={result} />}
      {provenance && <Provenance provenance={provenance} />}
    </div>
  );
}

/**
 * What the chart actually was.
 *
 * Withheld until the order is committed, because §12.2 hides identity so a chart cannot be
 * looked up before the decision. Afterwards there is nothing left to protect and something to
 * gain: the player can check for themselves that the price action was real, which is the whole
 * claim the product rests on. §3.3's Silent mod is the opt-out.
 */
function Provenance({ provenance }: { provenance: ChartProvenance }) {
  return (
    <div
      className="border-line-faint animate-rise mt-4 border-t pt-3"
      style={{ '--i': 2 } as React.CSSProperties}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Eyebrow className="shrink-0">This was</Eyebrow>

        <Chip mono>{provenance.symbol}</Chip>
        <span className="text-ink-lo font-mono text-xs">{provenance.venue}</span>
        <span className="text-ink-lo font-mono text-xs">{formatMoment(provenance.decisionAt)}</span>
        <span className="text-ink-lo font-mono text-xs">
          entry {formatPrice(provenance.entryPriceReal)}
        </span>

        {provenance.synthetic ? (
          <Chip tone="restraint" className="eyebrow">
            Synthetic
          </Chip>
        ) : (
          <Chip tone="long" className="eyebrow">
            Real price action
          </Chip>
        )}

        {provenance.mirrored && (
          <Chip
            tone="info"
            className="eyebrow"
            title="The chart you read was flipped vertically, so it will not match the real one until you invert it."
          >
            Mirrored
          </Chip>
        )}
      </div>

      {provenance.synthetic ? (
        <p className="text-ink-lo text-mini mt-2 leading-relaxed">
          Not a real market. {provenance.sourceNote ?? 'Generated as a control.'} Your score on
          charts like this one is how the product measures whether chart reading is a skill at all.
        </p>
      ) : (
        <p className="text-ink-dim text-mini mt-2 leading-relaxed">
          Every candle above is real trading, exactly as it happened
          {provenance.mirrored ? ' — flipped vertically so the shape could not be recognised' : ''}.
          Look it up.
        </p>
      )}
    </div>
  );
}

/** "Fri 16 Apr 2021, 08:00 UTC" — the real calendar moment, released only after the commit. */
function formatMoment(iso: string): string {
  return (
    new Date(iso).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

/**
 * Prices in this corpus span nine orders of magnitude — a coin at 0.0000034 and BTC at 100,000
 * cannot share a format, so the number of decimals follows the size.
 */
function formatPrice(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function outcomeLabel(result: RoundResult): string {
  if (result.outcome === 'target') return 'Target hit';
  if (result.outcome === 'stop') return 'Stopped out';
  return 'Neither — marked to market';
}

function fmtR(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}R`;
}
