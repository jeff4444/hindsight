/**
 * PATTERN — Bulkowski's measuring rule, on the only formations this window admits.
 *
 * The arithmetic here is the best on the roster and the window is the worst, and both facts have to
 * survive into the shipped engine.
 *
 * ## What is genuinely the school's
 *
 * The projection rule is **5/5 given a pattern**: height is the extreme-to-extreme distance inside
 * the formation, and the target is the breakout price plus that height, scaled. Edwards & Magee's
 * measuring implication for flags is equally crisp. This is the **only school-published target on
 * the roster** — CHANNEL, REVERSION, SWEEP and TAPE all exit on conditions, so their take-profits
 * are ours. Here the number is theirs and is marked `school`.
 *
 * > **The correction that matters.** Bulkowski's headline figure is *"percentage meeting price
 * > target"*, and he is explicit that the naive full-height projection "doesn't work well". So 58%
 * > for a symmetrical triangle is a **scaling factor, not a hit probability** — projecting a
 * > fraction of the height produces a target that roughly half of patterns reach, *by construction*.
 * > Reading it as "this pattern works 58% of the time" is a category error, and it is the one the
 * > number invites.
 *
 * ## What the window does to it, four times worse than first reported
 *
 * > **Correction to the research as first gathered.** The finding was reported as "80 hourly candles
 * > ≈ 13 trading days", which assumes a 6.5-hour equity session. This corpus is **24/7 crypto**: 80
 * > candles is **3.3 calendar days** and 300 is **12.5**.
 *
 * Bulkowski's identification guidelines are prose with escape hatches — "at least three" touches, a
 * valley drop "at least 10% but allow exceptions", peaks "usually several weeks apart" — and his
 * research base is daily and weekly bars. He warns that his own indicator on sub-weekly periods
 * produces "a nasty surprise". **A double top needing peaks weeks apart cannot exist at either
 * tier**, so it is not implemented: an engine that claims to find one in 3.3 days of candles would
 * be finding something else and calling it a double top.
 *
 * What fits is the short continuation family — flags and pennants — which is also the low-ranked,
 * weakest subset of his catalogue. That is the honest scope, and it is the scope that ships.
 *
 * **Bulkowski's percentages are not used as conviction anywhere.** They are daily-bar priors
 * measured over decades of US equities, applied here out of domain; conviction comes from our own
 * corpus replay, like every other engine's. The only number of his this engine uses is the scaling
 * factor, because that is a *rule*, not a track record.
 */

import type { Bar } from '../bars';
import { causal } from '../causal';
import { ENGINE_VERSION } from '../versions';
import { THRESHOLDS } from './manifest';
import { passes, type Annotation, type Engine, type EngineInput, type Verdict } from './contract';

const T = THRESHOLDS.pattern;

interface Flag {
  /** Where the impulse started and ended. */
  poleFrom: number;
  poleTo: number;
  /** Signed height of the impulse. */
  height: number;
  /** The consolidation's extremes. */
  high: number;
  low: number;
  up: boolean;
}

/**
 * The best flag ending at the bar before the decision bar.
 *
 * Searched rather than assumed: every (pole length, consolidation length) pair inside the manifest's
 * bounds is tried, and the one with the tallest pole wins. A flag is a *pause inside an impulse*, so
 * all four conditions below are about proportion — the pole must be an impulse, the pause must be
 * shallow, and the pause must not retrace the thing it is pausing inside.
 */
function findFlag(bars: readonly Bar[], end: number, atr: number): Flag | null {
  let best: Flag | null = null;

  for (let flagBars = T.flagMinBars; flagBars <= T.flagMaxBars; flagBars++) {
    const flagFrom = end - flagBars + 1;
    if (flagFrom <= 0) break;

    for (let poleBars = 2; poleBars <= T.poleMaxBars; poleBars++) {
      const poleFrom = flagFrom - poleBars;
      if (poleFrom < 0) break;

      const start = bars[poleFrom].c;
      const peak = bars[flagFrom - 1].c;
      const height = peak - start;
      if (Math.abs(height) < T.poleMinAtr * atr) continue;

      const up = height > 0;
      const window = bars.slice(flagFrom, end + 1);
      const high = Math.max(...window.map((b) => b.h));
      const low = Math.min(...window.map((b) => b.l));

      // The consolidation must be small against the pole, or it is a reversal wearing a flag's name.
      if (high - low > T.maxFlagHeight * Math.abs(height)) continue;

      // …and must not give back more than half the move. Deeper than that and the impulse is over.
      const retrace = up ? (peak - low) / height : (high - peak) / -height;
      if (retrace > T.maxRetrace || retrace < 0) continue;

      if (!best || Math.abs(height) > Math.abs(best.height)) {
        best = { poleFrom, poleTo: flagFrom - 1, height, high, low, up };
      }
    }
  }

  return best;
}

export const PATTERN: Engine = {
  code: 'PATTERN',
  name: 'Pattern',
  school: 'Bulkowski, *Encyclopedia of Chart Patterns*; measuring rule after Edwards & Magee',
  needs: T.poleMaxBars + T.flagMaxBars + 2,

  read(input: EngineInput): Verdict {
    const { bars, entry, atr } = input;
    const used = bars.length;
    if (used < PATTERN.needs || !(atr > 0)) {
      return passes(PATTERN, ENGINE_VERSION, 'not enough history to hold a pole and a flag', used);
    }

    const i = used - 1;
    // The flag is formed by the bars *before* the decision bar; the decision bar is the breakout.
    const flag = findFlag(bars, i - 1, atr);
    if (!flag) {
      return passes(PATTERN, ENGINE_VERSION, 'no flag or pennant in the window', used);
    }

    // The breakout has to happen on the decision bar, in the pole's direction. A flag that has not
    // broken out is a flag, not a trade — and one that broke out earlier was a trade we missed.
    const broke = flag.up ? bars[i].c > flag.high : bars[i].c < flag.low;
    if (!broke) {
      return passes(
        PATTERN,
        ENGINE_VERSION,
        `a ${flag.up ? 'bull' : 'bear'} flag is still forming between ${flag.low.toFixed(2)} and ${flag.high.toFixed(2)} — no breakout yet`,
        used,
      );
    }

    // The school's measuring rule, discounted by the school's own advice against the full
    // projection. The breakout price is the entry, per §4.2.
    const target = flag.up
      ? entry + T.projection * Math.abs(flag.height)
      : entry - T.projection * Math.abs(flag.height);

    // The stop is OURS. Bulkowski's stop guidance is discretionary prose; the other side of the
    // consolidation is where the pattern is wrong, which is the least inventive place to put it.
    const stop = flag.up
      ? flag.low - T.stopBufferAtr * atr
      : flag.high + T.stopBufferAtr * atr;

    const risk = Math.abs(entry - stop);
    if (!(risk > 0)) {
      return passes(PATTERN, ENGINE_VERSION, 'the flag leaves no room for a stop', used);
    }

    return {
      engine: 'PATTERN',
      name: PATTERN.name,
      version: ENGINE_VERSION,
      direction: flag.up ? 'long' : 'short',
      bracket: { stop, target },
      exit: null,
      provenance: { stop: 'ours', target: 'school' },
      conviction: null,
      rules: [
        `a ${flag.up ? 'bull' : 'bear'} flag: a ${Math.abs(flag.height).toFixed(2)} pole over ${flag.poleTo - flag.poleFrom + 1} bars, then a pause of ${i - 1 - flag.poleTo} that gave back under half of it`,
        `the bar closed ${flag.up ? 'above' : 'below'} the flag at ${(flag.up ? flag.high : flag.low).toFixed(2)}`,
        `target is the measuring rule: ${(T.projection * 100).toFixed(0)}% of the pole from the breakout — a scaling factor, not a hit rate`,
        'the formation set is flags and pennants only; 80 candles is 3.3 days of 24/7 tape and the rest of the catalogue cannot exist in it',
      ],
      annotations: [
        causal<Annotation>(
          { kind: 'band', price: flag.high, to: flag.low, label: 'flag' },
          i - 1,
          i - 1,
        ),
        causal<Annotation>(
          { kind: 'band', price: bars[flag.poleFrom].c, to: bars[flag.poleTo].c, label: 'pole' },
          flag.poleTo,
          flag.poleTo,
        ),
      ],
      candlesUsed: used,
    };
  },
};
