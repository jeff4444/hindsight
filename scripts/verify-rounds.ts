/**
 * Re-resolve every committed round from its stored order and assert the result is bit-for-bit
 * what was recorded.
 *
 *   npm run verify
 *
 * §14 makes this the exit condition for Phase 0.5: "A trade resolves identically on every run."
 * It is worth running now, while it is cheap, because it catches the whole class of bugs where
 * a change to the resolver, the packing format or the normalisation silently rewrites history.
 * A stored result that can no longer be reproduced is a leaderboard entry nobody can defend.
 *
 * A mismatch is not necessarily a bug — it may be a deliberate resolver change. But in that
 * case `RESOLVER_VERSION` must have been bumped, and this script says so rather than letting
 * the discrepancy pass unnoticed.
 */

import { createClient } from '@supabase/supabase-js';
import { PATH_BARS_PER_DISPLAY_BAR } from '../src/core/config';
import { fromPgHex, unpackPath } from '../src/core/pack';
import { NO_COSTS, resolve } from '../src/core/resolve';
import { RESOLVER_VERSION } from '../src/core/versions';

interface Row {
  id: string;
  order_stop: number | null;
  order_target: number | null;
  passed: boolean;
  outcome: string | null;
  r_multiple: number | null;
  mfe_r: number | null;
  mae_r: number | null;
  exit_path_index: number | null;
  resolver_version: string | null;
  charts: { entry_price: number; resolution_path: string } | null;
}

const EPSILON = 1e-9;

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env not set — see .env.local.example');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from('rounds')
    .select(
      'id, order_stop, order_target, passed, outcome, r_multiple, mfe_r, mae_r, ' +
        'exit_path_index, resolver_version, charts(entry_price, resolution_path)',
    )
    .not('committed_at', 'is', null)
    .returns<Row[]>();

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    console.log('no committed rounds to verify');
    return;
  }

  let checked = 0;
  let passes = 0;
  let stale = 0;
  const mismatches: string[] = [];

  for (const row of data) {
    if (row.passed) {
      passes += 1;
      continue;
    }
    if (!row.charts || row.order_stop === null || row.order_target === null) continue;

    if (row.resolver_version !== RESOLVER_VERSION) {
      stale += 1;
      continue;
    }

    const path = unpackPath(fromPgHex(row.charts.resolution_path));
    const again = resolve(
      { entry: row.charts.entry_price, stop: row.order_stop, target: row.order_target },
      path,
      PATH_BARS_PER_DISPLAY_BAR,
      NO_COSTS,
    );

    const differs =
      again.outcome !== row.outcome ||
      again.exitPathIndex !== row.exit_path_index ||
      Math.abs(again.rMultiple - (row.r_multiple ?? NaN)) > EPSILON ||
      Math.abs(again.mfeR - (row.mfe_r ?? NaN)) > EPSILON ||
      Math.abs(again.maeR - (row.mae_r ?? NaN)) > EPSILON;

    if (differs) {
      mismatches.push(
        `${row.id}: stored ${row.outcome} ${row.r_multiple?.toFixed(6)}R @${row.exit_path_index}, ` +
          `recomputed ${again.outcome} ${again.rMultiple.toFixed(6)}R @${again.exitPathIndex}`,
      );
    }
    checked += 1;
  }

  console.log(`committed rounds   ${data.length}`);
  console.log(`passes (no order)  ${passes}`);
  console.log(`skipped (old ver)  ${stale}`);
  console.log(`re-resolved        ${checked}`);
  console.log(`mismatches         ${mismatches.length}`);
  for (const line of mismatches) console.log(`  ${line}`);

  if (mismatches.length > 0) {
    console.log('\nresolution is NOT deterministic — stored results cannot be reproduced');
    process.exit(1);
  }
  if (checked > 0) console.log('\nevery stored result reproduced exactly');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
