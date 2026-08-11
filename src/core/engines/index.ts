/**
 * The roster, and the one function that runs it.
 *
 * §5.5: *"The player-facing output is a spread of opinion, never a consensus verdict."* So this
 * returns every verdict, including every pass, and nothing here computes a majority.
 */

import type { Verdict } from './contract';
import { CHANNEL } from './channel';
import { REVERSION, REVERSION_H } from './reversion';
import { ZERO } from './zero';
import { REGISTERED } from './manifest';
import { convictionFor } from './baseRates';
import type { Engine, EngineInput } from './contract';

export * from './contract';
export { THRESHOLDS, PROVENANCE, THRESHOLD_HASH, REGISTERED, digest } from './manifest';
export { CHANNEL } from './channel';
export { REVERSION, REVERSION_H } from './reversion';
export { ZERO } from './zero';
export { BRACKET, NATIVE, COUNCIL_COVERAGE, MEASURED_OVER, EDGE, convictionFor, type BaseRate } from './baseRates';

/**
 * Ordered as they appear to the player: the two schools whose rules are published, our control on
 * one of them, then the null. Engine Zero is last because it is the reference, not a peer — but it
 * is on the list, because a benchmark kept off the leaderboard is a benchmark nobody checks.
 */
export const ENGINES: Engine[] = [CHANNEL, REVERSION, REVERSION_H, ZERO];

export function engineByCode(code: string): Engine | null {
  return ENGINES.find((engine) => engine.code === code) ?? null;
}

/**
 * Every engine's read of one chart.
 *
 * The roster and the registered family must not drift apart — 3b's multiple-comparison correction
 * is computed against `REGISTERED.engines`, and an engine that runs without being registered would
 * be a free extra trial that no correction accounts for. Cheap to check, so it is checked.
 */
export function council(input: EngineInput): Verdict[] {
  if (ENGINES.length !== REGISTERED.engines.length) {
    throw new Error(
      `roster of ${ENGINES.length} does not match the registered family of ${REGISTERED.engines.length} — ` +
        'register the engine in manifest.ts before running it',
    );
  }
  return ENGINES.map((engine) => {
    const verdict = engine.read(input);
    // §5.5 wants a conviction level *and* a statement of where the number came from. It is attached
    // here rather than inside each engine so that no engine can invent one: the only source is the
    // corpus replay in `baseRates.ts`, and an engine that took no position has nothing to be
    // convinced about.
    return verdict.direction === null
      ? verdict
      : { ...verdict, conviction: convictionFor(verdict.engine) };
  });
}
