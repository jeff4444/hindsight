/**
 * Theme tagging — what the spec finds, and the backfill that stores it.
 *
 *   npm run themes             report the distribution over the corpus; writes nothing
 *   npm run themes -- --apply  store the tags
 *
 * §6 requires the spec to be published and held to. This is the other half of that bargain: a
 * published rule whose *hit rate* nobody has looked at is not a rule, it is a hope. A theme that
 * tags 99% of charts is not a filter, and one that tags 0.2% cannot fill a tape.
 *
 * That is not a hypothetical failure mode — it was the first result. Three of the six detectors
 * tagged essentially every chart on the first pass, each for a different and fixable reason:
 * compression normalised a ten-bar range against `ATR × 10` when diffusion says `ATR × √10`; the
 * failed breakout triggered on a wick beyond the level rather than a close beyond it; and the sweep
 * scanned all hundred-odd settled swings rather than the handful a reader would be watching. All
 * three are recorded next to the constants that fixed them, because the next person to move one of
 * those numbers should know what moving it does.
 *
 * Tags are computed over the **pinned base lead-in**, per `docs/rules.md` §13.3: geometry that
 * becomes a stored chart property is one number per chart, not one per tier.
 *
 * Read-only unless `--apply`.
 */

import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { atr } from '../src/core/atr';
import { LEAD_IN_BARS } from '../src/core/config';
import { efficiencyRatio } from '../src/core/regime';
import { persistentSwings, walkFromBars } from '../src/core/geometry/swings';
import { THEMES, themesOf, type Theme } from '../src/core/geometry/themes';
import { GEOMETRY_VERSION } from '../src/core/versions';

const APPLY = process.argv.includes('--apply');

interface Row {
  id: string;
  lead_in_bars: Bar[];
  atr14: number;
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

const bar = (share: number, width = 30): string => {
  const filled = Math.max(0, Math.min(width, Math.round(share * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

/** Tags for one chart, from its stored lead-in alone. */
export function tagsFor(row: Row): Theme[] {
  const bars = row.lead_in_bars.slice(0, LEAD_IN_BARS);
  if (bars.length < LEAD_IN_BARS) return [];
  const value = row.atr14 || atr(bars) || 0;
  if (!(value > 0)) return [];

  return themesOf(
    {
      bars,
      swings: persistentSwings(walkFromBars(bars)),
      atr: value,
      efficiency: efficiencyRatio(bars.map((b) => b.c)),
    },
    bars.length - 1,
  );
}

async function run() {
  const supabase = supabaseClient();

  const rows: Row[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('charts')
      .select('id, lead_in_bars, atr14')
      .order('id')
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < 500) break;
  }

  if (rows.length === 0) {
    console.log('No charts in the corpus. Run `npm run corpus` first.');
    return;
  }

  const counts = new Map<Theme, number>(THEMES.map((theme) => [theme, 0]));
  const perChart: { id: string; themes: Theme[] }[] = [];
  let untagged = 0;

  for (const row of rows) {
    const themes = tagsFor(row);
    perChart.push({ id: row.id, themes });
    if (themes.length === 0) untagged += 1;
    for (const theme of themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }

  console.log(`Theme spec ${GEOMETRY_VERSION}, over ${rows.length} charts`);
  console.log('');
  for (const theme of THEMES) {
    const n = counts.get(theme) ?? 0;
    console.log(`  ${theme.padEnd(23)} ${bar(n / rows.length)} ${String(n).padStart(5)}  ${((n / rows.length) * 100).toFixed(1)}%`);
  }
  console.log('');
  console.log(`  ${'untagged'.padEnd(23)} ${bar(untagged / rows.length)} ${String(untagged).padStart(5)}  ${((untagged / rows.length) * 100).toFixed(1)}%`);

  const tagCounts = perChart.map((chart) => chart.themes.length);
  const mean = tagCounts.reduce((a, b) => a + b, 0) / tagCounts.length;
  console.log('');
  console.log(`  themes per chart, mean ${mean.toFixed(2)}`);
  console.log('');

  // A theme is useful as a filter only if it separates the corpus. Both extremes are failures and
  // both are worth saying out loud rather than leaving in the numbers above.
  const useless = THEMES.filter((theme) => {
    const share = (counts.get(theme) ?? 0) / rows.length;
    return share > 0.9 || share < 0.01;
  });
  if (useless.length > 0) {
    console.log('  ⚠ these do not discriminate and should not ship as tapes:');
    for (const theme of useless) {
      const share = (counts.get(theme) ?? 0) / rows.length;
      console.log(`      ${theme} at ${(share * 100).toFixed(1)}% — ${share > 0.9 ? 'tags nearly everything' : 'too rare to fill a tape'}`);
    }
    console.log('');
  }

  if (!APPLY) {
    console.log('Dry run. Re-run with --apply to store these tags.');
    return;
  }

  let written = 0;
  for (const chart of perChart) {
    const { error } = await supabase
      .from('charts')
      .update({ themes: chart.themes, geometry_version: GEOMETRY_VERSION })
      .eq('id', chart.id);
    if (error) throw new Error(`${chart.id}: ${error.message}`);
    written += 1;
  }
  console.log(`Stored tags for ${written} charts at ${GEOMETRY_VERSION}.`);
}

if (process.argv[1] && process.argv[1].endsWith('themes.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
