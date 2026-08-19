# Authentication

Three ways in — Google, a sign-in link, or a password — all landing on the same callback, and all
running server-side. There is no Supabase client in the browser, which is what keeps §12.1's
guarantee (the future never reaches the client) structural rather than a promise: the browser
cannot talk to Postgres at all, so it cannot read a reveal path however hard it tries.

## The shape of it

| Path | What it does |
| --- | --- |
| `POST /api/auth/oauth` | Builds the provider URL server-side and 303s to it. Checks the provider is actually enabled first. |
| `POST /api/auth/magic-link` | Sends a sign-in link. |
| `POST /api/auth/password` | Sign in or sign up with a password. |
| `POST /api/auth/reset` | Sends a "set a new password" link. Silent about whether the account exists. |
| `POST /api/auth/password/update` | Sets the new password on the session the recovery link opened. |
| `GET /auth/callback` | Where all four land: exchanges the code, claims the anonymous session, routes onward. |
| `POST /auth/sign-out` | Ends the session and rotates the play cookie. |
| `src/proxy.ts` | Refreshes the session cookie. Not an authorisation check — see below. |

Two rules the callback enforces that are easy to miss:

- **The claim.** An anonymous player arrives with a cookie full of history, and binding it to the
  new account is a single UPDATE — `rounds.owner` is generated over `coalesce(user_id, session_id)`.
  If the cookie already belongs to a *different* account the claim is refused and the cookie is
  rotated, so two people on one browser cannot inherit each other's rounds.
- **A handle is part of signing up.** No profile means `/sign-in/handle`, whatever the provider
  thinks. Recovery outranks both: a player following a password link goes to `/reset-password` even
  if that means finishing the handle later.

## Where authorisation actually happens

`currentViewer()` calls `getUser()`, which verifies the token against Supabase. That is the only
thing any page trusts. `src/proxy.ts` deliberately allows and refuses nothing — it exists because a
Server Component cannot write a cookie, so a refreshed token was being computed and thrown away on
every render until the refresh token fell outside GoTrue's reuse window and the session was
revoked. The symptom was being signed out about an hour after signing in.

## Turning Google on

Google is a project setting, not code. Until it is configured, `/api/auth/oauth` detects it and
says so on our own page rather than sending the player to a raw JSON error on Supabase's domain.

1. **Google Cloud Console** → APIs & Services → Credentials → *Create OAuth client ID* → Web
   application.
   - Authorised JavaScript origins: `http://localhost:3000`, plus the deployed origin.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` — Google
     redirects to *Supabase*, not to us. This is the step most often got wrong.
2. **Supabase dashboard** → Authentication → Sign In / Providers → Google → enable, and paste the
   client ID and secret.
3. **Supabase dashboard** → Authentication → URL Configuration.
   - Site URL: the deployed origin.
   - Redirect URLs: `http://localhost:3000/**` and `https://<deployed-origin>/**`. Every link this
     product sends — OAuth, magic link, recovery — comes back through `/auth/callback`, and an
     origin missing from this list fails at the last step with a link that looks fine.

Verify without a browser:

```bash
curl -s "https://<project-ref>.supabase.co/auth/v1/authorize?provider=google" | head -c 200
```

A 400 reading `Unsupported provider: provider is not enabled` means step 2 has not taken effect. A
302 to `accounts.google.com` means it has.

## What is deliberately not here

- **Account deletion.** It is a product question before it is a code one: rounds carry percentiles
  that other players' cohorts were scored against, so a delete is either a tombstone or a
  recalculation, and the scope does not yet say which.
- **Email change.** Same callback would serve it (`type=email_change` is already accepted); there is
  no UI for it yet.
- **A browser-side Supabase client.** See the top of this file, and `lib/supabase/auth-server.ts`.
