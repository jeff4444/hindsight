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
