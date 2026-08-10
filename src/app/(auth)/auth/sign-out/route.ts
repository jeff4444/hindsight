import { NextResponse } from 'next/server';
import { authClient } from '@/lib/supabase/auth-server';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authClient();
  await auth.signOut();

  const response = NextResponse.redirect(new URL('/', new URL(request.url).origin), { status: 303 });
  // Rotate the play session too. Otherwise the next person to sign in on a shared machine would
  // claim whatever the previous player did after signing out.
  response.cookies.set(SESSION_COOKIE, crypto.randomUUID(), SESSION_COOKIE_OPTIONS);
  return response;
}
