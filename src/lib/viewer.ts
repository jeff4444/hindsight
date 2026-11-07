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
