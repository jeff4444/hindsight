/**
 * Do the themes tell you anything about what happened next?
 *
 *   npm run conditional
 *
 * 2c answered a different question, and answered it badly for us: **is a pattern more common in
 * markets than in noise?** One detector of ten beat a shuffle; seven fired *less* often on real
 * charts than on shuffled ones. That is a fact about how often these shapes occur.
 *
 * It is not a fact about whether they are worth anything. A formation could occur at exactly the
 * shuffle rate and still be informative about the future — occurrence and information come apart,
 * and Lo, Mamaysky & Wang measured both. This measures the second one, which is the one Phase 3's
 * engine council would be built on.
 *
 * ## The question, stated so it can only be answered one way
 *
 * A theme is computed from the **lead-in alone** — §12.1, enforced by the decision-bar gate in
 * `taggedThemes`. The achievable set is computed from the **reveal**. So:
 *
 * > Conditional on a theme being present at the decision bar, does what was achievable afterwards
 * > differ from the corpus-wide distribution?
 *
 * **Difficulty.** Does `par_r` — the median of the 98 achievable brackets — differ on tagged
 * charts? Whether a theme marks charts that were easier or harder matters for matchmaking and for
 * whether a theme tape is a fair slice of the library.
 *
 * **Direction**, and this is the sharp one. Five of the six themes name a *side*. The grid is
 * direction-major — 49 long cells then 49 short — so for every chart we can ask what the side the
 * theme pointed at achieved against what the other side achieved.
 *
 * The direction has to be recomputed rather than read off the stored tag, and that is not a detail:
 * a liquidity sweep points down on some charts and up on others, so pooling them and measuring
 * "long minus short" averages the two together and the cancellation looks exactly like an absence
 * of information. `taggedThemes` keeps the direction; `themesOf` throws it away because a filter
 * does not need it.
 *
 * ## What this cannot say, put before the numbers rather than after
 *
 * - **Association, not edge.** No costs, no slippage, no sizing — and the achievable set is the
 *   *best available* bracket rather than one anybody would have chosen in advance, so every number
 *   here is an upper bound on something nobody could have captured. Bajgrowicz & Scaillet (2012)
 *   found transaction costs of 16–70bp erased every detected outperformance from 1897–1962, and
 *   none at all after 1962.
 * - **Twelve comparisons on one corpus.** Park & Irwin (2007), reviewing 95 studies of technical
 *   analysis, named the failure: "data snooping, ex post selection of trading rules". Effect sizes
 *   with intervals; a p-value on the best of twelve would mean nothing.
 * - **One asset class, one window length.** Crypto spot, 80 candles.
 *
 * Read-only.
 */

import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { DIRECTIONS, STOP_ATR_MULTIPLES, TARGET_R_MULTIPLES } from '../src/core/achievable';
import { LEAD_IN_BARS } from '../src/core/config';
import { fromPgHex, unpackFloats } from '../src/core/pack';
import { mulberry32 } from '../src/core/random';
import { efficiencyRatio } from '../src/core/regime';
import { persistentSwings, walkFromBars } from '../src/core/geometry/swings';
import { THEMES, taggedThemes, type Theme } from '../src/core/geometry/themes';
import { GEOMETRY_VERSION } from '../src/core/versions';

const CELLS_PER_SIDE = STOP_ATR_MULTIPLES.length * TARGET_R_MULTIPLES.length;
const RESAMPLES = 4000;
/** Below this many tagged charts, the interval is too wide to mean anything. §4.9's habit. */
const MIN_TAGGED = 30;
/** Six themes × two tests. Named, because the correction below depends on it being honest. */
const COMPARISONS = 12;

interface Row {
  lead_in_bars: Bar[];
  atr14: number;
  par_r: number | null;
  achievable_r: string | null;
}

interface Chart {
  tags: Map<Theme, 'up' | 'down' | null>;
  par: number;
  longMedian: number;
  shortMedian: number;
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const mean = (xs: number[]) => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Bootstrap interval on a difference of group means, resampling **charts**.
 *
 * A difference rather than the ratio 2c used, because a directional edge is signed and the ratio of
 * two signed quantities is not interpretable. The chart is the unit of independence, as it was
 * there.
 */
function difference(a: number[], b: number[], seed: number) {
  const delta = mean(a) - mean(b);
  if (a.length < 2 || b.length < 2) {
    return { delta, low: NaN, high: NaN, familyLow: NaN, familyHigh: NaN };
  }

  const rng = mulberry32(seed);
  const deltas: number[] = [];
  for (let r = 0; r < RESAMPLES; r++) {
    const x = Array.from({ length: a.length }, () => a[Math.floor(rng() * a.length)]);
    const y = Array.from({ length: b.length }, () => b[Math.floor(rng() * b.length)]);
    deltas.push(mean(x) - mean(y));
  }
  deltas.sort((p, q) => p - q);
  const at = (q: number) => deltas[Math.max(0, Math.min(deltas.length - 1, Math.floor(q * (deltas.length - 1))))];

  // Two intervals, and the second is the one that decides. Twelve comparisons at 95% produce
  // about 0.6 false positives by chance, so the *most* interesting row in a table this size is
  // the one most likely to be noise. The family-wise interval is Bonferroni: 1 − 0.05/12.
  const alpha = 0.05 / COMPARISONS;
  return {
    delta,
    low: at(0.025),
    high: at(0.975),
    familyLow: at(alpha / 2),
    familyHigh: at(1 - alpha / 2),
  };
}

const fmt = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(3)}` : '—');
const verdict = (low: number, high: number) =>
  !Number.isFinite(low) ? 'too few' : low > 0 ? 'HIGHER' : high < 0 ? 'LOWER' : 'no difference';

/** The verdict that survives twelve comparisons rather than one. */
const familyVerdict = (d: { low: number; high: number; familyLow: number; familyHigh: number }) => {
  const naive = verdict(d.low, d.high);
  if (naive === 'no difference' || naive === 'too few') return naive;
  const survives = d.familyLow > 0 || d.familyHigh < 0;
  return survives ? `${naive} (survives correction)` : `${naive} at 95%, GONE once corrected`;
};

async function run() {
  const supabase = supabaseClient();

  const rows: Row[] = [];
  for (let from = 0; ; from += 250) {
    const { data, error } = await supabase
      .from('charts')
      .select('lead_in_bars, atr14, par_r, achievable_r')
      // Real charts only. §7.2's synthetic controls live in the corpus now, and a published
      // statistic that quietly averaged real and fabricated markets would describe neither.
      .eq('synthetic', false)
      .order('id')
      .range(from, from + 249);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < 250) break;
  }

  const charts: Chart[] = [];
  for (const row of rows) {
    if (!row.achievable_r || row.par_r === null || !(row.atr14 > 0)) continue;
    const values = unpackFloats(fromPgHex(row.achievable_r));
    if (values.length < DIRECTIONS.length * CELLS_PER_SIDE) continue;

    const bars = row.lead_in_bars.slice(0, LEAD_IN_BARS);
    if (bars.length < LEAD_IN_BARS) continue;

    const tags = taggedThemes(
      {
        bars,
        swings: persistentSwings(walkFromBars(bars)),
        atr: row.atr14,
        efficiency: efficiencyRatio(bars.map((b) => b.c)),
      },
      bars.length - 1,
    );

    charts.push({
      tags: new Map(tags.map((t) => [t.theme, t.direction])),
      par: row.par_r,
      longMedian: median(values.slice(0, CELLS_PER_SIDE)),
      shortMedian: median(values.slice(CELLS_PER_SIDE, CELLS_PER_SIDE * 2)),
    });
  }

  if (charts.length === 0) {
    console.log('No enumerated charts. Run `npm run achievable` first.');
    return;
  }

  console.log(`Do the themes predict anything? — ${GEOMETRY_VERSION}`);
  console.log(`${charts.length} charts carrying both a theme tag and an achievable set`);
  console.log('');
  console.log('A theme is computed from the lead-in; the achievable set from the reveal. So this');
  console.log('asks whether the first says anything about the second. 2c asked whether the patterns');
  console.log('are more common than chance, which is a different question.');
  console.log('');

  /* ------------------------------------------------------------- difficulty */

  console.log('DIFFICULTY — median achievable R (par)');
  console.log(`  ${'theme'.padEnd(23)} ${'n'.padStart(5)} ${'tagged'.padStart(8)} ${'others'.padStart(8)} ${'Δ'.padStart(8)}   95% CI`);
  for (const theme of THEMES) {
    const yes = charts.filter((c) => c.tags.has(theme)).map((c) => c.par);
    const no = charts.filter((c) => !c.tags.has(theme)).map((c) => c.par);
    const d = difference(yes, no, 0xc0ffee + theme.length);
    console.log(
      `  ${theme.padEnd(23)} ${String(yes.length).padStart(5)} ${fmt(mean(yes)).padStart(8)} ` +
        `${fmt(mean(no)).padStart(8)} ${fmt(d.delta).padStart(8)}   [${fmt(d.low)}, ${fmt(d.high)}]  ${verdict(d.low, d.high)}`,
    );
  }
  console.log('');

  /* -------------------------------------------------------------- direction */

  console.log('DIRECTION — did the side the theme named do better than the other side?');
  console.log('  edge = median R of the NAMED side − median R of the opposite side, per chart');
  console.log(`  ${'theme'.padEnd(23)} ${'n'.padStart(5)} ${'tagged'.padStart(8)} ${'others'.padStart(8)} ${'Δ'.padStart(8)}   95% CI`);

  // The untagged baseline has no named side, so it is scored as long-minus-short. That biases
  // nothing: the comparison is a difference, and any corpus-wide drift sits in both arms.
  const baseline = (c: Chart) => c.longMedian - c.shortMedian;

  for (const theme of THEMES) {
    const tagged = charts.filter((c) => c.tags.has(theme) && c.tags.get(theme) !== null);
    const untagged = charts.filter((c) => !c.tags.has(theme));

    if (theme === 'range-reversion') {
      // No direction to name. The claim a range makes is that neither side ran away, so it is
      // scored on symmetry: how close the two sides came to each other.
      const yes = charts.filter((c) => c.tags.has(theme)).map((c) => -Math.abs(baseline(c)));
      const no = untagged.map((c) => -Math.abs(baseline(c)));
      const d = difference(yes, no, 0xbeef);
      console.log(
        `  ${theme.padEnd(23)} ${String(yes.length).padStart(5)} ${fmt(mean(yes)).padStart(8)} ` +
          `${fmt(mean(no)).padStart(8)} ${fmt(d.delta).padStart(8)}   [${fmt(d.low)}, ${fmt(d.high)}]  ${verdict(d.low, d.high)}  (symmetry)`,
      );
      continue;
    }

    if (tagged.length < MIN_TAGGED) {
      console.log(`  ${theme.padEnd(23)} ${String(tagged.length).padStart(5)}   too few directional charts to say anything`);
      continue;
    }

    // The signed edge: flip the sign where the theme pointed down, so a positive number always
    // means "the side it named is the side that paid".
    const yes = tagged.map((c) =>
      c.tags.get(theme) === 'down' ? c.shortMedian - c.longMedian : c.longMedian - c.shortMedian,
    );
    const no = untagged.map(baseline);
    const d = difference(yes, no, 0xbeef + theme.length);
    console.log(
      `  ${theme.padEnd(23)} ${String(tagged.length).padStart(5)} ${fmt(mean(yes)).padStart(8)} ` +
        `${fmt(mean(no)).padStart(8)} ${fmt(d.delta).padStart(8)}   [${fmt(d.low)}, ${fmt(d.high)}]  ${familyVerdict(d)}`,
    );
  }

  console.log('');
  console.log('A theme carrying directional information moves Δ above zero: the side it named beat');
  console.log('the other side by more than the corpus does on charts without it.');
  console.log('');
  console.log('Twelve comparisons on one corpus, no costs, and the achievable set is the best');
  console.log('bracket available rather than one anybody would have chosen in advance — so these are');
  console.log('upper bounds on an association, not an edge. The result goes in docs/rules.md');
  console.log('whichever way it came out.');
}

if (process.argv[1] && process.argv[1].endsWith('conditional.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
