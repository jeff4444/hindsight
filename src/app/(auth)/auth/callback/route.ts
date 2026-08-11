import { NextResponse } from 'next/server';
import { codeForAuthMessage } from '@/lib/auth-errors';
import { authClient } from '@/lib/supabase/auth-server';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where every sign-in lands: OAuth, magic link and email confirmation alike.
 *
 * The interesting part is the claim. A player who has been playing anonymously arrives here with a
 * cookie full of history, and binding it to the new account is a single UPDATE — `rounds.owner` is
 * a generated column over `coalesce(user_id, session_id)`, so setting `user_id` moves the row's
 * ownership and the daily's one-attempt index follows it automatically.
 *
 * If the cookie is already owned by a *different* account, the claim is refused and the cookie is
 * rotated: two people on one browser must not inherit each other's rounds.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/home';

  const auth = await authClient();

  if (code) {
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/sign-in?error=${codeForAuthMessage(error.message)}`, url.origin));
  } else if (tokenHash && type) {
    const { error } = await auth.verifyOtp({
      type: type as 'magiclink' | 'signup' | 'email' | 'recovery',
      token_hash: tokenHash,
    });
    if (error) return NextResponse.redirect(new URL(`/sign-in?error=${codeForAuthMessage(error.message)}`, url.origin));
  } else {
    return NextResponse.redirect(new URL('/sign-in?error=expired-link', url.origin));
  }

  const { data } = await auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.redirect(new URL('/sign-in?error=no-session', url.origin));

  const sessionId = await ensureSession();
  const supabase = serviceClient();
  const { data: claim } = await supabase.rpc('claim_session', { p_session: sessionId, p_user: user.id });
  const row = Array.isArray(claim) ? claim[0] : null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle')
    .eq('user_id', user.id)
    .maybeSingle();

  // A player without a handle has not finished signing up, whatever the auth provider thinks.
  const destination = profile ? next : '/sign-in/handle';
  const response = NextResponse.redirect(new URL(destination, url.origin));

  if (row && row.refused_to) {
    // This cookie already belongs to someone else. Start this account on a clean session rather
    // than silently handing it another player's history.
    response.cookies.set(SESSION_COOKIE, crypto.randomUUID(), SESSION_COOKIE_OPTIONS);
  } else {
    response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  }
  return response;
}
