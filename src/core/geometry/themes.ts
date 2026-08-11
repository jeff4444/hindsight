/**
 * Themes — the published spec.
 *
 * §6 states the problem this file exists to solve, and it is not a problem of finding the right
 * definitions. There are none.
 *
 * > The two most-used open reference implementations of break of structure, change of character,
 * > order blocks, fair value gaps and equal highs and lows **disagree materially on every single
 * > primitive**… There is no canonical specification to adopt. Hindsight must write one, publish it
 * > in-app, and hold to it — otherwise players will argue with the annotations and be right to.
 *
 * Verified since, and worse than asserted: fair-value-gap counts differ by **13.6×** across
 * defensible readings of the same words, swing counts by 44 / 58 / 530 / 761, and the most-cited
 * supporting paper was withdrawn by its own author. Even RSI has no canonical implementation —
 * TA-Lib and TradingView disagree on weekly ATR(7) by 12%.
 *
 * **So the choice is not between the right definition and ours. It is between an undisclosed
 * definition and a published one.** Every threshold below is a named constant, defaulted here and
 * rendered at `/rules` from `docs/rules.md`, which reads this file's numbers back to the player.
 *
 * ## The template
 *
 * Lo, Mamaysky & Wang (2000, *Journal of Finance* 55(4)) is what this copies, and three things in
 * particular:
 *
 * 1. **Patterns are inequalities over consecutive extrema**, with every tolerance named — E1 and E5
 *    within 1.5% of their average, rectangles at 0.75%, double tops needing 22 days' separation.
 * 2. **A stated detection lag.** Their words: "the lag d ensures that we are computing our
 *    conditional returns completely out-of-sample and without any look-ahead bias." Here that is
 *    the `knownAt` on every tag, and it is inherited from the swings the theme is built out of —
 *    which is the thing both public SMC implementations lack.
 * 3. **Honesty about arbitrary parameters.** They shrank a cross-validated bandwidth to 0.3× because
 *    analysts judged the fit too smooth, said "admittedly, this is an ad hoc approach", fixed it
 *    *before* running the statistics and never revised it. The constants here are chosen once, in
 *    the open, and 2c publishes what they find in permuted bars beside what they find in real ones.
 *
 * ## What is not here
 *
 * Ten themes were drafted; **six ship**.
 *
 * - **gap-fill** and **opening-drive** are structurally meaningless on a 24/7 spot corpus — there is
 *   no session gap and no open. The gap-fill folklore is contradicted by the evidence anyway.
 * - **distribution-top** has no specifiable definition; Wyckoff phases are a drawing, not a bar
 *   count.
 * - **news-spike** is deferred to Phase 7. The research proposed shipping it as an outlier detector
 *   "labelled as such", and that is one label too many: with no event data, a theme named for a
 *   cause we cannot observe asserts exactly the kind of thing this project refuses to assert
 *   elsewhere. The detector is trivial to add once §9 gives it a timestamp to point at.
 *
 * Nothing here reads the reveal. A theme describes the setup, never the outcome — §12.1 — and a
 * tape filtered on a theme therefore selects on the lead-in alone, which is the rule
 * `supabase/migrations/0010` records for tape filters.
 */

import type { Bar } from '../bars';
import { causal, type Causal } from '../causal';
import { fitChannel } from './channels';
import type { Swing } from './swings';

export const THEMES = [
  'liquidity-sweep',
  'failed-breakout',
  'v-reversal',
  'compression-expansion',
  'range-reversion',
  'trend-continuation',
] as const;

export type Theme = (typeof THEMES)[number];

export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

export interface ThemeTag {
  theme: Theme;
  /** Which way the setup points. Null where the theme has no direction. */
  direction: 'up' | 'down' | null;
  /**
   * How strongly the window satisfies the rule, in [0, 1].
   *
   * Graded rather than boolean for the same reason swings are: a deterministic boolean detector
   * admits no stability guarantee at all (Kumabe & Yoshida 2023). A tag near zero is a tag the
   * next quarter tick could take away.
   */
  strength: number;
}

/* ------------------------------------------------------------- the constants */

/**
 * Every published threshold, in one object.
 *
 * One object rather than scattered constants so that `docs/rules.md` can quote it and a reader can
 * diff two versions of the spec without reading the code. Bumping any of these is a
 * `GEOMETRY_VERSION` bump — the tags stored under the old numbers are not comparable to the new
 * ones, and §12.4 is emphatic that population statistics are not comparable across a change of rule.
 */
export const THEME_SPEC = {
  /**
   * A sweep must clear the level it takes out, but only just.
   *
   * Osler (2005, *JIMF*) on a major dealing bank's complete order book — 9,655 orders, >$55bn —
   * found stop-loss orders clustering *just past* round numbers while take-profits clustered *at*
   * them: 14.3% of executed stop-loss buys at rates ending [01,10] against 6.9% at [91,00]. A sweep
   * is price reaching into that band and leaving. Clearing a level by two ATR is not a sweep, it is
   * a breakout, which is why there is a ceiling as well as a floor.
   */
  sweepMinExceedanceAtr: 0.05,
  sweepMaxExceedanceAtr: 0.75,
  /** Bars within which price must close back inside for the excursion to be a sweep, not a break. */
  sweepReclaimBars: 3,
  /** A swept level must have been tested before; an untested extreme has no stops resting on it. */
  sweepMinTouches: 2,
  /**
   * How close two swings have to be to count as the same level, in ATR.
   *
   * Its own constant because it is its own concept. The first draft reused the sweep's *exceedance*
   * ceiling for this, which is a different question wearing a similar shape — "how far past a level
   * did price go" is not "how far apart can two touches be and still be one level" — and at 0.75
   * ATR it made almost any pair of swings the same level.
   */
  levelToleranceAtr: 0.3,
  /**
   * Only swings of at least this persistence, in ATR, are levels worth sweeping.
   *
   * The `intermediate` grade. Without it the detector scans all ~108 settled swings on an 80-bar
   * chart — most of them one-tick wiggles — and something is always being taken out and given back:
   * it tagged **100%** of charts. Stops rest at levels a reader can see, so the detector should only
   * look where a reader would.
   */
  sweepMinLevelPersistenceAtr: 1.0,

  /** Window whose extreme a breakout has to clear. Donchian's own default, unchanged since 1960. */
  breakoutLookbackBars: 20,
  /**
   * A breakout is a **close** beyond the level, by this much of an ATR — not a wick beyond it.
   *
   * Edwards & Magee supply the one deterministic penetration rule the classical canon contains: a
   * valid trendline break requires a *close* beyond by about 3% of price. Ported to an
   * ATR-denominated form, because 3% of price means something different on a quiet chart and a
   * violent one, and every threshold in this file has to survive normalisation.
   *
   * Wick-based penetration is what made this theme fire on **100%** of charts: on any noisy series a
   * high pokes past a twenty-bar extreme and comes back constantly, and calling that a failed
   * breakout makes the label meaningless. A close beyond is a commitment; a wick is an excursion,
   * and excursions are what `liquidity-sweep` is for.
   */
  breakoutMinCloseAtr: 0.1,
  /** Bars within which price must close back inside the range for the breakout to have failed. */
  failedBreakoutReclaimBars: 5,

  /**
   * A V-reversal must retrace this share of the leg it reverses.
   *
   * The one hard number the classical literature actually supplies for this formation, and it is
   * Bulkowski's: 38.2%. Taken as given rather than tuned — the whole point of citing a source is
   * that its numbers are not ours to move.
   */
  vReversalMinRetrace: 0.382,
  /** The leg being reversed has to be worth reversing. */
  vReversalMinLegAtr: 2.0,
  /** …and the reversal has to be sharp. A slow grind back is not a V. */
  vReversalMaxBars: 20,

  /** Bars in the recent window whose range is compared against the whole lead-in. */
  compressionWindowBars: 10,
  /**
   * Recent range as a share of the range diffusion predicts, below which price is compressed.
   *
   * The scale-free relative of Crabel's NR7 and of Bollinger BandWidth percentile: both ask whether
   * the current range is small *against this instrument's own recent behaviour* rather than against
   * an absolute number, which is the only form of the question that survives normalisation.
   *
   * The denominator is `ATR·√n`, not `ATR·n`. A random walk's range grows with the *square root* of
   * elapsed time — the same first-passage identity that makes the directional-change event count
   * scale as δ⁻², and the reason that count is a diffusion identity rather than a market
   * regularity. Normalising by `ATR·n` instead measures a ten-bar range against the range of a
   * series that only ever moves in one direction, so every window on earth looks compressed: it
   * tagged **99%** of charts before this was fixed.
   */
  compressionMaxRangeRatio: 0.6,
  /** A bar this many ATR wide ends the compression and makes the theme an expansion. */
  expansionMinRangeAtr: 1.5,

  /**
   * Whole-window range, as a share of what diffusion predicts, below which this is a range.
   *
   * A driftless walk covers about `ATR·√n` in `n` bars — 8.94 ATR over the 80-bar lead-in. So "a
   * range" has a derivation rather than a number: **a window that went less far than diffusion
   * predicts.** The measured corpus median is 10.18 ATR and the first quartile 8.42, so this cuts
   * at roughly the quartile — but it cuts there because of the baseline, not because the quartile
   * was chosen.
   *
   * The first draft used a flat 6.0 ATR, which is below the corpus's *tenth* percentile of 7.03.
   * It tagged one chart in a thousand.
   */
  rangeMaxWidthDiffusion: 0.95,
  /**
   * Swings at each edge before the window is a range rather than a drift.
   *
   * The first draft asked for closes clustering inside the middle half, and measurement showed the
   * two conditions **fighting each other**: a window narrow against diffusion is one price traverses
   * repeatedly, so its closes are spread across the band rather than piled in the middle. Narrow and
   * mid-clustered are close to mutually exclusive, and requiring both tagged 0.7% of the corpus.
   *
   * What a range actually is, is price coming back to both edges — which is the Donchian
   * trading-range shape and is already sitting in the swing set. Two touches a side is the minimum
   * that can be called "kept returning" rather than "went there once".
   */
  rangeMinEdgeSwings: 2,
  /** Share of the range, at each end, that counts as the edge. */
  rangeEdgeBand: 0.25,

  /** Theil–Sen slope, in ATR per bar, above which the window is going somewhere. Corpus median. */
  trendMinSlopeAtrPerBar: 0.06,
  /**
   * Kaufman efficiency ratio above which the move is directional rather than wandering.
   *
   * 0.20 is the published boundary between `noise` and `directional` in `src/core/regime.ts`,
   * reused rather than reinvented so the theme and the regime tag cannot disagree about the same
   * window. It is anchored on the random-walk expectation of `1/√80 ≈ 0.11`, so it is about twice
   * noise.
   *
   * **Not 0.35**, which is where that file puts the `trend` bucket. Measurement says the corpus's
   * 90th percentile efficiency ratio is 0.302, so almost nothing reaches 0.35 — a threshold there
   * tagged 0.8% of charts. That is a finding about the corpus rather than about the theme: this is
   * a crypto-spot library and it is mostly chop, which is worth knowing before anyone wonders why
   * §6's `trend` regime row is thin.
   */
  trendMinEfficiency: 0.2,
  /**
   * The largest share of the window's net move any single bar may account for.
   *
   * The condition that separates a trend from a shock, and it had to be found by testing rather
   * than reasoned out: a flat window with one violent bar in the middle passes *both* of the other
   * two conditions comfortably. Efficiency is high because a step is perfectly efficient movement,
   * and Theil–Sen does not reject it either — that estimator is robust to outlying *points*, and a
   * step is not an outlier, it is a level change with half the data on each side of it.
   *
   * So the third condition says the thing the other two assume: the move has to be *distributed*.
   * A half is generous — a single bar carrying more than half of everything the window achieved is
   * a gap with scenery, whatever its slope and efficiency say.
   */
  trendMaxSingleBarShare: 0.5,

  /**
   * How recently a theme has to have happened to be what the chart is *about*.
   *
   * The correction that mattered most. A detector asking "did this ever occur in eighty bars"
   * answers yes for anything that occurs at all: sweeps, failed breakouts and V-reversals tagged
   * 92%, 86% and 82% of the corpus, which is not a filter, it is a description of price.
   *
   * A theme names the setup facing the player at the decision bar, so an occurrence sixty bars ago
   * is history rather than context. Twenty bars, matching the breakout lookback so there is one
   * window in this file rather than two.
   */
  recencyBars: 20,
} as const;

/**
 * Tags below this strength are not emitted.
 *
 * A single floor rather than one per theme: a per-theme floor is six more numbers to defend, and
 * the strengths are all built to the same scale — the margin by which the window clears its rule,
 * capped at one.
 */
export const MIN_STRENGTH = 0.15;

/* ------------------------------------------------------------------ helpers */

/** Clamp a margin into [0, 1]. Every strength in this file ends here. */
function graded(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Highest high and lowest low over a slice. */
function extremes(bars: readonly Bar[], from: number, to: number) {
  let high = -Infinity;
  let low = Infinity;
  for (let i = Math.max(0, from); i < Math.min(bars.length, to); i++) {
    if (bars[i].h > high) high = bars[i].h;
    if (bars[i].l < low) low = bars[i].l;
  }
  return { high, low };
}

export interface ThemeInput {
  bars: readonly Bar[];
  /** Settled swings over the same window, from `persistentSwings`. */
  swings: readonly Causal<Swing>[];
  /** The chart's pinned ATR. See `ATR_WINDOW_BARS` for why it is a fixed window at every tier. */
  atr: number;
  /** Kaufman efficiency ratio over the same closes, from `src/core/regime.ts`. */
  efficiency: number;
}

/* ------------------------------------------------------------ the detectors */

/**
 * A level was taken out and immediately given back.
 *
 * The best-evidenced theme on the list, and the only one whose mechanism was measured on a real
 * order book rather than inferred from charts. Requires a *tested* level — `sweepMinTouches` — since
 * the whole mechanism is resting stop orders, and nothing rests beyond a level price has never
 * visited.
 *
 * `knownAt` is the reclaim bar, never the excursion bar: until price closes back inside, the
 * excursion is indistinguishable from a breakout, and stamping it earlier would be the
 * pre-confirmation bug §15 names.
 */
function liquiditySweep(input: ThemeInput): Causal<ThemeTag>[] {
  const { bars, swings, atr } = input;
  const out: Causal<ThemeTag>[] = [];

  // Levels a reader would actually be watching. See `sweepMinLevelPersistenceAtr`.
  const levels = swings.filter(
    (swing) => swing.value.persistence >= THEME_SPEC.sweepMinLevelPersistenceAtr * atr,
  );

  for (const swing of levels) {
    const level = swing.value.price;
    const isHigh = swing.value.kind === 'high';

    // Only levels price had already tested. Counted among the other swings, not among all bars:
    // a level is defined by where price turned, not by where it passed through.
    const touches = levels.filter(
      (other) =>
        other.value.kind === swing.value.kind &&
        other.knownAt <= swing.knownAt &&
        Math.abs(other.value.price - level) <= THEME_SPEC.levelToleranceAtr * atr,
    ).length;
    if (touches < THEME_SPEC.sweepMinTouches) continue;

    // The excursion has to happen after the level was knowable, or the sweep is of a level nobody
    // could have been watching.
    for (let i = swing.knownAt + 1; i < bars.length; i++) {
      const exceedance = isHigh ? bars[i].h - level : level - bars[i].l;
      if (exceedance < THEME_SPEC.sweepMinExceedanceAtr * atr) continue;
      if (exceedance > THEME_SPEC.sweepMaxExceedanceAtr * atr) break; // a break, not a sweep

      // Reclaimed? A close back on the original side, inside the window.
      const deadline = Math.min(bars.length - 1, i + THEME_SPEC.sweepReclaimBars);
      for (let j = i; j <= deadline; j++) {
        const reclaimed = isHigh ? bars[j].c < level : bars[j].c > level;
        if (!reclaimed) continue;
        out.push(
          causal<ThemeTag>(
            {
              theme: 'liquidity-sweep',
              // A swept high traps buyers and points down.
              direction: isHigh ? 'down' : 'up',
              // Deeper into the stop band and faster back is a cleaner sweep.
              strength: graded(
                (exceedance / (THEME_SPEC.sweepMaxExceedanceAtr * atr)) *
                  (1 - (j - i) / (THEME_SPEC.sweepReclaimBars + 1)),
              ),
            },
            i,
            j,
          ),
        );
        break;
      }
      break;
    }
  }

  return out;
}

/**
 * The range extreme was cleared and then lost.
 *
 * Deliberately a different rule from `liquidity-sweep`, and the difference is published because the
 * two would otherwise be one theme wearing two names. A sweep takes out a **tested swing level** by
 * a *small* amount and reverses fast — the Osler mechanism, resting stops. A failed breakout takes
 * out the **N-bar range extreme** by any amount and closes back inside within a longer window. One
 * is about stop placement; the other is about a move that did not hold.
 */
function failedBreakout(input: ThemeInput): Causal<ThemeTag>[] {
  const { bars, atr } = input;
  const out: Causal<ThemeTag>[] = [];
  const lookback = THEME_SPEC.breakoutLookbackBars;

  for (let i = lookback; i < bars.length; i++) {
    const prior = extremes(bars, i - lookback, i);
    for (const side of ['up', 'down'] as const) {
      const level = side === 'up' ? prior.high : prior.low;
      const margin = THEME_SPEC.breakoutMinCloseAtr * atr;
      // A close beyond, not a wick beyond. See `breakoutMinCloseAtr`.
      const broke = side === 'up' ? bars[i].c > level + margin : bars[i].c < level - margin;
      if (!broke) continue;

      const deadline = Math.min(bars.length - 1, i + THEME_SPEC.failedBreakoutReclaimBars);
      for (let j = i + 1; j <= deadline; j++) {
        const backInside = side === 'up' ? bars[j].c < level : bars[j].c > level;
        if (!backInside) continue;
        const excursion = side === 'up' ? bars[i].c - level : level - bars[i].c;
        out.push(
          causal<ThemeTag>(
            {
              theme: 'failed-breakout',
              direction: side === 'up' ? 'down' : 'up',
              strength: graded(excursion / atr),
            },
            i,
            j,
          ),
        );
        break;
      }
    }
  }

  return out;
}

/**
 * A leg, then a sharp retracement of it.
 *
 * The retrace threshold is Bulkowski's 38.2% and is not ours to move. What *is* ours, and is
 * therefore stated rather than borrowed: the leg has to be worth two ATR before its reversal is
 * interesting, and the reversal has to complete inside twenty bars or it is a drift back rather
 * than a V.
 */
function vReversal(input: ThemeInput): Causal<ThemeTag>[] {
  const { swings, atr } = input;
  const out: Causal<ThemeTag>[] = [];

  const ordered = [...swings].sort((a, b) => a.value.index - b.value.index);
  for (let i = 1; i < ordered.length; i++) {
    const start = ordered[i - 1];
    const pivot = ordered[i];
    if (start.value.kind === pivot.value.kind) continue;

    const leg = Math.abs(pivot.value.price - start.value.price);
    if (leg < THEME_SPEC.vReversalMinLegAtr * atr) continue;

    // How far price came back off the pivot, measured by the next opposing swing.
    const back = ordered
      .slice(i + 1)
      .find((swing) => swing.value.kind !== pivot.value.kind);
    if (!back) continue;

    const bars = back.value.index - pivot.value.index;
    if (bars <= 0 || bars > THEME_SPEC.vReversalMaxBars) continue;

    const retrace = Math.abs(back.value.price - pivot.value.price) / leg;
    if (retrace < THEME_SPEC.vReversalMinRetrace) continue;

    out.push(
      causal<ThemeTag>(
        {
          theme: 'v-reversal',
          // A V-bottom is a low pivot and points up.
          direction: pivot.value.kind === 'low' ? 'up' : 'down',
          strength: graded((retrace - THEME_SPEC.vReversalMinRetrace) / (1 - THEME_SPEC.vReversalMinRetrace)),
        },
        pivot.value.index,
        // Knowable only once the retracing swing has settled — which is what makes it a V rather
        // than a pivot that might still be a pause.
        Math.max(back.knownAt, pivot.knownAt),
      ),
    );
  }

  return out;
}

/**
 * Range contracted, then released.
 *
 * The scale-free relative of Crabel's NR7 and of Bollinger BandWidth percentile: both ask whether
 * the current range is small against *this instrument's own recent behaviour*. An absolute
 * threshold is the version of this question that cannot survive normalisation, and would quietly
 * mean something different on every chart in the corpus.
 */
function compressionExpansion(input: ThemeInput): Causal<ThemeTag>[] {
  const { bars, atr } = input;
  const out: Causal<ThemeTag>[] = [];
  const window = THEME_SPEC.compressionWindowBars;
  if (bars.length < window * 2) return out;

  for (let i = window; i < bars.length; i++) {
    const recent = extremes(bars, i - window, i);
    const recentRange = recent.high - recent.low;
    if (!(recentRange > 0)) continue;

    // Compressed against what diffusion predicts for a stretch this long — see the constant.
    const ratio = recentRange / (Math.sqrt(window) * atr);
    if (ratio > THEME_SPEC.compressionMaxRangeRatio) continue;

    // The release. Without it this is just a quiet patch, which is a regime, not a theme.
    const bar = bars[i];
    const expansion = (bar.h - bar.l) / atr;
    if (expansion < THEME_SPEC.expansionMinRangeAtr) continue;

    out.push(
      causal<ThemeTag>(
        {
          theme: 'compression-expansion',
          direction: bar.c >= bar.o ? 'up' : 'down',
          strength: graded(
            ((THEME_SPEC.compressionMaxRangeRatio - ratio) / THEME_SPEC.compressionMaxRangeRatio) *
              graded(expansion / (2 * THEME_SPEC.expansionMinRangeAtr)),
          ),
        },
        i,
        // The expanding bar is the signal and it is knowable on its own close. No lag to invent.
        i,
      ),
    );
  }

  return out;
}

/**
 * Price is living inside a band and returning to the middle of it.
 *
 * Donchian's own lookback and the trading-range-break literature's shape: a bounded window that
 * price keeps re-entering rather than leaving. This is a statement about the whole lead-in, so it
 * emits at most one tag, knowable at the last bar it is measured over.
 */
function rangeReversion(input: ThemeInput): Causal<ThemeTag>[] {
  const { bars, swings, atr } = input;
  if (bars.length < THEME_SPEC.breakoutLookbackBars) return [];

  const { high, low } = extremes(bars, 0, bars.length);
  const width = high - low;
  // What a driftless walk would have covered over this many bars. See the constant.
  const expected = atr * Math.sqrt(bars.length);
  if (!(width > 0) || width > THEME_SPEC.rangeMaxWidthDiffusion * expected) return [];

  // Price came back to both edges — see `rangeMinEdgeSwings`.
  const band = width * THEME_SPEC.rangeEdgeBand;
  const visits = swings
    .filter((swing) =>
      swing.value.kind === 'high'
        ? swing.value.price >= high - band
        : swing.value.price <= low + band,
    )
    .map((swing) => ({ index: swing.value.index, top: swing.value.kind === 'high' }))
    .sort((a, b) => a.index - b.index);

  const atTop = visits.filter((visit) => visit.top).length;
  const atBottom = visits.length - atTop;
  if (atTop < THEME_SPEC.rangeMinEdgeSwings || atBottom < THEME_SPEC.rangeMinEdgeSwings) return [];

  // …and *alternated* between them. Counting edge visits alone does not distinguish a range from a
  // drift: a series creeping from the bottom of its window to the top touches both edges plenty,
  // just never twice in the same direction. Requiring a transition each way is what makes this
  // "kept coming back" rather than "passed through".
  let topThenBottom = false;
  let bottomThenTop = false;
  for (let i = 1; i < visits.length; i++) {
    if (visits[i - 1].top && !visits[i].top) topThenBottom = true;
    if (!visits[i - 1].top && visits[i].top) bottomThenTop = true;
  }
  if (!topThenBottom || !bottomThenTop) return [];

  return [
    causal<ThemeTag>(
      {
        theme: 'range-reversion',
        direction: null,
        strength: graded(
          (Math.min(atTop, atBottom) / (2 * THEME_SPEC.rangeMinEdgeSwings)) *
            (1 - width / (THEME_SPEC.rangeMaxWidthDiffusion * expected)),
        ),
      },
      bars.length - 1,
      bars.length - 1,
    ),
  ];
}

/**
 * The window is going somewhere, and steadily.
 *
 * Two conditions rather than one, because either alone is satisfied by something that is not a
 * trend. A steep Theil–Sen slope can come from one violent bar in an otherwise flat window; a high
 * efficiency ratio can come from a series that barely moves but moves monotonically. Requiring both
 * is what makes "trend" a fact about the window rather than a name for its slope.
 *
 * The efficiency ratio is §6's own trendiness axis, computed in `src/core/regime.ts` and already
 * stored on every chart — reused rather than re-derived, so the theme and the regime tag can never
 * disagree about the same window.
 */
function trendContinuation(input: ThemeInput): Causal<ThemeTag>[] {
  const { bars, atr, efficiency } = input;
  const channel = fitChannel(bars);
  if (!channel) return [];

  const slope = channel.value.slope / atr;
  if (Math.abs(slope) < THEME_SPEC.trendMinSlopeAtrPerBar) return [];
  if (efficiency < THEME_SPEC.trendMinEfficiency) return [];

  // The move has to be spread across the window rather than delivered in one bar. See the constant.
  const net = Math.abs(bars[bars.length - 1].c - bars[0].c);
  if (net > 0) {
    let largest = 0;
    for (let i = 1; i < bars.length; i++) {
      largest = Math.max(largest, Math.abs(bars[i].c - bars[i - 1].c));
    }
    if (largest / net > THEME_SPEC.trendMaxSingleBarShare) return [];
  }

  return [
    causal<ThemeTag>(
      {
        theme: 'trend-continuation',
        direction: slope > 0 ? 'up' : 'down',
        strength: graded(
          ((Math.abs(slope) - THEME_SPEC.trendMinSlopeAtrPerBar) /
            (2 * THEME_SPEC.trendMinSlopeAtrPerBar)) *
            ((efficiency - THEME_SPEC.trendMinEfficiency) / (1 - THEME_SPEC.trendMinEfficiency)),
        ),
      },
      bars.length - 1,
      bars.length - 1,
    ),
  ];
}

/* --------------------------------------------------------------- the roster */

const DETECTORS: Record<Theme, (input: ThemeInput) => Causal<ThemeTag>[]> = {
  'liquidity-sweep': liquiditySweep,
  'failed-breakout': failedBreakout,
  'v-reversal': vReversal,
  'compression-expansion': compressionExpansion,
  'range-reversion': rangeReversion,
  'trend-continuation': trendContinuation,
};

/**
 * Every theme tag in the window, strongest first.
 *
 * Tags below `MIN_STRENGTH` are dropped: a tag that barely clears its rule is one the next quarter
 * tick could take away, and an annotation that flickers is worse than one that is absent.
 */
export function detectThemes(input: ThemeInput): Causal<ThemeTag>[] {
  if (!(input.atr > 0)) return [];

  const tags = THEMES.flatMap((theme) => DETECTORS[theme](input)).filter(
    (tag) => tag.value.strength >= MIN_STRENGTH,
  );

  tags.sort(
    (a, b) =>
      b.value.strength - a.value.strength ||
      a.knownAt - b.knownAt ||
      a.value.theme.localeCompare(b.value.theme),
  );
  return tags;
}

/**
 * The themes a chart carries, as stored.
 *
 * Two gates, and both are load-bearing.
 *
 * **Knowable by the decision bar.** `supabase/migrations/0010` records that a tape's filter must be
 * computable from the lead-in alone, and a theme confirmed at bar 84 of an 80-bar lead-in is a fact
 * about the *reveal*. Filtering on it would announce the answer before the trade — the same defect
 * that keeps The Null Set locked.
 *
 * **Recent enough to be the setup.** See `recencyBars`. A theme is what the chart is about at the
 * moment of the decision, not an inventory of everything that ever happened in the window. Without
 * this gate three of the six detectors tagged over 80% of the corpus each.
 *
 * Deduplicated to a set of names, because that is what a filter needs and what a chart row should
 * hold. The graded tags stay available from `detectThemes` for anything that wants them.
 */
export function themesOf(input: ThemeInput, decisionBar: number): Theme[] {
  const earliest = decisionBar - THEME_SPEC.recencyBars;
  const seen = new Set<Theme>();
  for (const tag of detectThemes(input)) {
    if (tag.knownAt <= decisionBar && tag.knownAt > earliest) seen.add(tag.value.theme);
  }
  return THEMES.filter((theme) => seen.has(theme));
}
