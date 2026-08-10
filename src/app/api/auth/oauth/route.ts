import { NextResponse } from 'next/server';
import { authClient } from '@/lib/supabase/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start an OAuth flow from the server.
 *
 * `skipBrowserRedirect` hands back the provider URL instead of navigating, so this route can 303
 * to it — which is what keeps the whole flow server-side and the publishable key out of the
 * bundle. The PKCE verifier is written to a cookie by the SSR adapter and consumed by the callback.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const provider = String(form.get('provider') ?? 'google');
  const next = String(form.get('next') ?? '/home');
  const origin = new URL(request.url).origin;

  const auth = await authClient();
  const { data, error } = await auth.signInWithOAuth({
    provider: provider as 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${encodeURIComponent(error?.message ?? 'Could not start sign-in')}`, origin),
      { status: 303 },
    );
  }
  return NextResponse.redirect(data.url, { status: 303 });
}
