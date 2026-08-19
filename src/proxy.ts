import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Keep a signed-in session alive.
 *
 * Access tokens last an hour; refresh tokens rotate. The refresh itself is not the problem — the
 * *writing down* is. Supabase refreshes on demand inside `getUser()`, but almost every call in
 * this product happens during a Server Component render, and a Server Component cannot set a
 * cookie. `auth-server.ts` catches that failure and says so in a comment. The consequence was left
 * implicit, and it is this: the new token was thrown away every time, so the next request arrived
 * with the *old* refresh token, and once that fell outside GoTrue's reuse window the session was
 * revoked. A player signed in, browsed for an hour, and was silently signed out — a bug that never
 * reproduces in the first five minutes of testing, which is the only five minutes anyone tests
 * signing in.
 *
 * A proxy runs before the render, on a request that still owns its response headers, so this is
 * the one place in a read-mostly app where the refreshed cookie can actually be stored.
 *
 * It is deliberately not an authorisation check. Next's own guidance is that a proxy should not be
 * a session-management layer, and it isn't one here: nothing is allowed or refused by this file.
 * `currentViewer()` still calls `getUser()`, which verifies the token against Supabase, and that
 * remains the only thing any page trusts.
 *
 * The two cheap parts are worth naming, because they are what makes this affordable on every
 * request. Anonymous players carry no `sb-` cookie and return before a client is even built — and
 * anonymous play is the common case here, by design. For everyone else `getSession()` reads the
 * cookie and returns; it only reaches the network when the token is within auth-js's expiry
 * margin, which is the exact moment we want it to.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  const signedIn = request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'));
  if (!url || !key || !signedIn) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        // Onto the request as well as the response: the render that follows in this same pass
        // should see the new token, not the one we have just replaced.
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  await supabase.auth.getSession();
  return response;
}

export const config = {
  /**
   * Everything except static assets and the handlers that write session cookies themselves.
   * `/auth/callback` and `/api/auth/*` are mid-flight by definition — they are establishing the
   * session this file exists to preserve, and refreshing underneath them is at best wasted work.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|auth/callback|api/auth|.*\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};
