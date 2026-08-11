import { NextResponse } from 'next/server';
import { authClient } from '@/lib/supabase/auth-server';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';
import { codeForAuthMessage, type AuthErrorCode } from '@/lib/auth-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const intent = String(form.get('intent') ?? 'sign-in');
  const origin = new URL(request.url).origin;

  // A code, never a message. See `lib/auth-errors.ts`: the page used to render whatever string
  // arrived in the query, which meant a provider's internals in our voice — and any text at all in
  // our voice, to anyone who could get a player to follow a link.
  const fail = (code: AuthErrorCode) =>
    NextResponse.redirect(new URL(`/sign-in?error=${code}`, origin), { status: 303 });

  if (!email || !password) return fail('missing-fields');
  if (intent === 'sign-up' && password.length < 8) {
    return fail('weak-password');
  }

  const auth = await authClient();

  if (intent === 'sign-up') {
    const { data, error } = await auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) return fail(codeForAuthMessage(error.message));
    // Projects with email confirmation on return a user with no session; nothing to claim yet.
    if (!data.session) {
      return NextResponse.redirect(
        new URL(`/check-email?email=${encodeURIComponent(email)}`, origin),
        { status: 303 },
      );
    }
  } else {
    const { error } = await auth.signInWithPassword({ email, password });
    if (error) return fail(codeForAuthMessage(error.message));
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

  const response = NextResponse.redirect(new URL(profile ? '/home' : '/sign-in/handle', origin), { status: 303 });
  response.cookies.set(
    SESSION_COOKIE,
    row?.refused_to ? crypto.randomUUID() : sessionId,
    SESSION_COOKIE_OPTIONS,
  );
  return response;
}
