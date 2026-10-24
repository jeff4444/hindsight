import { describe, expect, it } from 'vitest';
import { DEFAULT_NEXT, RECOVERY_NEXT, callbackUrl, safeNext } from '@/lib/auth-redirect';
import { authError, codeForAuthMessage, codeForProviderError } from '@/lib/auth-errors';

describe('a sign-in cannot be redirected off-origin', () => {
  // The dangerous shape is not "an odd URL" — it is a *working* sign-in that ends somewhere else.
  // By the time the callback reads `next` the session cookie is already written, so a redirect it
  // honours hands an authenticated player to whoever wrote the link.
  it('keeps an ordinary path', () => {
    expect(safeNext('/tapes/abc')).toBe('/tapes/abc');
    expect(safeNext('/play?tape=abc#top')).toBe('/play?tape=abc#top');
  });

  it('refuses an absolute URL, whatever the scheme', () => {
    expect(safeNext('https://evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNext('http://evil.example/home')).toBe(DEFAULT_NEXT);
    expect(safeNext('javascript:alert(1)')).toBe(DEFAULT_NEXT);
    expect(safeNext('data:text/html,<script>')).toBe(DEFAULT_NEXT);
  });

  it('refuses the protocol-relative form, which starts with a slash and still leaves', () => {
    expect(safeNext('//evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNext('//evil.example/home')).toBe(DEFAULT_NEXT);
  });

  it('refuses backslashes, which several parsers read as slashes', () => {
    expect(safeNext('/\\evil.example')).toBe(DEFAULT_NEXT);
    expect(safeNext('\\evil.example')).toBe(DEFAULT_NEXT);
  });

  it('refuses a userinfo trick that hides the real host', () => {
    expect(safeNext('//hindsight.invalid@evil.example')).toBe(DEFAULT_NEXT);
  });

  it('falls back rather than throwing on nothing, which is the common case', () => {
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
    expect(safeNext(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNext('')).toBe(DEFAULT_NEXT);
    expect(safeNext('home')).toBe(DEFAULT_NEXT);
  });

  it('honours a caller that wants somewhere other than the daily', () => {
    expect(safeNext(null, RECOVERY_NEXT)).toBe(RECOVERY_NEXT);
  });

  it('builds a callback URL whose next is validated on the way out too', () => {
    expect(callbackUrl('https://hindsight.app', '/versus/9')).toBe(
      'https://hindsight.app/auth/callback?next=%2Fversus%2F9',
    );
    expect(callbackUrl('https://hindsight.app', 'https://evil.example')).toBe(
      'https://hindsight.app/auth/callback?next=%2Ftoday',
    );
  });
});

describe('a failure is told in our own voice', () => {
  // The whole point of the closed vocabulary: whatever arrives in `?error=`, the page renders one
  // of ours. Anything else is a phishing surface built out of a redirect.
  it('renders an unknown code as an admission rather than an invention', () => {
    const copy = authError('Your account was closed. Email support@evil.example');
    expect(copy?.title).toBe('That did not work.');
  });

  it('has copy for every code a handler can send', () => {
    for (const code of [
      'missing-fields',
      'invalid-credentials',
      'email-taken',
      'weak-password',
      'rate-limited',
      'expired-link',
      'no-session',
      'provider-failed',
      'provider-disabled',
      'access-denied',
      'session-required',
      'password-mismatch',
    ]) {
      expect(authError(code)?.title, code).not.toBe('That did not work.');
    }
  });

  it('says nothing at all when nothing went wrong', () => {
    expect(authError(undefined)).toBeNull();
    expect(authError('')).toBeNull();
  });
});

describe('a provider that refuses is read correctly', () => {
  // This is the case that sent the user to a raw JSON page: Google was never enabled on the
  // project, so `signInWithOAuth` built a URL to an endpoint that answers 400.
  it('recognises a provider that is switched off', () => {
    expect(codeForAuthMessage('Unsupported provider: provider is not enabled')).toBe(
      'provider-disabled',
    );
    expect(codeForProviderError('validation_failed', 'Unsupported provider: provider is not enabled')).toBe(
      'provider-disabled',
    );
  });

  it('does not blame an expired link for a player pressing Cancel', () => {
    expect(codeForProviderError('access_denied', 'The user denied the request')).toBe('access-denied');
  });

  it('treats a provider outage as an outage', () => {
    expect(codeForProviderError('server_error', 'upstream is unavailable')).toBe('provider-failed');
    expect(codeForProviderError('temporarily_unavailable', null)).toBe('provider-failed');
  });

  it('still maps the credential failures it always did', () => {
    expect(codeForAuthMessage('Invalid login credentials')).toBe('invalid-credentials');
    expect(codeForAuthMessage('User already registered')).toBe('email-taken');
    expect(codeForAuthMessage('Email rate limit exceeded')).toBe('rate-limited');
    expect(codeForAuthMessage(undefined)).toBe('unknown');
  });
});
