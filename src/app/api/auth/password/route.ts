import { NextResponse } from 'next/server';
import { authClient } from '@/lib/supabase/auth-server';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const intent = String(form.get('intent') ?? 'sign-in');
  const origin = new URL(request.url).origin;

  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(message)}`, origin), { status: 303 });

  if (!email || !password) return fail('Enter an email and a password.');
  if (intent === 'sign-up' && password.length < 8) {
    return fail('Use at least 8 characters.');
  }

  const auth = await authClient();

  if (intent === 'sign-up') {
    const { data, error } = await auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) return fail(error.message);
    // Projects with email confirmation on return a user with no session; nothing to claim yet.
    if (!data.session) {
      return NextResponse.redirect(
        new URL(`/check-email?email=${encodeURIComponent(email)}`, origin),
        { status: 303 },
      );
    }
  } else {
    const { error } = await auth.signInWithPassword({ email, password });
    if (error) return fail(error.message);
  }

  const { data } = await auth.getUser();
  const user = data.user;
  if (!user) return fail('Could not establish a session.');

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
