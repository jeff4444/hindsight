import Link from 'next/link';
import { Button, Divider, Eyebrow, Field, INPUT_CLASS } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Sign in and sign up on one screen.
 *
 * Two screens would be a lie about the shape of the thing: with OAuth and magic links there is no
 * meaningful difference between the two, and asking someone to pick before they have typed
 * anything is a decision that buys them nothing. Password is offered last because it is the only
 * option that creates something to forget.
 *
 * Everything posts to a route handler — there is no Supabase client in the browser, which is what
 * keeps §12.1's guarantee structural rather than a promise.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next = '/home' } = await searchParams;

  return (
    <div data-stagger>
      <div style={{ '--i': 0 } as React.CSSProperties}>
        <Eyebrow>Play first, claim later</Eyebrow>
        <h1 className="text-ink-max mt-2 text-2xl font-semibold">Keep your record</h1>
        <p className="text-ink-lo mt-3 text-base leading-relaxed">
          Anything you have already played on this browser is bound to your account when you sign
          in — rounds, percentiles and today&rsquo;s daily included. Nothing is lost and nothing is
          replayed.
        </p>
      </div>

      {error && (
        <div
          className="border-short-line bg-short-bg text-short-ink mt-5 rounded-lg border p-3.5 text-sm"
          style={{ '--i': 1 } as React.CSSProperties}
          role="alert"
        >
          {error}
        </div>
      )}

      <form action="/api/auth/oauth" method="post" className="mt-7" style={{ '--i': 2 } as React.CSSProperties}>
        <input type="hidden" name="provider" value="google" />
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="primary" size="lg" block>
          Continue with Google
        </Button>
      </form>

      <Divider label="or" className="my-6" />

      <form action="/api/auth/magic-link" method="post" className="space-y-3" style={{ '--i': 3 } as React.CSSProperties}>
        <label className="block">
          <span className="text-ink-lo mb-1.5 block text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className={INPUT_CLASS}
          />
        </label>
        <Button type="submit" variant="secondary" size="lg" block>
          Email me a link
        </Button>
      </form>

      <details className="group mt-6" style={{ '--i': 4 } as React.CSSProperties}>
        <summary className="text-ink-dim hover:text-ink-hi hover:bg-fill-1 press inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors">
          Use a password instead
        </summary>
        {/* Visible labels rather than placeholders. A placeholder disappears the moment you type,
            so it is the one form affordance that vanishes exactly when it is being relied on. */}
        <form action="/api/auth/password" method="post" className="mt-4 space-y-3">
          <Field id="pw-email" label="Email" type="email" name="email" required autoComplete="email" />
          <Field
            id="pw-password"
            label="Password"
            hint="At least 8 characters."
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="current-password"
          />
          <div className="flex gap-2">
            <Button type="submit" name="intent" value="sign-in" variant="secondary" size="lg" block>
              Sign in
            </Button>
            <Button type="submit" name="intent" value="sign-up" variant="ghost" size="lg" block>
              Create account
            </Button>
          </div>
        </form>
      </details>

      <p className="text-ink-dim mt-10 text-sm" style={{ '--i': 5 } as React.CSSProperties}>
        <Link href={`/play${next && next !== '/home' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-ink-lo hover:text-ink-hi underline underline-offset-4 transition-colors">
          Or just play
        </Link>{' '}
        — the daily and every tape are open without an account.
      </p>
    </div>
  );
}
