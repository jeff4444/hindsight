/**
 * Let every school trade the corpus with its own money.
 *
 *   npm run bots -- --fixture            offline, over synthetic demo markets; no database
 *   npm run bots -- --dry-run            read the corpus, trade it, print, write nothing
 *   npm run bots -- --write              …and record every session to the schools' accounts
 *
 * Options: `--bot CODE` for one school, `--limit N` for the first N markets, `--markets N` with
 * `--fixture`.
 *
 * Each school starts with $100,000 and meets the real (non-synthetic) charts in calendar order of
 * their decision bar, carrying its equity from one to the next. Its orders go through the same
 * simulator a player's do (`src/core/trading/simulator.ts`) and it trades by the rules in
 * `src/core/bots/spec.ts`. Its record is pinned to `BOT_VERSION` and `BOT_SPEC_HASH`: change how a
 * school trades and it starts a new account rather than inheriting the old one's history.
 *
 * Nothing here is evidence of an edge. §14.5 measured every school inside Engine Zero's band on
 * R; this measures the same rules in dollars, with fees, and the band still applies.
 */

import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { fromPgHex, unpackDetail, unpackPath } from '../src/core/pack';
import { BOTS, BOT_PARAMS, BOT_SPEC_HASH, runSeries, type BotSpec } from '../src/core/bots';
import { demoMarket } from '../src/core/trading/demo';
import { marketFromChart, type Market } from '../src/core/trading/market';
import { maxDrawdown, profitFactor, winRate } from '../src/core/trading/metrics';
import { MICROS } from '../src/core/trading/instrument';
import { BOT_VERSION } from '../src/core/versions';
import { recordBotSeries } from './bots-write';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

const FIXTURE = flag('fixture');
const WRITE = flag('write');
const ONLY = option('bot');
const LIMIT = option('limit') ? Number(option('limit')) : Infinity;
const FIXTURE_MARKETS = option('markets') ? Number(option('markets')) : 20;

interface ChartRow {
  id: string;
  symbol: string;
  decision_at: string;
  index_factor: number;
  mirrored: boolean;
  volume_base: number;
  lead_in_bars: Bar[];
  lead_in_extra: Bar[] | null;
  reveal_bars: Bar[];
  resolution_path: string;
  detail_path: string | null;
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function marketFromRow(row: ChartRow): Market {
  return marketFromChart({
    chartId: row.id,
    symbol: row.symbol,
    decisionAt: row.decision_at,
    indexFactor: row.index_factor,
    mirrored: row.mirrored,
    volumeBase: row.volume_base,
    leadInBars: row.lead_in_bars,
    leadInExtra: row.lead_in_extra,
    revealBars: row.reveal_bars,
    path: unpackPath(fromPgHex(row.resolution_path)),
    detail: row.detail_path ? unpackDetail(fromPgHex(row.detail_path)) : null,
  });
}

/** Real charts, oldest decision first. Decoded lazily, one page at a time. */
async function* corpus(limit: number): AsyncGenerator<Market> {
  const supabase = supabaseClient();
  let served = 0;
  for (let from = 0; served < limit; from += 50) {
    const { data, error } = await supabase
      .from('charts')
      .select(
        'id, symbol, decision_at, index_factor, mirrored, volume_base, lead_in_bars, lead_in_extra, reveal_bars, resolution_path, detail_path',
      )
      .eq('synthetic', false)
      .order('decision_at')
      .order('id')
      .range(from, from + 49);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return;
    for (const row of data as ChartRow[]) {
      if (served >= limit) return;
      served += 1;
      yield marketFromRow(row);
    }
    if (data.length < 50) return;
  }
}

const usd = (micros: number) =>
  (micros / MICROS).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);

function report(spec: BotSpec, result: ReturnType<typeof runSeries>, starting: number, ms: number) {
  const trips = result.runs.flatMap((run) => run.state.trips);
  const ending = result.equity.at(-1) ?? starting;
  const drawdown = maxDrawdown([starting, ...result.equity]);
  const traded = result.runs.filter((run) => run.state.fills.length > 0).length;
  const reads = result.runs.reduce((sum, run) => sum + run.reads, 0);
  const fees = result.runs.reduce((sum, run) => sum + run.state.fees, 0);
  console.log(
    `  ${spec.code.padEnd(12)} ${String(result.runs.length).padStart(5)} ${String(traded).padStart(6)} ` +
      `${String(trips.length).padStart(6)} ${pct(winRate(trips)).padStart(7)} ` +
      `${(profitFactor(trips)?.toFixed(2) ?? '—').padStart(6)} ${usd(ending).padStart(12)} ` +
      `${pct(ending / starting - 1).padStart(8)} ${pct(drawdown.fraction).padStart(7)} ${usd(fees).padStart(10)} ` +
      `${String(reads).padStart(7)} ${(ms / 1000).toFixed(1).padStart(6)}s${result.bankrupt ? '  BANKRUPT' : ''}`,
  );
}

async function main() {
  const starting = BOT_PARAMS.startingBalanceUsdt * MICROS;
  const roster = ONLY ? BOTS.filter((bot) => bot.code === ONLY) : BOTS;
  if (roster.length === 0) throw new Error(`no school called ${ONLY}`);

  console.log(`The schools as traders — ${BOT_VERSION}, spec ${BOT_SPEC_HASH}`);
  console.log(FIXTURE ? `${FIXTURE_MARKETS} synthetic demo markets (no database)` : 'the real corpus, oldest first');
  console.log('');

  let markets: Market[];
  if (FIXTURE) {
    markets = Array.from({ length: FIXTURE_MARKETS }, (_, i) => demoMarket(i + 1));
  } else {
    markets = [];
    for await (const market of corpus(LIMIT)) markets.push(market);
    if (markets.length === 0) {
      console.log('No real charts in the corpus. Run `npm run corpus` first.');
      return;
    }
    console.log(`${markets.length} markets loaded`);
  }

  console.log(
    `  ${'school'.padEnd(12)} ${'mkts'.padStart(5)} ${'traded'.padStart(6)} ${'trips'.padStart(6)} ${'win'.padStart(7)} ` +
      `${'PF'.padStart(6)} ${'equity'.padStart(12)} ${'return'.padStart(8)} ${'maxDD'.padStart(7)} ${'fees'.padStart(10)} ` +
      `${'reads'.padStart(7)} ${'time'.padStart(7)}`,
  );
  for (const spec of roster) {
    const started = Date.now();
    const result = runSeries(spec, markets, starting);
    report(spec, result, starting, Date.now() - started);
    if (WRITE && !FIXTURE) await recordBotSeries(supabaseClient(), spec, markets, result, starting);
  }

  if (!WRITE || FIXTURE) {
    console.log('');
    console.log('Nothing was written. `--write` records the sessions to each school’s account.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
