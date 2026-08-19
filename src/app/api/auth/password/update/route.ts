import { NextResponse } from 'next/server';
import { codeForAuthMessage, type AuthErrorCode } from '@/lib/auth-errors';
import { authClient } from '@/lib/supabase/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Set a new password on the session the recovery link just opened.
 *
 * The session is the authorisation. A recovery link mints one exactly like a magic link does, so
 * there is no token to pass around here and nothing to verify a second time — but it does mean the
 * check that matters is that a session exists at all, because without one this route would happily
 * be a way to change a password from a cold POST.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  const origin = new URL(request.url).origin;

  const fail = (code: AuthErrorCode) =>
    NextResponse.redirect(new URL(`/reset-password?error=${code}`, origin), { status: 303 });

  if (!password) return fail('missing-fields');
  if (password.length < 8) return fail('weak-password');
  if (password !== confirm) return fail('password-mismatch');

  const auth = await authClient();
  const { data } = await auth.getUser();
  if (!data.user) return fail('session-required');

  const { error } = await auth.updateUser({ password });
  if (error) return fail(codeForAuthMessage(error.message));

  return NextResponse.redirect(new URL('/settings?password=set', origin), { status: 303 });
}
