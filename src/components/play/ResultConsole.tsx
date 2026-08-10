'use client';

import type { ChartProvenance, RoundResult, ScorePayload } from '@/lib/api-types';
import { useBeats } from '@/lib/useBeats';
import { useCountUp } from '@/lib/useTween';
import { Debrief } from '../Debrief';
import { Beat } from '../ui/motion';
import { Button, Chip, Eyebrow, Panel, Stat, cx, toneInk } from '../ui';
import { Tooltip } from '../ui/client';

/**
 * The post-trade console.
 *
 * §4.1 fixes the vocabulary: R is the initial risk, the R-multiple is the outcome divided by it,
 * and both terms are defined in-app rather than assumed. §4.6 puts MFE and MAE on every result at
 * every tier — and distinguishes the excursion during the trade's life from the excursion across
 * the whole window, which is the managed ceiling a set-and-forget bracket cannot reach.
 *
 * Two structural changes from the panel this replaces.
 *
 * The R-multiple is no longer the largest thing here. It lands at 92px on the chart, over the
 * trade it describes, and by the time the eye reaches this console its job is done — so it stays
 * as a persistent but secondary readout and the debrief's percentile becomes the biggest number.
 * That is the correct hierarchy for this product: R is what happened, the percentile is the score.
 *
 * Provenance arrives last, on its own beat. "This was BTCUSDT, Friday 16 April 2021 — real price
 * action, look it up" is the punchline of the whole screen, and it used to appear at the same
 * instant as everything else.
 */
const BEATS = [0, 240, 900] as const;

export function ResultConsole({
  result,
  provenance,
  score,
  atr,
  nextLabel = 'Next chart',
  onNext,
  onReplay,
}: {
  result: RoundResult;
  provenance: ChartProvenance | null;
  score: ScorePayload | null;
  atr: number | null;
  nextLabel?: string;
  onNext: () => void;
  onReplay: () => void;
}) {
  const passed = result.outcome === 'pass';
  const r = result.rMultiple ?? 0;
  const counted = useCountUp(passed ? 0 : r, { ms: 620, decimals: 2, sign: true, deps: [passed] });
  const tone = passed ? 'restraint' : r > 0 ? 'long' : r < 0 ? 'short' : 'neutral';
  const beats = useBeats(BEATS, [result]);

  return (
    <Panel pad="none" className="animate-rise p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* No MFE/MAE line here: they are labelled `Stat`s in the grid below, and the score stage
            has just shown them over the chart. Three copies of two numbers on one screen. */}
        <div>
          <Eyebrow tone={tone}>{passed ? 'Stood aside' : outcomeLabel(result)}</Eyebrow>
          <div className={cx('numeral mt-0.5 text-2xl font-semibold', toneInk(tone))}>{counted}R</div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="lg" onClick={onReplay} kbd="R">
            Replay
          </Button>
          <Button variant="primary" size="lg" onClick={onNext} kbd="⏎" glow="brand">
            {nextLabel}
          </Button>
        </div>
      </div>

      {passed ? (
        <p className="text-ink-lo mt-4 max-w-prose text-base leading-relaxed">
          Restraint is a scored action. It is measured as 0R against the same 98 brackets any trade
          would have been measured against — so on a chart whose median outcome was negative,
          standing aside legitimately beat most of the entries available.
        </p>
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4" data-stagger>
            <Stat label="Direction" value={result.direction ?? '—'} index={0} mono={false} />
            <Stat label="Risk / unit" value={result.riskPerUnit?.toFixed(2) ?? '—'} index={1} />
            <Stat
              label="MFE"
              value={fmtR(result.mfeR)}
              sublabel="best while you held it"
              index={2}
            />
            <Stat
              label="MAE"
              value={fmtR(result.maeR)}
              sublabel="worst while you held it"
              index={3}
            />
          </dl>

          <Beat on={1} beats={beats}>
            <Panel tone="inset" pad="none" className="mt-6 p-4">
              <Eyebrow>The managed ceiling</Eyebrow>
              <p className="text-ink-lo mt-1.5 max-w-prose text-sm leading-relaxed">
                Across the whole window the move was worth{' '}
                <span className="numeral text-gain-ink">{fmtR(result.windowMfeR)}</span> your way and{' '}
                <span className="numeral text-loss-ink">{fmtR(result.windowMaeR)}</span> against you. A
                set-and-forget bracket cannot capture that; managing the trade could have.
              </p>
            </Panel>
          </Beat>

          {result.ambiguous && (
            <p className="border-attention-line bg-attention-bg text-attention-ink mt-4 rounded-md border p-3 text-sm leading-relaxed">
              Stop and target were both touched inside a single one-minute bar, so even the
              resolution path cannot order them. Resolved stop-first and flagged — a round like this
              would be excluded from ranked play.
            </p>
          )}
        </>
      )}

      {score && <Debrief score={score} result={result} atr={atr} />}

      {provenance && (
        <Beat on={2} beats={beats}>
          <Provenance provenance={provenance} />
        </Beat>
      )}
    </Panel>
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
    <div className="border-line-faint mt-8 border-t pt-5">
      <Eyebrow>This was</Eyebrow>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="numeral text-ink-max text-lg font-semibold">{provenance.symbol}</span>
        <span className="numeral text-ink-lo text-sm">{provenance.venue}</span>
        <span className="numeral text-ink-lo text-sm">{formatMoment(provenance.decisionAt)}</span>
        <span className="numeral text-ink-dim text-sm">
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
          <Tooltip label="The chart you read was flipped vertically, so it will not match the real one until you invert it.">
            <Chip tone="info" className="eyebrow">
              Mirrored
            </Chip>
          </Tooltip>
        )}
      </div>

      {provenance.synthetic ? (
        <p className="text-ink-lo mt-2.5 max-w-prose text-sm leading-relaxed">
          Not a real market. {provenance.sourceNote ?? 'Generated as a control.'} Your score on
          charts like this one is how the product measures whether chart reading is a skill at all.
        </p>
      ) : (
        <p className="text-ink-dim mt-2.5 max-w-prose text-sm leading-relaxed">
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
