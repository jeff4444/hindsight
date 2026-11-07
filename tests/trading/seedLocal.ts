/**
 * Seed a scratch database (never the live project) with a handful of synthetic-but-realistic
 * charts, for running the whole server path locally against PostgREST:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx tests/trading/seedLocal.ts [count]
 *
 * Five charts by default. A duel deals ten tapes neither player has seen (docs/rules.md §23.6), so
 * playing duels locally wants more: a count cycles the five instruments over later weeks and
 * fresh seeds.
 */
import { createClient } from '@supabase/supabase-js';
import { fakeChart } from './fakeSupabase';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error('refusing to seed anything but a local database');
}

const specs = [
  ['BTCUSDT', 41_250, '2021-05-18T07:00:00Z', false],
  ['ETHUSDT', 2_430, '2022-01-21T14:00:00Z', true],
  ['SOLUSDT', 96.4, '2022-04-11T02:00:00Z', false],
  ['DOGEUSDT', 0.0712, '2022-08-30T19:00:00Z', true],
  ['PEPEUSDT', 0.00000142, '2023-05-06T11:00:00Z', false],
] as const;

async function main() {
  const supabase = createClient(url!, key!, { auth: { persistSession: false } });
  const count = Math.max(1, Number.parseInt(process.argv[2] ?? '', 10) || specs.length);
  const rows = Array.from({ length: count }, (_, i) => {
    const [symbol, price, start, mirrored] = specs[i % specs.length];
    const decision = new Date(Date.parse(start) + Math.floor(i / specs.length) * 7 * 86_400_000).toISOString();
    const id = `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    const chart = fakeChart(id, symbol, 100 + i, decision, price, mirrored);
    return {
      ...chart.row,
      window_start: new Date(Date.parse(decision) - 79 * 3_600_000).toISOString(),
      display_tf: '1h',
      resolution_tf: '1m',
      atr14: 1,
      tick_size: 0.01,
      entry_price: 100,
      selection_seed: i,
      pipeline_version: 'local-seed',
      normalization_version: 'norm-1',
      delisted: symbol === 'PEPEUSDT',
    };
  });
  const { error } = await supabase.from('charts').upsert(rows);
  if (error) throw new Error(error.message);
  console.log(`seeded ${rows.length} charts`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
