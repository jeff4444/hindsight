/**
 * §12.2 — what does drawing a round-number level cost?
 *
 *   npm run leak
 *
 * `src/core/geometry/roundNumbers.ts` computes levels on the **real** price lattice and maps them
 * forward, because that is where Osler's order-book clustering lives and a level computed on the
 * indexed price would be a property of our own normalisation rather than of the market. That is the
 * honest construction and it has a cost. §12.2's standard is that the identity-lookup exploit be
 * **uneconomic**, not that it be impossible — and whether this crosses that line is a measurement.
 *
 * ## What a player can actually reconstruct
 *
 * More than "roughly where the price was", and the arithmetic is worth writing out because it is
 * what turns a hand-wave into a number.
 *
 * The round grid is `k · 0.25 · 10^m`, so consecutive levels are `0.25 · 10^m` apart in real price.
 * Displayed, that spacing is `S = 0.25 · 10^m · factor`. The player measures `S` straight off the
 * chart. Since `factor = 100 / firstOpen` by construction (§12.2 indexes every first candle to
 * 100), rearranging gives
 *
 *     firstOpen = 25 · 10^m / S
 *
 * — the instrument's real opening price, **exactly**, up to an unknown power of ten. Not a range,
 * not a distribution: the full mantissa. That is a far larger leak than the one it looks like, and
 * it comes from the *spacing* rather than from any single level's position.
 *
 * Show only one level and the spacing is unobservable. Then all the player learns is that
 * `firstOpen = 100 · R / L` for some round `R`, which pins the mantissa to the 36 grid values in a
 * decade rather than to a point.
 *
 * So the script measures both, against the corpus:
 *
 * - **grid** — every round level drawn, spacing readable, mantissa known to the tick resolution.
 * - **single** — one level drawn, mantissa confined to the 36-value grid.
 *
 * and reports how many charts, and how many distinct instruments, survive each. The comparison is
 * against the prior, which is the whole corpus.
 *
 * ## The result is optimistic and should be read that way
 *
 * Collisions are counted inside our own corpus of a few hundred windows. The real attacker searches
 * every symbol-month of public OHLCV, which is orders of magnitude larger, so a mantissa that
 * collides here would still be far more identifying out there. A *bad* number here is therefore
 * conclusive; a good one is only suggestive.
 *
 * Read-only. Safe to run against production.
 */

import { createClient } from '@supabase/supabase-js';
import { INDEX_BASE } from '../src/core/normalize';
import { SUBDIVISION } from '../src/core/geometry/roundNumbers';

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

interface Row {
  id: string;
  symbol: string;
  index_factor: number;
}

/** Mantissa in [1, 10): the part of a price a power of ten cannot hide. */
function mantissa(price: number): number {
  return price / Math.pow(10, Math.floor(Math.log10(price)));
}

/**
 * How precisely the spacing pins the mantissa.
 *
 * Displayed levels are snapped to the tick, and the chart is indexed to 100, so a spacing is read
 * off to about one part in 10^4. Deliberately generous to the *defence*: assuming the player reads
 * it less precisely than they could makes the leak look smaller, and a leak that looks bad even
 * under a generous assumption is unarguable.
 */
const GRID_DIGITS = 4;

/** Grid values in one decade: k from 4 to 39, so 36 of them. */
const GRID_VALUES_PER_DECADE = Math.round(1 / SUBDIVISION) * 9;

const bar = (share: number, width = 28): string => {
  const filled = Math.max(0, Math.min(width, Math.round(share * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

function summarise(label: string, buckets: Map<string, Row[]>, total: number, symbols: number) {
  const sizes = [...buckets.values()].map((rows) => rows.length).sort((a, b) => a - b);
  const median = sizes[sizes.length >> 1] ?? 0;
  const unique = sizes.filter((size) => size === 1).length;
  const symbolCounts = [...buckets.values()].map((rows) => new Set(rows.map((r) => r.symbol)).size);
  const medianSymbols = symbolCounts.sort((a, b) => a - b)[symbolCounts.length >> 1] ?? 0;

  console.log(`  ${label}`);
  console.log(`    distinct signatures        ${buckets.size} across ${total} charts`);
  console.log(`    median charts per signature ${median}`);
  console.log(`    signatures naming exactly one chart  ${bar(unique / Math.max(1, buckets.size))} ${unique}/${buckets.size}`);
  console.log(`    median instruments still possible    ${medianSymbols} of ${symbols}`);
  console.log('');
  return { median, unique, medianSymbols };
}

async function run() {
  const supabase = supabaseClient();

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('charts')
      .select('id, symbol, index_factor')
      // Real charts only. §7.2's synthetic controls live in the corpus now, and a published
      // statistic that quietly averaged real and fabricated markets would describe neither.
      .eq('synthetic', false)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < 1000) break;
  }

  console.log('§12.2 — the cost of drawing a round-number level');
  console.log('');

  if (rows.length === 0) {
    console.log('No charts in the corpus, so there is nothing to collide against.');
    console.log('Run `npm run corpus` first; until then docs/rules.md records the leak as unmeasured');
    console.log('and src/core/geometry/roundNumbers.ts stays out of any player-facing payload.');
    return;
  }

  const symbols = new Set(rows.map((row) => row.symbol)).size;
  console.log(`corpus  ${rows.length} charts, ${symbols} instruments`);
  console.log(`prior   a level tells you nothing: 1 in ${rows.length}`);
  console.log('');

  // firstOpen = INDEX_BASE / factor, by the definition of the indexing transform.
  const withOpen = rows.map((row) => ({ ...row, firstOpen: INDEX_BASE / row.index_factor }));

  // Grid visible: the spacing gives the mantissa to the resolution the tick supports.
  const gridBuckets = new Map<string, Row[]>();
  for (const row of withOpen) {
    const key = mantissa(row.firstOpen).toFixed(GRID_DIGITS);
    gridBuckets.set(key, [...(gridBuckets.get(key) ?? []), row]);
  }

  // One level only: the mantissa is confined to the grid, not pinned to a point. Which of the 36
  // cells it falls in is what the player learns.
  const singleBuckets = new Map<string, Row[]>();
  for (const row of withOpen) {
    const cell = Math.floor((mantissa(row.firstOpen) / 10) * GRID_VALUES_PER_DECADE);
    const key = String(cell);
    singleBuckets.set(key, [...(singleBuckets.get(key) ?? []), row]);
  }

  const grid = summarise('every round level drawn — spacing readable', gridBuckets, rows.length, symbols);
  const single = summarise('one level drawn — spacing hidden', singleBuckets, rows.length, symbols);

  console.log('verdict');
  const gridUniqueShare = grid.unique / Math.max(1, gridBuckets.size);
  if (gridUniqueShare > 0.5) {
    console.log(`  Drawing the grid names a single chart ${(gridUniqueShare * 100).toFixed(0)}% of the time, and`);
    console.log('  that is inside a corpus of a few hundred windows. Against the whole of public OHLCV');
    console.log('  it is worse, not better. The grid should not be drawn.');
  } else {
    console.log(`  The grid leaves ${grid.median} charts indistinguishable at the median.`);
  }
  console.log(
    `  Hiding the spacing moves the median from ${grid.median} chart(s) to ${single.median}, and the` +
      ` instruments still\n  possible from ${grid.medianSymbols} to ${single.medianSymbols}.`,
  );
  console.log('');
  console.log('  Whichever way these came out, they go in docs/rules.md as measured rather than argued.');
}

if (process.argv[1] && process.argv[1].endsWith('round-number-leak.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
