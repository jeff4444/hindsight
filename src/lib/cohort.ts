import { serviceClient } from '@/lib/supabase/server';

/**
 * §11.2's cohort roll-up: the operator's view over a tape's players.
 *
 * > "Cohort dashboards for the owner: aggregate scores, weakest axes across the group, per-student
 * > progress, per-theme ratings."
 *
 * ## What this cannot be verified against, and says so
 *
 * Every other number in this product is checked against a measured null. This one has none
 * available: it aggregates over a group of players, and there is one player. The queries are
 * ordinary and they return the right shape for a cohort of one — but *"the group's weakest axis"*
 * over a single member is that member's weakest axis with extra words, and the surface says so
 * rather than dressing an *n* of 1 as a finding.
 *
 * So every figure here carries its sample size, and the page gates on it exactly as §4.9 gates a
 * player's own percentile.
 *
 * ## There is no invitation, so this is everyone who played
 *
 * §11.2 imagines a cohort as an operator's students. Nothing in the product invites anyone to a
 * tape: a link is a link. So this is every player who has committed a round on the tape, which for a
 * private or unlisted tape is the cohort and for a public one is the public. The page names which.
 */

export interface CohortPlayer {
  /** The display handle, or null for a player with no account. */
  handle: string | null;
  rounds: number;
  traded: number;
  passed: number;
  meanPercentile: number | null;
  lastPlayed: string | null;
}

export interface CohortAxis {
  /** A theme code or a regime bucket. */
  key: string;
  rounds: number;
  meanPercentile: number;
}

export interface Cohort {
  slug: string;
  players: CohortPlayer[];
  rounds: number;
  traded: number;
  passed: number;
  meanPercentile: number | null;
  /** Per-theme means, weakest first. Only axes with enough rounds to be worth reading. */
  axes: CohortAxis[];
  /** Rounds needed on an axis before it is reported at all. */
  axisFloor: number;
}

/** An axis with fewer rounds than this is one or two charts wearing a trend's clothing. */
export const AXIS_FLOOR = 5;

export async function getCohort(slug: string): Promise<Cohort> {
  const supabase = serviceClient();

  /*
   * Committed, unsuperseded rounds only — the same filter every other statistic in this product
   * uses. An issued-but-abandoned round is not a result, and counting it would let a player pad a
   * cohort's volume by opening charts they never answered.
   */
  const { data, error } = await supabase
    .from('rounds')
    .select('owner, user_id, percentile, passed, committed_at, charts!inner(themes, regime_er_bucket)')
    .eq('tape', slug)
    .eq('superseded', false)
    .not('committed_at', 'is', null);

  if (error) throw new Error(`could not read the cohort: ${error.message}`);

  const rows = (data ?? []) as unknown as {
    owner: string;
    user_id: string | null;
    percentile: number | null;
    passed: boolean | null;
    committed_at: string;
    charts: { themes: string[] | null; regime_er_bucket: string | null };
  }[];

  const byPlayer = new Map<
    string,
    { userId: string | null; percentiles: number[]; rounds: number; passed: number; last: string }
  >();
  const byAxis = new Map<string, number[]>();
  const allPercentiles: number[] = [];
  let passed = 0;

  for (const row of rows) {
    const player = byPlayer.get(row.owner) ?? {
      userId: row.user_id,
      percentiles: [],
      rounds: 0,
      passed: 0,
      last: row.committed_at,
    };
    player.rounds += 1;
    if (row.passed) player.passed += 1;
    if (row.percentile !== null) player.percentiles.push(row.percentile);
    if (row.committed_at > player.last) player.last = row.committed_at;
    byPlayer.set(row.owner, player);

    if (row.passed) passed += 1;
    if (row.percentile !== null) {
      allPercentiles.push(row.percentile);
      // A chart carries several themes, so a round counts towards each of them. That is the honest
      // reading — the round is evidence about every formation the chart contained — and it means the
      // axis counts sum to more than the round count, which the surface states.
      for (const theme of row.charts?.themes ?? []) {
        byAxis.set(theme, [...(byAxis.get(theme) ?? []), row.percentile]);
      }
      const regime = row.charts?.regime_er_bucket;
      if (regime) byAxis.set(`regime:${regime}`, [...(byAxis.get(`regime:${regime}`) ?? []), row.percentile]);
    }
  }

  // Handles are looked up in one query rather than per player.
  const userIds = [...byPlayer.values()].map((p) => p.userId).filter((id): id is string => id !== null);
  const handles = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, handle_display')
      .in('user_id', userIds);
    for (const row of profiles ?? []) {
      handles.set(row.user_id as string, row.handle_display as string);
    }
  }

  const players: CohortPlayer[] = [...byPlayer.values()]
    .map((p) => ({
      handle: p.userId ? (handles.get(p.userId) ?? null) : null,
      rounds: p.rounds,
      traded: p.rounds - p.passed,
      passed: p.passed,
      meanPercentile: p.percentiles.length ? mean(p.percentiles) : null,
      lastPlayed: p.last,
    }))
    .sort((a, b) => b.rounds - a.rounds);

  const axes: CohortAxis[] = [...byAxis.entries()]
    .filter(([, values]) => values.length >= AXIS_FLOOR)
    .map(([key, values]) => ({ key, rounds: values.length, meanPercentile: mean(values) }))
    .sort((a, b) => a.meanPercentile - b.meanPercentile);

  return {
    slug,
    players,
    rounds: rows.length,
    traded: rows.length - passed,
    passed,
    meanPercentile: allPercentiles.length ? mean(allPercentiles) : null,
    axes,
    axisFloor: AXIS_FLOOR,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
