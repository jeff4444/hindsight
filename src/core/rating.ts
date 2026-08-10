/**
 * Hindsight's application of Glicko-2: every constant, and the policy around it.
 *
 * `glicko.ts` is the algorithm and knows nothing about this product. This is where the numbers the
 * scope document does not give are chosen, and where each one's reasoning lives so that changing it
 * is a decision rather than a tweak.
 *
 * The single most important thing here is a decision the document contradicts itself on. §8.5 asks
 * for "larger gains and smaller losses at the harder settings"; §4.8 says "never award a minimum
 * gain per round" and cites a chess platform's post-mortem on why its puzzle ratings inflated.
 * Asymmetric gain and loss *is* that inflation mechanism. And it matters more here than in chess:
 * §8.3's retirement test and §3.5's fairness test both regress on player rating, so a rating that
 * drifts stops being a measuring instrument and quietly corrupts both.
 *
 * **So the Glicko update is symmetric, always.** §8.5's asymmetry lives entirely in XP and in which
 * charts get served. That is recorded here and in `docs/rules.md` rather than left implicit.
 */

import { type Glicko, type GlickoConfig, decay, expectedScore, initial, update } from './glicko';
import { glickoScore } from './ranked';
import type { TierCode } from './tiers';

/**
 * Players.
 *
 * `tau` at 0.5 sits mid-low in Glickman's recommended 0.3–1.2. This domain's per-round outcome is
 * mostly luck — the modelled outcome variance is around 0.043 against a mean near 0.42 — and a
 * large tau would let the volatility term chase that noise.
 *
 * **The RD floor is 25, and it is the one constant that must not be copied from chess.** The
 * estimated population spread here is ~42 rating points, because the environment is noisy and the
 * achievable band is narrow. A floor of 50, which chess puzzle deployments commonly use, would give
 * reliability 42²/(42²+50²) = 0.41 — less signal than noise. At 25 it is 0.74.
 */
export const PLAYER_CONFIG: GlickoConfig = {
  tau: 0.5,
  initialRating: 1500,
  initialRd: 350,
  initialSigma: 0.06,
  rdFloor: 25,
  rdCeiling: 350,
  periodMs: 7 * 86_400_000,
  // Calibrated the way Glickman calibrates Glicko-1's c: 18 months idle returns a settled player
  // to the 350 prior. c² = (350² − 25²)/78 weeks ⇒ c ≈ 39.5.
  decayPerPeriod: 39.5,
  infoWeight: 2.0,
};

/**
 * Charts.
 *
 * `tau` at the bottom of Glickman's range because **a chart cannot improve**. Its difficulty is a
 * property of a stored path and a fixed 98-cell distribution; the only genuine drift is the
 * population learning the meta, which is slow.
 *
 * `decayPerPeriod` is zero for the same reason — an unplayed chart's rating is stale only in a
 * sense nothing consumes.
 */
export const CHART_CONFIG: GlickoConfig = {
  tau: 0.3,
  initialRating: 1500,
  initialRd: 350,
  initialSigma: 0.04,
  rdFloor: 15,
  rdCeiling: 350,
  periodMs: 86_400_000,
  decayPerPeriod: 0,
  infoWeight: 2.0,
};

/**
 * §8.2's pending gate.
 *
 * The play count is the binding clause: RD 75 alone arrives after about eleven attempts, and §8.1
 * says in terms that "a chart with high deviation and twelve plays is not trustworthy". The
 * mean-opponent clause stops a chart being calibrated entirely against unrated newcomers.
 */
export const PENDING_MIN_PLAYS = 50;
export const PENDING_RD_EXIT = 75;
export const PENDING_MAX_MEAN_OPPONENT_RD = 100;

/** §4.9's display gates. "Do not display a number until the sample supports it." */
export const RANK_MIN_ATTEMPTS = 30;
export const RANK_MAX_RD = 100;
export const TIER_RATING_MIN_ATTEMPTS = 50;

/**
 * §8.5's three settings.
 *
 * Stated in rating points but chosen in expected-score terms, because the scale is compressed here:
 * E = 1/(1 + 10^(−d/400)) gives 0.586 at −60 and 0.386 at +80. Standard is the default because
 * §8.5 says so — "a higher success rate is better for learning".
 */
export type Difficulty = 'standard' | 'hard' | 'extra';

export const MATCH_OFFSET: Record<Difficulty, number> = {
  standard: -60,
  hard: 0,
  extra: 80,
};
export const MATCH_TOLERANCE = 40;

/**
 * §8.5's "larger gains" — in XP only.
 *
 * Its "smaller losses" clause has no referent once the rating is symmetric and XP is non-negative
 * by construction. It is not implemented, and saying so is better than inventing a penalty
 * somewhere so the sentence has something to point at.
 */
export const DIFFICULTY_XP: Record<Difficulty, number> = {
  standard: 1.0,
  hard: 1.15,
  extra: 1.35,
};

export interface ChartRating extends Glicko {
  plays: number;
  pending: boolean;
  retired: boolean;
}

export interface PlayerRating extends Glicko {
  attempts: number;
}

export interface AttemptInput {
  /** The player's rating for this tier, before the attempt. */
  tierRating: PlayerRating;
  /** The player's overall rating, before the attempt. */
  overall: PlayerRating;
  chart: ChartRating;
  /** Where the result landed among the chart's 98 achievable brackets. */
  percentile: number;
  /** Milliseconds since this player's previous rated attempt. */
  sinceLastMs: number;
  /** Ambiguous fills are excluded from ranked entirely (§12.3.2, §8.1's ambiguousFill). */
  ambiguous: boolean;
}

export interface AttemptResult {
  tierRating: PlayerRating;
  overall: PlayerRating;
  chart: ChartRating;
  /** The Glicko outcome actually used, for storage and for later re-derivation. */
  score: number;
  /** What the player's rating was when the attempt happened — §8.3 regresses on this, not on today's. */
  ratingAtAttempt: number;
  rated: boolean;
  reason: string;
}

export function newChartRating(): ChartRating {
  return { ...initial(CHART_CONFIG), plays: 0, pending: true, retired: false };
}

export function newPlayerRating(): PlayerRating {
  return { ...initial(PLAYER_CONFIG), attempts: 0 };
}

/**
 * Score one rated attempt.
 *
 * Three entities move: the player's rating for this tier, their overall rating, and the
 * (chart, tier) entity. **Overall is estimated directly rather than pooled from the tier ratings.**
 * Pooling would fabricate an RD that no data supports and let an abandoned tier keep injecting
 * stale information forever — and §15 requires overall to converge fastest, because it is what
 * drives matchmaking and division placement in a small population. It only converges fastest if it
 * sees every game.
 *
 * Tier difficulty needs no multiplier: the same chart at a harder tier is a *different entity* and
 * rates higher because players score lower against it. Which means the corpus-wide rating gap
 * between a chart at two tiers **is** §3.4's derived tier multiplier — "a measured number cannot be
 * argued with; a chosen one always will be."
 */
export function rateAttempt(input: AttemptInput): AttemptResult {
  const { chart, percentile, sinceLastMs, ambiguous } = input;
  const score = glickoScore(percentile);
  const ratingAtAttempt = input.overall.rating;

  if (ambiguous) {
    // §12.3.2: both levels touched inside one minute, so even the resolution path cannot order
    // them. That is unfairness, not inaccuracy, and neither side should be rated on it.
    return {
      ...input,
      score,
      ratingAtAttempt,
      rated: false,
      reason: 'ambiguous fill — excluded from rated play (§12.3.2)',
    };
  }

  if (chart.retired) {
    return {
      ...input,
      score,
      ratingAtAttempt,
      rated: false,
      reason: 'chart retired from ranked (§8.3)',
    };
  }

  // The chart always rates against the player, even while pending — that is exactly how a new
  // opponent gets calibrated against known-strength references.
  const chartAfter = update(
    chart,
    [{ opponent: input.overall, score: 1 - score }],
    CHART_CONFIG,
  );
  const nextChart: ChartRating = {
    ...chartAfter,
    plays: chart.plays + 1,
    pending: chart.pending,
    retired: chart.retired,
  };

  if (chart.pending) {
    // §8.2 asks that a pending chart "can only gain a player rating, never cost it". Implemented
    // literally that is a one-sided random walk: E[(s−E)⁺] ≈ 0.083 at this outcome spread, worth
    // about +2.3 rating points per pending chart and **it never converges** — the drift only stops
    // as E → 1. A hundred pending charts in a season is ~234 points of pure inflation, which would
    // corrupt the two statistics that regress on rating.
    //
    // So a pending chart is unrated *for the player*. The promise §8.2 makes is kept by saying so
    // in the interface and by paying XP in full, which is where §8.5 already puts the generosity.
    return {
      tierRating: input.tierRating,
      overall: input.overall,
      chart: nextChart,
      score,
      ratingAtAttempt,
      rated: false,
      reason: 'chart still calibrating — it cannot cost you rating, and it cannot pay you either',
    };
  }

  const decayed = {
    tier: decay(input.tierRating, sinceLastMs, PLAYER_CONFIG),
    overall: decay(input.overall, sinceLastMs, PLAYER_CONFIG),
  };

  const game = { opponent: { rating: chart.rating, rd: chart.rd, sigma: chart.sigma }, score };

  return {
    tierRating: {
      ...update(decayed.tier, [game], PLAYER_CONFIG),
      attempts: input.tierRating.attempts + 1,
    },
    overall: {
      ...update(decayed.overall, [game], PLAYER_CONFIG),
      attempts: input.overall.attempts + 1,
    },
    chart: nextChart,
    score,
    ratingAtAttempt,
    rated: true,
    reason: 'rated',
  };
}

/** §8.2's exit. All three clauses, with the play count binding. */
export function exitsPending(chart: ChartRating, meanOpponentRd: number): boolean {
  return (
    chart.plays >= PENDING_MIN_PLAYS &&
    chart.rd <= PENDING_RD_EXIT &&
    meanOpponentRd <= PENDING_MAX_MEAN_OPPONENT_RD
  );
}

/** §4.9: whether there is enough sample to show a rank at all. */
export function rankIsShowable(rating: PlayerRating): boolean {
  return rating.attempts >= RANK_MIN_ATTEMPTS && rating.rd <= RANK_MAX_RD;
}

/** §3.4: per-tier numbers "surface only above a division threshold and are explicitly labelled as statistical". */
export function tierRatingIsShowable(rating: PlayerRating): boolean {
  return rating.attempts >= TIER_RATING_MIN_ATTEMPTS;
}

/** The rating band §8.5 serves charts from. */
export function targetBand(
  overall: PlayerRating,
  difficulty: Difficulty,
): { low: number; high: number } {
  const centre = overall.rating + MATCH_OFFSET[difficulty];
  return { low: centre - MATCH_TOLERANCE, high: centre + MATCH_TOLERANCE };
}

/**
 * §3.4's derived tier multiplier: "compute the mean achieved percentile per tier and set each
 * tier's multiplier as the inverse — then publish the derivation."
 *
 * Falls out of the chart table for free. The mean rating a chart carries at a tier *is* how much
 * harder that tier makes it, in the same units as everything else and with a CI.
 */
export function derivedTierOffset(
  ratingsByTier: Record<TierCode, number[]>,
  baseline: TierCode,
): Partial<Record<TierCode, number>> {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const base = mean(ratingsByTier[baseline] ?? []);
  const out: Partial<Record<TierCode, number>> = {};
  for (const [code, values] of Object.entries(ratingsByTier) as [TierCode, number[]][]) {
    if (values.length === 0) continue;
    out[code] = mean(values) - base;
  }
  return out;
}

export { expectedScore };
