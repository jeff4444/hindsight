/**
 * TAPE — Volume Spread Analysis, after two corrections to how §5.2 described it.
 *
 * Tom Williams' method reads three things per bar: the spread, where the close sits inside it, and
 * the volume *relative to recent bars*. No demand, upthrust, spring, stopping volume, effort
 * versus result.
 *
 * > **"A veto rather than a direction" is our invention, not Williams'.** VSA signals are explicitly
 * > directional — an upthrust is bearish, a spring is bullish, and neither is a filter on somebody
 * > else's trade. What *is* defensible in that description is the abstain rate: the signals are rare
 * > and the method is explicitly background-conditional. So this ships as **a directional engine
 * > that passes often**, which is a different thing from a veto and is what the school actually says.
 *
 * > **"Neither stop nor target is native" is half wrong.** The **stop is native** — beyond the
 * > extreme of the signal bar, which is where the signal is refuted. The target genuinely is not:
 * > VSA exits on an *opposing signal*, a condition evaluated bar by bar, so the take-profit here is
 * > ours and is marked `ours`.
 *
 * ## The determinism here is manufactured, not inherited
 *
 * **Exactly one rule in the school is numeric**: "volume lower than each of the previous two bars".
 * "Narrow", "wide" and "ultra-high" are qualitative in Williams, and every number in circulation
 * for them comes from vendors and coders rather than from him. So a 4.5/5 determinism score cannot
 * be inherited from the source — this engine is exactly as reproducible as the percentiles frozen in
 * the manifest, and no more. That is a statement about us, not about VSA.
 *
 * ## Why percentile rank and not a multiple of the median
 *
 * Every VSA volume test is comparative, so rebasing volume is harmless: dividing by a positive
 * constant preserves every ordering and every ratio, and no signal changes. **But median-scaling
 * equalises location, not dispersion.** A fixed "2× median is ultra-high" threshold fires on a
 * placid instrument far more often than on a violent one, which would make coverage a property of
 * the symbol rather than of the tape. A percentile rank within the lead-in fires at the same rate by
 * construction, so that is what is used — for spread as well as volume.
 *
 * ## What can honestly be claimed
 *
 * No peer-reviewed test of VSA exists. That volume carries information is supported — Gervais,
 * Kaniel & Mingelgrin (2001) — but cross-sectionally and at monthly horizons, not at bar scale.
 * **The premise is supported; the bar taxonomy is untested.** This engine exists to test it.
 */

import type { Bar } from '../bars';
import { causal } from '../causal';
import { ENGINE_VERSION } from '../versions';
import { THRESHOLDS } from './manifest';
import { passes, type Annotation, type Engine, type EngineInput, type Verdict } from './contract';

const T = THRESHOLDS.tape;

/**
 * Where `value` sits among `history`, as a fraction in [0, 1].
 *
 * Ties count as half, so a flat series ranks at 0.5 rather than at either extreme — the alternative
 * makes every bar of a dead tape simultaneously the widest and the narrowest.
 */
function percentile(history: readonly number[], value: number): number {
  if (history.length === 0) return 0.5;
  let below = 0;
  let equal = 0;
  for (const item of history) {
    if (item < value) below += 1;
    else if (item === value) equal += 1;
  }
  return (below + equal / 2) / history.length;
}

interface Signal {
  name: string;
  long: boolean;
  why: string;
}

/** Williams' bar taxonomy, restricted to the three signals whose definitions are least ambiguous. */
function signalAt(bars: readonly Bar[], i: number): Signal | null {
  const window = bars.slice(Math.max(0, i - T.rankWindow), i);
  if (window.length < T.rankWindow) return null;

  const bar = bars[i];
  const spread = bar.h - bar.l;
  if (!(spread > 0)) return null;

  const spreadRank = percentile(window.map((b) => b.h - b.l), spread);
  const volumeRank = percentile(window.map((b) => b.v), bar.v);
  // Where the close sits inside the bar: 0 at the low, 1 at the high.
  const close = (bar.c - bar.l) / spread;

  const priorHigh = Math.max(...window.slice(-T.rankWindow).map((b) => b.h));
  const priorLow = Math.min(...window.slice(-T.rankWindow).map((b) => b.l));

  // Upthrust: takes out the prior high on a wide spread and heavy volume, then closes in the lower
  // third. Supply overwhelmed the push. Bearish.
  if (
    bar.h > priorHigh &&
    spreadRank >= T.wideSpreadPct &&
    volumeRank >= T.highVolumePct &&
    close <= T.closeThird
  ) {
    return {
      name: 'upthrust',
      long: false,
      why: `took out the prior high on wide spread and heavy volume, then closed in the lower third (${(close * 100).toFixed(0)}% of the bar)`,
    };
  }

  // Spring: the mirror. Breaks the prior low, closes in the upper third on wide spread and volume.
  if (
    bar.l < priorLow &&
    spreadRank >= T.wideSpreadPct &&
    volumeRank >= T.highVolumePct &&
    close >= 1 - T.closeThird
  ) {
    return {
      name: 'spring',
      long: true,
      why: `broke the prior low on wide spread and heavy volume, then closed in the upper third (${(close * 100).toFixed(0)}% of the bar)`,
    };
  }

  // No demand: an up close on a narrow spread with volume below *each of* the previous two bars —
  // the one genuinely numeric rule in the school. The push has no participation behind it. Bearish.
  if (
    i >= 2 &&
    bar.c > bars[i - 1].c &&
    spreadRank <= T.narrowSpreadPct &&
    bar.v < bars[i - 1].v &&
    bar.v < bars[i - 2].v
  ) {
    return {
      name: 'no demand',
      long: false,
      why: 'an up close on a narrow spread, with volume below each of the previous two bars — Williams’ one numeric rule',
    };
  }

  return null;
}

export const TAPE: Engine = {
  code: 'TAPE',
  name: 'Tape',
  school: 'Volume Spread Analysis — Williams; every threshold below is ours, because his are words',
  needs: T.rankWindow + 3,

  read(input: EngineInput): Verdict {
    const { bars, entry, atr } = input;
    const used = bars.length;
    if (used < TAPE.needs || !(atr > 0)) {
      return passes(TAPE, ENGINE_VERSION, 'not enough history to rank a bar against its own tape', used);
    }

    const i = used - 1;
    const signal = signalAt(bars, i);
    if (!signal) {
      return passes(TAPE, ENGINE_VERSION, 'no upthrust, spring or no-demand bar here', used);
    }

    // The stop is the school's: beyond the extreme of the signal bar is where the signal is refuted.
    const bar = bars[i];
    const stop = signal.long
      ? bar.l - T.stopBufferAtr * atr
      : bar.h + T.stopBufferAtr * atr;
    const risk = Math.abs(entry - stop);
    if (!(risk > 0)) {
      return passes(TAPE, ENGINE_VERSION, 'the signal bar leaves no room for a stop', used);
    }

    const target = signal.long ? entry + T.targetR * risk : entry - T.targetR * risk;

    return {
      engine: 'TAPE',
      name: TAPE.name,
      version: ENGINE_VERSION,
      direction: signal.long ? 'long' : 'short',
      bracket: { stop, target },
      // VSA exits on an opposing signal — a condition, and one that needs the detector run forward
      // over the reveal. We do not model it, so nothing is claimed here rather than something
      // approximate being claimed as the school's.
      exit: null,
      provenance: { stop: 'school', target: 'ours' },
      conviction: null,
      rules: [
        `${signal.name}: ${signal.why}`,
        `stop beyond the signal bar's ${signal.long ? 'low' : 'high'} — where the signal is refuted, and the school's own rule`,
        `target ${T.targetR}R, ours: VSA exits on an opposing signal, which is a condition and not a price`,
        'spread and volume are read as percentile ranks within the lead-in, not multiples of a median',
      ],
      annotations: [
        causal<Annotation>({ kind: 'band', price: bar.h, to: bar.l, label: signal.name }, i, i),
      ],
      candlesUsed: used,
    };
  },
};
