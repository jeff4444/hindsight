import { NextResponse } from 'next/server';
import { callbackUrl, safeNext } from '@/lib/auth-redirect';
import { authClient } from '@/lib/supabase/auth-server';
import { providerEnabled } from '@/lib/supabase/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The providers this product offers. A hand-made POST cannot widen it. */
const PROVIDERS = new Set(['google']);

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
  const next = safeNext(String(form.get('next') ?? ''));
  const origin = new URL(request.url).origin;

  const fail = (code: string) =>
    NextResponse.redirect(new URL(`/sign-in?error=${code}`, origin), { status: 303 });

  if (!PROVIDERS.has(provider)) return fail('provider-failed');

  // Ask before sending them away. See `providers.ts`: a provider that is switched off refuses at
  // its own endpoint, in JSON, on someone else's domain — so the only place this can be turned
  // into a sentence is here, before the redirect.
  if ((await providerEnabled(provider)) === false) return fail('provider-disabled');

  const auth = await authClient();
  const { data, error } = await auth.signInWithOAuth({
    provider: provider as 'google',
    options: {
      redirectTo: callbackUrl(origin, next),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) return fail('provider-failed');

  return NextResponse.redirect(data.url, { status: 303 });
}
