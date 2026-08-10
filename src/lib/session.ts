import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';

/**
 * The anonymous play session.
 *
 * Scope §14 puts accounts out of scope for Phase 0, but rounds still have to be issued and
 * committed against something, and a round that anyone can commit is a round anyone can
 * replay. This cookie is that something. It is not a user, it grants nothing, and it will be
 * replaced by real authentication when the ladder needs one.
 */
export const SESSION_COOKIE = 'hs_session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The current session id, or null if the caller has never been issued a round. */
export async function readSession(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value && UUID.test(value) ? value : null;
}

/** The current session id, minting one if there is none. */
export async function ensureSession(): Promise<string> {
  return (await readSession()) ?? randomUUID();
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
} as const;
