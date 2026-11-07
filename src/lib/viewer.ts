import 'server-only';
import { cache } from 'react';
import { serviceClient } from './supabase/server';
import { authClient } from './supabase/auth-server';
import { ensureSession } from './session';
import { isAccent, type Accent } from './avatar';

/**
 * Who is looking at the page.
 *
 * A viewer is always present — trading without an account is a first-class state, not a degraded
 * one. What an account adds is durability: a handle, a signature, and a balance that survives
 * clearing a cookie. The terminal is identical either way, which is what makes "trade first, sign
 * in later" honest rather than a funnel trick.
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

/**
 * Deduplicated per request.
 *
 * This does an auth round trip, a `play_sessions` lookup, sometimes a `claim_session` RPC, and a
 * profile select — and it is called from the layout, the page, and now from each streamed section
 * of a page independently. `cache()` is scoped to a single server request, so every caller in one
 * render shares one answer and the work happens once. Without it, splitting `/home` into four
 * Suspense boundaries would have quadrupled the identity lookup to buy a faster paint.
 */
export const currentViewer = cache(async function currentViewer(): Promise<Viewer> {
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
    // The game's rounds and duel seats (docs/rules.md §23) are adopted the same way.
    await supabase.rpc('game_claim_session', { p_session: sessionId, p_user: userId });
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
});


/* ---------------------------------------------------------------- scenarios */

/**
 * An official tape, which Markets now calls a scenario: a published filter over the library that
 * picks markets by what they were doing. Creator tapes and the tier lock belonged to the game and
 * are not listed.
 */
export interface Tape {
  slug: string;
  name: string;
  blurb: string;
  /** How many real markets the filter admits. */
  charts: number;
  filter: StoredTapeFilter;
}

/** A tape's filter as the database hands it back: three text[] columns and three scalars. */
export interface StoredTapeFilter {
  er: string[];
  vol: string[];
  themes: string[];
  driftBelow: number | null;
  driftAbove: number | null;
  councilSplit: boolean;
}

/** The filter columns as the UI wants them. One reader, so the three call sites cannot disagree. */
function filterOf(row: Record<string, unknown>): StoredTapeFilter {
  return {
    er: (row.er_buckets as string[] | null) ?? [],
    vol: (row.vol_buckets as string[] | null) ?? [],
    themes: (row.themes as string[] | null) ?? [],
    driftBelow: (row.drift_below as number | null) ?? null,
    driftAbove: (row.drift_above as number | null) ?? null,
    councilSplit: Boolean(row.council_split),
  };
}

export async function listTapes(): Promise<Tape[]> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('tapes')
    .select(
      'slug, name, blurb, er_buckets, vol_buckets, themes, drift_below, drift_above, council_split, sort',
    )
    .eq('published', true)
    // A locked tape's rule reads the outcome; it is never dealt, so it is not offered.
    .is('locked_reason', null)
    .order('sort');

  // A failed query used to fall through `data ?? []` and render as *an empty library* — a page
  // saying there is nothing to trade, which is indistinguishable from the truth and looks like a
  // product decision rather than a broken deploy. Adding one column to the select was enough to
  // trigger it. Fail loudly instead: an error page is a bug report, an empty page is not.
  if (error) throw new Error(`could not list tapes: ${error.message}`);

  const tapes = data ?? [];

  // The chart count is the honest size of the scenario, so it is counted rather than guessed — a
  // scenario that advertises markets it cannot deal is the failure this exists to prevent.
  const counted = await Promise.all(
    tapes.map(async (t) => {
      return {
        charts: await countTapeCharts(supabase, t),
        slug: t.slug as string,
        name: t.name as string,
        blurb: t.blurb as string,
        filter: filterOf(t),
      };
    }),
  );

  return counted;
}

/**
 * The honest size of a scenario, counted with the predicates `trade_open_session` applies — real
 * charts only, since a synthetic one is never dealt as a market.
 */
async function countTapeCharts(
  supabase: ReturnType<typeof serviceClient>,
  row: Record<string, unknown>,
): Promise<number> {
  let query = supabase.from('charts').select('id', { count: 'exact', head: true }).eq('synthetic', false);
  const er = row.er_buckets as string[] | null;
  const vol = row.vol_buckets as string[] | null;
  const themes = row.themes as string[] | null;
  const below = row.drift_below as number | null;
  const above = row.drift_above as number | null;
  if (er) query = query.in('regime_er_bucket', er);
  if (vol) query = query.in('regime_vol_bucket', vol);
  // `overlaps`, matching the `&&` the issuance function runs: a chart qualifies if it carries *any*
  // of the tape's themes.
  if (themes) query = query.overlaps('themes', themes);
  // Drift was measured on the stored bars, so a mirrored chart's sign is flipped back first, as the
  // RPC does: the real drift is at most `below` when the stored one is at least `-below`.
  if (below !== null && below !== undefined) {
    query = query.or(`and(mirrored.eq.false,lead_in_drift_atr.lte.${below}),and(mirrored.eq.true,lead_in_drift_atr.gte.${-below})`);
  }
  if (above !== null && above !== undefined) {
    query = query.or(`and(mirrored.eq.false,lead_in_drift_atr.gte.${above}),and(mirrored.eq.true,lead_in_drift_atr.lte.${-above})`);
  }
  if (row.council_split) query = query.gt('council_minority', 0);
  const { count } = await query;
  return count ?? 0;
}
