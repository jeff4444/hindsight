'use client';

import type { RoundResult, ScorePayload } from '@/lib/api-types';
import { useTween } from '@/lib/useTween';
import { STOP_ATR, TARGET_R, axisPosition } from '@/lib/grid';
import { Eyebrow, Stat, cx, toneInk } from './ui';
import { AchievableField } from './debrief/AchievableField';
import { PercentileLadder } from './debrief/PercentileLadder';

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
 * Three things arrive on one clock — the percentile counting up, the field filling in, the ladder
 * building down to the player's rung — because they are the same fact stated three ways. On
 * separate timers they miss each other and the screen reads as three unrelated animations.
 *
 * What replaced the 26-bin histogram, and why: the histogram binned the achievable set by value,
 * which discarded the coordinates the set is actually indexed by. A player could see that most
 * brackets lost and that theirs was among them, and could not see that every winning bracket was
 * on the other side, or two columns wider. Those are the lessons; the shape was not.
 */
export function Debrief({
  score,
  result,
  atr,
}: {
  score: ScorePayload;
  result: RoundResult;
  /** Needed to place the player's own stop on the grid's ATR axis. */
  atr: number | null;
}) {
  const percentile = score.percentile;
  const passed = result.outcome === 'pass';
  const t = useTween(560, [percentile]);
  const playerR = passed ? 0 : (result.rMultiple ?? 0);

  // The player's bracket in grid coordinates. Continuous, so it lands between cells.
  const stopAtr = atr && atr > 0 && result.riskPerUnit ? result.riskPerUnit / atr : null;
  const targetR =
    result.riskPerUnit && result.riskPerUnit > 0 && result.target !== null && result.entryFill !== null
      ? Math.abs(result.target - result.entryFill) / result.riskPerUnit
      : null;

  return (
    <div className="mt-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div>
          <Eyebrow>Against what was achievable</Eyebrow>
          <div className="mt-1 flex items-baseline gap-1">
            <span className={cx('numeral font-semibold text-display-sm sm:text-display', toneFor(percentile))}>
              {percentile === null ? '—' : Math.round(percentile * 100 * t)}
            </span>
            {percentile !== null && (
              <span className={cx('text-lg font-semibold', toneFor(percentile))}>{ordinalSuffix(Math.round(percentile * 100))}</span>
            )}
          </div>
          <p className="text-ink-lo mt-1 text-sm">
            {percentile === null
              ? 'Not scored — this chart predates the achievable set.'
              : `You beat ${Math.round(percentile * 98)} of the 98 brackets that were placeable here.`}
          </p>

          {/* Wraps. The old row was a bare flex with no wrap and overflowed below 420px. */}
          <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-4">
            <Stat
              label="Oracle"
              value={`${score.oracleR.toFixed(1)}R`}
              hint="The best any bracket could have done on this path"
              tone="gold"
            />
            <Stat
              label="You took"
              value={score.axes.efficiency === null ? '—' : `${(score.axes.efficiency * 100).toFixed(1)}%`}
              hint="Your R as a share of the oracle — the closest thing to a measure of trade quality"
            />
            <Stat
              label="Par"
              value={score.parR === null ? '—' : `${score.parR >= 0 ? '+' : ''}${score.parR.toFixed(2)}R`}
              hint="The median achievable outcome. Negative means most brackets lost here"
              tone={score.parR !== null && score.parR < 0 ? 'short' : 'neutral'}
            />
          </dl>
        </div>

        <PercentileLadder
          distribution={score.distribution}
          playerR={playerR}
          passed={passed}
          oracleR={score.oracleR}
          parR={score.parR}
          progress={t}
        />
      </div>

      <AchievableField
        className="mt-8"
        distribution={score.distribution}
        direction={passed ? null : (result.direction ?? null)}
        stopIndex={stopAtr === null ? null : axisPosition(stopAtr, STOP_ATR)}
        targetIndex={targetR === null ? null : axisPosition(targetR, TARGET_R)}
        progress={t}
      />

      <ul className="mt-8 flex flex-col gap-2" data-stagger>
        {sentences(score, result).map((line, index) => (
          <li
            key={line}
            className="border-line-faint text-ink flex gap-3 border-l-2 py-0.5 pl-3 text-sm md:text-base"
            style={{ '--i': index } as React.CSSProperties}
          >
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Just the suffix — it is rendered immediately after the number itself. */
function ordinalSuffix(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
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
