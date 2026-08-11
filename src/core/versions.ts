/**
 * Version constants pinned to every stored result.
 *
 * Scope §1.2: "Engine versioning pinned to every stored result. This must be in the first
 * commit. It is unfixable later."
 *
 * Bump the relevant constant whenever a change would alter the output of the code it names.
 * A stored round must always be re-derivable from the version it was resolved under.
 */

/** Trade resolution semantics: fill rules, gap handling, timeout, R arithmetic. */
export const RESOLVER_VERSION = 'resolver-1';

/** Price indexing, mirroring and volume rebasing. */
export const NORMALIZATION_VERSION = 'norm-1';

/** Corpus generation: windowing, filtering, materialisation. */
export const PIPELINE_VERSION = 'pipeline-2';

/**
 * The published rule that decides *which* windows become charts.
 *
 * Separate from PIPELINE_VERSION because the two change for different reasons and invalidate
 * different things. A pipeline change alters how a chart is built; a selection change alters
 * which charts exist, and therefore every population statistic computed over the corpus — chart
 * ratings, engine track records, the achievable-set distributions. §12.4 is emphatic that those
 * cannot be compared across a change of rule, so the rule gets its own version and every chart
 * records the one that admitted it.
 */
export const SELECTION_VERSION = 'selection-1';

/**
 * The achievable set: the enumerated grid, the oracle bound and the axis decomposition.
 *
 * Separate again, because it invalidates a different thing. Change the grid's stop or target
 * ladder, or the oracle's definition, and every percentile ever recorded means something else —
 * §6's promise that "the same chart yields the same distribution forever" only holds within one
 * version of it. Charts record the version they were enumerated under.
 */
export const ACHIEVABLE_VERSION = 'achievable-1';

/**
 * The percentile-to-score map, and the ranked compression built on it.
 *
 * Separate from ACHIEVABLE_VERSION because it invalidates a different thing. The grid decides what
 * was achievable; this decides what a place in it is worth. Move the pass anchor or the knee and
 * every rating ever computed means something else — and §8.3's retirement verdicts, which are
 * correlations against achieved percentile, stop being comparable to new ones. A retirement is
 * stored with the version that produced it so a bump can invalidate rather than inherit.
 */
export const SCORE_MAP_VERSION = 'score-map-1';

/**
 * Layer 2 geometry: the swing thresholds, the trendline selection rule, the channel containment,
 * the kernel bandwidth, the round-number grid and the volume-profile bins.
 *
 * Separate from everything above because of what it does *not* invalidate. Geometry feeds display,
 * the engine council and the theme tags; it never feeds the achievable set, so a bump here leaves
 * every stored percentile, every rating and every retirement verdict exactly where they were. What
 * it does invalidate is any stored annotation and any theme tag derived from one — §12.4's rule
 * that population statistics are not comparable across a change of rule, applied to the one
 * statistic that is a drawing.
 */
export const GEOMETRY_VERSION = 'geometry-1';

/**
 * The engine council: the roster, every threshold, and the provenance of each stop and target.
 *
 * Bumping this invalidates every stored engine verdict and every published track record, and the
 * two must move together — §12.4's rule that population statistics are not comparable across a
 * change of rule applies with particular force here, because a track record is exactly such a
 * statistic and it is the thing §7.3 promises to publish.
 *
 * It is also the family-size anchor for 3b. `src/core/engines/manifest.ts` records a hash of the
 * thresholds beside this constant, and a test fails if they drift apart, so a silently retuned
 * threshold cannot inherit an old record.
 */
export const ENGINE_VERSION = 'engine-3';

/**
 * The rating system: Glicko-2's constants, the information weight, and the pending policy.
 *
 * Bumping this does not invalidate percentiles — it invalidates *ratings*, which is why it is not
 * the same constant as the one above.
 */
export const RATING_VERSION = 'rating-1';
