import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bar } from '@/core/bars';
import { fromPgHex, unpackDetail, unpackPath } from '@/core/pack';
import { marketFromChart, type Market } from '@/core/trading/market';

/**
 * A chart, decoded once into a market and kept.
 *
 * Charts are immutable once the corpus is built, and decoding one — 3,600 packed minutes of path
 * and 8,400 of detail — is the most expensive thing a request does, so a session that asks for new
 * minutes twice a second should not do it twice a second. A small LRU is enough: a server instance
 * serves the markets its open sessions are on.
 */

const CAPACITY = 32;
const cache = new Map<string, Market>();

export interface MarketMeta {
  symbol: string;
  synthetic: boolean;
  decisionAt: string;
}
const meta = new Map<string, MarketMeta>();

const COLUMNS =
  'id, symbol, decision_at, index_factor, mirrored, volume_base, lead_in_bars, lead_in_extra, reveal_bars, resolution_path, detail_path, synthetic';

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
  synthetic: boolean;
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

export async function loadMarket(supabase: SupabaseClient, chartId: string): Promise<{ market: Market; meta: MarketMeta }> {
  const hit = cache.get(chartId);
  const known = meta.get(chartId);
  if (hit && known) {
    // Refresh its place in the LRU.
    cache.delete(chartId);
    cache.set(chartId, hit);
    return { market: hit, meta: known };
  }
  const { data, error } = await supabase.from('charts').select(COLUMNS).eq('id', chartId).single();
  if (error || !data) throw new Error(`chart ${chartId} could not be loaded: ${error?.message ?? 'missing'}`);
  const row = data as ChartRow;
  const market = marketFromRow(row);
  const info = { symbol: row.symbol, synthetic: row.synthetic, decisionAt: row.decision_at };
  cache.set(chartId, market);
  meta.set(chartId, info);
  while (cache.size > CAPACITY) {
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
    meta.delete(oldest);
  }
  return { market, meta: info };
}
