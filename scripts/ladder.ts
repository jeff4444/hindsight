/**
 * Where the ladder actually stands.
 *
 *   npm run ladder
 *
 * The point of this script is that the rating system spends its first long stretch doing almost
 * nothing visible, entirely correctly. Charts sit pending because §8.2 will not graduate them
 * before fifty plays. Nothing retires because §8.3 needs four hundred attempts on one chart before
 * its equivalence test can conclude. No tier is validated because §3.5 needs the same players on
 * the same charts at two tiers.
 *
 * All three of those are indistinguishable from "the code is broken" if the only thing you can see
 * is that no numbers are moving — which is exactly the trap that hid the un-called `exitsPending`
 * for a whole phase. So this prints the distance to each gate rather than the state at each gate,
 * and says what to run when a gate opens.
 *
 * Read-only. Safe to run against production at any time.
 */

import { createClient } from '@supabase/supabase-js';
import { PENDING_MIN_PLAYS, PENDING_RD_EXIT, RANK_MIN_ATTEMPTS, RANK_MAX_RD } from '../src/core/rating';
import { RETIRE_MIN_N } from '../src/core/retire';
import { TIERS } from '../src/core/tiers';

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

const bar = (done: number, need: number, width = 24): string => {
  const filled = Math.max(0, Math.min(width, Math.round((done / Math.max(need, 1)) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

async function run() {
  const supabase = supabaseClient();

  /* ------------------------------------------------------------------ corpus */

  const { count: charts } = await supabase.from('charts').select('id', { count: 'exact', head: true });
  const { count: extended } = await supabase
    .from('charts')
    .select('id', { count: 'exact', head: true })
    .not('lead_in_extra', 'is', null);

  console.log('CORPUS');
  console.log(`  charts                 ${charts ?? 0}`);
  console.log(`  servable at No Tools   ${extended ?? 0}  (needs 300 candles)`);
  console.log('');

  /* ------------------------------------------------------------------- tiers */

  console.log('TIERS');
  for (const tier of TIERS) {
    const { count: rounds } = await supabase
      .from('rounds')
      .select('id', { count: 'exact', head: true })
      .eq('tier', tier.code)
      .not('committed_at', 'is', null);
    const { count: rated } = await supabase
      .from('rounds')
      .select('id', { count: 'exact', head: true })
      .eq('tier', tier.code)
      .eq('rated', true);
    console.log(
      `  ${tier.code.padEnd(5)} ${tier.name.padEnd(10)} ` +
        `played ${String(rounds ?? 0).padStart(5)}   rated ${String(rated ?? 0).padStart(5)}` +
        `${tier.rated ? '' : '   (unrated by design)'}`,
    );
  }
  console.log('');

  /* --------------------------------------------------------- §8.2 pending gate */

  const { data: chartRatings } = await supabase
    .from('chart_ratings')
    .select('chart_id, tier, plays, rd, pending, retired');
  const cr = (chartRatings ?? []) as {
    chart_id: string;
    tier: string;
    plays: number;
    rd: number;
    pending: boolean;
    retired: boolean;
  }[];

  const pending = cr.filter((c) => c.pending);
  const graduated = cr.filter((c) => !c.pending && !c.retired);
  const retired = cr.filter((c) => c.retired);
  const closestToGraduating = pending.slice().sort((a, b) => b.plays - a.plays)[0];

  console.log(`§8.2  PENDING GATE — a chart graduates at ${PENDING_MIN_PLAYS} plays and RD ≤ ${PENDING_RD_EXIT}`);
  console.log(`  rated charts   ${cr.length}`);
  console.log(`  pending        ${pending.length}   (unrated for the player, by design)`);
  console.log(`  graduated      ${graduated.length}`);
  console.log(`  retired        ${retired.length}`);
  if (closestToGraduating) {
    console.log(
      `  closest        ${bar(closestToGraduating.plays, PENDING_MIN_PLAYS)} ` +
        `${closestToGraduating.plays}/${PENDING_MIN_PLAYS} plays, RD ${closestToGraduating.rd.toFixed(0)}`,
    );
  }
  if (graduated.length === 0 && pending.length > 0) {
    console.log('  → No chart has graduated, so no player attempt is rated yet. Expected until a');
    console.log(`    chart reaches ${PENDING_MIN_PLAYS} plays. If a chart is past it and still pending,`);
    console.log('    that is a bug — check applyRating calls exitsPending.');
  }
  console.log('');

  /* ------------------------------------------------------ §8.3 retirement gate */

  const { data: ratedRounds } = await supabase
    .from('rounds')
    .select('chart_id, tier')
    .eq('rated', true)
    .eq('superseded', false);
  const perPair = new Map<string, number>();
  for (const row of (ratedRounds ?? []) as { chart_id: string; tier: string }[]) {
    const key = `${row.chart_id}|${row.tier}`;
    perPair.set(key, (perPair.get(key) ?? 0) + 1);
  }
  const deepest = [...perPair.values()].sort((a, b) => b - a)[0] ?? 0;
  const assessable = [...perPair.values()].filter((n) => n >= RETIRE_MIN_N).length;

  console.log(`§8.3  RETIREMENT GATE — the equivalence test needs ${RETIRE_MIN_N} attempts on one chart`);
  console.log(`  assessable pairs  ${assessable}`);
  console.log(`  deepest pair      ${bar(deepest, RETIRE_MIN_N)} ${deepest}/${RETIRE_MIN_N}`);
  console.log(
    assessable > 0
      ? '  → Run `npm run retire` to see the verdicts, then `-- --apply` to write them.'
      : '  → Nothing to assess. Below the threshold the answer is always "keep", which is the',
  );
  if (assessable === 0) console.log('    safe direction: destroying content is permanent, keeping a coin flip is not.');
  console.log('');

  /* -------------------------------------------------------- §3.5 fairness gate */

  const { data: pairRows } = await supabase
    .from('rounds')
    .select('owner, chart_id, tier')
    .eq('rated', true)
    .eq('superseded', false);
  const seen = new Map<string, Set<string>>();
  for (const row of (pairRows ?? []) as { owner: string; chart_id: string; tier: string }[]) {
    const key = `${row.owner}|${row.chart_id}`;
    const tiers = seen.get(key) ?? new Set<string>();
    tiers.add(row.tier);
    seen.set(key, tiers);
  }
  const crossTier = [...seen.values()].filter((tiers) => tiers.size >= 2).length;

  console.log('§3.5  FAIRNESS GATE — the same players, on the same charts, at two tiers');
  console.log(`  player-and-chart pairs at two tiers  ${bar(crossTier, 30)} ${crossTier}/30`);
  console.log('  → `npm run fairness` validates the harness on simulated players today.');
  console.log('  → `npm run fairness -- --live NT NTZ` runs the real test once the bar fills.');
  console.log('');

  /* ---------------------------------------------------------------- §4.9 ranks */

  const { data: players } = await supabase
    .from('player_ratings')
    .select('rating, rd, attempts')
    .eq('tier', 'ALL');
  const pr = (players ?? []) as { rating: number; rd: number; attempts: number }[];
  const showable = pr.filter((p) => p.attempts >= RANK_MIN_ATTEMPTS && p.rd <= RANK_MAX_RD);

  console.log(`§4.9  RANKS — shown at ${RANK_MIN_ATTEMPTS} rated rounds and RD ≤ ${RANK_MAX_RD}`);
  console.log(`  players with a rating row  ${pr.length}`);
  console.log(`  ranks displayable          ${showable.length}`);
  if (pr.length > 0) {
    const best = pr.slice().sort((a, b) => b.attempts - a.attempts)[0];
    console.log(`  furthest along             ${bar(best.attempts, RANK_MIN_ATTEMPTS)} ${best.attempts}/${RANK_MIN_ATTEMPTS} rated, RD ${best.rd.toFixed(0)}`);
  }
  console.log('');

  console.log('docs/rules.md §15 records what is unvalidated. Update it when a gate opens.');
}

if (process.argv[1] && process.argv[1].endsWith('ladder.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
