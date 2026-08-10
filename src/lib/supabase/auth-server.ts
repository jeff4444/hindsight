import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * The auth client. Server-only, and deliberately crippled.
 *
 * §12.1's guarantee — the future never reaches the client before the order is committed — is
 * currently *structural* rather than a promise: the browser cannot talk to Postgres at all, so it
 * cannot read a reveal path however hard it tries. Introducing a browser-side Supabase client
 * would be the first crack in that, so there isn't one.
 *
 * Every flow the product needs (Google OAuth, magic link, email and password) runs in a route
 * handler through `createServerClient`. The key is read from `SUPABASE_PUBLISHABLE_KEY` — with no
 * `NEXT_PUBLIC_` prefix, so Next will not inline it into a bundle — and this module returns
 * `client.auth` and nothing else, so `.from()` is not reachable through it even by accident.
 *
 * What that costs: realtime, `onAuthStateChange`, and client-side token refresh. None are needed
 * before duels and racers in Phase 5, and switching then is a `GRANT`, not a rewrite.
 */
export async function authClient() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase auth is not configured. Set SUPABASE_PUBLISHABLE_KEY — see .env.local.example',
    );
  }

  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component, where the cookie store is read-only. The session is
          // still valid for this render; the next route handler writes the refreshed cookie.
        }
      },
    },
  });

  return client.auth;
}
