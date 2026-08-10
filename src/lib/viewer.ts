import 'server-only';
import { serviceClient } from './supabase/server';
import { authClient } from './supabase/auth-server';
import { SESSION_COOKIE, ensureSession, readSession } from './session';
import { dailyNumber, DAILY_CHARTS } from './daily';
import { streakState, type StreakView } from '@/core/streak';
import { rankIsShowable } from '@/core/rating';
import { isAccent, type Accent } from './avatar';

/**
 * Who is looking at the page.
 *
 * A viewer is always present — anonymous play is a first-class state, not a degraded one. What an
 * account adds is durability: a handle, a signature, a streak, and a history that survives clearing
 * a cookie. The play loop itself is identical either way, which is what makes "play first, claim
 * later" honest rather than a funnel trick.
 */

export interface Profile {
  userId: string;
  handle: string;
  handleDisplay: string;
  displayName: string | null;
  avatarSeed: number;
  avatarAccent: Accent;
  createdAt: string;
}

export interface Viewer {
  /** The anonymous play-session id. Always present; it is what rounds are issued against. */
  sessionId: string;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
}

export async function currentViewer(): Promise<Viewer> {
  const sessionId = await ensureSession();
  let userId: string | null = null;
  let email: string | null = null;

  try {
    const auth = await authClient();
    const { data } = await auth.getUser();
    userId = data.user?.id ?? null;
    email = data.user?.email ?? null;
  } catch {
    // Auth not configured, or no session. Anonymous is a valid state.
  }

  if (!userId) return { sessionId, userId: null, email: null, profile: null };

  const supabase = serviceClient();

  // Self-healing claim: if the callback errored after the session was established but before the
  // claim landed, the next page view fixes it. `claim_session` is idempotent and cheap, so there
  // is no reconciliation job and no window where a player's history is stranded.
  const { data: sessionRow } = await supabase
    .from('play_sessions')
    .select('user_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!sessionRow || sessionRow.user_id === null) {
    await supabase.rpc('claim_session', { p_session: sessionId, p_user: userId });
  }

  const { data } = await supabase
    .from('profiles')
    .select('user_id, handle, handle_display, display_name, avatar_seed, avatar_accent, created_at')
    .eq('user_id', userId)
    .maybeSingle();

  const profile: Profile | null = data
    ? {
        userId: data.user_id as string,
        handle: data.handle as string,
        handleDisplay: (data.handle_display as string | null) ?? (data.handle as string),
        displayName: data.display_name as string | null,
        avatarSeed: data.avatar_seed as number,
        avatarAccent: isAccent(data.avatar_accent) ? data.avatar_accent : 'ember',
        createdAt: data.created_at as string,
      }
    : null;

  return { sessionId, userId, email, profile };
}

/** The session cookie has to be written from a route handler; pages only read it. */
export async function sessionCookiePresent(): Promise<boolean> {
  return (await readSession()) !== null;
}
export { SESSION_COOKIE };

/* -------------------------------------------------------------------- daily */

export interface DailyState {
  day: number;
  played: number;
  total: number;
  traded: number;
  percentile: number | null;
  complete: boolean;
}

export async function getDailyState(viewer: Viewer, day = dailyNumber(Date.now())): Promise<DailyState> {
  const supabase = serviceClient();
  const owner = viewer.userId ?? viewer.sessionId;

  const { data } = await supabase
    .from('rounds')
    .select('daily_index, passed, percentile')
    .eq('owner', owner)
    .eq('daily_day', day)
    .eq('superseded', false)
    .not('committed_at', 'is', null);

  const rows = data ?? [];
  const scored = rows.map((r) => r.percentile as number | null).filter((p): p is number => p !== null);

  return {
    day,
    played: rows.length,
    total: DAILY_CHARTS,
    traded: rows.filter((r) => !r.passed).length,
    percentile: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
    complete: rows.length >= DAILY_CHARTS,
  };
}

/* ------------------------------------------------------------------ streaks */

export async function getStreak(viewer: Viewer): Promise<StreakView | null> {
  if (!viewer.userId) return null;
  const supabase = serviceClient();
  const today = dailyNumber(Date.now());

  const [completions, freezes, repairs, streak] = await Promise.all([
    supabase.from('daily_completions').select('day').eq('user_id', viewer.userId),
    supabase.from('streak_freezes').select('day').eq('user_id', viewer.userId),
    supabase
      .from('streak_repairs')
      .select('id, state, covers_from_day, covers_to_day, charts_required, charts_done, expires_at')
      .eq('user_id', viewer.userId),
    supabase
      .from('player_streaks')
      .select('freezes_remaining, longest_length')
      .eq('user_id', viewer.userId)
      .maybeSingle(),
  ]);

  const { view, decisions } = streakState({
    today,
    now: Date.now(),
    completions: (completions.data ?? []).map((r) => r.day as number),
    freezes: (freezes.data ?? []).map((r) => r.day as number),
    repairs: (repairs.data ?? []).map((r) => ({
      id: r.id as string,
      state: r.state as 'open' | 'redeemed' | 'expired',
      coversFrom: r.covers_from_day as number,
      coversTo: r.covers_to_day as number | null,
      chartsRequired: r.charts_required as number,
      chartsDone: r.charts_done as number,
      expiresAt: new Date(r.expires_at as string).getTime(),
    })),
    freezesRemaining: streak.data?.freezes_remaining ?? 2,
  });

  // Freezes are spent lazily, on the player's next visit — so a player who never comes back never
  // burns one, and there is no cron job deciding their fate while they sleep.
  await applyStreakDecisions(viewer.userId, decisions);

  return { ...view, longest: streak.data?.longest_length ?? 0 };
}

async function applyStreakDecisions(
  userId: string,
  decisions: ReturnType<typeof streakState>['decisions'],
): Promise<void> {
  const supabase = serviceClient();
  const nothing =
    decisions.spendFreezeDays.length === 0 &&
    !decisions.broke &&
    !decisions.openRepair &&
    !decisions.redeemRepairId &&
    decisions.expireRepairIds.length === 0;
  if (nothing) return;

  await supabase.rpc('apply_streak_decisions', {
    p_user: userId,
    p_decisions: decisions as unknown as Record<string, unknown>,
  });
}

/* -------------------------------------------------------------------- stats */

export interface PlayerStats {
  rounds: number;
  traded: number;
  passed: number;
  meanPercentile: number | null;
  bestPercentile: number | null;
}

export async function getPlayerStats(viewer: Viewer): Promise<PlayerStats> {
  const supabase = serviceClient();
  const owner = viewer.userId ?? viewer.sessionId;

  const { data } = await supabase
    .from('rounds')
    .select('passed, percentile')
    .eq('owner', owner)
    .eq('superseded', false)
    .not('committed_at', 'is', null);

  const rows = data ?? [];
  const scored = rows.map((r) => r.percentile as number | null).filter((p): p is number => p !== null);

  return {
    rounds: rows.length,
    traded: rows.filter((r) => !r.passed).length,
    passed: rows.filter((r) => r.passed).length,
    meanPercentile: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
    bestPercentile: scored.length ? Math.max(...scored) : null,
  };
}

/* ------------------------------------------------------------------ ratings */

export interface RatingSummary {
  rating: number | null;
  rd: number | null;
  attempts: number;
  /** §4.9: whether there is enough sample to show the number at all. */
  showable: boolean;
}

export async function getRating(viewer: Viewer, tier = 'ALL'): Promise<RatingSummary> {
  if (!viewer.userId) return { rating: null, rd: null, attempts: 0, showable: false };

  const supabase = serviceClient();
  const { data } = await supabase
    .from('player_ratings')
    .select('rating, rd, attempts')
    .eq('user_id', viewer.userId)
    .eq('tier', tier)
    .maybeSingle();

  if (!data) return { rating: null, rd: null, attempts: 0, showable: false };

  const summary = {
    rating: data.rating as number,
    rd: data.rd as number,
    attempts: data.attempts as number,
  };
  return { ...summary, showable: rankIsShowable({ ...summary, sigma: 0 }) };
}

/* -------------------------------------------------------------------- tapes */

export interface Tape {
  slug: string;
  name: string;
  blurb: string;
  tier: string;
  charts: number;
  lockedReason: string | null;
}

export async function listTapes(): Promise<Tape[]> {
  const supabase = serviceClient();
  const { data } = await supabase
    .from('tapes')
    .select('slug, name, blurb, tier, er_buckets, vol_buckets, locked_reason, sort')
    .eq('published', true)
    .order('sort');

  const tapes = data ?? [];

  // The chart count is the honest size of the tape, so it is counted rather than guessed.
  const counted = await Promise.all(
    tapes.map(async (t) => {
      let query = supabase.from('charts').select('id', { count: 'exact', head: true });
      const er = t.er_buckets as string[] | null;
      const vol = t.vol_buckets as string[] | null;
      if (er) query = query.in('regime_er_bucket', er);
      if (vol) query = query.in('regime_vol_bucket', vol);
      const { count } = await query;
      return {
        slug: t.slug as string,
        name: t.name as string,
        blurb: t.blurb as string,
        tier: t.tier as string,
        charts: count ?? 0,
        lockedReason: t.locked_reason as string | null,
      };
    }),
  );

  return counted;
}

export async function getTape(slug: string): Promise<Tape | null> {
  const tapes = await listTapes();
  return tapes.find((t) => t.slug === slug) ?? null;
}
