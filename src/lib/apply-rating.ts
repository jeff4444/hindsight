import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CHART_CONFIG,
  PLAYER_CONFIG,
  exitsPending,
  newChartRating,
  newPlayerRating,
  rateAttempt,
  type ChartRating,
  type PlayerRating,
} from '@/core/rating';

/**
 * Persist one rated attempt.
 *
 * §8.1: "each attempt is a rated game between the player and the chart". Three entities move — the
 * player's rating at this tier, their overall rating, and the (chart, tier) entity — and the
 * arithmetic for all three lives in `src/core/rating.ts`, which is pure and tested. This is only
 * the read, the call, and the write.
 *
 * `OVERALL` is a reserved tier key rather than a separate table: §3.4 wants per-tier ratings
 * "feeding one overall rating that drives matchmaking and division placement", and the overall is
 * estimated directly from every attempt rather than pooled from the tier ratings, so it is the same
 * kind of thing and belongs in the same shape.
 */
export const OVERALL = 'ALL';

export interface ApplyRatingInput {
  supabase: SupabaseClient;
  userId: string;
  chartId: string;
  tier: string;
  percentile: number;
  ambiguous: boolean;
  roundId: string;
}

export async function applyRating({
  supabase,
  userId,
  chartId,
  tier,
  percentile,
  ambiguous,
  roundId,
}: ApplyRatingInput): Promise<void> {
  const [chartRow, tierRow, overallRow] = await Promise.all([
    supabase
      .from('chart_ratings')
      .select('rating, rd, sigma, plays, pending, retired, mean_opponent_rd')
      .eq('chart_id', chartId)
      .eq('tier', tier)
      .maybeSingle(),
    supabase
      .from('player_ratings')
      .select('rating, rd, sigma, attempts, last_rated_at')
      .eq('user_id', userId)
      .eq('tier', tier)
      .maybeSingle(),
    supabase
      .from('player_ratings')
      .select('rating, rd, sigma, attempts, last_rated_at')
      .eq('user_id', userId)
      .eq('tier', OVERALL)
      .maybeSingle(),
  ]);

  const chart: ChartRating = chartRow.data
    ? {
        rating: chartRow.data.rating as number,
        rd: chartRow.data.rd as number,
        sigma: chartRow.data.sigma as number,
        plays: chartRow.data.plays as number,
        pending: chartRow.data.pending as boolean,
        retired: chartRow.data.retired as boolean,
      }
    : newChartRating();

  const readPlayer = (row: typeof tierRow.data): PlayerRating =>
    row
      ? {
          rating: row.rating as number,
          rd: row.rd as number,
          sigma: row.sigma as number,
          attempts: row.attempts as number,
        }
      : newPlayerRating();

  const lastRated = (overallRow.data?.last_rated_at ?? null) as string | null;
  const sinceLastMs = lastRated ? Math.max(0, Date.now() - Date.parse(lastRated)) : 0;

  const result = rateAttempt({
    tierRating: readPlayer(tierRow.data),
    overall: readPlayer(overallRow.data),
    chart,
    percentile,
    sinceLastMs,
    ambiguous,
  });

  // §8.2's exit, evaluated on every attempt.
  //
  // Without this a chart stays pending for ever — and a pending chart is unrated for the player,
  // so *no attempt would ever move a player's rating*. The whole ladder would sit at 1500 with
  // "needs 30 more rated rounds" showing permanently. The gate has to be checked somewhere, and
  // the cheapest correct place is the moment the chart's own rating changes.
  const meanOpponentRd = runningMean(
    (chartRow.data?.mean_opponent_rd as number) ?? CHART_CONFIG.initialRd,
    chart.plays,
    readPlayer(overallRow.data).rd,
  );
  const graduated = result.chart.pending
    ? !exitsPending({ ...result.chart, plays: result.chart.plays }, meanOpponentRd)
    : false;

  const now = new Date().toISOString();

  // The chart always moves, even while pending — calibrating a new opponent against
  // known-strength references is the entire point of the pending state.
  await supabase.from('chart_ratings').upsert(
    {
      chart_id: chartId,
      tier,
      rating: result.chart.rating,
      rd: result.chart.rd,
      sigma: result.chart.sigma,
      plays: result.chart.plays,
      pending: graduated,
      retired: result.chart.retired,
      mean_opponent_rd: meanOpponentRd,
      updated_at: now,
    },
    { onConflict: 'chart_id,tier' },
  );

  if (result.rated) {
    await supabase.from('player_ratings').upsert(
      [
        {
          user_id: userId,
          tier,
          rating: result.tierRating.rating,
          rd: result.tierRating.rd,
          sigma: result.tierRating.sigma,
          attempts: result.tierRating.attempts,
          last_rated_at: now,
          updated_at: now,
        },
        {
          user_id: userId,
          tier: OVERALL,
          rating: result.overall.rating,
          rd: result.overall.rd,
          sigma: result.overall.sigma,
          attempts: result.overall.attempts,
          last_rated_at: now,
          updated_at: now,
        },
      ],
      { onConflict: 'user_id,tier' },
    );
  }

  // §8.3 regresses on the rating the player carried *at the attempt*, so it is recorded here and
  // never re-derived from today's number.
  await supabase
    .from('rounds')
    .update({
      player_rating_at_attempt: result.ratingAtAttempt,
      glicko_score: result.score,
      rated: result.rated,
    })
    .eq('id', roundId);
}

export { PLAYER_CONFIG, CHART_CONFIG };

/** Incremental mean, so the gate never has to aggregate a growing table on the hot path. */
function runningMean(current: number, priorCount: number, next: number): number {
  if (priorCount <= 0) return next;
  return (current * priorCount + next) / (priorCount + 1);
}
