import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import type { Bar } from '@/core/bars';
import { PATH_BARS_PER_DISPLAY_BAR, REVEAL_BARS } from '@/core/config';
import { SPOT_COSTS } from '@/core/costs';
import { toTick } from '@/core/normalize';
import { fromPgHex, unpackFloats, unpackPath } from '@/core/pack';
import { percentileOf } from '@/core/achievable';
import { resolvePlayerManaged, type ManageEvent } from '@/core/manage';
import { InvalidOrderError } from '@/core/resolve';
import { MANAGE_MS_PER_BAR } from '@/core/config';
import { MANAGE_VERSION, NORMALIZATION_VERSION, PIPELINE_VERSION } from '@/core/versions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * §10.1's Manage round, metered by the server.
 *
 * ## Why one endpoint and not four
 *
 * Open, tick, act and close all need the same thing first: *how far has this reveal actually got?*
 * That question has exactly one correct answer — elapsed wall-clock against `manage_opened_at` — and
 * splitting it across four routes would mean four places that could each compute it slightly
 * differently. One handler, one clock.
 *
 * ## The integrity problem this exists to solve
 *
 * §6: *"Future data and identity never reach the client before the order is committed."* Naked
 * satisfies that by construction — the reveal bars ship **at commit**, after the only decision.
 *
 * Manage does not. The player keeps deciding while the candles arrive, so shipping all sixty bars
 * when the position opens would hand over the entire future with every remaining decision still
 * ahead of them. **No client-side discipline fixes that**: whatever the interface chooses to draw,
 * the bytes are in the tab.
 *
 * So this route never returns a bar that has not elapsed. `revealed` is computed from the server's
 * own clock, the response is sliced to it, and an action is stamped with **the index the server
 * believes is current** rather than the one the client sends. A client that lies about its position
 * in the reveal gets its action applied where the server says it is, which is the only place it
 * could honestly have happened.
 *
 * ## The action log is the score
 *
 * The result is derived from the stored log by `resolvePlayerManaged` — the same walk the 98-cell
 * grid uses, so the player's rank is against a distribution built by identical arithmetic. The
 * client never sends an outcome, so there is nothing to forge, and replaying the log reproduces the
 * score exactly.
 */

const bodySchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('open'), stop: z.number().finite().positive() }),
  z.object({ op: z.literal('tick') }),
  z.object({ op: z.literal('stop'), price: z.number().finite().positive() }),
  z.object({ op: z.literal('partial') }),
  z.object({ op: z.literal('exit') }),
]);

/** How far the reveal has got, on the server's clock. Never derived from anything the client says. */
function revealedBars(openedAt: string): number {
  const elapsed = Date.now() - Date.parse(openedAt);
  return Math.max(0, Math.min(REVEAL_BARS, Math.floor(elapsed / MANAGE_MS_PER_BAR)));
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const sessionId = await readSession();
  if (!sessionId) {
    return NextResponse.json({ error: 'No session. Request a round first.' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = serviceClient();
  const { data: round, error: roundError } = await supabase
    .from('rounds')
    .select('id, chart_id, session_id, committed_at, manage_stop, manage_opened_at, manage_events')
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
    .select('entry_price, atr14, resolution_path, reveal_bars, manage_r, manage_par_r, manage_oracle_r')
    .eq('id', round.chart_id)
    .single();

  if (chartError || !chart) {
    console.error('chart lookup failed', chartError);
    return NextResponse.json({ error: 'Could not load the chart.' }, { status: 500 });
  }

  const entry = chart.entry_price as number;
  const atr = chart.atr14 as number;

  /* ------------------------------------------------------------------- open */

  if (body.op === 'open') {
    if (round.manage_opened_at !== null) {
      return NextResponse.json({ error: 'This position is already open.' }, { status: 409 });
    }
    const stop = toTick(body.stop);
    if (stop === entry) {
      return NextResponse.json({ error: 'The stop cannot sit on the entry.' }, { status: 400 });
    }

    const openedAt = new Date().toISOString();
    const { error } = await supabase
      .from('rounds')
      .update({ manage_stop: stop, manage_opened_at: openedAt, manage_events: [] })
      .eq('id', id);
    if (error) {
      console.error('manage open failed', error);
      return NextResponse.json({ error: 'Could not open the position.' }, { status: 500 });
    }

    // Deliberately no bars: at the instant of opening, none have elapsed.
    return NextResponse.json({ open: true, stop, revealed: 0, bars: [], events: [], done: false });
  }

  /* ------------------------------ every other op needs an open position ---- */

  if (round.manage_opened_at === null) {
    return NextResponse.json({ error: 'No open position on this round.' }, { status: 409 });
  }

  const openedAt = round.manage_opened_at as string;
  const revealed = revealedBars(openedAt);
  const events = ((round.manage_events as ManageEvent[] | null) ?? []).slice();

  // The index an action lands on: the last bar the player can actually have seen. Clamped into the
  // window so an action arriving after the reveal ends still resolves inside it.
  const atPathIndex = Math.max(
    0,
    Math.min(REVEAL_BARS * PATH_BARS_PER_DISPLAY_BAR - 1, revealed * PATH_BARS_PER_DISPLAY_BAR - 1),
  );

  let closed = false;
  if (body.op !== 'tick') {
    if (revealed === 0) {
      return NextResponse.json({ error: 'The first candle has not printed yet.' }, { status: 409 });
    }
    if (events.some((event) => event.action.kind === 'exit')) {
      return NextResponse.json({ error: 'This position is already closed.' }, { status: 409 });
    }

    if (body.op === 'stop') events.push({ atPathIndex, action: { kind: 'stop', price: toTick(body.price) } });
    if (body.op === 'partial') events.push({ atPathIndex, action: { kind: 'partial' } });
    if (body.op === 'exit') {
      events.push({ atPathIndex, action: { kind: 'exit' } });
      closed = true;
    }

    const { error } = await supabase.from('rounds').update({ manage_events: events }).eq('id', id);
    if (error) {
      console.error('manage action failed', error);
      return NextResponse.json({ error: 'Could not record the action.' }, { status: 500 });
    }
  }

  /* ------------------------------------------------------- resolve, or wait */

  /*
   * Has the stop already taken the position out, inside the part of the reveal the player has seen?
   *
   * Found by playing it: the reveal kept advancing and the controls stayed live long after the stop
   * had been hit, so a partial and a close were recorded at bars 46 and 54 on a position that closed
   * at bar 9. The walk discarded them correctly — it terminates at the stop — but the player had
   * spent forty bars managing a position that no longer existed, which is worse than a wrong number.
   *
   * So every tick resolves against the full path and asks whether the exit has *already happened* in
   * revealed time. The full path is the truth either way; this only decides whether the round is over
   * yet. Resolving against a truncated path instead would report a timeout at the truncation, which
   * is a different outcome entirely.
   */
  const revealedMinutes = revealed * PATH_BARS_PER_DISPLAY_BAR;
  const fullPath = unpackPath(fromPgHex(chart.resolution_path as string));
  let stoppedAlready = false;
  if (fullPath.length > 0) {
    try {
      const soFar = resolvePlayerManaged(
        { entry, stop: round.manage_stop as number },
        fullPath,
        events,
        atr,
        SPOT_COSTS,
      );
      stoppedAlready = soFar.exitPathIndex < revealedMinutes && soFar.exitPathIndex < fullPath.length - 1;
    } catch {
      stoppedAlready = false;
    }
  }

  const done = closed || stoppedAlready || revealed >= REVEAL_BARS;
  const revealBars = chart.reveal_bars as Bar[];

  if (!done) {
    // Only the bars that have elapsed. This slice is the whole of §6 for this mode.
    return NextResponse.json({
      open: true,
      stop: round.manage_stop as number,
      revealed,
      bars: revealBars.slice(0, revealed),
      events,
      done: false,
    });
  }

  let resolution;
  try {
    resolution = resolvePlayerManaged(
      { entry, stop: round.manage_stop as number },
      fullPath,
      events,
      atr,
      // Net, exactly as the grid was enumerated (§16.1). A player scored gross against a net
      // distribution would be handed the whole cost gradient for free.
      SPOT_COSTS,
    );
  } catch (error) {
    if (error instanceof InvalidOrderError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const distribution = chart.manage_r ? unpackFloats(fromPgHex(chart.manage_r as string)) : [];
  const percentile = distribution.length > 0 ? percentileOf(resolution.rMultiple, distribution) : null;

  const { error: commitError } = await supabase
    .from('rounds')
    .update({
      manage_events: events,
      manage_percentile: percentile,
      manage_version: MANAGE_VERSION,
      committed_at: new Date().toISOString(),
      direction: resolution.direction,
      outcome: resolution.outcome,
      r_multiple: resolution.rMultiple,
      risk_per_unit: resolution.riskPerUnit,
      entry_fill: resolution.entryFill,
      exit_path_index: resolution.exitPathIndex,
      spread_bps: SPOT_COSTS.spreadBps,
      stop_slippage_bps: SPOT_COSTS.stopSlippageBps,
      normalization_version: NORMALIZATION_VERSION,
      pipeline_version: PIPELINE_VERSION,
    })
    .eq('id', id);
  if (commitError) {
    console.error('manage commit failed', commitError);
    return NextResponse.json({ error: 'Could not commit the round.' }, { status: 500 });
  }

  return NextResponse.json({
    open: false,
    stop: round.manage_stop as number,
    // The bars that actually elapsed, not the window's length. A player stopped out at bar 9 was
    // shown nine candles, and reporting sixty would tell them the window played out when it did not.
    revealed,
    // The whole window, now that every decision is behind the player. This is the same moment Naked
    // releases its reveal: after the last thing the score depends on. A player stopped out at bar 9
    // sees the remaining fifty-one — the trade is over, so there is nothing left to leak into.
    bars: revealBars,
    events,
    done: true,
    result: {
      outcome: resolution.outcome,
      direction: resolution.direction,
      rMultiple: resolution.rMultiple,
      riskPerUnit: resolution.riskPerUnit,
      trailed: resolution.trailed,
      scaledOut: resolution.scaledOut,
      exitPathIndex: resolution.exitPathIndex,
    },
    score: {
      percentile,
      parR: (chart.manage_par_r as number | null) ?? null,
      gridBestR: (chart.manage_oracle_r as number | null) ?? null,
      distribution,
    },
  });
}
