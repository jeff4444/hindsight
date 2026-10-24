import type { RoundResult, ScorePayload } from './api-types';
import { CELLS_PER_DIRECTION, GRID_CELLS, STOP_ATR, TARGET_R } from './grid';

/**
 * The verdict: one line, in the serif, that says what kind of trade that was.
 *
 * The debrief already had the diagnosis — five or six sentences from `debrief.ts`, open by default
 * at the top of the result. Correct, and too much to read between charts. A verdict is the
 * diagnosis compressed to the one thing that most explains the score, chosen by a fixed order of
 * precedence over the same axes. The sentences stay one tap away under "Why".
 *
 * Pure, so the mapping is testable and the screen cannot disagree with it.
 */

export type VerdictKind =
  | 'clean'
  | 'satOutRight'
  | 'satOutCostly'
  | 'wrongSide'
  | 'stopTight'
  | 'leftOnTable'
  | 'luckyWin'
  | 'goodLoss'
  | 'solid'
  | 'rough';

export interface VerdictLine {
  kind: VerdictKind;
  /** The serif headline. Short, declarative, ends with a full stop. */
  title: string;
  /** One supporting sentence, in plain words, drawn from the axes. */
  body: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function verdictFor(result: RoundResult, score: ScorePayload | null): VerdictLine {
  const percentile = score?.percentile ?? null;
  const axes = score?.axes;
  const r = result.rMultiple ?? 0;

  if (result.outcome === 'pass') {
    const par = score?.parR ?? null;
    if (par !== null && par < 0) {
      return {
        kind: 'satOutRight',
        title: 'Sitting out was right.',
        body: `The typical trade here lost ${Math.abs(par).toFixed(2)}R. Doing nothing beat most of what you could have done.`,
      };
    }
    return {
      kind: 'satOutCostly',
      title: 'There was a trade here.',
      body:
        par !== null
          ? `The typical trade made ${par >= 0 ? '+' : ''}${par.toFixed(2)}R. Sitting out gave it up.`
          : 'Most trades on this chart made money. Sitting out gave that up.',
    };
  }

  if (percentile !== null && percentile >= 0.9) {
    return {
      kind: 'clean',
      title: 'Clean read.',
      body: `Better than ${pct(percentile)} of every trade you could have placed here.`,
    };
  }

  if (axes?.direction !== null && axes?.direction !== undefined && axes.direction <= 0.15) {
    return {
      kind: 'wrongSide',
      title: 'Wrong side.',
      body: `Only ${pct(axes.direction)} of the trades that worked here were on your side.`,
    };
  }

  if (r < 0 && axes?.stopInsideNoise) {
    const swept = axes.stopSweptShare;
    return {
      kind: 'stopTight',
      title: 'Right idea, stop too tight.',
      body:
        swept !== null
          ? `A stop that close was knocked out in ${pct(swept)} of trades that used it. The move needed more room.`
          : 'Your stop sat inside the noise the winning trades had to survive.',
    };
  }

  if (r > 0 && percentile !== null && percentile < 0.5) {
    return {
      kind: 'luckyWin',
      title: 'A win, but a thin one.',
      body: `It made money, and still trailed ${pct(1 - percentile)} of the trades on offer. The chart had more in it.`,
    };
  }

  if (r <= 0 && percentile !== null && percentile >= 0.5) {
    return {
      kind: 'goodLoss',
      title: 'A good loss.',
      body: `It lost, and still beat ${pct(percentile)} of what was possible. Most trades here did worse.`,
    };
  }

  if (r > 0 && axes?.captureShare !== null && axes?.captureShare !== undefined && axes.captureShare < 0.35) {
    return {
      kind: 'leftOnTable',
      title: 'Money left on the table.',
      body: `You took ${pct(axes.captureShare)} of the move that was there while you held it.`,
    };
  }

  if (percentile !== null && percentile >= 0.6) {
    return {
      kind: 'solid',
      title: 'Solid.',
      body: `Better than ${pct(percentile)} of the trades on offer.`,
    };
  }

  return {
    kind: 'rough',
    title: 'Not this one.',
    body:
      percentile !== null
        ? `${pct(1 - percentile)} of the possible trades did better. The breakdown below says where.`
        : 'This chart has no scored distribution, so there is nothing to rank it against.',
  };
}

export interface GridBracket {
  direction: 'long' | 'short';
  stopAtr: number;
  targetR: number;
  r: number;
  stop: number;
  target: number;
}

/**
 * The best of the 98 trades, with its coordinates — the gold bracket on the chart.
 *
 * `distribution` is the achievable grid in its stored order (direction, stop, target). A short
 * array cannot be decoded, because the coordinates are implied by position; that case returns null
 * rather than guessing.
 */
export function bestBracket(distribution: readonly number[], entry: number, atr: number): GridBracket | null {
  if (distribution.length !== GRID_CELLS || !(atr > 0)) return null;
  let best = 0;
  for (let i = 1; i < distribution.length; i++) if (distribution[i] > distribution[best]) best = i;
  const direction = best < CELLS_PER_DIRECTION ? 'long' : 'short';
  const within = best % CELLS_PER_DIRECTION;
  const stopAtr = STOP_ATR[Math.floor(within / TARGET_R.length)];
  const targetR = TARGET_R[within % TARGET_R.length];
  const risk = stopAtr * atr;
  const sign = direction === 'long' ? 1 : -1;
  return {
    direction,
    stopAtr,
    targetR,
    r: distribution[best],
    stop: entry - sign * risk,
    target: entry + sign * risk * targetR,
  };
}
