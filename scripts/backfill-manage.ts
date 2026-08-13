/**
 * Enumerate the Manage achievable set for every chart.
 *
 *   npm run manage
 *   npm run manage -- --recompute    redo charts already tagged, for a version bump
 *
 * The sibling of `backfill-achievable.ts`, and deliberately built the same way: read `entry_price`,
 * `atr14` and the stored minute path, resolve a grid against it, write back a few hundred bytes.
 * Nothing here touches the 168 KB detail paths or regenerates a chart.
 *
 * ## Why Manage needs a grid of its own
 *
 * `docs/phase-5-research.md` §1.2, both grids net of costs, over all 1,111 charts:
 *
 * | grid | best cell | par (median cell) |
 * | --- | --- | --- |
 * | bracket | 4.55R | −0.782R |
 * | manage | 4.51R | −0.415R |
 *
 * The two ceilings are equal to within noise, so **par is the whole argument**: 0.367R apart. A
 * percentile is a rank against a distribution, so ranking a managed trade among static brackets
 * would hand it that gap before it did anything — and the bracket grid holds no managed outcomes at
 * all, so the comparison is between unlike things whatever the numbers say.
 *
 * ## Net of costs, like everything else
 *
 * §16.1 put costs inside the enumeration rather than beside it, on Bajgrowicz & Scaillet's
 * instruction that frictions belong in the selection process. The same applies here with more force:
 * management *trades more*, so a Manage grid scored gross against a Naked grid scored net would hand
 * the new ladder a systematic advantage that has nothing to do with skill.
 *
 * Read-mostly: it writes only the five `manage_*` columns.
 */

import { createClient } from '@supabase/supabase-js';
import { SPOT_COSTS } from '../src/core/costs';
import { enumerateManaged, MANAGE_GRID_SIZE } from '../src/core/manage';
import { median } from '../src/core/achievable';
import { OUTCOME_CODE, fromPgHex, packFloats, toPgHex, unpackPath } from '../src/core/pack';
import { MANAGE_VERSION } from '../src/core/versions';

const RECOMPUTE = process.argv.includes('--recompute');
const PAGE = 25;

interface ChartRow {
  id: string;
  entry_price: number;
  atr14: number;
  resolution_path: string;
}

/** Everything the Manage ladder stores for one chart. Pure given the row. */
export function manageFor(row: {
  entry_price: number;
  atr14: number;
  resolution_path: string;
}) {
  const path = unpackPath(fromPgHex(row.resolution_path));
  const cells = enumerateManaged(row.entry_price, row.atr14, path, SPOT_COSTS);
  if (cells.length === 0) return null;

  const distribution = cells.map((cell) => cell.rMultiple);
  const outcomes = new Uint8Array(cells.length);
  for (let i = 0; i < cells.length; i++) outcomes[i] = OUTCOME_CODE[cells[i].outcome];

  return {
    manage_r: toPgHex(packFloats(distribution)),
    manage_outcome: toPgHex(outcomes),
    // The best of the 98 cells — deliberately *not* the analogue of `oracle_r`, which is a path
    // bound (best entry and exit anywhere, ~62R on average) rather than the top of an enumerated
    // family (~4.5R). The path bound is a property of the path, so Manage shares `oracle_r` for any
    // "percentage of what was possible" display and uses this only for the top of its own ladder.
    manage_oracle_r: Math.max(...distribution),
    manage_par_r: median(distribution),
    manage_version: MANAGE_VERSION,
    cellCount: cells.length,
  };
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function run() {
  const supabase = supabaseClient();
  let done = 0;
  let short = 0;
  const pars: number[] = [];
  const oracles: number[] = [];

  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('charts')
      .select('id, entry_price, atr14, resolution_path')
      .order('id')
      .range(from, from + PAGE - 1);
    if (!RECOMPUTE) query = query.is('manage_r', null);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data as ChartRow[]) {
      const grid = manageFor(row);
      if (!grid) {
        short += 1;
        continue;
      }
      if (grid.cellCount !== MANAGE_GRID_SIZE) {
        // A short grid would make one chart's percentile incomparable with every other chart's,
        // which is worse than having no Manage score for it at all.
        throw new Error(`chart ${row.id} enumerated ${grid.cellCount} cells, expected ${MANAGE_GRID_SIZE}`);
      }

      const columns = { ...grid } as Partial<typeof grid>;
      delete columns.cellCount;
      const { error: writeError } = await supabase.from('charts').update(columns).eq('id', row.id);
      if (writeError) throw new Error(writeError.message);

      pars.push(grid.manage_par_r ?? 0);
      oracles.push(grid.manage_oracle_r);
      done += 1;
      if (done % 100 === 0) console.log(`  ${done} enumerated`);
    }

    // Without --recompute the filter is `manage_r is null`, so finished rows leave the result set
    // and paging forward would skip the ones that shift down into the window.
    if (!RECOMPUTE) from = -PAGE;
    if (data.length < PAGE) break;
  }

  const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  console.log('');
  console.log(`enumerated       ${done}`);
  if (short > 0) console.log(`empty grids      ${short}`);
  if (done > 0) {
    console.log(`manage par       ${mean(pars).toFixed(3)}R mean`);
    console.log(`manage oracle    ${mean(oracles).toFixed(2)}R mean`);
    console.log('');
    console.log('Par is Manage’s own. Scoring a managed trade against the bracket grid’s par would');
    console.log('flatter it by about 0.4R before it did anything — see docs/phase-5-research.md §1.2.');
  }
  console.log('done');
}

if (process.argv[1] && process.argv[1].endsWith('backfill-manage.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
