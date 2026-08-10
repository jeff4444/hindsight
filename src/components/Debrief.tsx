'use client';

import type { RoundResult, ScorePayload } from '@/lib/api-types';

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
 * The distribution is drawn rather than described because that is what makes a percentile mean
 * something: 98 outcomes were available on this path, and the player's sits somewhere among them.
 */
export function Debrief({ score, result }: { score: ScorePayload; result: RoundResult }) {
  const percentile = score.percentile;
  const passed = result.outcome === 'pass';

  return (
    <div className="hs-rise mt-4 border-t border-white/5 pt-3" style={{ animationDelay: '120ms' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold tracking-widest text-slate-500">
            AGAINST WHAT WAS ACHIEVABLE
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span
              className={`font-mono text-3xl font-semibold tabular-nums ${toneFor(percentile)}`}
            >
              {percentile === null ? '—' : `${Math.round(percentile * 100)}`}
            </span>
            <span className="text-xs text-slate-500">
              {percentile === null
                ? 'not scored'
                : `of 100 · beat ${Math.round(percentile * 98)} of 98 possible trades`}
            </span>
          </div>
        </div>

        <dl className="flex gap-5 text-xs">
          <Figure label="ORACLE" value={`${score.oracleR.toFixed(1)}R`} hint="The best any bracket could have done on this path" />
          <Figure
            label="YOU TOOK"
            value={
              score.axes.efficiency === null ? '—' : `${(score.axes.efficiency * 100).toFixed(1)}%`
            }
            hint="Your R as a share of the oracle — §4.5 calls this the closest thing to trade quality"
          />
          <Figure
            label="PAR"
            value={score.parR === null ? '—' : `${score.parR >= 0 ? '+' : ''}${score.parR.toFixed(2)}R`}
            hint="The median achievable outcome. Negative means most brackets lost here"
          />
        </dl>
      </div>

      <Distribution
        distribution={score.distribution}
        playerR={passed ? 0 : (result.rMultiple ?? 0)}
        passed={passed}
      />

      <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-400">
        {sentences(score, result).map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-slate-600">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toneFor(percentile: number | null): string {
  if (percentile === null) return 'text-slate-300';
  if (percentile >= 0.75) return 'text-emerald-400';
  if (percentile >= 0.4) return 'text-slate-200';
  return 'text-rose-400';
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div title={hint}>
      <dt className="text-[10px] font-semibold tracking-widest text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-slate-200">{value}</dd>
    </div>
  );
}

/**
 * The 98 achievable outcomes as a histogram, with the player's result marked.
 *
 * The long tail is clipped rather than scaled to it: a grid cell that caught an 8R target would
 * otherwise squash every other bar to nothing. Clipped cells are counted into the end bin, so no
 * outcome disappears — the axis just stops describing exactly where it landed.
 */
function Distribution({
  distribution,
  playerR,
  passed,
}: {
  distribution: number[];
  playerR: number;
  passed: boolean;
}) {
  if (distribution.length === 0) return null;

  const LOW = -1.2;
  const HIGH = 4;
  const BINS = 26;
  const width = (HIGH - LOW) / BINS;

  const bins = new Array<number>(BINS).fill(0);
  for (const value of distribution) {
    const index = Math.min(BINS - 1, Math.max(0, Math.floor((value - LOW) / width)));
    bins[index] += 1;
  }
  const tallest = Math.max(...bins, 1);

  const position = (value: number) =>
    Math.min(100, Math.max(0, ((Math.min(HIGH, Math.max(LOW, value)) - LOW) / (HIGH - LOW)) * 100));

  const zeroAt = position(0);
  const playerAt = position(playerR);

  return (
    <div className="mt-4 pt-4">
      <div className="relative h-24">
        <div className="flex h-full items-end gap-px">
          {bins.map((count, i) => {
            const binLow = LOW + i * width;
            return (
              <div
                key={i}
                className={`flex-1 rounded-t-sm ${
                  binLow >= 0 ? 'bg-emerald-500/25' : 'bg-rose-500/25'
                }`}
                style={{ height: `${(count / tallest) * 100}%` }}
              />
            );
          })}
        </div>

        {/* Break-even, so the shape of the distribution reads at a glance. */}
        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-slate-500/40"
          style={{ left: `${zeroAt}%` }}
        />

        {/* The player. */}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-sky-400"
          style={{ left: `${playerAt}%` }}
        >
          {/* Above the plot rather than over it: the tallest bar is usually the pile of stopped
              brackets at exactly −1R, which is precisely where a losing player's marker lands. */}
          <span
            className={`absolute -top-4 whitespace-nowrap rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-sky-200 ring-1 ring-sky-500/40 ${
              playerAt > 70 ? 'right-0' : 'left-0'
            }`}
          >
            {passed ? 'YOU PASSED' : 'YOU'}
          </span>
        </div>
      </div>

      <div className="mt-1 flex justify-between font-mono text-[9px] text-slate-600">
        <span>−1R</span>
        <span>0</span>
        <span>+4R and above</span>
      </div>
    </div>
  );
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
      lines.push('The median achievable trade lost money on this chart, so standing aside was a real edge, not an absence of one.');
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
