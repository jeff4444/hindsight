/**
 * Style fingerprinting — which school you actually trade as, rather than the one you say you do.
 *
 * §5.12: *"Every player trade is scored against every engine's proposal, which over time reveals
 * which school the player actually trades as distinct from the one they believe they trade. You
 * describe yourself as a breakout trader, but 68% of your entries match the Reversion engine, and
 * that is the engine you underperform against."*
 *
 * ## Why this is not "which school were you closest to"
 *
 * The obvious construction — find the nearest engine on each chart and count the labels — is
 * degenerate on this roster, and the corpus says so before a line of it is written:
 *
 * | on a given chart | |
 * | --- | --- |
 * | no school took a position | **66.9%** — there is nothing to be near |
 * | exactly one did | **22.2%** — "nearest" is trivially that one |
 * | two or more did | **10.9%** — a genuine choice exists |
 *
 * A nearest-school label would therefore be undefined two times in three, tautological most of the
 * rest, and informative on a ninth of charts. So each engine is scored **on its own charts
 * instead**: of the charts where Channel took a position and you also traded, on how many did your
 * bracket look like Channel's? That is well defined whenever the engine spoke, it does not compete
 * with the other engines for a label, and it survives a roster where most engines are usually silent.
 *
 * ## What "looks like" means, and where the number came from
 *
 * A bracket has three parts a player controls: which way, how far the stop, and how much reward for
 * that risk. Two brackets resemble each other when the direction matches and both the stop distance
 * and the reward ratio are **within one step of the achievable grid** (§1's enumerated ladder).
 *
 * That tolerance is taken from the product's own grid rather than invented. `STOP_ATR_MULTIPLES`
 * steps by ratios of 1.33–1.5 and `TARGET_R_MULTIPLES` by 1.33–2, so a factor of **1.5** is one
 * rung. Two brackets a rung apart would have scored in adjacent cells of the same distribution; a
 * player cannot meaningfully be said to have traded a different system than one he sits a single
 * grid step from.
 *
 * ## What this can and cannot say, stated before anyone reads a percentage
 *
 * An affinity is a proportion, and a proportion over five charts is not a fingerprint. The bar is
 * **30 charts on which that engine traded**, matching the sample floor §16.3 applies to the regime
 * cells. Because the engines are mostly silent, that bar is expensive:
 *
 * | engine | fires on | rounds you must play first |
 * | --- | --- | --- |
 * | Channel | 19.8% | **152** |
 * | Reversion (Hindsight) | 8.8% | 341 |
 * | Tape | 6.1% | 492 |
 * | Sweep | 5.4% | 556 |
 * | Pattern | 3.2% | 938 |
 * | Reversion | 2.2% | 1,364 |
 * | Geometry | 0% | **never** |
 *
 * So for most players this feature will report Channel and nothing else for a long time, and it
 * says so rather than showing six percentages computed from four trades each.
 *
 * **And matching a school is not praise.** §14.7 measured every engine on this roster against a coin
 * flip on the charts it chose and none of them could be told apart from one. "You trade like
 * Channel" is a description, not a grade, and the only comparative claim this file will make is the
 * one §5.12 asks for: whether you did better or worse than that engine *on the same charts*.
 */

import type { EngineCode } from './engines/contract';
import type { Direction } from './resolve';

/**
 * The tolerance, in ratio terms. One rung of the achievable grid.
 *
 * Pre-registered on the §14 pattern: it is a choice, it came from the grid's own spacing, and
 * moving it changes every fingerprint ever shown.
 */
export const STYLE_SPEC = {
  /** A stop or reward within this factor either way is the same rung. */
  tolerance: 1.5,
  /** Charts on which an engine traded, before its affinity is reported at all. */
  minCharts: 30,
} as const;

/** What a player controls, in the units the engines also speak. */
export interface BracketShape {
  direction: Direction;
  /** Stop distance from entry, in ATR — the same unit the grid's rungs are in. */
  stopAtr: number;
  /** Reward for that risk, in R. */
  rewardR: number;
}

/** A bracket reduced to its shape. Null when it is not a placeable order. */
export function shapeOf(
  entry: number,
  stop: number,
  target: number,
  atr: number,
): BracketShape | null {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0) || !(atr > 0)) return null;
  const direction: Direction = stop < entry ? 'long' : 'short';
  // A target on the wrong side of entry is not a bracket, whoever placed it.
  const reward = direction === 'long' ? target - entry : entry - target;
  if (!(reward > 0)) return null;
  return { direction, stopAtr: risk / atr, rewardR: reward / risk };
}

/** How many grid rungs apart two brackets are, on their worse axis. Infinity across directions. */
export function rungsApart(a: BracketShape, b: BracketShape): number {
  if (a.direction !== b.direction) return Infinity;
  const ratio = (x: number, y: number) => (x > 0 && y > 0 ? Math.max(x / y, y / x) : Infinity);
  return Math.max(ratio(a.stopAtr, b.stopAtr), ratio(a.rewardR, b.rewardR));
}

/** Within one rung on both axes, and the same way round. */
export function resembles(a: BracketShape, b: BracketShape): boolean {
  return rungsApart(a, b) <= STYLE_SPEC.tolerance;
}

/** One chart's worth of evidence, as stored on the round. */
export interface StyleRound {
  /** Engines that took a position, and what their bracket returned on this chart, in R. */
  available: Partial<Record<EngineCode, number>>;
  /** Of those, the ones the player's own bracket resembled. */
  matched: EngineCode[];
  /** The player's own R on this chart, net of costs. */
  playerR: number;
}

export interface Affinity {
  engine: EngineCode;
  /** Charts where this engine traded and so did you. The denominator. */
  charts: number;
  /** …of which your bracket looked like its bracket. */
  matched: number;
  share: number;
  /** Your mean R on those charts, and its. The comparison §5.12 asks for. */
  playerMeanR: number;
  engineMeanR: number;
  /** False until `charts` clears the floor. A share below it is not reported as a finding. */
  reportable: boolean;
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * The fingerprint: one affinity per engine, over a player's history.
 *
 * Rounds where the player passed carry no bracket and are excluded from every denominator —
 * restraint is a verdict (§4.4) but it is not a *style*, and counting a pass as "did not match
 * Channel" would make an abstaining player look like the opposite of every school at once.
 */
export function fingerprint(rounds: readonly StyleRound[], engines: readonly EngineCode[]): Affinity[] {
  return engines.map((engine) => {
    const relevant = rounds.filter((round) => round.available[engine] !== undefined);
    const matched = relevant.filter((round) => round.matched.includes(engine));
    return {
      engine,
      charts: relevant.length,
      matched: matched.length,
      share: relevant.length === 0 ? 0 : matched.length / relevant.length,
      playerMeanR: mean(relevant.map((round) => round.playerR)),
      engineMeanR: mean(relevant.map((round) => round.available[engine] as number)),
      reportable: relevant.length >= STYLE_SPEC.minCharts,
    };
  });
}

/**
 * The one sentence §5.12 wants, or null when the history cannot support one.
 *
 * Deliberately returns null rather than a hedge. A fingerprint drawn from nine charts is not a
 * weaker version of this claim, it is a different claim, and the product does not get to make it.
 */
export function describe(affinities: readonly Affinity[]): string | null {
  const reportable = affinities.filter((a) => a.reportable && a.matched > 0);
  if (reportable.length === 0) return null;

  const closest = [...reportable].sort((a, b) => b.share - a.share)[0];
  const gap = closest.playerMeanR - closest.engineMeanR;
  const verb = gap >= 0 ? 'ahead of' : 'behind';

  return (
    `${(closest.share * 100).toFixed(0)}% of your brackets on the charts ${closest.engine} traded ` +
    `looked like ${closest.engine}'s, over ${closest.charts} charts — and you are ` +
    `${Math.abs(gap).toFixed(2)}R ${verb} it on those same charts.`
  );
}
