import 'server-only';

import { RANK_MAX_RD, RANK_MIN_ATTEMPTS } from '@/core/rating';
import { DAILY_CHARTS } from './daily';
import { serviceClient } from './supabase/server';
import { isAccent, type Accent } from './avatar';

/**
 * The field: today's daily across every player, the ranked ladder, and each tape's best.
 *
 * All reads go through the functions migration 0029 adds. Until that migration is applied the
 * functions do not exist, and every reader here returns `null` rather than throwing — a board that
 * is not there yet is an empty state, never an error page. The same is true if the database is
 * briefly unreachable: the boards are the least essential thing on any screen that shows them.
 */

export interface BoardRow {
  userId: string;
  handle: string;
  avatarSeed: number;
  avatarAccent: Accent;
  /** The figure the board is sorted on: a score 0–1, or a rating. */
  value: number;
  /** Supporting figure: charts traded, rounds played, or rating deviation. */
  detail: number | null;
}

export interface DailyField {
  day: number;
  players: number;
  /** Ten buckets of the field's scores, 0 = 0–9 … 9 = 90–100. */
  histogram: number[];
  /** The viewer's standing, when they finished it. */
  you: { beaten: number; mean: number } | null;
}

function rowOf(raw: Record<string, unknown>, value: string, detail: string | null): BoardRow {
  return {
    userId: raw.user_id as string,
    handle: raw.handle as string,
    avatarSeed: raw.avatar_seed as number,
    avatarAccent: isAccent(raw.avatar_accent) ? raw.avatar_accent : 'slate',
    value: Number(raw[value]),
    detail: detail === null ? null : Number(raw[detail]),
  };
}

export async function getDailyField(day: number, owner: string | null): Promise<DailyField | null> {
  try {
    const supabase = serviceClient();
    const [field, standing] = await Promise.all([
      supabase.rpc('daily_field', { p_day: day, p_charts: DAILY_CHARTS }),
      owner
        ? supabase.rpc('daily_standing', { p_day: day, p_owner: owner, p_charts: DAILY_CHARTS })
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (field.error) return null;
    const histogram = Array.from({ length: 10 }, () => 0);
    let players = 0;
    for (const row of (field.data ?? []) as { bucket: number; players: number }[]) {
      histogram[Math.min(9, Math.max(0, row.bucket))] += row.players;
      players += row.players;
    }
    const mine = Array.isArray(standing.data) ? (standing.data[0] as { beaten: number; mean_percentile: number | null } | undefined) : undefined;
    return {
      day,
      players,
      histogram,
      you: mine && mine.mean_percentile !== null ? { beaten: mine.beaten, mean: mine.mean_percentile } : null,
    };
  } catch {
    return null;
  }
}

export async function getDailyBoard(day: number, limit = 20): Promise<BoardRow[] | null> {
  try {
    const { data, error } = await serviceClient().rpc('daily_leaderboard', { p_day: day, p_limit: limit });
    if (error) return null;
    return ((data ?? []) as Record<string, unknown>[]).map((raw) => rowOf(raw, 'mean_percentile', 'traded'));
  } catch {
    return null;
  }
}

export async function getLadder(limit = 50): Promise<BoardRow[] | null> {
  try {
    const { data, error } = await serviceClient().rpc('ranked_ladder', {
      p_limit: limit,
      p_min_attempts: RANK_MIN_ATTEMPTS,
      p_max_rd: RANK_MAX_RD,
    });
    if (error) return null;
    return ((data ?? []) as Record<string, unknown>[]).map((raw) => rowOf(raw, 'rating', 'rd'));
  } catch {
    return null;
  }
}

export async function getLadderPosition(userId: string): Promise<{ position: number | null; players: number } | null> {
  try {
    const { data, error } = await serviceClient().rpc('ranked_position', {
      p_user: userId,
      p_min_attempts: RANK_MIN_ATTEMPTS,
      p_max_rd: RANK_MAX_RD,
    });
    if (error) return null;
    const row = (Array.isArray(data) ? data[0] : null) as { rank_position: number | null; players: number } | null;
    return row ? { position: row.rank_position, players: row.players } : null;
  } catch {
    return null;
  }
}

/** A player appears on a tape's board after this many rounds on it. */
export const TAPE_BOARD_MIN_ROUNDS = 10;

export async function getTapeBoard(tape: string, limit = 20): Promise<BoardRow[] | null> {
  try {
    const { data, error } = await serviceClient().rpc('tape_leaderboard', {
      p_tape: tape,
      p_min_rounds: TAPE_BOARD_MIN_ROUNDS,
      p_limit: limit,
    });
    if (error) return null;
    return ((data ?? []) as Record<string, unknown>[]).map((raw) => rowOf(raw, 'mean_percentile', 'rounds'));
  } catch {
    return null;
  }
}
