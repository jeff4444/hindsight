/**
 * Causality metadata on derived features.
 *
 * §6 Layer 0: "Each annotation record carries the index at which the feature exists and the index
 * at which it could first have been known. Rendering and scoring both gate on the second."
 *
 * The distinction is not pedantic, and §15 names the two ways it is normally got wrong:
 *
 * > Both major open-source implementations of the structure primitives contain [look-ahead], one
 * > via a whole-dataset range and one via pre-confirmation stamping.
 *
 * A swing high *exists* at the bar that made it. It is not *known* until enough bars after it
 * have printed to confirm it was a high — which is usually several bars later. Drawing it at the
 * bar it exists on is pre-confirmation stamping: the annotation appears on a chart at a moment
 * nobody could have drawn it, and in a product whose entire premise is "no hindsight" that is not
 * a subtle bug.
 *
 * The other failure is quieter. A detector that normalises against the range of the whole series
 * has already read the future into every one of its outputs, including the early ones, and
 * nothing about the output looks wrong. tests/lookahead.test.ts is built to catch that one.
 *
 * Nothing here is used by Phase 0.5's own features — it exists so Layer 2 cannot be written
 * without it, which is the whole argument for §14 putting this phase before the geometry.
 */

/** A derived feature, stamped with when it exists and when it could first have been known. */
export interface Causal<T> {
  value: T;
  /** Index of the bar the feature is *about*. */
  existsAt: number;
  /**
   * Index of the earliest bar at which the feature could have been computed.
   *
   * Never less than `existsAt`. For anything requiring confirmation it is strictly greater.
   */
  knownAt: number;
}

export class CausalityError extends Error {}

/** Stamp a value. Throws rather than silently allowing a feature known before it exists. */
export function causal<T>(value: T, existsAt: number, knownAt: number): Causal<T> {
  if (!Number.isInteger(existsAt) || !Number.isInteger(knownAt)) {
    throw new CausalityError('existsAt and knownAt must be bar indices');
  }
  if (knownAt < existsAt) {
    throw new CausalityError(
      `a feature cannot be known at ${knownAt} before it exists at ${existsAt}`,
    );
  }
  return { value, existsAt, knownAt };
}

/**
 * The features a viewer at `index` is allowed to see.
 *
 * This is the gate §6 requires rendering and scoring to pass through. Filtering on `existsAt`
 * instead is exactly the pre-confirmation bug, so the mistake has to be made deliberately.
 */
export function visibleAt<T>(features: readonly Causal<T>[], index: number): Causal<T>[] {
  return features.filter((feature) => feature.knownAt <= index);
}

/** How late a feature was confirmed, in bars. Zero for anything knowable immediately. */
export function confirmationLag<T>(feature: Causal<T>): number {
  return feature.knownAt - feature.existsAt;
}

/**
 * Assert an ordered feature list is internally consistent.
 *
 * Cheap enough to call from a detector's own tests, and it catches the case where a detector
 * emits features in `existsAt` order while claiming confirmation indices that go backwards.
 */
export function assertWellFormed<T>(features: readonly Causal<T>[]): void {
  for (const feature of features) {
    if (feature.knownAt < feature.existsAt) {
      throw new CausalityError(
        `feature at ${feature.existsAt} claims to be known at ${feature.knownAt}`,
      );
    }
  }
}
