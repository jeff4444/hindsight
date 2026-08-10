'use client';

import type { RoundResult, ScorePayload } from '@/lib/api-types';
import { useTween } from '@/lib/useTween';
import { Eyebrow, Stat, toneInk } from './ui';
import { DistributionPlot } from './ui/DistributionPlot';

/**
 * Layer 1's verdict, made legible.
 *
 * §14's exit condition for this phase is "a debrief screen worth screenshotting before any engine
 * exists", and §4.5 says what belongs on it: a headline number with the diagnosis behind it
 * decomposed into independent axes, phrased the way its own example is —
 *
 * > your direction was in the top quartile, but your stop sat inside the noise band and would
 * > have been swept in 61% of the achievable set, and you captured 19% of the oracle.
 *
 * The headline and the marker on the distribution share one clock, because they are the same fact
 * stated twice: the number arriving as the marker lands is the whole emotional payload of the
 * screen, and on two separate timers they miss each other.
 */
export function Debrief({ score, result }: { score: ScorePayload; result: RoundResult }) {
  const percentile = score.percentile;
  const passed = result.outcome === 'pass';
  const t = useTween(560, [percentile]);

  return (
    <div className="border-line-faint animate-rise mt-4 border-t pt-3" style={{ '--i': 1 } as React.CSSProperties}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Eyebrow>Against what was achievable</Eyebrow>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-semibold tabular-nums ${toneFor(percentile)}`}
            >
              {percentile === null ? '—' : Math.round(percentile * 100 * t)}
            </span>
            <span className="text-ink-dim text-xs">
              {percentile === null
                ? 'not scored'
                : `of 100 · beat ${Math.round(percentile * 98)} of 98 possible trades`}
            </span>
          </div>
        </div>

        <dl className="flex gap-5">
          <Stat
            label="Oracle"
            value={`${score.oracleR.toFixed(1)}R`}
            hint="The best any bracket could have done on this path"
          />
          <Stat
            label="You took"
            value={
              score.axes.efficiency === null ? '—' : `${(score.axes.efficiency * 100).toFixed(1)}%`
            }
            hint="Your R as a share of the oracle — §4.5 calls this the closest thing to trade quality"
          />
          <Stat
            label="Par"
            value={
              score.parR === null
                ? '—'
                : `${score.parR >= 0 ? '+' : ''}${score.parR.toFixed(2)}R`
            }
            hint="The median achievable outcome. Negative means most brackets lost here"
          />
        </dl>
      </div>

      <DistributionPlot
        distribution={score.distribution}
        playerR={passed ? 0 : (result.rMultiple ?? 0)}
        passed={passed}
        progress={t}
      />

      <ul className="text-ink-lo mt-3 space-y-1.5 text-xs leading-relaxed" data-stagger>
        {sentences(score, result).map((line, index) => (
          <li key={line} className="flex gap-2" style={{ '--i': index } as React.CSSProperties}>
            <span className="text-ink-faint">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toneFor(percentile: number | null): string {
  if (percentile === null) return toneInk('neutral');
  if (percentile >= 0.75) return toneInk('long');
  if (percentile >= 0.4) return toneInk('neutral');
  return toneInk('short');
}

/** §4.5's diagnosis, in the voice its own example uses. */
function sentences(score: ScorePayload, result: RoundResult): string[] {
  const lines: string[] = [];
  const { axes } = score;

  if (result.outcome === 'pass') {
    lines.push(
      axes.restraint === null
        ? 'Passing is scored as 0R against the same distribution as any trade.'
        : `Passing scored better than ${Math.round(axes.restraint * 98)} of the 98 brackets available here.`,
    );
    if (score.parR !== null && score.parR < 0) {
      lines.push(
        'The median achievable trade lost money on this chart, so standing aside was a real edge, not an absence of one.',
      );
    } else {
      lines.push('There was money on this chart, and passing gave all of it up.');
    }
    return lines;
  }

  if (axes.direction !== null) {
    lines.push(
      axes.direction >= 0.9
        ? `Direction was right: ${Math.round(axes.direction * 100)}% of everything that worked here was on your side.`
        : axes.direction <= 0.1
          ? `Direction was wrong — only ${Math.round(axes.direction * 100)}% of the winning brackets were on your side.`
          : `${Math.round(axes.direction * 100)}% of the winning brackets were on your side.`,
    );
  }

  if (axes.stopSweptShare !== null) {
    const swept = Math.round(axes.stopSweptShare * 100);
    lines.push(
      axes.stopInsideNoise
        ? `Your stop sat inside the noise the winners had to survive, and would have been swept out of ${swept}% of the brackets at that distance.`
        : `A stop at that distance was swept in ${swept}% of the brackets that used it.`,
    );
  }

  // Capture is only meaningful for a trade that made money. A loser captured none of the move,
  // and "you captured -29% of it" is arithmetically true and semantically nonsense.
  if (axes.captureShare !== null && axes.captureShare > 0) {
    lines.push(
      `You captured ${Math.round(axes.captureShare * 100)}% of the move that was there while you held it.`,
    );
  } else if (result.windowMfeR !== null && result.windowMfeR > 0) {
    lines.push(
      `There was ${result.windowMfeR.toFixed(2)}R on the table in your direction across the window, and you took none of it.`,
    );
  }

  if (axes.efficiency !== null) {
    lines.push(
      `Against the best that was possible on this path, you took ${(axes.efficiency * 100).toFixed(1)}%.`,
    );
  }

  if (axes.restraint !== null && score.percentile !== null && axes.restraint > score.percentile) {
    lines.push('Passing would have scored better than this trade.');
  }

  return lines;
}
