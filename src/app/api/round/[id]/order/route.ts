import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { applyRating } from '@/lib/apply-rating';
import { readSession } from '@/lib/session';
import type { Bar } from '@/core/bars';
import { LEAD_IN_BARS, PATH_BARS_PER_DISPLAY_BAR } from '@/core/config';
import { council } from '@/core/engines';
import { decodeCells, scoreAgainst, type PlayerTrade } from '@/core/achievable';
import { denormalizePrice, toTick } from '@/core/normalize';
import {
  DETAIL_BAR_BYTES,
  fromPgHex,
  toBase64,
  unpackFloats,
  unpackPath,
} from '@/core/pack';
import { InvalidOrderError, NO_COSTS, resolve } from '@/core/resolve';
import { SPOT_COSTS } from '@/core/costs';
import { brier } from '@/core/calibration';
import { resembles, shapeOf } from '@/core/style';
import { DUEL_SPEC, damageFor } from '@/core/duel';
import { imp } from '@/core/ranked';
import {
  beatsMedian,
  chargeClock,
  stormAfter,
  streakAfter,
  type RunOutcome,
} from '@/core/run';
import {
  ACHIEVABLE_VERSION,
  NORMALIZATION_VERSION,
  PIPELINE_VERSION,
} from '@/core/versions';
import type {
  ChartProvenance,
  MatchPayload,
  RevealPayload,
  RunPayload,
  RoundResult,
  ScorePayload,
} from '@/lib/api-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const orderSchema = z
  .object({
    stop: z.number().finite().positive().optional(),
    target: z.number().finite().positive().optional(),
    pass: z.boolean().optional(),
    /**
     * §4.7's stake: how likely the player thinks this trade is to finish above zero.
     *
     * Optional on purpose. A round played without one stores null and is absent from every
     * calibration statistic — counting a missing forecast as 0.5 would put an opinion in a player's
     * curve that they never expressed, which is the one thing a calibration measure must not do.
     */
    confidence: z.number().finite().min(0).max(1).optional(),
  })
  .refine((body) => body.pass === true || (body.stop !== undefined && body.target !== undefined), {
    message: 'send either { pass: true } or both a stop and a target',
  });

/**
 * Commit an order and release the reveal.
 *
 * This is the only place in the product that reads `reveal_bars` or `resolution_path`, and it
 * reads them strictly after the order has been written. Two rules are enforced here rather
 * than trusted to the client:
 *
 *   - A round commits exactly once. Re-submitting a committed round is rejected, so a player
 *     cannot see the reveal and then revise the trade.
 *   - The round must belong to the caller's session, so a round id guessed or lifted from
 *     someone else is worthless.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const sessionId = await readSession();
  if (!sessionId) {
    return NextResponse.json({ error: 'No session. Request a round first.' }, { status: 401 });
  }

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = serviceClient();

  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, chart_id, session_id, user_id, owner, committed_at, tier, expires_at, run_id, issued_at, match_id, match_index')
    .eq('id', id)
    .maybeSingle();

  if (roundError) {
    console.error('round lookup failed', roundError);
    return NextResponse.json({ error: 'Could not load the round.' }, { status: 500 });
  }
  if (!round || round.session_id !== sessionId) {
    return NextResponse.json({ error: 'No such round.' }, { status: 404 });
  }
  // §3.2's clock. Enforced here rather than in the client because the client's clock is not the
  // one that counts — and a late commit is a *forfeit*, not a rejection, so a player who ran out
  // of time cannot simply reload and get the chart back.
  const expired =
    round.expires_at !== null && Date.parse(round.expires_at as string) < Date.now();

  if (round.committed_at !== null) {
    return NextResponse.json({ error: 'This round is already committed.' }, { status: 409 });
  }

  const { data: chart, error: chartError } = await supabase
    .from('charts')
    // One literal, not a concatenation: supabase-js parses this string to type the row, and a
    // concatenated one degrades every field to an error type.
    .select('reveal_bars, resolution_path, detail_path, entry_price, symbol, window_start, decision_at, mirrored, index_factor, synthetic, source_note, achievable_r, achievable_outcome, oracle_r, par_r, atr14, lead_in_bars, lead_in_extra')
    .eq('id', round.chart_id)
    .single();

  if (chartError || !chart) {
    console.error('chart lookup failed', chartError);
    return NextResponse.json({ error: 'Could not load the chart.' }, { status: 500 });
  }

  const committedAt = new Date().toISOString();
  let result: RoundResult;
  let update: Record<string, unknown>;
  /** The minute path, hoisted so §5.12's engine comparison can reuse it after the update is built. */
  let enginePath: Bar[] | null = null;

  if (body.pass === true) {
    // §4.4: passing is a first-class scored action, evaluated as 0R. Phase 0 has no achievable
    // distribution to evaluate it against yet — that is Phase 1 — so for now it simply
    // resolves flat and the player still sees what they declined.
    result = {
      outcome: 'pass',
      direction: null,
      rMultiple: 0,
      // A pass costs nothing because no order was sent, so gross and net are the same zero. That
      // is not a technicality: it is the one move on the board whose cost is genuinely nil, and
      // §4.4 already scores it.
      grossR: 0,
      brier: null,
      entryFill: null,
      exitFill: null,
      exitBarIndex: null,
      riskPerUnit: null,
      mfeR: null,
      maeR: null,
      windowMfeR: null,
      windowMaeR: null,
      ambiguous: false,
      stop: null,
      target: null,
    };
    update = { passed: true, outcome: 'pass', r_multiple: 0 };
  } else {
    // Snap to the published tick grid so the client cannot submit sub-tick precision.
    const order = {
      entry: chart.entry_price as number,
      stop: toTick(body.stop as number),
      target: toTick(body.target as number),
    };

    const path = unpackPath(fromPgHex(chart.resolution_path as string));
    enginePath = path;

    let resolution;
    let gross;
    try {
      // Resolved twice on the same path: once net, which is what the player is scored on, and once
      // with the fees off, which is what the debrief shows beside it. Two passes over 3,600 minute
      // bars is nothing, and the alternative is deriving one from the other, which is wrong —
      // costs move the *fills*, so a cost-free run can exit on a different bar entirely.
      resolution = resolve(order, path, PATH_BARS_PER_DISPLAY_BAR, SPOT_COSTS);
      gross = resolve(order, path, PATH_BARS_PER_DISPLAY_BAR, NO_COSTS);
    } catch (error) {
      if (error instanceof InvalidOrderError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    result = {
      outcome: resolution.outcome,
      direction: resolution.direction,
      rMultiple: resolution.rMultiple,
      grossR: gross.rMultiple,
      brier: null,
      entryFill: resolution.entryFill,
      exitFill: resolution.exitFill,
      exitBarIndex: resolution.exitBarIndex,
      riskPerUnit: resolution.riskPerUnit,
      mfeR: resolution.mfeR,
      maeR: resolution.maeR,
      windowMfeR: resolution.windowMfeR,
      windowMaeR: resolution.windowMaeR,
      ambiguous: resolution.ambiguous,
      stop: order.stop,
      target: order.target,
    };

    update = {
      passed: false,
      order_stop: order.stop,
      order_target: order.target,
      outcome: resolution.outcome,
      direction: resolution.direction,
      entry_fill: resolution.entryFill,
      exit_fill: resolution.exitFill,
      exit_path_index: resolution.exitPathIndex,
      exit_bar_index: resolution.exitBarIndex,
      risk_per_unit: resolution.riskPerUnit,
      r_multiple: resolution.rMultiple,
      mfe_r: resolution.mfeR,
      mae_r: resolution.maeR,
      window_mfe_r: resolution.windowMfeR,
      window_mae_r: resolution.windowMaeR,
      ambiguous: resolution.ambiguous,
      spread_bps: SPOT_COSTS.spreadBps,
      stop_slippage_bps: SPOT_COSTS.stopSlippageBps,
      resolver_version: resolution.resolverVersion,
    };
  }

  // Layer 1. The grid was enumerated offline against this same path (§13.2), so scoring is a
  // lookup plus a percentile rather than 98 fresh resolutions on the request.
  let score: ScorePayload | null = null;
  if (chart.achievable_r && chart.achievable_outcome) {
    const distribution = unpackFloats(fromPgHex(chart.achievable_r as string));
    const cells = decodeCells(distribution, fromPgHex(chart.achievable_outcome as string));
    const atr = chart.atr14 as number;

    const trade: PlayerTrade = {
      direction: result.direction,
      // The grid's stop axis is in ATR, so the player's stop is converted into the same unit.
      stopAtr:
        result.stop === null || !(atr > 0)
          ? null
          : Math.abs((chart.entry_price as number) - result.stop) / atr,
      rMultiple: result.rMultiple ?? 0,
      outcome: result.outcome,
      windowMfeR: result.windowMfeR,
    };

    const scored = scoreAgainst(trade, cells, (chart.oracle_r as number) ?? 0);
    score = {
      percentile: scored.percentile,
      oracleR: scored.oracleR,
      parR: scored.parR,
      distribution,
      axes: scored.axes,
    };
  }

  // §5's council. Engines read the full stored lead-in — up to 300 candles where the chart has them
  // — while the player may have seen 80. That is history *before* the window and never after it, and
  // every verdict reports `candlesUsed` so the asymmetry is disclosed rather than hidden.
  //
  // Seeded on the round id so Engine Zero's coin flip is stable for this round: a player who
  // reloads the reveal must not see the null change its mind.
  let councilSeed = 0;
  for (const ch of id) councilSeed = (Math.imul(councilSeed, 31) + ch.charCodeAt(0)) >>> 0;
  const engineBars = [
    ...((chart.lead_in_extra as Bar[] | null) ?? []),
    ...(chart.lead_in_bars as Bar[]),
  ];
  const verdicts = council({
    bars: engineBars,
    entry: chart.entry_price as number,
    atr: chart.atr14 as number,
    seed: councilSeed,
  });

  /*
   * §5.12's evidence, computed here because everything it needs is already in hand.
   *
   * Each engine that took a position is resolved on this same path, so the round carries what the
   * school's own bracket returned beside what the player's did — and `matched` records which of
   * them the player's bracket resembled, within one rung of the achievable grid.
   *
   * Stored rather than recomputed: the verdicts above are thrown away after this response, and
   * rebuilding a player's history would mean replaying eight engines over every chart they have
   * ever seen. See `src/core/style.ts` for why this is per-engine rather than a nearest-school
   * label, and migration 0019 for the shape.
   */
  let style: { available: Record<string, number>; matched: string[] } | null = null;
  if (!body.pass && result.stop !== null && result.target !== null && enginePath) {
    const atr = chart.atr14 as number;
    const entry = chart.entry_price as number;
    const player = shapeOf(entry, result.stop, result.target, atr);
    const available: Record<string, number> = {};
    const matched: string[] = [];

    for (const verdict of verdicts) {
      // Engine Zero is excluded, and not as a technicality. §5.12 asks which *school* a player
      // trades as; the null is a coin flip with a fixed 2 ATR stop and a 2R target, so resembling
      // it means "you place 2 ATR stops", not "your brackets are random". Worse, it speaks on every
      // chart — leaving it in would put a denominator of at least one on every round and make the
      // one engine that is not a school the only one that always qualifies.
      if (verdict.engine === 'ZERO') continue;
      if (verdict.direction === null || !verdict.bracket) continue;
      const shape = shapeOf(entry, verdict.bracket.stop, verdict.bracket.target, atr);
      if (!shape) continue;
      try {
        // Net of costs, like the player's own result — comparing a gross engine to a net player
        // would hand the engine the whole of §16.1's gradient for free.
        available[verdict.engine] = resolve(
          { entry, stop: verdict.bracket.stop, target: verdict.bracket.target },
          enginePath,
          PATH_BARS_PER_DISPLAY_BAR,
          SPOT_COSTS,
        ).rMultiple;
      } catch {
        continue; // an unplaceable bracket is not evidence either way
      }
      if (player && resembles(player, shape)) matched.push(verdict.engine);
    }
    if (Object.keys(available).length > 0) style = { available, matched };
  }

  /*
   * §4.7's score for this round.
   *
   * The event is "finished above zero, **net of costs**" — the same number §16.1 grades everything
   * else on, so the player is forecasting the thing they are scored on rather than a proxy. Not
   * "hit target before stop", because a timeout is neither and a proper rule needs an event that
   * always resolves.
   *
   * A pass carries no forecast: there is no trade to be confident about, and scoring the stake on a
   * round the player declined would grade a prediction they withdrew.
   */
  const confidence = body.pass === true ? null : (body.confidence ?? null);
  const brierScore =
    confidence === null || result.rMultiple === null
      ? null
      : brier(confidence, result.rMultiple > 0);

  result.brier = brierScore;

  // §1.2: the versions that produced this result are pinned to it, in the first commit.
  const { error: updateError } = await supabase
    .from('rounds')
    .update({
      ...update,
      style,
      confidence,
      brier: brierScore,
      committed_at: committedAt,
      normalization_version: NORMALIZATION_VERSION,
      pipeline_version: PIPELINE_VERSION,
      // Layer 1's verdict, stored with the grid version that produced it — a percentile is not
      // comparable across a change of the grid.
      percentile: score?.percentile ?? null,
      oracle_r: score?.oracleR ?? null,
      efficiency: score?.axes.efficiency ?? null,
      achievable_version: score ? ACHIEVABLE_VERSION : null,
      forfeited: expired,
    })
    .eq('id', round.id)
    // Belt and braces against two requests racing to commit the same round.
    .is('committed_at', null);

  if (updateError) {
    console.error('commit failed', updateError);
    return NextResponse.json({ error: 'Could not commit the order.' }, { status: 500 });
  }

  // §10.3's earn-back credit. Any committed round in the window counts, passes included —
  // excluding passes would push a player to trade everything to rescue a streak, which is the exact
  // habit §4.4 exists to discourage.
  if (round.user_id) {
    await supabase.rpc('credit_repair', { p_user: round.user_id as string });
  }

  // §8.1's rated game between the player and the chart. Only where it is honest to: the Sandbox is
  // unrated by §3.2, a round that ran out of clock was not really played, and an ambiguous fill is
  // unfairness rather than inaccuracy (§12.3.2) so neither side is rated on it.
  //
  // Match rounds are excluded too. Migration 0027 and the Versus screen both say duels and races
  // are unrated, but their rounds are issued at NTZ and nothing here checked `match_id`, so every
  // duel chart was quietly moving the overall rating.
  const tierCode = (round.tier as string | null) ?? null;
  if (round.user_id && tierCode && tierCode !== 'SBX' && !round.match_id && score?.percentile != null && !expired) {
    await applyRating({
      supabase,
      userId: round.user_id as string,
      chartId: round.chart_id as string,
      tier: tierCode,
      percentile: score.percentile,
      ambiguous: Boolean(result.ambiguous),
      roundId: round.id as string,
    });
  }

  // The reveal half of the detail path, released only now. The lead-in prefix was issued with
  // the round, so this drops it rather than sending it twice.
  const leadInBytes = LEAD_IN_BARS * PATH_BARS_PER_DISPLAY_BAR * DETAIL_BAR_BYTES;
  const detail = chart.detail_path
    ? toBase64(fromPgHex(chart.detail_path as string).subarray(leadInBytes))
    : '';

  // What it actually was. §12.2 hides this so the chart cannot be looked up before the
  // decision; the decision is now committed and scored, so withholding it any longer would only
  // stop the player checking that the price action was real.
  const provenance: ChartProvenance = {
    symbol: chart.symbol as string,
    venue: 'Binance spot',
    decisionAt: chart.decision_at as string,
    windowStart: chart.window_start as string,
    entryPriceReal: denormalizePrice(
      chart.entry_price as number,
      chart.index_factor as number,
      chart.mirrored as boolean,
    ),
    mirrored: chart.mirrored as boolean,
    synthetic: chart.synthetic as boolean,
    sourceNote: (chart.source_note as string | null) ?? null,
  };

  /*
   * §10.1's run modes, advanced by the same commit that scored the round.
   *
   * One scoring path, not two. Storm and Streak exist to generate volume for measurements taken
   * everywhere else — calibration's 30 forecasts, the fingerprint's 152 rounds — so a round played
   * inside a run has to be scored exactly as one played outside it, or the volume is worthless.
   *
   * The clock is read from the run row and never from the client. A pass scores nothing in Storm and
   * spends the single skip in Streak: `par_r` is negative on 95% of charts and a pass is 0R, so
   * without that rationing both modes are farmed by standing aside. See `src/core/run.ts`.
   */
  let run: RunPayload | null = null;
  if (round.run_id) {
    const { data: row } = await supabase
      .from('runs')
      .select('id, mode, remaining_ms, score, combo, best_combo, length, best_length, skips_left, charts, alive')
      .eq('id', round.run_id as string)
      .maybeSingle();

    if (row && row.alive) {
      const outcome: RunOutcome = {
        beatMedian: beatsMedian(result.rMultiple, (chart.par_r as number | null) ?? null),
        stoppedOut: result.outcome === 'stop',
        passed: result.outcome === 'pass',
      };

      if (row.mode === 'storm') {
        /*
         * The charge is what the player spent deciding, not what the wall clock did.
         *
         * Storm's clock used to be a deadline, and playing it showed what that charges for: about
         * ten of every eleven seconds went to the reveal animation, which the player can skip. The
         * mode therefore paid them to commit and look away — and looking at the outcome is the
         * product. So the reveal, the debrief and the pause between charts are free, and only the
         * gap between `issued_at` and now is spent. See `chargeClock`.
         */
        const decisionMs = Date.now() - Date.parse(round.issued_at as string);
        const remainingMs = chargeClock(row.remaining_ms as number, decisionMs);
        const next = stormAfter(
          {
            score: row.score as number,
            combo: row.combo as number,
            bestCombo: row.best_combo as number,
            charts: row.charts as number,
            remainingMs,
            // Never true here: the block is guarded by `row.alive`, so the run was live when this
            // round was committed. Deciding whether *this* chart ran the clock out is
            // `stormAfter`'s job, and conflating the two lost the final chart from the count.
            over: false,
          },
          outcome,
          remainingMs,
        );
        await supabase
          .from('runs')
          .update({
            score: next.score,
            combo: next.combo,
            best_combo: next.bestCombo,
            charts: next.charts,
            remaining_ms: next.remainingMs,
            alive: !next.over,
            ended_at: next.over ? new Date().toISOString() : null,
          })
          .eq('id', row.id);
        run = {
          id: row.id as string,
          mode: 'storm',
          alive: !next.over,
          charts: next.charts,
          score: next.score,
          combo: next.combo,
          bestCombo: next.bestCombo,
          remainingMs: next.remainingMs,
          beatMedian: outcome.beatMedian,
        };
      } else {
        const next = streakAfter(
          {
            length: row.length as number,
            best: row.best_length as number,
            skipsLeft: row.skips_left as number,
            charts: row.charts as number,
            alive: true,
          },
          outcome,
        );
        await supabase
          .from('runs')
          .update({
            length: next.length,
            best_length: next.best,
            skips_left: next.skipsLeft,
            charts: next.charts,
            alive: next.alive,
            ended_at: next.alive ? null : new Date().toISOString(),
          })
          .eq('id', row.id);
        run = {
          id: row.id as string,
          mode: 'streak',
          alive: next.alive,
          charts: next.charts,
          length: next.length,
          bestLength: next.best,
          skipsLeft: next.skipsLeft,
          beatMedian: outcome.beatMedian,
        };
      }
    }
  }

  /*
   * §10.1's Duel and Racer, advanced by the same commit that scored the round.
   *
   * One scoring path, as with the run modes. A chart played inside a match has to be scored exactly
   * as one played outside it, or a duel is measuring something the rest of the product is not.
   *
   * **A duel round resolves when the second player finishes it, not when the first does.** Damage is
   * the difference between two readings of the same chart, so there is nothing to apply until both
   * exist — which is also what makes the mode work asynchronously: the opponent may arrive tomorrow.
   */
  const match = round.match_id ? await advanceMatch(supabase, round, score?.percentile ?? null) : null;

  const payload: RevealPayload = {
    result,
    revealBars: chart.reveal_bars,
    detail,
    provenance,
    score,
    council: verdicts,
    style,
    run,
    match,
    forfeited: expired,
  };
  return NextResponse.json(payload);
}

/**
 * Apply one committed chart to its match.
 *
 * Returns what the player should be shown: their own standing, and the opponent's where the pairing
 * has actually happened. A duel round that the opponent has not reached yet reports `pending`, which
 * is the honest state and the common one — most duels are played hours apart.
 */
async function advanceMatch(
  supabase: ReturnType<typeof serviceClient>,
  round: Record<string, unknown>,
  percentile: number | null,
): Promise<MatchPayload | null> {
  const matchId = round.match_id as string;
  const index = round.match_index as number;
  const owner = round.owner as string;

  const { data: match } = await supabase
    .from('matches')
    .select('id, mode, length, status, chart_ids')
    .eq('id', matchId)
    .maybeSingle();
  if (!match) return null;

  const total = ((match.chart_ids as string[] | null) ?? []).length;

  // The player's own progress, whatever the mode. A race scores IMPs and a duel does not, but both
  // want a chart count and both want the run's own clock.
  const { data: me } = await supabase
    .from('match_players')
    .select('owner, seat, health, score, charts, started_at, clean')
    .eq('match_id', matchId)
    .eq('owner', owner)
    .maybeSingle();
  if (!me) return null;

  const charts = (me.charts as number) + 1;
  const score = (me.score as number) + (percentile === null ? 0 : imp(percentile));
  const finished = charts >= total;

  await supabase
    .from('match_players')
    .update({
      charts,
      score,
      finished_at: finished ? new Date().toISOString() : null,
    })
    .eq('match_id', matchId)
    .eq('owner', owner);

  if (match.mode === 'race') {
    return {
      mode: 'race',
      index,
      length: total,
      charts,
      score,
      complete: finished,
      clean: Boolean(me.clean),
      elapsedMs: me.started_at ? Date.now() - Date.parse(me.started_at as string) : 0,
    };
  }

  /*
   * A duel. Find the opponent's round at this same position — `match_index` is what pairs them,
   * rather than the chart id, so the pairing survives a sequence containing a repeat.
   */
  const { data: theirRound } = await supabase
    .from('rounds')
    .select('owner, percentile')
    .eq('match_id', matchId)
    .eq('match_index', index)
    .neq('owner', owner)
    .not('committed_at', 'is', null)
    .maybeSingle();

  const { data: seats } = await supabase
    .from('match_players')
    .select('owner, seat, health, charts')
    .eq('match_id', matchId)
    .order('seat');

  const opponentSeat = (seats ?? []).find((s) => s.owner !== owner) ?? null;

  if (!theirRound || theirRound.percentile === null || percentile === null || !opponentSeat) {
    return {
      mode: 'duel',
      index,
      length: total,
      charts,
      health: (me.health as number) ?? DUEL_SPEC.health,
      opponentHealth: (opponentSeat?.health as number) ?? null,
      pending: true,
      complete: false,
      winner: null,
    };
  }

  // Both readings exist, so the exchange happens now. `damageFor` is the one place the rule lives.
  const { toA: toMe, toB: toThem } = damageFor(imp(percentile), imp(theirRound.percentile as number));
  const myHealth = Math.max(0, ((me.health as number) ?? DUEL_SPEC.health) - toMe);
  const theirHealth = Math.max(0, ((opponentSeat.health as number) ?? DUEL_SPEC.health) - toThem);

  await supabase.from('match_players').update({ health: myHealth }).eq('match_id', matchId).eq('owner', owner);
  await supabase
    .from('match_players')
    .update({ health: theirHealth })
    .eq('match_id', matchId)
    .eq('owner', opponentSeat.owner as string);

  const over = myHealth <= 0 || theirHealth <= 0 || charts >= total;
  if (over) {
    await supabase
      .from('matches')
      .update({ status: 'done', ended_at: new Date().toISOString() })
      .eq('id', matchId);
  }

  return {
    mode: 'duel',
    index,
    length: total,
    charts,
    health: myHealth,
    opponentHealth: theirHealth,
    pending: false,
    complete: over,
    // From this player's point of view, which is the only one this response is for.
    winner: !over ? null : myHealth <= 0 && theirHealth <= 0 ? 'draw' : myHealth <= 0 ? 'them' : 'me',
  };
}
