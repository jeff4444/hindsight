import { NextResponse } from 'next/server';
import { codeForAuthMessage, codeForProviderError } from '@/lib/auth-errors';
import { RECOVERY_NEXT, safeNext } from '@/lib/auth-redirect';
import { authClient } from '@/lib/supabase/auth-server';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The one-time token types this callback will act on.
 *
 * The type used to be cast straight out of the query string into `verifyOtp`, which meant an
 * arbitrary string reached the provider and the failure came back as a provider message rather
 * than as one of ours. It is a closed set, so it is checked against one.
 */
const OTP_TYPES = new Set(['magiclink', 'signup', 'email', 'email_change', 'recovery', 'invite']);
type OtpType = 'magiclink' | 'signup' | 'email' | 'email_change' | 'recovery' | 'invite';

/**
 * Where every sign-in lands: OAuth, magic link, recovery and email confirmation alike.
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
  const next = safeNext(url.searchParams.get('next'));

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/sign-in?error=${reason}`, url.origin));

  // A provider that refuses does not throw — it redirects back here with `error` set. Read that
  // before concluding anything from the absence of a code.
  const providerError = url.searchParams.get('error') ?? url.searchParams.get('error_code');
  if (providerError) {
    return fail(codeForProviderError(providerError, url.searchParams.get('error_description')));
  }

  const auth = await authClient();

  if (code) {
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) return fail(codeForAuthMessage(error.message));
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await auth.verifyOtp({ type: type as OtpType, token_hash: tokenHash });
    if (error) return fail(codeForAuthMessage(error.message));
  } else {
    return fail('expired-link');
  }

  const { data } = await auth.getUser();
  const user = data.user;
  if (!user) return fail('no-session');

  const sessionId = await ensureSession();
  const supabase = serviceClient();
  const { data: claim } = await supabase.rpc('claim_session', { p_session: sessionId, p_user: user.id });
  const row = Array.isArray(claim) ? claim[0] : null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('handle')
    .eq('user_id', user.id)
    .maybeSingle();

  // Recovery outranks both of the rules below: someone who followed a "set a new password" link
  // has one thing to do, and sending them to the daily with a live session and no new password is
  // the one outcome that leaves them locked out tomorrow.
  //
  // Otherwise: a player without a handle has not finished signing up, whatever the provider thinks.
  const recovering = next === RECOVERY_NEXT || type === 'recovery';
  // The handle page carries `next` on, so finishing sign-up lands where the player was heading.
  const destination = recovering
    ? RECOVERY_NEXT
    : profile
      ? next
      : `/sign-in/handle?next=${encodeURIComponent(next)}`;
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
