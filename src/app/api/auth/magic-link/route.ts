import { NextResponse } from 'next/server';
import { codeForAuthMessage } from '@/lib/auth-errors';
import { authClient } from '@/lib/supabase/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const origin = new URL(request.url).origin;

  if (!email) {
    return NextResponse.redirect(new URL('/sign-in?error=missing-fields', origin), { status: 303 });
  }

  const auth = await authClient();
  const { error } = await auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${codeForAuthMessage(error.message)}`, origin),
      { status: 303 },
    );
  }
  return NextResponse.redirect(
    new URL(`/check-email?email=${encodeURIComponent(email)}`, origin),
    { status: 303 },
  );
}
