/**
 * Where a sign-in is allowed to land.
 *
 * Every auth entry point carries a `next` — the page the player was heading for before they were
 * asked who they were — and it travels through the query string, which means it is attacker-typed
 * text by the time the callback reads it. `new URL(next, origin)` does not defend that: an
 * absolute `https://evil.example` ignores the base entirely, and so does a protocol-relative
 * `//evil.example`. The result is a redirect off-origin that happens *after* the session cookie
 * has been written — the victim is signed in, and then handed to whoever wrote the link, which is
 * the shape of a credible phishing page.
 *
 * So `next` is validated as a path rather than trusted as a URL. Anything that resolves to another
 * origin, and anything that is not a plain absolute path, falls back rather than failing: a bad
 * `next` is far more often a stale bookmark than an attack, and the player still wants to arrive
 * somewhere.
 */

/** Parsed against a base that cannot be reached, so escaping it is detectable and harmless. */
const BASE = 'https://hindsight.invalid';

export const DEFAULT_NEXT = '/today';

/** Where a password recovery has to land, whatever else the link asked for. */
export const RECOVERY_NEXT = '/reset-password';

export function safeNext(value: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!value || !value.startsWith('/')) return fallback;

  // A backslash never appears in a path this product generates, and it is the character the
  // parsers disagree about: `/\evil.example` is another origin to WHATWG and a path to some
  // proxies. Refusing it outright is cheaper than being sure which one every consumer downstream
  // agrees with.
  if (value.includes('\\')) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(value, BASE);
  } catch {
    return fallback;
  }

  // `//evil.example` and `/\evil.example` both start with a slash and both parse to another
  // origin — which is exactly the check, rather than a list of prefixes to keep up with.
  if (parsed.origin !== BASE) return fallback;

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * The absolute URL a provider should send the player back to.
 *
 * Kept here so the `next` that goes out in `redirectTo` is the same shape as the `next` the
 * callback will accept coming back.
 */
export function callbackUrl(origin: string, next: string | null | undefined): string {
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
}
