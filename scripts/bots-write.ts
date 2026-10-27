/**
 * Record a school's sessions to its account. Used by `scripts/bots.ts --write`.
 *
 * Each market becomes one closed `trade_sessions` row with `source = 'corpus'`, written through the
 * same `trade_finalize_session` function a player's session ends with, so the Strategies page,
 * the leaderboard and the per-market review all read one shape. The account is keyed on
 * `(bot_code, bot_version)`: a new version is a new account, never a continuation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BotSpec, SeriesResult } from '../src/core/bots';
import type { Market } from '../src/core/trading/market';
import { finalizePayload } from '../src/lib/trading/finalize';
import { BOT_VERSION, FEE_VERSION, INSTRUMENT_VERSION, MARGIN_VERSION, SIM_VERSION } from '../src/core/versions';

export async function recordBotSeries(
  supabase: SupabaseClient,
  spec: BotSpec,
  markets: Market[],
  result: SeriesResult,
  starting: number,
): Promise<void> {
  const { data: accountId, error: accountError } = await supabase.rpc('trade_bot_account', {
    p_code: spec.code,
    p_version: BOT_VERSION,
    p_starting_micros: starting,
    p_versions: { sim: SIM_VERSION, fee: FEE_VERSION, margin: MARGIN_VERSION, instrument: INSTRUMENT_VERSION },
  });
  if (accountError) throw new Error(`account for ${spec.code}: ${accountError.message}`);

  let equity = starting;
  let recorded = 0;
  for (let i = 0; i < result.runs.length; i++) {
    const run = result.runs[i];
    const market = markets[i];
    const payload = finalizePayload(market, run.state, equity);
    const { data, error } = await supabase.rpc('trade_record_bot_session', {
      p_account: accountId,
      p_chart: market.chartId,
      p_symbol: market.instrument.symbol,
      p_events: run.events,
      p_summary: payload.summary,
      p_fills: payload.fills,
      p_trips: payload.trips,
      p_curve: payload.curve,
    });
    if (error) throw new Error(`${spec.code} on ${market.chartId}: ${error.message}`);
    if (data === true) recorded += 1;
    equity = run.state.cash;
  }
  console.log(`    ${spec.code}: ${recorded} sessions recorded, ${result.runs.length - recorded} already on the account`);
}
