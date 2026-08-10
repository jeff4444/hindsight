import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import { LEAD_IN_BARS, PATH_BARS_PER_DISPLAY_BAR } from '@/core/config';
import { toTick } from '@/core/normalize';
import { DETAIL_BAR_BYTES, fromPgHex, toBase64, unpackPath } from '@/core/pack';
import { InvalidOrderError, NO_COSTS, resolve } from '@/core/resolve';
import { NORMALIZATION_VERSION, PIPELINE_VERSION } from '@/core/versions';
import type { RevealPayload, RoundResult } from '@/lib/api-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const orderSchema = z
  .object({
    stop: z.number().finite().positive().optional(),
    target: z.number().finite().positive().optional(),
    pass: z.boolean().optional(),
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
    .select('id, chart_id, session_id, committed_at')
    .eq('id', id)
    .maybeSingle();

  if (roundError) {
    console.error('round lookup failed', roundError);
    return NextResponse.json({ error: 'Could not load the round.' }, { status: 500 });
  }
  if (!round || round.session_id !== sessionId) {
    return NextResponse.json({ error: 'No such round.' }, { status: 404 });
  }
  if (round.committed_at !== null) {
    return NextResponse.json({ error: 'This round is already committed.' }, { status: 409 });
  }

  const { data: chart, error: chartError } = await supabase
    .from('charts')
    .select('reveal_bars, resolution_path, detail_path, entry_price')
    .eq('id', round.chart_id)
    .single();

  if (chartError || !chart) {
    console.error('chart lookup failed', chartError);
    return NextResponse.json({ error: 'Could not load the chart.' }, { status: 500 });
  }

  const committedAt = new Date().toISOString();
  let result: RoundResult;
  let update: Record<string, unknown>;

  if (body.pass === true) {
    // §4.4: passing is a first-class scored action, evaluated as 0R. Phase 0 has no achievable
    // distribution to evaluate it against yet — that is Phase 1 — so for now it simply
    // resolves flat and the player still sees what they declined.
    result = {
      outcome: 'pass',
      direction: null,
      rMultiple: 0,
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

    let resolution;
    try {
      resolution = resolve(order, path, PATH_BARS_PER_DISPLAY_BAR, NO_COSTS);
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
      spread_bps: NO_COSTS.spreadBps,
      stop_slippage_bps: NO_COSTS.stopSlippageBps,
      resolver_version: resolution.resolverVersion,
    };
  }

  // §1.2: the versions that produced this result are pinned to it, in the first commit.
  const { error: updateError } = await supabase
    .from('rounds')
    .update({
      ...update,
      committed_at: committedAt,
      normalization_version: NORMALIZATION_VERSION,
      pipeline_version: PIPELINE_VERSION,
    })
    .eq('id', round.id)
    // Belt and braces against two requests racing to commit the same round.
    .is('committed_at', null);

  if (updateError) {
    console.error('commit failed', updateError);
    return NextResponse.json({ error: 'Could not commit the order.' }, { status: 500 });
  }

  // The reveal half of the detail path, released only now. The lead-in prefix was issued with
  // the round, so this drops it rather than sending it twice.
  const leadInBytes = LEAD_IN_BARS * PATH_BARS_PER_DISPLAY_BAR * DETAIL_BAR_BYTES;
  const detail = chart.detail_path
    ? toBase64(fromPgHex(chart.detail_path as string).subarray(leadInBytes))
    : '';

  const payload: RevealPayload = { result, revealBars: chart.reveal_bars, detail };
  return NextResponse.json(payload);
}
