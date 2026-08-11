/**
 * What went wrong signing in, as a closed vocabulary.
 *
 * Every failure used to travel as `?error=${error.message}` — the raw string Supabase handed back —
 * and the sign-in page rendered it verbatim. Two problems with that, and the smaller one is that
 * players were reading `AuthApiError: Invalid login credentials` in a product that otherwise writes
 * in sentences.
 *
 * The larger one is that the page was printing arbitrary text from the query string in its own
 * voice. React escapes it, so it is not an injection — but `/sign-in?error=Your%20account%20was%20
 * closed.%20Email%20support@…` renders as if we said it, on our own page, under our own wordmark.
 * That is a phishing surface built out of a redirect.
 *
 * So the wire carries a code from this list and nothing else. An unrecognised code — a stale link, a
 * hand-edited URL, a future handler that forgets to update this file — falls back to a message that
 * is honest about knowing nothing rather than inventing something.
 */

export type AuthErrorCode =
  | 'missing-fields'
  | 'invalid-credentials'
  | 'email-taken'
  | 'weak-password'
  | 'rate-limited'
  | 'expired-link'
  | 'no-session'
  | 'provider-failed'
  | 'unknown';

interface AuthErrorCopy {
  title: string;
  body?: string;
}

const COPY: Record<AuthErrorCode, AuthErrorCopy> = {
  'missing-fields': { title: 'Enter an email and a password.' },
  'invalid-credentials': {
    title: 'That email and password do not match.',
    body: 'If you first signed in with Google or a link, there may be no password on this account yet.',
  },
  'email-taken': {
    title: 'There is already an account with that email.',
    body: 'Sign in instead, or email yourself a link.',
  },
  'weak-password': { title: 'Use at least 8 characters.' },
  'rate-limited': {
    title: 'Too many attempts.',
    body: 'Wait a minute and try again — the limit is on the email address, not on you.',
  },
  'expired-link': {
    title: 'That link has expired.',
    body: 'Sign-in links last an hour and work once. Send a fresh one.',
  },
  'no-session': {
    title: 'The sign-in did not complete.',
    body: 'Nothing was lost — anything you played on this browser is still here. Try again.',
  },
  'provider-failed': {
    title: 'Google could not be reached.',
    body: 'Try again, or use a sign-in link instead.',
  },
  unknown: {
    title: 'That did not work.',
    body: 'Nothing was lost. Try again, or use a different sign-in method.',
  },
};

export function authError(code: string | undefined): AuthErrorCopy | null {
  if (!code) return null;
  return COPY[code as AuthErrorCode] ?? COPY.unknown;
}

/**
 * Supabase's message → our code.
 *
 * Matched on substrings because the provider does not publish stable codes for these, and a
 * mismatch is not dangerous: anything unrecognised becomes `unknown`, which says so.
 */
export function codeForAuthMessage(message: string | undefined): AuthErrorCode {
  const text = (message ?? '').toLowerCase();
  if (text.includes('invalid login') || text.includes('invalid credentials')) return 'invalid-credentials';
  if (text.includes('already registered') || text.includes('already been registered')) return 'email-taken';
  if (text.includes('password should be') || text.includes('weak password')) return 'weak-password';
  if (text.includes('rate limit') || text.includes('too many')) return 'rate-limited';
  if (text.includes('expired') || text.includes('invalid token')) return 'expired-link';
  return 'unknown';
}
