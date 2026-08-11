/**
 * CHANNEL — Donchian / Turtle, System 1.
 *
 * Richard Dennis and William Eckhardt, 1983. The rules are genuinely public: Curtis Faith released
 * *The Original Turtle Trading Rules* free, and it is complete enough to implement. This is the most
 * verifiable school on the roster, which is why it goes first.
 *
 * > **Correction to §5.2 as first drafted, in three places.**
 * >
 * > **"Never abstains" is false**, and it is the most consequential error in that table. System 1
 * > explicitly skips a breakout *if the previous one would have been a winner* — counting skipped
 * > breakouts too — and picks the missed move up only at the 55-day failsafe. Abstention is core
 * > machinery. Measured on this corpus, a faithful CHANNEL takes a position on **19.8%** of charts.
 * >
 * > **There is no target.** Turtle exits are trailing breakout exits, not price objectives. Any
 * > take-profit here is ours and is marked `ours`.
 * >
 * > **Determinism is ~3.5/5, not 5/5.** The residual ambiguity is listed at each site below rather
 * > than summarised: ATR seeding, intraday fills, whether the window includes the current bar, and
 * > the filter's need for history from before the window.
 *
 * ## What "fixed entry" does to this system, and why it is not a distortion
 *
 * A real Turtle enters *one tick beyond* the 20-day extreme, intraday. Our entry is fixed at the
 * decision bar's close (§4.2), which no system chooses. So the question this engine answers is not
 * "where would you have entered" but the one the player is also being asked: **given a trade at this
 * bar, is this a setup for your school, and where do the levels go?**
 *
 * The faithful answer is therefore to **pass unless the decision bar itself breaks the extreme**.
 * Anything looser would be inventing entries the school would not have taken, which is exactly the
 * kind of quiet accommodation that makes a published rule set worthless.
 */

import type { Bar } from '../bars';
import { atr as atrOf } from '../atr';
import { causal } from '../causal';
import { donchian } from '../indicators';
import { ENGINE_VERSION } from '../versions';
import { THRESHOLDS } from './manifest';
import { passes, type Annotation, type Engine, type EngineInput, type Verdict } from './contract';

const T = THRESHOLDS.channel;

/**
 * Would the previous breakout have won?
 *
 * System 1's filter, and the reason "never abstains" is wrong. A breakout is skipped when the last
 * one would have been a winner; a loser is defined as a move of 2N against the entry before a
 * profitable 10-bar exit. Faith is explicit that *skipped* breakouts count as the previous breakout
 * for this purpose, so the filter has memory of trades never taken.
 *
 * **The honest limitation, stated rather than hidden.** This needs breakout history from before the
 * window. With 300 stored candles there is usually enough; when there is not, the default is to
 * **take the breakout** — the permissive direction, chosen because the alternative silently
 * suppresses signals at the start of every window and would bias the measured coverage downward for
 * a reason that has nothing to do with the market.
 */
function previousBreakoutWon(bars: readonly Bar[], upto: number, n: number): boolean | null {
  const channel = donchian(bars.slice(0, upto), T.breakoutBars);
  let last: { index: number; direction: 1 | -1 } | null = null;

  for (let i = T.breakoutBars; i < upto; i++) {
    const high = channel.upper[i - 1];
    const low = channel.lower[i - 1];
    if (high === null || low === null) continue;
    if (bars[i].h > high) last = { index: i, direction: 1 };
    else if (bars[i].l < low) last = { index: i, direction: -1 };
  }
  if (!last || !(n > 0)) return null;

  // Walk it forward exactly as the system would have: 2N against is a loss, the opposite 10-bar
  // extreme is the exit, and whichever comes first decides.
  const entry = bars[last.index].c;
  const stop = last.direction === 1 ? entry - T.stopN * n : entry + T.stopN * n;
  const exits = donchian(bars.slice(0, upto), T.exitBars);

  for (let i = last.index + 1; i < upto; i++) {
    if (last.direction === 1 ? bars[i].l <= stop : bars[i].h >= stop) return false;
    const opposite = last.direction === 1 ? exits.lower[i - 1] : exits.upper[i - 1];
    if (opposite === null) continue;
    const exited = last.direction === 1 ? bars[i].l <= opposite : bars[i].h >= opposite;
    if (exited) return last.direction === 1 ? opposite > entry : opposite < entry;
  }
  return null; // still open at the decision bar, so it is neither yet
}

export const CHANNEL: Engine = {
  code: 'CHANNEL',
  name: 'Channel',
  school: 'Donchian / Turtle — Dennis & Eckhardt 1983, rules published by Faith',
  needs: T.breakoutBars + T.atrPeriod + 1,

  read(input: EngineInput): Verdict {
    // Deliberately not using `input.atr`: the chart's pinned ATR is ATR(14) over a fixed 80-bar
    // window (§11.2), and the Turtles' N is ATR(20). Borrowing the badge's number because it is to
    // hand would be a different system with the same name.
    const { bars, entry } = input;
    const used = bars.length;
    if (used < CHANNEL.needs) {
      return passes(CHANNEL, ENGINE_VERSION, 'not enough history to form the 20-bar channel', used);
    }

    const i = used - 1;
    // The channel is measured over the bars *before* the decision bar. Including the decision bar
    // would make every bar its own breakout — one of the ambiguities that keeps determinism off 5/5,
    // and resolved here in the only direction that produces a signal at all.
    const prior = donchian(bars.slice(0, i), T.breakoutBars);
    const high = prior.upper[prior.upper.length - 1];
    const low = prior.lower[prior.lower.length - 1];
    if (high === null || low === null) {
      return passes(CHANNEL, ENGINE_VERSION, 'no 20-bar channel yet', used);
    }

    const broke: 1 | -1 | null = bars[i].h > high ? 1 : bars[i].l < low ? -1 : null;
    if (broke === null) {
      return passes(
        CHANNEL,
        ENGINE_VERSION,
        `no breakout: the bar traded inside the 20-bar channel (${low.toFixed(2)}–${high.toFixed(2)})`,
        used,
      );
    }

    // N is ATR(20) under Wilder's smoothing, seeded on a simple average — Faith's own description,
    // and the seeding is a real divergence point between implementations.
    const n = atrOf(bars.slice(0, i + 1), T.atrPeriod);
    if (n === null || !(n > 0)) {
      return passes(CHANNEL, ENGINE_VERSION, 'no N to size the stop with', used);
    }

    const wonLast = previousBreakoutWon(bars, i, n);
    if (wonLast === true) {
      return passes(
        CHANNEL,
        ENGINE_VERSION,
        'System 1 skips this breakout: the previous one would have been a winner',
        used,
      );
    }

    const long = broke === 1;
    const stop = long ? entry - T.stopN * n : entry + T.stopN * n;

    // The target is OURS. The Turtles have none — they trail out on the opposite 10-bar extreme —
    // so rather than invent a number we take the distance to that extreme at the decision bar,
    // which is where the trailing exit would sit on the first day of the trade. It is derived from
    // the school without pretending to be the school's.
    const exitChannel = donchian(bars.slice(0, i + 1), T.exitBars);
    const trail = long
      ? exitChannel.lower[exitChannel.lower.length - 1]
      : exitChannel.upper[exitChannel.upper.length - 1];
    const reach = trail === null ? T.stopN * n : Math.abs(entry - trail);
    const target = long ? entry + Math.max(reach, n) : entry - Math.max(reach, n);

    const annotations = [
      causal<Annotation>(
        { kind: 'level', price: long ? high : low, label: '20-bar breakout' },
        i,
        i,
      ),
      causal<Annotation>({ kind: 'band', price: entry, to: stop, label: '2N risk' }, i, i),
    ];

    return {
      engine: 'CHANNEL',
      name: CHANNEL.name,
      version: ENGINE_VERSION,
      direction: long ? 'long' : 'short',
      bracket: { stop, target },
      exit: {
        kind: 'opposite-extreme',
        bars: T.exitBars,
        description: `exit on the opposite ${T.exitBars}-bar extreme`,
      },
      provenance: { stop: 'school', target: 'ours' },
      conviction: null,
      rules: [
        `the bar broke the ${T.breakoutBars}-bar ${long ? 'high' : 'low'} at ${(long ? high : low).toFixed(2)}`,
        wonLast === null
          ? 'no prior breakout in view, so System 1’s winner filter does not apply'
          : 'the previous breakout would have lost, so System 1 takes this one',
        `stop ${T.stopN}N from entry, N = ATR(${T.atrPeriod}) = ${n.toFixed(2)}`,
      ],
      annotations,
      candlesUsed: used,
    };
  },
};
