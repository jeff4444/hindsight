/**
 * §3.5 — is a restriction legitimate, or is it artificial difficulty?
 *
 *   npm run fairness                    validate the harness against simulated players
 *   npm run fairness -- --live NT NTZ   run it against real attempts, once there are any
 *
 * > Does an expert beat a novice by a **larger** margin at this tier, or a smaller one? If removing
 * > X compresses the skill gap, X was load-bearing information and removing it is artificial
 * > difficulty. If removing X widens the gap, X was a crutch and removing it is legitimate.
 * >
 * > …Run both tiers on the same charts with the same player pool and compare the variance in score
 * > explained by player rating. Every tier in §3.2 should be validated this way before it is
 * > ranked, and the result should be published.
 *
 * Two modes, and the default is the one that works today.
 *
 * **Simulated.** Players with a known latent skill play both tiers, and the harness is asked
 * whether it can recover a gap whose size was chosen in advance. This validates the instrument, not
 * the ladder — but an instrument that has never been shown to work on a known answer is not
 * evidence about an unknown one, and it is the honest thing to be able to claim before launch.
 *
 * **Live.** The same measurement against real attempts, with one correction that decides the
 * result: regressing on an *estimated* rating attenuates R² by that rating's reliability, and
 * deviation differs by tier — so without correcting, the tier whose players happen to be better
 * measured wins by artefact rather than by discriminating. The correction is applied identically to
 * both tiers or not at all.
 *
 * §3.5's condition is "the same charts with the same player pool", so live mode pairs attempts by
 * (player, chart) and uses only players who played *both* tiers on the *same* chart. That is a
 * demanding requirement and it will report exactly how far short the data falls until it is met.
 */

import { createClient } from '@supabase/supabase-js';
import { mulberry32 } from '../src/core/random';
import { compareTiers, correctAttenuation, type Observation } from '../src/core/fairness';
import { isTierCode } from '../src/core/tiers';

const LIVE = process.argv.includes('--live');
const [tierA = 'NTZ', tierB = 'NTVZ'] = process.argv.slice(process.argv.indexOf('--live') + 1);

/** Minimum paired players before the comparison is worth printing at all. */
const MIN_PAIRED = 30;

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ------------------------------------------------------------------ simulated */

function simulate(n: number, signalA: number, signalB: number, seed: number) {
  const rng = mulberry32(seed);
  const normal = () => {
    const u = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };
  return Array.from({ length: n }, () => {
    const skill = normal();
    const at = (signal: number): Observation => ({
      skill,
      percentile: Math.min(1, Math.max(0, 0.5 + signal * skill * 0.15 + (1 - signal) * normal() * 0.2)),
    });
    return { a: at(signalA), b: at(signalB) };
  });
}

function runSimulated() {
  const rng = mulberry32(4242);

  console.log('§3.5 harness — simulated players of known skill');
  console.log('');
  console.log('Validating the instrument, not the ladder. Each row is a restriction whose true');
  console.log('character was decided in advance; the harness has to recover it.');
  console.log('');

  const cases = [
    ['removes a crutch (gap widens)', 0.35, 0.75, 'legitimate'],
    ['removes load-bearing information (gap narrows)', 0.75, 0.35, 'artificial'],
    ['changes nothing', 0.5, 0.5, 'inconclusive'],
  ] as const;

  let passed = 0;
  for (const [label, signalA, signalB, expected] of cases) {
    const result = compareTiers(simulate(600, signalA, signalB, 7), { resamples: 2000, rng });
    const ok = result.verdict === expected;
    if (ok) passed += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
    console.log(
      `       R² ${result.aR2.toFixed(3)} → ${result.bR2.toFixed(3)}` +
        `   Δ ${result.difference >= 0 ? '+' : ''}${result.difference.toFixed(3)}` +
        `   95% [${result.ci.low.toFixed(3)}, ${result.ci.high.toFixed(3)}]` +
        `   ${result.verdict}`,
    );
  }

  console.log('');
  console.log(`${passed}/${cases.length} recovered.`);
  console.log('');
  console.log('This says the measurement works. It says nothing about Naked versus Blackout, and');
  console.log('docs/rules.md §13 records that no tier is validated until --live can run.');
  return passed === cases.length;
}

/* ----------------------------------------------------------------------- live */

async function runLive() {
  if (!isTierCode(tierA) || !isTierCode(tierB)) {
    throw new Error(`unknown tier: ${tierA} or ${tierB}`);
  }

  const supabase = supabaseClient();
  console.log(`§3.5 test — ${tierA} against ${tierB}, live`);
  console.log('');

  const { data, error } = await supabase
    .from('rounds')
    .select('owner, chart_id, tier, percentile, player_rating_at_attempt')
    .in('tier', [tierA, tierB])
    .eq('rated', true)
    .eq('superseded', false)
    .not('percentile', 'is', null)
    .not('player_rating_at_attempt', 'is', null);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    owner: string;
    chart_id: string;
    tier: string;
    percentile: number;
    player_rating_at_attempt: number;
  }[];

  // §3.5's condition, taken literally: the same charts, the same pool. A pair is one player on one
  // chart at both tiers.
  const byKey = new Map<string, Record<string, { rating: number; percentile: number }>>();
  for (const row of rows) {
    const key = `${row.owner}|${row.chart_id}`;
    const entry = byKey.get(key) ?? {};
    entry[row.tier] = { rating: row.player_rating_at_attempt, percentile: row.percentile };
    byKey.set(key, entry);
  }

  const paired = [...byKey.values()]
    .filter((entry) => entry[tierA] && entry[tierB])
    .map((entry) => ({
      a: { skill: entry[tierA].rating, percentile: entry[tierA].percentile },
      b: { skill: entry[tierB].rating, percentile: entry[tierB].percentile },
    }));

  console.log(`rated attempts at either tier   ${rows.length}`);
  console.log(`player-and-chart pairs at both  ${paired.length}   (need ${MIN_PAIRED})`);
  console.log('');

  if (paired.length < MIN_PAIRED) {
    console.log('Not enough to say anything, and saying nothing is the correct output.');
    console.log('');
    console.log('§3.5 requires the same charts played by the same pool at both tiers. That means');
    console.log(`the same player has to play one chart at ${tierA} and again at ${tierB} — which the`);
    console.log('one-rated-attempt-per-chart-and-tier rule permits, because the tiers are separate');
    console.log('entities.');
    console.log('');
    console.log('Until then docs/rules.md §13 stands: no tier is validated.');
    return false;
  }

  const result = compareTiers(paired, { resamples: 4000 });

  // Attenuation, applied to both or to neither.
  const { data: ratings } = await supabase.from('player_ratings').select('rd').eq('tier', 'ALL');
  const rds = (ratings ?? []).map((r) => r.rd as number);
  const meanRd = rds.length ? rds.reduce((a, b) => a + b, 0) / rds.length : 0;
  const spread = standardDeviation(rows.map((r) => r.player_rating_at_attempt));
  const reliability = spread > 0 ? spread ** 2 / (spread ** 2 + meanRd ** 2) : 1;

  console.log(`R²  ${tierA} ${result.aR2.toFixed(4)}   ${tierB} ${result.bR2.toFixed(4)}`);
  console.log(`Δ   ${result.difference >= 0 ? '+' : ''}${result.difference.toFixed(4)}`);
  console.log(`95% [${result.ci.low.toFixed(4)}, ${result.ci.high.toFixed(4)}]`);
  console.log('');
  console.log(`rating spread ${spread.toFixed(1)}, mean RD ${meanRd.toFixed(1)}, reliability ${reliability.toFixed(3)}`);
  console.log(
    `corrected R²  ${tierA} ${correctAttenuation(result.aR2, reliability).toFixed(4)}` +
      `   ${tierB} ${correctAttenuation(result.bR2, reliability).toFixed(4)}`,
  );
  console.log('');
  console.log(`verdict: ${tierB} is ${result.verdict}`);
  console.log('');
  console.log('§3.5 says to publish this. Put it in docs/rules.md §13 and replace the line saying');
  console.log('no tier is validated.');
  return true;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1));
}

async function run() {
  const ok = LIVE ? await runLive() : runSimulated();
  if (!ok && !LIVE) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('fairness.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
