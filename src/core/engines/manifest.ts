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
  zero: {
    /** Ours by construction — it is the null. */
    stopAtr: 2,
    targetR: 2,
  },
} as const;

/** Which numbers belong to the school and which are ours. Printed in `docs/rules.md` §14. */
export const PROVENANCE = {
  CHANNEL: { stop: 'school', target: 'ours' },
  REVERSION: { stop: 'ours', target: 'ours' },
  REVERSION_H: { stop: 'ours', target: 'ours' },
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
 */
export const THRESHOLD_HASH = 'd034e8b2';

/** The registered family, and its size. 3b's corrections are computed against this number. */
export const REGISTERED = {
  version: ENGINE_VERSION,
  hash: THRESHOLD_HASH,
  /**
   * N for the multiple-comparison correction.
   *
   * Counts every engine whose record is published, Engine Zero included — it is the benchmark, but
   * it is also on the leaderboard, and a family that excludes its own control is undercounted.
   */
  engines: ['CHANNEL', 'REVERSION', 'REVERSION_H', 'ZERO'] as const,
} as const;
