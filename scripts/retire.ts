/**
 * §8.3 — retire the coin flips.
 *
 *   npm run retire            assess everything and report; writes nothing
 *   npm run retire -- --apply actually set the flags
 *
 * > A chart on which strong and weak players score identically is a coin flip and is automatically
 * > retired from ranked play.
 *
 * **Dry by default.** Retiring a chart destroys content permanently, and this is a job that will
 * eventually run unattended against a corpus nobody is watching. It should not be possible to
 * remove a thousand charts by running the wrong command in the wrong directory.
 *
 * **It is expected to do nothing for a long time.** The equivalence test needs 400 attempts on a
 * single chart-and-tier pair before it can conclude anything, and until then the correct answer is
 * "keep" — see `src/core/retire.ts` for why the burden of proof runs that way. Running this on an
 * empty corpus prints how far off the threshold is and exits, which is the state it will be in for
 * most of the product's life.
 *
 * Every verdict is stored with the versions that produced it. §12.4: population statistics are not
 * comparable across a change of rule, so a retirement decided under one score map has to be
 * re-derivable and, if the map moves, thrown away rather than inherited.
 */

import { createClient } from '@supabase/supabase-js';
import { RETIRE_MIN_N, assess, type Attempt } from '../src/core/retire';
import { ACHIEVABLE_VERSION, SCORE_MAP_VERSION } from '../src/core/versions';

const APPLY = process.argv.includes('--apply');

interface Row {
  chart_id: string;
  tier: string;
  percentile: number;
  player_rating_at_attempt: number;
}

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1));
}

async function run() {
  const supabase = supabaseClient();

  // Every rated attempt that carries both halves of the correlation.
  const attempts: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('rounds')
      .select('chart_id, tier, percentile, player_rating_at_attempt')
      .eq('rated', true)
      .eq('superseded', false)
      .not('percentile', 'is', null)
      .not('player_rating_at_attempt', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    attempts.push(...(data as Row[]));
    if (data.length < 1000) break;
  }

  const populationSd = standardDeviation(attempts.map((a) => a.player_rating_at_attempt));

  const byPair = new Map<string, Attempt[]>();
  for (const row of attempts) {
    const key = `${row.chart_id}|${row.tier}`;
    const list = byPair.get(key) ?? [];
    list.push({ rating: row.player_rating_at_attempt, percentile: row.percentile });
    byPair.set(key, list);
  }

  console.log(`rated attempts       ${attempts.length}`);
  console.log(`chart-and-tier pairs ${byPair.size}`);
  console.log(`population rating sd ${populationSd.toFixed(1)}`);
  console.log('');

  if (byPair.size === 0) {
    console.log(`Nothing to assess yet. §8.3 needs ${RETIRE_MIN_N} attempts on a single chart at a`);
    console.log('single tier before the equivalence test can conclude anything, and below that the');
    console.log('correct answer is always "keep" — see src/core/retire.ts.');
    console.log('');
    console.log('Come back when `npm run ladder` reports pairs at or near the threshold.');
    return;
  }

  const verdicts = { keep: 0, retire: 0, defer: 0, review: 0 };
  const actionable: { key: string; verdict: string; rho: number; n: number; reason: string }[] = [];
  let closest = { key: '', n: 0 };

  for (const [key, list] of byPair) {
    if (list.length > closest.n) closest = { key, n: list.length };
    const result = assess(list, populationSd);
    verdicts[result.verdict] += 1;
    if (result.verdict === 'retire' || result.verdict === 'review') {
      actionable.push({
        key,
        verdict: result.verdict,
        rho: result.rho,
        n: result.n,
        reason: result.reason,
      });
    }
  }

  console.log(`keep    ${verdicts.keep}`);
  console.log(`retire  ${verdicts.retire}`);
  console.log(`review  ${verdicts.review}   (weak players outscoring strong ones — probably a defect)`);
  console.log(`defer   ${verdicts.defer}   (served rating range too narrow to judge)`);
  console.log('');
  console.log(`most-played pair: ${closest.key} at ${closest.n} attempts (threshold ${RETIRE_MIN_N})`);

  if (actionable.length === 0) {
    console.log('');
    console.log('Nothing actionable.');
    return;
  }

  console.log('');
  for (const item of actionable) {
    console.log(`  ${item.verdict.padEnd(6)} ${item.key}  rho ${item.rho.toFixed(3)}  n ${item.n}`);
    console.log(`         ${item.reason}`);
  }

  if (!APPLY) {
    console.log('');
    console.log('Dry run. Re-run with --apply to write these flags.');
    return;
  }

  let written = 0;
  for (const item of actionable) {
    // A chart where weak players reliably win is flagged, never auto-retired: far more likely a
    // mis-signed mirror or a mislabelled regime than a real phenomenon, and retiring it would hide
    // the bug rather than surface it.
    if (item.verdict === 'review') continue;

    const [chartId, tier] = item.key.split('|');
    const { error } = await supabase
      .from('chart_ratings')
      .update({
        retired: true,
        retired_at: new Date().toISOString(),
        retired_rho: item.rho,
        retired_n: item.n,
        retired_reason: item.reason,
        score_map_version: SCORE_MAP_VERSION,
        achievable_version: ACHIEVABLE_VERSION,
      })
      .eq('chart_id', chartId)
      .eq('tier', tier);
    if (error) throw new Error(`${item.key}: ${error.message}`);
    written += 1;
  }

  console.log('');
  console.log(`retired ${written} chart-and-tier pairs`);
  console.log(`flagged ${actionable.filter((a) => a.verdict === 'review').length} for human review`);
}

if (process.argv[1] && process.argv[1].endsWith('retire.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
