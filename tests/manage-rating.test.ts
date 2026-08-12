import { describe, expect, it, vi } from 'vitest';

/**
 * The Manage ladder is separate, and this is the test that keeps it separate.
 *
 * §10.1 gives Manage its own rating; §3 compares it to blitz against classical. The phase's exit
 * condition is *"a Manage rating that correlates only partly with the Naked rating"* — and a
 * correlation between two numbers that feed each other measures nothing at all. So the one thing
 * that must never happen is a Manage result reaching the reserved `ALL` key.
 *
 * `applyRating` writes two rows for a normal ladder and must write exactly one for this one, so the
 * audit is on the rows it upserts rather than on the arithmetic, which `tests/rating.test.ts`
 * already covers.
 */

interface Upserted {
  table: string;
  rows: Record<string, unknown>[];
}

function harness(existing: Record<string, unknown> | null) {
  const writes: Upserted[] = [];
  const reads: string[] = [];

  const supabase = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            eq: (...args: unknown[]) => {
              const tier = args[1];
              reads.push(`${table}:${String(tier)}`);
              return { maybeSingle: async () => ({ data: existing }) };
            },
            maybeSingle: async () => ({ data: existing }),
            single: async () => ({ data: existing }),
          }),
        }),
        upsert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => {
          writes.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
          return { error: null };
        },
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
  };

  return { supabase, writes, reads };
}

vi.mock('server-only', () => ({}));

/** A chart already out of pending, so the attempt is actually rated. */
const RATED_CHART = {
  rating: 1500,
  rd: 80,
  sigma: 0.06,
  plays: 60,
  pending: false,
  retired: false,
  mean_opponent_rd: 90,
  attempts: 40,
  last_rated_at: null,
};

describe('a Manage attempt never touches the overall rating', () => {
  it('writes one player row, not two', async () => {
    const { applyRating, MANAGE_LADDER, OVERALL } = await import('@/lib/apply-rating');
    const { supabase, writes } = harness(RATED_CHART);

    await applyRating({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: 'u1',
      chartId: 'c1',
      tier: MANAGE_LADDER,
      percentile: 0.8,
      ambiguous: false,
      roundId: 'r1',
      ladder: 'isolated',
    });

    const players = writes.filter((write) => write.table === 'player_ratings').flatMap((w) => w.rows);
    expect(players).toHaveLength(1);
    expect(players[0].tier).toBe(MANAGE_LADDER);
    // The whole point: the reserved overall key must be nowhere in what was written.
    expect(players.some((row) => row.tier === OVERALL)).toBe(false);
  });

  it('never even reads the overall row, so it cannot be used as the opponent', async () => {
    // Reading `ALL` would pull the Naked rating into the game the chart is calibrated against, which
    // would couple the ladders through the back door even if nothing were written.
    const { applyRating, MANAGE_LADDER, OVERALL } = await import('@/lib/apply-rating');
    const { supabase, reads } = harness(RATED_CHART);

    await applyRating({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: 'u1',
      chartId: 'c1',
      tier: MANAGE_LADDER,
      percentile: 0.8,
      ambiguous: false,
      roundId: 'r1',
      ladder: 'isolated',
    });

    expect(reads.some((read) => read.endsWith(`:${OVERALL}`))).toBe(false);
  });

  it('still writes both rows for a ladder that does feed the overall', async () => {
    // The control. If this ever stopped writing two rows, the isolation test above would pass for
    // the wrong reason and the Naked ladder would silently stop rating.
    const { applyRating, OVERALL } = await import('@/lib/apply-rating');
    const { supabase, writes } = harness(RATED_CHART);

    await applyRating({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: 'u1',
      chartId: 'c1',
      tier: 'NTZ',
      percentile: 0.8,
      ambiguous: false,
      roundId: 'r1',
    });

    const players = writes.filter((write) => write.table === 'player_ratings').flatMap((w) => w.rows);
    expect(players).toHaveLength(2);
    expect(players.some((row) => row.tier === OVERALL)).toBe(true);
  });

  it('rates the chart under its own ladder, because managing it is a different problem', async () => {
    // (chart_id, 'MANAGE') is a different opponent from (chart_id, 'NTZ'). The two grids have
    // different medians (§17), so a chart's difficulty to manage is simply not its difficulty to
    // bracket, and sharing one rating would average two unrelated quantities.
    const { applyRating, MANAGE_LADDER } = await import('@/lib/apply-rating');
    const { supabase, writes } = harness(RATED_CHART);

    await applyRating({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      userId: 'u1',
      chartId: 'c1',
      tier: MANAGE_LADDER,
      percentile: 0.3,
      ambiguous: false,
      roundId: 'r1',
      ladder: 'isolated',
    });

    const charts = writes.filter((write) => write.table === 'chart_ratings').flatMap((w) => w.rows);
    expect(charts).toHaveLength(1);
    expect(charts[0].tier).toBe(MANAGE_LADDER);
  });
});
