/**
 * §14's exit condition for Phase 2 — the comparison, published rather than merely passed.
 *
 *   npm run null                 the permutation null, over the whole corpus
 *   npm run null -- --draws 40   more null draws per chart, for a tighter interval
 *
 * > Also run the detector on **permuted bars**: a geometry layer that finds structure in shuffled
 * > data at the same rate as in real data is telling you nothing.
 *
 * Lo, Mamaysky & Wang (2000) is the template and the reason it matters. Head-and-shoulders came out
 * 1,611 real against 577 random — a real effect. Broadening tops came out **725 real against 1,227
 * random**: noise produced nearly twice as many. A detector can be deterministic, causal and stable
 * and still be finding something markets produce *less* readily than a shuffle does, and no other
 * test in this repository would notice.
 *
 * Nobody in this space has published that table since 2000. This prints ours.
 *
 * Two nulls, and `src/core/geometry/nullTest.ts` explains why the order matters: the permutation
 * keeps each chart's exact return distribution and destroys only the ordering, so beating it means
 * responding to sequence. GBM assumes normal returns, which markets violate, so beating GBM alone
 * may mean nothing more than noticing a fat tail.
 *
 * Read-only. Writes nothing, ever — permuted charts stay out of the corpus (§7.2's synthetic
 * controls are Phase 4, and docs/rules.md §1.2 records that the reveal would otherwise be lying).
 */

import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { atr } from '../src/core/atr';
import { LEAD_IN_BARS } from '../src/core/config';
import { permuteBars } from '../src/core/permute';
import { efficiencyRatio } from '../src/core/regime';
import { persistentSwings, walkFromBars, atGrade } from '../src/core/geometry/swings';
import { candidates } from '../src/core/geometry/trendlines';
import { levelsFrom } from '../src/core/geometry/levels';
import { THEMES, themesOf, type Theme } from '../src/core/geometry/themes';
import {
  compareCounts,
  compareRates,
  gbmBars,
  type Comparison,
} from '../src/core/geometry/nullTest';
import { GEOMETRY_VERSION } from '../src/core/versions';

const drawsArg = process.argv.indexOf('--draws');
const DRAWS = drawsArg > 0 ? Number(process.argv[drawsArg + 1]) : 20;

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

/** Everything Layer 2 finds in one window, reduced to the numbers the null compares. */
interface Findings {
  themes: Set<Theme>;
  swingsMinor: number;
  swingsMajor: number;
  hullEdges: number;
  levels: number;
}

function findings(bars: Bar[], atrValue: number): Findings {
  const swings = persistentSwings(walkFromBars(bars));
  return {
    themes: new Set(
      themesOf(
        { bars, swings, atr: atrValue, efficiency: efficiencyRatio(bars.map((b) => b.c)) },
        bars.length - 1,
      ),
    ),
    swingsMinor: atGrade(swings, atrValue, 'minor').length,
    swingsMajor: atGrade(swings, atrValue, 'major').length,
    hullEdges: candidates(bars, 'upper').length + candidates(bars, 'lower').length,
    levels: levelsFrom(swings, atrValue).length,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const num = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '∞');

function line(label: string, real: string, nullValue: string, c: Comparison): string {
  const mark =
    c.verdict === 'discriminates' ? '  ' : c.verdict === 'inverted' ? '←!' : ' ~';
  return (
    `  ${label.padEnd(23)} ${real.padStart(8)} ${nullValue.padStart(9)}` +
    `   ${num(c.ratio).padStart(6)}×  [${num(c.ci.low)}, ${num(c.ci.high)}]  ${mark}`
  );
}

async function run() {
  const supabase = supabaseClient();

  const rows: Row[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from('charts')
      .select('id, lead_in_bars, atr14')
      // Real charts only. §7.2's synthetic controls live in the corpus now, and a published
      // statistic that quietly averaged real and fabricated markets would describe neither.
      .eq('synthetic', false)
      .order('id')
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < 500) break;
  }

  const usable = rows
    .map((row) => ({ bars: row.lead_in_bars.slice(0, LEAD_IN_BARS), atr: row.atr14 }))
    .filter((row) => row.bars.length === LEAD_IN_BARS && row.atr > 0);

  if (usable.length === 0) {
    console.log('No charts in the corpus. Run `npm run corpus` first.');
    return;
  }

  console.log(`Layer 2 against the null — ${GEOMETRY_VERSION}`);
  console.log(`${usable.length} charts, ${DRAWS} null draws each`);
  console.log('');

  const real: Findings[] = [];
  const permuted: Findings[][] = [];
  const gbm: Findings[][] = [];

  for (let i = 0; i < usable.length; i++) {
    const { bars, atr: chartAtr } = usable[i];
    real.push(findings(bars, chartAtr));

    const perm: Findings[] = [];
    const brownian: Findings[] = [];
    for (let d = 0; d < DRAWS; d++) {
      // Seeded on the chart index and the draw, so the whole table is reproducible.
      const seed = (i * 7919 + d * 104729) >>> 0;

      // Each null series is re-measured for its OWN ATR rather than inheriting the real chart's.
      // Every threshold in Layer 2 is denominated in ATR, so handing a null series a volatility it
      // does not have would make the detectors systematically too strict or too loose on it — and
      // the result would be an artefact of the mismatch rather than a fact about structure.
      const permBars = permuteBars(bars, seed);
      perm.push(findings(permBars, atr(permBars) ?? chartAtr));

      const gbmSeries = gbmBars(bars, seed ^ 0x5bf0_3635);
      brownian.push(findings(gbmSeries, atr(gbmSeries) ?? chartAtr));
    }
    permuted.push(perm);
    gbm.push(brownian);

    if ((i + 1) % 200 === 0) console.error(`  …${i + 1}/${usable.length}`);
  }

  for (const [title, nulls] of [
    ['PERMUTATION NULL — same return distribution, ordering destroyed', permuted],
    ['GBM NULL — normal returns, the weaker test, reproduced from Lo, Mamaysky & Wang', gbm],
  ] as const) {
    console.log(title);
    console.log(`  ${'detector'.padEnd(23)} ${'real'.padStart(8)} ${'null'.padStart(9)}   ${'ratio'.padStart(6)}   95% CI`);

    const results: [string, Comparison][] = [];

    for (const theme of THEMES) {
      const c = compareRates(
        real.map((f) => f.themes.has(theme)),
        nulls.map((row) => row.map((f) => f.themes.has(theme))),
      );
      results.push([theme, c]);
      console.log(line(theme, pct(c.realRate), pct(c.nullRate), c));
    }

    console.log('');
    for (const [label, pick] of [
      ['swings (minor)', (f: Findings) => f.swingsMinor],
      ['swings (major)', (f: Findings) => f.swingsMajor],
      ['hull edges', (f: Findings) => f.hullEdges],
      ['levels', (f: Findings) => f.levels],
    ] as const) {
      const c = compareCounts(real.map(pick), nulls.map((row) => row.map(pick)));
      results.push([label, c]);
      console.log(line(label, c.realRate.toFixed(1), c.nullRate.toFixed(1), c));
    }

    const inverted = results.filter(([, c]) => c.verdict === 'inverted');
    const flat = results.filter(([, c]) => c.verdict === 'no better than chance');
    console.log('');
    console.log(`  ${results.length - inverted.length - flat.length} discriminate, ${flat.length} no better than chance, ${inverted.length} inverted`);
    if (inverted.length > 0) {
      console.log(`  ←! noise produces MORE of these than the market does: ${inverted.map(([l]) => l).join(', ')}`);
    }
    if (flat.length > 0) {
      console.log(`   ~ indistinguishable from noise: ${flat.map(([l]) => l).join(', ')}`);
    }
    console.log('');
  }

  console.log('§14 asks for this comparison to be published, not merely passed.');
  console.log('It goes in docs/rules.md §13.9 whichever way it came out.');
}

if (process.argv[1] && process.argv[1].endsWith('null.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
