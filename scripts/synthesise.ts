/**
 * Generate the §7.2 synthetic controls and mix them into the corpus.
 *
 *   npm run synthesise                 add synthetics up to the registered mix share
 *   npm run synthesise -- --count 40   add exactly this many
 *   npm run synthesise -- --purge      remove every synthetic chart first
 *
 * §7.2's design is that the player **cannot know**. Nothing about issuance changes: the round
 * payload is a closed allowlist (`tests/api-leak.test.ts` asserts the exact field set) and
 * `synthetic` is not in it, so the blinding holds by construction rather than by care. The flag is
 * released on the reveal, with the rest of the chart's identity, exactly as §12.2 releases a ticker.
 *
 * ## What a synthetic chart has to be
 *
 * Not 80 fake candles. `resolve()` walks the one-minute path and §12.3's fill semantics depend on
 * it, so a synthetic chart needs a synthetic *minute series* — and the hourly candles the player
 * reads have to be that same series aggregated, or the chart and the resolver disagree about what
 * happened. See `src/core/synthetic.ts`.
 *
 * Each synthetic chart is built from one **donor** real chart, resampled. That keeps the price
 * scale, the tick grid, the volatility level and the volume profile inside the range this corpus
 * actually contains — a control drawn from a different distribution than the thing it controls for
 * would be measuring the wrong difference.
 *
 * ## What it inherits and why that is disclosed rather than hidden
 *
 * The **volatility regime tag is inherited from the donor**, because the chart is built from the
 * donor's own returns and its realised volatility is the donor's by construction. The efficiency
 * ratio is recomputed from the synthetic lead-in, because resampling genuinely changes how much
 * ground price covers. Inheriting one and computing the other is a judgement, and it is written
 * here so it can be argued with.
 */

import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { atr } from '../src/core/atr';
import {
  DISPLAY_TF,
  LEAD_IN_BARS,
  PATH_BARS_PER_DISPLAY_BAR,
  REVEAL_BARS,
  RESOLUTION_TF,
} from '../src/core/config';
import { fromPgHex, packDetail, packPath, toPgHex, unpackDetail } from '../src/core/pack';
import { efficiencyRatio, erBucket } from '../src/core/regime';
import { permuteBars } from '../src/core/permute';
import { SYNTHETIC_SPEC, aggregate, blockBootstrap, type SyntheticMethod } from '../src/core/synthetic';
import { mulberry32 } from '../src/core/random';
import { NORMALIZATION_VERSION, PIPELINE_VERSION, SELECTION_VERSION } from '../src/core/versions';
import { achievableFor } from './backfill-achievable';

const ATR_PERIOD = 14;
const WINDOW_BARS = LEAD_IN_BARS + REVEAL_BARS;
const WINDOW_MINUTES = WINDOW_BARS * PATH_BARS_PER_DISPLAY_BAR;

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

interface Donor {
  id: string;
  symbol: string;
  detail_path: string;
  lead_in_extra: Bar[] | null;
  tick_size: number;
  volume_base: number;
  regime_vol_bucket: string;
  volatility_percentile: number;
  symbol_last_month: string;
}

/** One synthetic chart, built end to end from one donor. */
function synthesise(donor: Donor, method: SyntheticMethod, index: number) {
  const minutes = unpackDetail(fromPgHex(donor.detail_path));
  if (minutes.length < WINDOW_MINUTES / 2) return null;

  const seed = (0x5f47e7 ^ (index * 2654435761)) >>> 0;
  const fake =
    method === 'block-bootstrap'
      ? blockBootstrap(minutes, SYNTHETIC_SPEC.blockMinutes, seed, WINDOW_MINUTES)
      : permuteBars(resample(minutes, WINDOW_MINUTES, seed), seed);

  if (fake.length < WINDOW_MINUTES) return null;

  const hourly = aggregate(fake, PATH_BARS_PER_DISPLAY_BAR);
  if (hourly.length < WINDOW_BARS) return null;

  const leadIn = hourly.slice(0, LEAD_IN_BARS);
  const reveal = hourly.slice(LEAD_IN_BARS, WINDOW_BARS);
  const path = fake.slice(LEAD_IN_BARS * PATH_BARS_PER_DISPLAY_BAR, WINDOW_MINUTES);

  const atrValue = atr(leadIn, ATR_PERIOD);
  if (atrValue === null || !(atrValue > 0)) return null;

  // The extra lead-in is hourly only — the corpus stores no minute data before the window — so it
  // is resampled at hourly resolution from the donor's own extra lead-in. Engines read it; the
  // resolver never does, so it does not need a minute path.
  const extra =
    donor.lead_in_extra && donor.lead_in_extra.length > 2
      ? blockBootstrap(donor.lead_in_extra, 16, seed ^ 0x9e37, donor.lead_in_extra.length)
      : null;

  const entry = leadIn[leadIn.length - 1].c;
  const er = efficiencyRatio(leadIn.map((bar) => bar.c));

  // A synthetic chart is not an instrument and has no history, so `window_start` is a stable
  // synthetic instant derived from the index. It exists to satisfy the (symbol, window_start)
  // uniqueness constraint, and the reveal never presents it as a real moment — the UI branches on
  // `synthetic` and says "Not a real market".
  const stamp = new Date(Date.UTC(2000, 0, 1) + index * 3_600_000);

  return {
    symbol: `SYNTH-${method === 'block-bootstrap' ? 'BB' : 'PM'}-${String(index).padStart(4, '0')}`,
    window_start: stamp.toISOString(),
    decision_at: new Date(stamp.getTime() + LEAD_IN_BARS * 3_600_000).toISOString(),
    display_tf: DISPLAY_TF,
    resolution_tf: RESOLUTION_TF,
    lead_in_bars: leadIn,
    lead_in_extra: extra,
    reveal_bars: reveal,
    resolution_path: toPgHex(packPath(path)),
    detail_path: toPgHex(packDetail(fake)),
    // Already in indexed space: the donor's bars were normalised, and every operation here is a
    // ratio, so the output inherits that space. There is no real price to recover.
    index_factor: 1,
    volume_base: donor.volume_base,
    mirrored: false,
    atr14: atrValue,
    tick_size: donor.tick_size,
    entry_price: entry,
    selection_seed: index,
    pipeline_version: PIPELINE_VERSION,
    normalization_version: NORMALIZATION_VERSION,
    selection_version: SELECTION_VERSION,
    efficiency_ratio: er,
    // Inherited — see the header. The chart is made of the donor's returns.
    volatility_percentile: donor.volatility_percentile,
    regime_er_bucket: erBucket(er),
    regime_vol_bucket: donor.regime_vol_bucket,
    delisted: false,
    symbol_last_month: donor.symbol_last_month,
    synthetic: true,
    source_note:
      method === 'block-bootstrap'
        ? `Block bootstrap of real one-minute bars, ${SYNTHETIC_SPEC.blockMinutes / 60}-hour blocks. Structure survives inside a block and is destroyed across block boundaries.`
        : 'Random permutation of real one-minute bars. The marginal distribution of returns is exactly preserved; all serial structure is destroyed.',
  };
}

/** Draw `length` minutes with replacement, one bar at a time — the permutation generator's input. */
function resample(minutes: readonly Bar[], length: number, seed: number): Bar[] {
  if (minutes.length >= length) return minutes.slice(0, length);
  return blockBootstrap(minutes, 1, seed ^ 0x1234, length);
}

async function run() {
  const supabase = supabaseClient();

  if (process.argv.includes('--purge')) {
    const { error } = await supabase.from('charts').delete().eq('synthetic', true);
    if (error) throw new Error(error.message);
    console.log('purged every synthetic chart');
  }

  const { count: realCount, error: countError } = await supabase
    .from('charts')
    .select('id', { count: 'exact', head: true })
    .eq('synthetic', false);
  if (countError) throw new Error(countError.message);

  const { count: existing } = await supabase
    .from('charts')
    .select('id', { count: 'exact', head: true })
    .eq('synthetic', true);

  const target = arg('count')
    ? Number(arg('count'))
    : Math.max(0, Math.round(((realCount ?? 0) * SYNTHETIC_SPEC.mixShare) / (1 - SYNTHETIC_SPEC.mixShare)) - (existing ?? 0));

  console.log(`${realCount} real charts, ${existing} synthetic; generating ${target}`);
  if (target <= 0) return;

  // Donor *ids* first, then one donor row at a time.
  //
  // A single query for 200 donors pulls 200 x 168 KB of minute path and dies on the statement
  // timeout — the detail paths are the largest column in the schema and there is no reason to hold
  // more than one in memory at once. Ids are cheap, so the donor pool is still the whole corpus.
  const { data: idRows, error } = await supabase
    .from('charts')
    .select('id')
    .eq('synthetic', false)
    .not('detail_path', 'is', null)
    .order('id');
  if (error) throw new Error(error.message);
  const ids = (idRows ?? []).map((row) => (row as { id: string }).id);
  if (ids.length === 0) {
    console.log('no donor charts with a stored minute path');
    return;
  }

  // Offset past whatever is already there. Both the symbol and the synthetic `window_start` are
  // derived from this index and the pair is unique-constrained, so restarting at zero collides
  // with every chart from an earlier run.
  const offset = existing ?? 0;
  const rng = mulberry32(0x5117 + offset);
  const rows: Record<string, unknown>[] = [];
  for (let n = 0; n < target; n++) {
    const i = offset + n;
    const { data: donorRow, error: donorError } = await supabase
      .from('charts')
      .select('id, symbol, detail_path, lead_in_extra, tick_size, volume_base, regime_vol_bucket, volatility_percentile, symbol_last_month')
      .eq('id', ids[Math.floor(rng() * ids.length)])
      .single();
    if (donorError) throw new Error(donorError.message);
    const donor = donorRow as unknown as Donor;
    // Half of each, because they answer different questions and disagreement between them is the
    // finding. See `src/core/synthetic.ts`.
    const method: SyntheticMethod = i % 2 === 0 ? 'block-bootstrap' : 'permutation';
    const chart = synthesise(donor, method, i);
    if (!chart) continue;

    rows.push({
      ...chart,
      ...achievableFor({
        entry_price: chart.entry_price,
        atr14: chart.atr14,
        tick_size: chart.tick_size,
        resolution_path: chart.resolution_path,
      }),
      cellCount: undefined,
    });
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10).map((row) => { const copy = { ...row }; delete copy.cellCount; return copy; });
    const { error: insertError } = await supabase.from('charts').insert(batch);
    if (insertError) throw new Error(insertError.message);
    written += batch.length;
    console.log(`  ${written} inserted`);
  }

  const bb = rows.filter((r) => String(r.symbol).includes('-BB-')).length;
  console.log(`\ninserted ${written} — ${bb} block bootstrap, ${written - bb} permutation`);
  console.log('They are issued like any other chart. The round payload does not carry the flag.');
}

if (process.argv[1] && process.argv[1].endsWith('synthesise.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
