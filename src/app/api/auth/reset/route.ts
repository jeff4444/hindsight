import { NextResponse } from 'next/server';
import { codeForAuthMessage } from '@/lib/auth-errors';
import { callbackUrl, RECOVERY_NEXT } from '@/lib/auth-redirect';
import { authClient } from '@/lib/supabase/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send a "set a new password" link.
 *
 * Deliberately silent about whether the address has an account. Supabase answers the same way
 * either way, and so does this: a form that says "no account with that email" is a form that will
 * enumerate every player's address for anyone who asks it patiently enough. The only failure the
 * player is told about is the rate limit, which is about the request rather than the account.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const origin = new URL(request.url).origin;

  if (!email) {
    return NextResponse.redirect(new URL('/forgot-password?error=missing-fields', origin), {
      status: 303,
    });
  }

  const auth = await authClient();
  const { error } = await auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(origin, RECOVERY_NEXT),
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/forgot-password?error=${codeForAuthMessage(error.message)}`, origin),
      { status: 303 },
    );
  }

  return NextResponse.redirect(
    new URL(`/check-email?email=${encodeURIComponent(email)}&mode=reset`, origin),
    { status: 303 },
  );
}
