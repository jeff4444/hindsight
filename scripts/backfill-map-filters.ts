/**
 * Compute the tags that three of §11.1's official maps are filtered on.
 *
 *   npm run map-filters              # only charts that have never been tagged
 *   npm run map-filters -- --recompute
 *
 * §11.1 requires that an official map be "defined by a published filter over the regime tags and
 * theme tags, not by hand-picking, so the map's difficulty distribution is reproducible". Crash,
 * Euphoria and Council Split each need a tag no chart carries yet, and neither can be computed at
 * query time — the council alone is eight engines over 300 candles per chart.
 *
 * ## Two tags, two versions, because they go stale for different reasons
 *
 * **`lead_in_drift_atr`** is the move across the *visible* lead-in, expressed in ATRs, as a log
 * return over a relative ATR — see the note on the calculation for why both halves of that matter.
 * It reads `lead_in_bars` rather than the extended history, because the map is a claim about the
 * chart the player is shown — and those bars are already mirrored (§12.2), so this is the drift on
 * the screen rather than the instrument's. Versioned by `MAP_FILTER_VERSION`; it invalidates map
 * membership and nothing else.
 *
 * **The council columns** read the full stored history, exactly as the council does on the reveal,
 * and count only the schools — Engine Zero always speaks, and counting the null would make every
 * chart look like a live council. Versioned by `ENGINE_VERSION`, because they are the council's
 * output and a roster change moves them.
 *
 * ## What this measured, and what it cost §11.1
 *
 * Two claims in the scope do not survive it, both recorded in `docs/phase-5d-research.md`:
 *
 * - **Crash and Euphoria are the same map reflected.** Random mirroring means half of every
 *   displayed crash is a mirrored rally: 237 charts below −6 ATR against 216 above +6, and 65
 *   against 65 past ±10. A map named Crash here is a map of falling *charts*, not of crash
 *   dynamics.
 * - **Council Split is not "the hardest map in the game".** Median `par_r` −1.022 against −1.019 for
 *   the corpus, median pass percentile 0.612 against 0.612, Welch's t of 0.10 and 0.79. Flat.
 *
 * Writes five columns and reads nothing it does not need. Synthetic charts are tagged too — a map
 * filter is a property of a chart, and §7.2's controls are charts.
 */

import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { council } from '../src/core/engines';
import { ENGINE_VERSION, MAP_FILTER_VERSION } from '../src/core/versions';

const RECOMPUTE = process.argv.includes('--recompute');
const PAGE = 100;

interface ChartRow {
  id: string;
  lead_in_bars: Bar[];
  lead_in_extra: Bar[] | null;
  atr14: number;
  entry_price: number;
}

/** Everything the map filters store for one chart. Pure given the row. */
export function mapFiltersFor(row: {
  id: string;
  lead_in_bars: Bar[];
  lead_in_extra: Bar[] | null;
  atr14: number;
  entry_price: number;
}) {
  const visible = row.lead_in_bars;
  /*
   * A *log* return over a *relative* ATR, normalised by the window's geometric mean price.
   *
   * All three choices are forced by one requirement: §12.2 mirrors half the corpus at random, so
   * **mirroring a chart must negate its drift**, or Crash and Euphoria are not the same map
   * reflected and any asymmetry between them is an artifact. `tests/map-filters.test.ts` is that
   * requirement as a test, and it rejected two earlier definitions.
   *
   * - `(last - first) / atr14` fails twice. The mirror is `BASE² / p`, exact in *log* space, so a
   *   linear difference is not the negation of its original; and `atr14` is an absolute price
   *   distance, so a chart that fell sits at lower prices with a smaller ATR, which inflates every
   *   down move. Over the corpus this read 88 charts past −10 ATR against 39 past +10 — a large,
   *   plausible asymmetry pointing exactly the way the literature says it should, and entirely
   *   manufactured by the measurement.
   * The denominator has to be measured at the price level ATR is measured at, and `atr14` is
   * **Wilder's ATR(14)** — an exponentially weighted average anchored at the *end* of the lead-in,
   * which is where `entry_price` also sits. That pairing is exactly invariant: a bar at price `p`
   * with range `r` reflects to price `BASE²/p` with range `r·BASE²/p²`, so `atr / entry` is
   * preserved and the whole quantity flips sign while keeping its magnitude.
   *
   * A geometric mean over the whole window looks more principled and is wrong for the same reason,
   * in the other direction: it is measured across a window whose ATR is not. It missed by 29%.
   */
  const drift =
    Math.log(visible[visible.length - 1].c / visible[0].c) / (row.atr14 / row.entry_price);

  // The council reads history from before the window where it exists, exactly as it does on the
  // reveal. History before, never after (§6).
  const bars = [...(row.lead_in_extra ?? []), ...row.lead_in_bars];
  // Seeded on the chart id, so Engine Zero is reproducible across runs. Same construction as
  // `scripts/engines.ts`; the two must agree or the corpus and the track record describe different
  // councils.
  let seed = 0;
  for (const ch of row.id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;

  const schools = council({ bars, entry: row.entry_price, atr: row.atr14, seed }).filter(
    (v) => v.direction !== null && v.engine !== 'ZERO',
  );
  const longs = schools.filter((v) => v.direction === 'long').length;
  const shorts = schools.length - longs;

  return {
    lead_in_drift_atr: drift,
    map_filter_version: MAP_FILTER_VERSION,
    council_speakers: schools.length,
    // 0 when unanimous or silent. The minority side is the honest measure of conflict: two schools
    // agreeing is not a split, and one school speaking alone is not either.
    council_minority: Math.min(longs, shorts),
    council_version: ENGINE_VERSION,
  };
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function run() {
  const supabase = supabaseClient();
  let done = 0;
  const drifts: number[] = [];
  let split = 0;
  let silent = 0;

  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('charts')
      .select('id, lead_in_bars, lead_in_extra, atr14, entry_price')
      .order('id')
      .range(from, from + PAGE - 1);
    if (!RECOMPUTE) query = query.is('map_filter_version', null);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data as ChartRow[]) {
      const columns = mapFiltersFor(row);
      const { error: writeError } = await supabase.from('charts').update(columns).eq('id', row.id);
      if (writeError) throw new Error(writeError.message);

      drifts.push(columns.lead_in_drift_atr);
      if (columns.council_minority > 0) split += 1;
      if (columns.council_speakers === 0) silent += 1;
      done += 1;
      if (done % 200 === 0) console.log(`  ${done} tagged`);
    }

    // Without --recompute the filter is `map_filter_version is null`, so finished rows leave the
    // result set and paging forward would skip the ones that shift down into the window.
    if (!RECOMPUTE) from = -PAGE;
    if (data.length < PAGE) break;
  }

  if (done === 0) {
    console.log('Nothing to tag. Pass --recompute to redo the corpus.');
    return;
  }

  const q = (p: number) => {
    const s = [...drifts].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
  };
  const share = (n: number) => `${((n / done) * 100).toFixed(1)}%`;

  console.log('');
  console.log(`tagged            ${done}`);
  console.log(`drift median      ${q(0.5).toFixed(2)} ATR      p25 ${q(0.25).toFixed(2)}   p75 ${q(0.75).toFixed(2)}`);
  for (const t of [-6, -4, 4, 6]) {
    const n = drifts.filter((d) => (t < 0 ? d <= t : d >= t)).length;
    console.log(`  drift ${t < 0 ? '<=' : '>='} ${String(t).padStart(2)} ATR  ${String(n).padStart(5)}  ${share(n)}`);
  }
  console.log(`council silent    ${String(silent).padStart(5)}  ${share(silent)}`);
  console.log(`council split     ${String(split).padStart(5)}  ${share(split)}`);
  console.log('');
  console.log('A near-symmetric drift distribution is the expected result, not a bug: §12.2 mirrors');
  console.log('at random, so Crash and Euphoria are the same charts reflected. See docs/phase-5d-research.md.');
}

// Only when invoked as the script. `mapFiltersFor` is imported by `tests/map-filters.test.ts`, and
// an unguarded `run()` would have the test suite rewrite the corpus — the same guard
// `backfill-manage.ts` carries, for the same reason.
if (process.argv[1] && process.argv[1].endsWith('backfill-map-filters.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
