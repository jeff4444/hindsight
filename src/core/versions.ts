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

/** Corpus generation: windowing, filtering, selection. */
export const PIPELINE_VERSION = 'pipeline-1';
