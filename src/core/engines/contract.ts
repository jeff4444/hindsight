/**
 * What an engine is.
 *
 * §5.5 sets the contract: every engine receives an identical setup window and must return a
 * complete, structured read — annotations carrying both the index at which a feature exists and the
 * index at which it could first have been known, a direction or an explicit no-setup verdict, a
 * proposed entry, stop and target, a conviction level *and a statement of where that number comes
 * from*, a plain-language rationale citing the rules that fired, and the engine version.
 *
 * `docs/phase-3-research.md` forced two additions to that list, and both exist to stop the product
 * claiming something it has not got.
 *
 * ## `provenance` — because no engine on this roster has a native price target
 *
 * Verified rather than assumed. The Turtles exit on a trailing breakout; Connors exits on a close
 * above the 5-bar mean; VSA exits on an opposing signal. All three are **conditions evaluated per
 * bar**, not prices — so at the decision bar there is no take-profit to report. §5.5 demands one
 * anyway, because the player places a static bracket and the two have to be comparable.
 *
 * Four of the six schools' targets are therefore ours. §5.2 discloses this for one. Marking each
 * side `school` or `ours` is what keeps the difference visible, and the debrief prints it.
 *
 * ## `exit` — because forcing a school into a bracket has a cost, and it can be measured
 *
 * Every engine also emits its **native** conditional exit. `resolve()` already walks the reveal path
 * minute by minute for §12.3, so resolving "exit on the opposite 10-bar extreme" costs nothing new.
 *
 * Publishing both records makes the cost of the static bracket a *measured number* rather than an
 * assumption — how much worse the school does when its trailing exit is replaced by our fixed
 * target. Nobody in this category has that, and it is only available because the corpus stores the
 * one-minute path.
 *
 * ## An explicit pass is a verdict, not a failure
 *
 * The research measured what faithful engines actually do on this corpus, and the answer decides how
 * this file reads: **CHANNEL fires on 19.8% of charts, REVERSION as published on 2.2%, and the
 * council is silent on 56.5%, and GEOMETRY fires on nothing at all.**
 *
 * That is not a broken roster. §4.4 already scores restraint as a move a *player* can make, and an
 * engine that passes is making the same move for the same reason. "No school on this roster had a
 * trade here" is a useful sentence, and a council that could not say it would be lying by
 * construction. `direction: null` is recorded and scored exactly like a trade.
 */

import type { Bar } from '../bars';
import type { Causal } from '../causal';
import type { Direction } from '../resolve';

export type EngineCode =
  | 'CHANNEL'
  | 'REVERSION'
  | 'REVERSION_H'
  | 'SWEEP'
  | 'PATTERN'
  | 'GEOMETRY'
  | 'TAPE'
  | 'ZERO';

/** Where a number came from. See the header — this is the field that keeps the product honest. */
export type Provenance = 'school' | 'ours';

/**
 * A school's own exit rule, which is a condition rather than a price.
 *
 * Deliberately a small closed union rather than a predicate function: an engine's exit has to be
 * *published*, and a rule you can print is one a player can argue with. A closure would be neither.
 */
export type ConditionalExit =
  | { kind: 'opposite-extreme'; bars: number; description: string }
  | { kind: 'close-beyond-ma'; period: number; description: string };

export interface Annotation {
  /** What to draw: a level, or a band between two prices. */
  kind: 'level' | 'band';
  price: number;
  /** Present for a band. */
  to?: number;
  label: string;
}

export interface Verdict {
  engine: EngineCode;
  /** Display name. `REVERSION_H` is named as ours, because it is. */
  name: string;
  version: string;

  /** Null is an explicit pass — a verdict, recorded and scored like any other. */
  direction: Direction | null;
  /** The static bracket, comparable to the player's and to the 98-cell achievable set. */
  bracket: { stop: number; target: number } | null;
  /** The school's own exit, resolved against the reveal. Null where the school has none. */
  exit: ConditionalExit | null;

  provenance: { stop: Provenance; target: Provenance };

  /**
   * Conviction, and where the number came from.
   *
   * §5.6: "Only one school on the roster ships calibrated conviction… Every other engine's
   * conviction score would be invented." Its own remedy is to replay every engine over the corpus
   * and use its measured base rates, which is what `scripts/engines.ts` does and
   * `baseRates.ts` records. Null until that measurement exists — an engine that has not been
   * measured says so rather than guessing.
   */
  conviction: { value: number; source: string } | null;

  /** The rules that fired, in the school's own words. §5.5's plain-language rationale. */
  rules: string[];
  annotations: Causal<Annotation>[];

  /**
   * How many candles this engine read.
   *
   * Engines see the full stored lead-in — up to 300 — while the player may have seen 80. That is
   * not a causality leak: it is history *before* the window and never after it, and Connors'
   * 200-period regime filter is unusable without it. But it is an asymmetry, so it is disclosed
   * rather than hidden, and the debrief prints it.
   */
  candlesUsed: number;
}

/** Everything an engine is given. Nothing here reaches past the decision bar. */
export interface EngineInput {
  /** The stored lead-in, oldest first. Up to 300 candles; the last one is the decision bar. */
  bars: Bar[];
  /** Entry, fixed at the decision bar's close (§4.2). */
  entry: number;
  /** The chart's pinned ATR — see `ATR_WINDOW_BARS` for why it is a fixed window at every tier. */
  atr: number;
  /** Stable per chart, so a randomised engine is reproducible. */
  seed: number;
}

export interface Engine {
  code: EngineCode;
  name: string;
  /** The school and its canonical source, printed wherever the engine is. */
  school: string;
  /** Minimum candles before the engine can answer at all. */
  needs: number;
  read(input: EngineInput): Verdict;
}

/** An explicit pass, with the reason. The most common verdict on this corpus, by a distance. */
export function passes(engine: Engine, version: string, reason: string, candlesUsed: number): Verdict {
  return {
    engine: engine.code,
    name: engine.name,
    version,
    direction: null,
    bracket: null,
    exit: null,
    provenance: { stop: 'school', target: 'school' },
    conviction: null,
    rules: [reason],
    annotations: [],
    candlesUsed,
  };
}

/** True when at least two engines took a position and they do not agree. */
export function disagreement(verdicts: readonly Verdict[]): boolean {
  const taken = verdicts.filter((v) => v.direction !== null).map((v) => v.direction);
  return taken.length >= 2 && new Set(taken).size > 1;
}
