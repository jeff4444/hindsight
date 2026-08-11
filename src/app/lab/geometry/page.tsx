import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import type { Bar } from '@/core/bars';
import { LEAD_IN_BARS, PATH_BARS_PER_DISPLAY_BAR } from '@/core/config';
import { DETAIL_BAR_BYTES, fromPgHex, unpackDetail } from '@/core/pack';
import { GeometryLab } from './GeometryLab';

/**
 * The Layer 2 inspection surface.
 *
 * §14 sets Phase 2's exit condition as "annotations a competent trader agrees with", and that is
 * unjudgeable if the primitives only ever appear in test assertions. A test can tell you a
 * trendline touches the extremes and never crosses; only an eye can tell you it is the line a
 * reader would have drawn. So this exists to be looked at.
 *
 * **Development only.** It reads charts directly with the service role and shows annotations over
 * real corpus data, which is a §12.2 surface and not one to leave standing in production. The route
 * is a 404 there, and the guard is at the top of the module rather than inside a component so there
 * is no render path that reaches the query.
 *
 * Nothing here touches the player-facing payload. `tests/api-leak.test.ts` is unchanged by this
 * phase, and that is the check that it stayed that way.
 */

export const dynamic = 'force-dynamic';

interface ChartRow {
  id: string;
  lead_in_bars: Bar[];
  atr14: number;
  entry_price: number;
  mirrored: boolean;
  detail_path: string | null;
  regime_er_bucket: string | null;
  regime_vol_bucket: string | null;
}

async function loadChart(id?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.' };

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const columns =
    'id, lead_in_bars, atr14, entry_price, mirrored, detail_path, regime_er_bucket, regime_vol_bucket';

  // No id given: take an arbitrary one. Ordering by the primary key rather than by anything
  // meaningful keeps the walk-through unbiased — picking "the most interesting" chart is how a
  // detector comes to be judged on the cases it was tuned against.
  const query = id
    ? supabase.from('charts').select(columns).eq('id', id).maybeSingle()
    : supabase.from('charts').select(columns).order('id').limit(1).maybeSingle();

  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data) return { error: id ? `No chart with id ${id}.` : 'The corpus is empty — run `npm run corpus`.' };

  const row = data as unknown as ChartRow;

  // The lead-in half of the detail path: 80 display bars of one-minute candles, with volume. This
  // is what makes the volume profile a real profile rather than a synthesised one, and what lets
  // the swing detector resolve intrabar ordering without inventing a convention.
  let leadInMinutes: Bar[] = [];
  if (row.detail_path) {
    const bytes = fromPgHex(row.detail_path);
    const leadInBytes = LEAD_IN_BARS * PATH_BARS_PER_DISPLAY_BAR * DETAIL_BAR_BYTES;
    leadInMinutes = unpackDetail(bytes.subarray(0, Math.min(leadInBytes, bytes.byteLength)));
  }

  return {
    chart: {
      id: row.id,
      bars: row.lead_in_bars,
      minutes: leadInMinutes,
      atr: row.atr14,
      entry: row.entry_price,
      mirrored: row.mirrored,
      regime: [row.regime_er_bucket, row.regime_vol_bucket].filter(Boolean).join(' / ') || 'untagged',
    },
  };
}

async function loadIds(): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await supabase.from('charts').select('id').order('id').limit(400);
  return (data ?? []).map((row) => (row as { id: string }).id);
}

export default async function GeometryLabPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { id } = await searchParams;
  const [result, ids] = await Promise.all([loadChart(id), loadIds()]);

  if ('error' in result) {
    return (
      <main className="mx-auto max-w-2xl p-8 font-mono text-sm">
        <h1 className="mb-4 text-lg">Geometry lab</h1>
        <p className="text-loss-ink">{result.error}</p>
      </main>
    );
  }

  return <GeometryLab chart={result.chart} ids={ids} />;
}
