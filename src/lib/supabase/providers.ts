import 'server-only';

/**
 * Which social providers the project will actually accept.
 *
 * `signInWithOAuth` never fails for a provider that is switched off, because it does not ask
 * anyone: with `skipBrowserRedirect` it only *builds* the authorize URL and hands it back. The
 * refusal happens one redirect later, at the provider endpoint, and it arrives as
 * `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not
 * enabled"}` rendered as raw JSON on a domain that is not ours. A player who presses "Continue
 * with Google" on a project where Google was never configured sees exactly that, and there is no
 * route back.
 *
 * So the button asks first. `/auth/v1/settings` is the endpoint that answers, it is cheap, and the
 * answer changes about once in the life of a project — hence the cache. When the check itself
 * fails we return `null` and the caller goes ahead anyway: an unreachable settings endpoint is not
 * evidence that the provider is broken, and refusing to try would turn a blip into an outage.
 */

interface AuthSettings {
  external?: Record<string, boolean>;
}

const TTL_MS = 5 * 60 * 1000;
let cached: { at: number; settings: AuthSettings } | null = null;

async function settings(): Promise<AuthSettings | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;

  if (cached && Date.now() - cached.at < TTL_MS) return cached.settings;

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as AuthSettings;
    cached = { at: Date.now(), settings: body };
    return body;
  } catch {
    return null;
  }
}

/** `true`, `false`, or `null` when the project could not be asked. */
export async function providerEnabled(provider: string): Promise<boolean | null> {
  const body = await settings();
  if (!body?.external) return null;
  return body.external[provider] === true;
}
