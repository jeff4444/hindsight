/**
 * Compute the achievable set for every chart that does not have one.
 *
 *   npm run achievable
 *   npm run achievable -- --recompute    redo charts already tagged, for a version bump
 *
 * A backfill rather than a corpus regeneration. The enumeration needs only `entry_price`,
 * `atr14`, `tick_size` and the resolution path, all of which are already stored — so this reads
 * ~58 KB a chart, writes back ~500 bytes, and never touches the 168 KB detail paths or the
 * archives on disk. Regenerating the corpus to add a derived column would have thrown away the
 * §12.4 guarantee that population statistics are comparable, for no reason.
 *
 * `build-corpus.ts` computes the same fields for new charts, so this is only ever needed for
 * charts that predate a column or a version bump.
 */

import { createClient } from '@supabase/supabase-js';
import {
  enumerateAchievable,
  median,
  oracleBound,
  percentileOf,
} from '../src/core/achievable';
import { PATH_BARS_PER_DISPLAY_BAR } from '../src/core/config';
import {
  AMBIGUOUS_FLAG,
  OUTCOME_CODE,
  fromPgHex,
  packFloats,
  toPgHex,
  unpackPath,
} from '../src/core/pack';
import { SPOT_COSTS } from '../src/core/costs';
import { ACHIEVABLE_VERSION } from '../src/core/versions';

const RECOMPUTE = process.argv.includes('--recompute');
const PAGE = 25;

interface ChartRow {
  id: string;
  entry_price: number;
  atr14: number;
  tick_size: number;
  resolution_path: string;
}

/** Everything Layer 1 stores for one chart. Pure given the row. */
export function achievableFor(row: {
  entry_price: number;
  atr14: number;
  tick_size: number;
  resolution_path: string;
}) {
  const path = unpackPath(fromPgHex(row.resolution_path));
  // Net of costs, per `src/core/costs.ts`. The grid a player is scored against has to be the grid
  // they could actually have traded, or the oracle is the best bracket in a game nobody plays.
  const cells = enumerateAchievable(
    row.entry_price,
    row.atr14,
    path,
    PATH_BARS_PER_DISPLAY_BAR,
    SPOT_COSTS,
  );
  const distribution = cells.map((cell) => cell.rMultiple);

  const outcomes = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    outcomes[i] = OUTCOME_CODE[cells[i].outcome] | (cells[i].ambiguous ? AMBIGUOUS_FLAG : 0);
  }

  return {
    achievable_r: toPgHex(packFloats(distribution)),
    achievable_outcome: toPgHex(outcomes),
    // The oracle is a bound on the *path*, not a tradeable bracket, so it carries no costs. It is
    // therefore slightly optimistic against a net grid, which is the honest direction for a bound.
    oracle_r: oracleBound(row.entry_price, path, row.tick_size),
    par_r: median(distribution),
    pass_percentile: percentileOf(0, distribution),
    achievable_version: ACHIEVABLE_VERSION,
    cellCount: cells.length,
  };
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — see .env.local.example',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function run() {
  const supabase = supabaseClient();

  const { count, error: countError } = await supabase
    .from('charts')
    .select('id', { count: 'exact', head: true });
  if (countError) throw new Error(countError.message);
  console.log(`corpus: ${count} charts`);

  let done = 0;
  let emptyGrid = 0;
  const parValues: number[] = [];

  for (;;) {
    let query = supabase
      .from('charts')
      .select('id, entry_price, atr14, tick_size, resolution_path')
      .order('id')
      .limit(PAGE);
    if (!RECOMPUTE) query = query.is('achievable_version', null);
    else query = query.neq('achievable_version', ACHIEVABLE_VERSION);

    const { data, error } = await query.returns<ChartRow[]>();
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const computed = achievableFor(row);
      if (computed.cellCount === 0) emptyGrid += 1;
      if (computed.par_r !== null) parValues.push(computed.par_r);

      const { cellCount, ...update } = computed;
      void cellCount;

      const { error: updateError } = await supabase
        .from('charts')
        .update(update)
        .eq('id', row.id);
      if (updateError) throw new Error(`${row.id}: ${updateError.message}`);

      done += 1;
      if (done % 100 === 0) console.log(`  ${done} enumerated`);
    }
  }

  const negativePar = parValues.filter((value) => value < 0).length;

  console.log('');
  console.log(`enumerated       ${done}`);
  console.log(`empty grids      ${emptyGrid}`);
  if (parValues.length > 0) {
    console.log(
      `par_r < 0        ${negativePar}/${parValues.length} ` +
        `(${((negativePar / parValues.length) * 100).toFixed(0)}%) — charts where passing beats ` +
        `most entries (§4.4), and the Null Set tape (§11.1)`,
    );
  }
  console.log('done');
}

if (process.argv[1] && process.argv[1].endsWith('backfill-achievable.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
