/**
 * Pre-registration, enforced by a test.
 *
 * Every threshold any engine uses lives in one frozen object, and its hash is recorded beside it.
 * `tests/engines.test.ts` asserts the two agree, so changing a constant fails the build and forces
 * a deliberate act with a diff attached.
 *
 * ## Why this file exists before any engine does
 *
 * 3b will ask whether any engine beats a random benchmark. That question has a family size **N**,
 * and everything downstream depends on N being honest:
 *
 * > Pre-register and hash the engines and their thresholds **before touching the corpus**. This is
 * > what makes N = 6 rather than N = every threshold we tried. Bailey & López de Prado's minimum
 * > backtest length is ≈ 2·ln(N) years, so tuning on the evaluation set silently multiplies N into
 * > the hundreds.
 *
 * We have already walked into the naive version of this once. §13.9 ran twelve comparisons, found
 * one "significant" result at 95%, and watched it vanish under correction — and that was with the
 * comparisons *counted*. An uncounted one is worse: it produces a number nobody can deflate because
 * nobody knows what to deflate it by.
 *
 * The rule this file enforces is therefore narrow and absolute: **a threshold may be changed, but
 * not quietly.** If a number below moves after the corpus has been replayed, the honest response is
 * to bump `ENGINE_VERSION`, re-run everything, and treat the family as larger — not to keep the old
 * track record.
 *
 * Nothing here was tuned. Every value is either published by the school it belongs to, or is ours
 * and marked as ours in `PROVENANCE` below.
 */

import { ENGINE_VERSION } from '../versions';

/**
 * Every constant, frozen.
 *
 * Grouped by engine, and each entry says whether the school published it or we did. A reader should
 * be able to check any line against its source without reading the code that consumes it.
 */
export const THRESHOLDS = {
  channel: {
    /** System 1's entry breakout. Faith, *The Original Turtle Trading Rules*. Theirs. */
    breakoutBars: 20,
    /** System 1's exit. Theirs. */
    exitBars: 10,
    /** N, the volatility unit. "The 20-day exponential moving average of the True Range." Theirs. */
    atrPeriod: 20,
    /** Stop distance in N, measured from the fill rather than the breakout level. Theirs. */
    stopN: 2,
  },
  reversion: {
    /** "2-period RSI". Theirs. */
    rsiPeriod: 2,
    /** Connors tested < 5 as better than < 10. Theirs. */
    rsiThreshold: 5,
    /** The regime filter. Rule 3, and load-bearing. Theirs. */
    regimePeriod: 200,
    /** Exit condition: a close above the 5-bar mean. Theirs. */
    exitMaPeriod: 5,
    /**
     * The stop, in ATR. **Ours, and against the school's own advice.**
     *
     * Rule 5 of *Short Term Trading Strategies That Work* is titled "Stops Hurt". Connors and
     * Alvarez tested stops from 1% to 50% across fifteen years of liquid US equities and reported:
     * "In every single case, the use of stops lowered the performance." Risk is controlled by
     * position sizing instead.
     *
     * This product is about stop placement, so an engine with no stop cannot be compared to a
     * player who must place one. We supply one, mark it `ours`, and print the objection on screen —
     * it is the most interesting disagreement on the roster and hiding it would waste it.
     */
    stopAtr: 2,
    /** Target in R. Ours: the school exits on a condition, not a price. */
    targetR: 2,
  },
  /**
   * The Hindsight variant: identical but for the regime filter.
   *
   * Not a tuning of Connors — a **separate named engine** whose only difference is the one rule, so
   * the pair is a controlled test of whether Rule 3 survives crypto hourly. Faithful REVERSION fires
   * on 2.2% of the corpus (22 charts), which is below anything measurable; this exists so the
   * comparison has a sample, and it is labelled as ours wherever it appears.
   */
  reversionHindsight: {
    /** The one change. */
    useRegimeFilter: false,
  },
  /**
   * SWEEP — the engine that could not ship under the name it arrived with.
   *
   * §5.2 called this LIQUIDITY and credited it to ICT. The research found the target rule fatal:
   * defining "the next liquidity pool" deterministically needs six rules — a pivot definition, an
   * equal-level tolerance, a minimum touch count, which side of entry counts, a tie-break among
   * qualifying pools, and precedence between internal and external liquidity — and **none is
   * published anywhere authoritative**. The doctrine explicitly makes the target *revisable*:
   * choose "the most obvious" pool and update as structure changes. A rule containing "most
   * obvious" is a discretionary loop, and the discretion is what the school considers the skill.
   *
   * So every number here is **ours**, the engine carries our name rather than the school's, and it
   * is written in the ICT idiom without claiming to be ICT. Same bargain §13.7 struck for the
   * themes: the choice is not between the right definition and ours, it is between an undisclosed
   * definition and a published one.
   *
   * One deliberate omission. §5.2 specified a "minimum 1:2" reward filter; the research established
   * that **this is not an ICT rule at all** and that it silently overrides the pool choice whenever
   * the nearest pool sits closer than 2R — making the output not-ICT by the school's own lights.
   * There is no minimum-R rule here. The nearest opposing pool is the target whatever R it implies,
   * and where there is no opposing pool the engine passes rather than inventing one.
   */
  sweep: {
    /** Which swings count as pools. Ours — `SWING_GRADES` from §13.1. */
    poolGrade: 'intermediate',
    /** How far back a pool may sit, in bars. Ours. */
    lookbackBars: 60,
    /**
     * Minimum penetration beyond the pool, in ATR, before a wick counts as a sweep.
     *
     * **Re-registered at 0.25 from 0.05 (`engine-2` → `engine-3`), and the reason is internal
     * consistency rather than anything measured.** The engine already treated 0.25 ATR as the
     * distance that counts as "clearly beyond a level" — that is what `stopBufferAtr` is — while
     * asking only 0.05 ATR of the sweep itself. Two notions of "beyond" differing fivefold inside
     * one engine is a spec defect, and 0.05 ATR is a twentieth of a typical bar's range: inside the
     * noise, so it made "swept" mean "touched".
     *
     * A stop run has to actually run the stops. Stops rest a little way beyond a swing, so the bar
     * must clear the level by a distance a trader would recognise as clearing it.
     */
    minPenetrationAtr: 0.25,
    /** The close must return this far back inside the pool, in ATR. Ours; 0.25 for the same reason. */
    minRejectionAtr: 0.25,
    /** Stop buffer beyond the sweep wick, in ATR. Ours; the "beyond the wick" part is the idiom's. */
    stopBufferAtr: 0.25,
  },
  /**
   * PATTERN — Bulkowski. The best arithmetic on the roster, in the worst window for it.
   *
   * The measuring rule is genuinely 5/5 *given a pattern*, and it is the only school-published
   * **target** on this roster. All the determinism risk sits in detection, and the window decides it:
   *
   * > **Correction to the research as first gathered.** The finding was reported as "80 hourly
   * > candles ≈ 13 trading days", which assumes a 6.5-hour equity session. This corpus is **24/7
   * > crypto**: 80 candles is **3.3 calendar days** and 300 is **12.5**. The window problem is
   * > roughly four times worse than reported.
   *
   * A double top needing peaks "usually several weeks apart" cannot exist at either tier. So this
   * engine is restricted to the formations the window actually admits — flags and pennants, the
   * short continuation patterns — and Bulkowski's percentages are **not** used as conviction. They
   * are daily-bar priors measured over decades and applied out of domain; conviction comes from our
   * own replay like every other engine's.
   */
  pattern: {
    /** Bars the impulse leg may span. Ours — the window admits nothing longer. */
    poleMaxBars: 12,
    /** How far the pole must travel, in ATR, to be an impulse rather than drift. Ours. */
    poleMinAtr: 2,
    /** Bars of consolidation after the pole. Ours. */
    flagMinBars: 3,
    flagMaxBars: 12,
    /** The consolidation may retrace at most this share of the pole. Ours. */
    maxRetrace: 0.5,
    /** …and must be at most this fraction of the pole's height, so a flag is not a reversal. Ours. */
    maxFlagHeight: 0.5,
    /**
     * The measuring rule's scaling factor. **Theirs, and the correction that matters.**
     *
     * Bulkowski's headline percentage is *"percentage meeting price target"*, and he is explicit
     * that the naive full-height projection "doesn't work well". The number is therefore a
     * **scaling factor, not a hit probability** — projecting a fraction of pattern height produces
     * a target that roughly half of patterns reach, by construction. Edwards & Magee's measuring
     * implication for flags is the full pole; this discounts it, which is the school's own advice.
     */
    projection: 0.6,
    /** Stop the other side of the consolidation, plus this buffer in ATR. Ours. */
    stopBufferAtr: 0.25,
  },
  /**
   * GEOMETRY — harmonics. Mechanical, once we supply what Carney did not.
   *
   * He publishes exact ratios and **no tolerances**. Vendors invent them: a typical scanner exposes
   * an "error percent" defaulting to 8 on a 0–20 range, so ±5% turns 0.618 into 0.587–0.649. Two
   * faithful implementers reading the same book produce different patterns. Determinism is 3/5 as
   * written and 5/5 once the tolerance is published, so it is published here.
   *
   * **The Crab contradiction, resolved explicitly.** Carney's own site states B = 0.886 XA for the
   * Crab, against the near-universal secondary statement of 0.382–0.618 — 0.886 is normally the
   * *Deep* Crab. We take the secondary consensus, because taking 0.886 would make the Crab and the
   * Deep Crab the same pattern and leave the Deep Crab undefined. The disagreement is disclosed
   * rather than silently picked, and a reader who prefers the originator's page can say so.
   *
   * Evidence is weak: no peer-reviewed support was located, and the strongest empirical claim also
   * reports occurrence low enough to erode profitability. This engine is on the roster to be
   * *measured*, which is the only defensible reason to ship it.
   */
  geometry: {
    /** Relative tolerance on every ratio below. **Ours**, and the number that makes this 5/5. */
    tolerance: 0.05,
    /** Which swings may serve as X, A, B, C, D. Ours. */
    pivotGrade: 'minor',
    /** Carney's ratios. Theirs, except where the comment says otherwise. */
    gartley: { b: 0.618, d: 0.786, bcMin: 1.27, bcMax: 1.618 },
    bat: { bMin: 0.382, bMax: 0.5, d: 0.886, bcMin: 1.618, bcMax: 2.618 },
    butterfly: { b: 0.786, d: 1.27, bcMin: 1.618, bcMax: 2.24 },
    /** `bMin`/`bMax` are the secondary consensus, not Carney's page. See the header. */
    crab: { bMin: 0.382, bMax: 0.618, d: 1.618, bcMin: 2.618, bcMax: 3.618 },
    /** The D point must be within this many bars of the decision bar. Ours. */
    dWithinBars: 3,
    /** Stop beyond X by this buffer in ATR. The "beyond X" is Carney's; the buffer is ours. */
    stopBufferAtr: 0.25,
    /** Carney's first target: a retracement of the AD leg. Theirs. */
    targetRetrace: 0.618,
  },
  /**
   * TAPE — Volume Spread Analysis, after two corrections.
   *
   * **"Neither stop nor target is native" is half wrong.** The stop *is* native — beyond the extreme
   * of the signal bar. The target genuinely is not: VSA exits on an opposing signal, which is a
   * condition evaluated per bar and not a price.
   *
   * **"A veto rather than a direction" is our invention.** VSA signals are explicitly directional.
   * What is defensible is a large native abstain rate and background-conditionality, so this ships
   * as a directional engine that passes often — not as a veto, which Williams never proposed.
   *
   * **Only one rule in the school is numeric**: "volume lower than each of the previous two bars".
   * "Narrow", "wide" and "ultra-high" are qualitative, and the numbers in circulation come from
   * vendors and coders rather than from Williams. So the determinism here is **manufactured, not
   * inherited** — it is exactly as good as the frozen percentiles below, and no better.
   *
   * Volume and spread are read as **percentile ranks within the lead-in**, not as multiples of a
   * median. Median-scaling equalises location but not dispersion, so a fixed "2× median" threshold
   * would fire at different rates across instruments; a percentile fires at the same rate by
   * construction. Rebasing is safe either way — every VSA volume test is comparative, and dividing
   * by a positive constant preserves orderings and ratios.
   */
  tape: {
    /** Percentile below which a spread is "narrow". Ours. */
    narrowSpreadPct: 0.3,
    /** …and above which it is "wide". Ours. */
    wideSpreadPct: 0.7,
    /** Percentile above which volume is "high". Ours. */
    highVolumePct: 0.8,
    /** Close must sit within this share of the bar's low (spring) or high (upthrust). Ours. */
    closeThird: 1 / 3,
    /** Bars of lead-in needed before a percentile means anything. Ours. */
    rankWindow: 40,
    /** Stop beyond the signal bar's extreme by this buffer in ATR. The "beyond" is the school's. */
    stopBufferAtr: 0.25,
    /** Target in R. Ours — VSA exits on an opposing signal, not a price. */
    targetR: 2,
  },
  zero: {
    /** Ours by construction — it is the null. */
    stopAtr: 2,
    targetR: 2,
  },
} as const;

/**
 * Which numbers belong to the school and which are ours. Printed in `docs/rules.md` §14.
 *
 * §14.2 was written when the roster was four and read *"no school on this roster has a price
 * target"*. With eight it is **four of eight** — PATTERN and GEOMETRY both publish one, and they are
 * the only two that do. That is a correction to the claim, not to the practice: every target below
 * still says whose it is.
 */
export const PROVENANCE = {
  CHANNEL: { stop: 'school', target: 'ours' },
  REVERSION: { stop: 'ours', target: 'ours' },
  REVERSION_H: { stop: 'ours', target: 'ours' },
  SWEEP: { stop: 'ours', target: 'ours' },
  PATTERN: { stop: 'ours', target: 'school' },
  GEOMETRY: { stop: 'school', target: 'school' },
  TAPE: { stop: 'school', target: 'ours' },
  ZERO: { stop: 'ours', target: 'ours' },
} as const;

/**
 * A stable, order-independent digest of `THRESHOLDS`.
 *
 * FNV-1a over the canonical JSON — small, dependency-free, and sufficient: this guards against
 * *accidental* drift and makes a deliberate change visible in review. It is not a security
 * primitive and does not need to be.
 *
 * Keys are sorted so that reordering the object does not change the hash. Only the values do.
 */
export function digest(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val,
  );

  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * The recorded hash of the thresholds above, fixed before the corpus was replayed.
 *
 * If a test tells you this no longer matches, that is the mechanism working. Update it *and*
 * `ENGINE_VERSION` together, in a commit that says what moved and why — the two must never diverge,
 * because a track record stored under one set of numbers is not comparable to a track record stored
 * under another (§12.4).
 *
 * > **This was a literal for one release and then, briefly, was not.** 3a shipped it as
 * > `digest(THRESHOLDS)`, which made the test asserting the two agree *tautological* — it could not
 * > fail, so it guarded nothing, and any threshold could have moved silently while the old track
 * > record stayed attached to it. A pre-registration you compute at read time is not a
 * > pre-registration. It is written out by hand below, and 3c's four engines are the change that
 * > would have slipped through.
 *
 * `engine-3` is the first deliberate re-registration: Sweep's penetration and rejection thresholds
 * moved after the corpus had been replayed under `engine-2`. Everything downstream was re-measured
 * rather than inherited, and `REGISTERED.trials` counts the discarded specification.
 */
export const THRESHOLD_HASH = '388f4588';

/** The registered family, and its size. §14.7's corrections are computed against these numbers. */
export const REGISTERED = {
  version: ENGINE_VERSION,
  hash: THRESHOLD_HASH,
  /**
   * N for the multiple-comparison correction.
   *
   * Counts every engine whose record is published, Engine Zero included — it is the benchmark, but
   * it is also on the leaderboard, and a family that excludes its own control is undercounted.
   */
  engines: [
    'CHANNEL',
    'REVERSION',
    'REVERSION_H',
    'SWEEP',
    'PATTERN',
    'GEOMETRY',
    'TAPE',
    'ZERO',
  ] as const,

  /**
   * **Specifications tried on this corpus — which is larger than the roster, and has to be.**
   *
   * The deflation floor asks how high the best of N *skill-free* strategies is expected to reach by
   * luck. N is not the number of engines shipped; it is the number of things tried. Every
   * specification that has ever been replayed over these 1,000 charts counts, including the ones
   * that were replaced, because the replacement was chosen by somebody who had seen the first
   * result. That is the whole mechanism Bailey & López de Prado's deflation exists to price.
   *
   * The manifest header states the rule: a threshold may move, but the honest response is to bump
   * `ENGINE_VERSION`, re-run everything, and **treat the family as larger** — not to keep the old
   * track record. This is the counter that makes "treat the family as larger" a number rather than
   * a sentiment.
   *
   * | version | what was tried |
   * | --- | --- |
   * | `engine-1` | CHANNEL, REVERSION, REVERSION_H, ZERO |
   * | `engine-2` | …plus SWEEP, PATTERN, GEOMETRY, TAPE |
   * | `engine-3` | SWEEP re-specified: penetration and rejection 0.05 → 0.25 ATR |
   *
   * Eight engines, nine specifications. The extra trial is Sweep's first one, and it counts against
   * every engine's result even though it was discarded — that is the cost of having looked.
   */
  trials: 9,
} as const;
