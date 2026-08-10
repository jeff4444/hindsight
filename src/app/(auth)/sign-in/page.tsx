import Link from 'next/link';
import { Button } from '@/components/ui';

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
        <Link href="/" className="text-ink-hi tracking-wordmark text-sm font-semibold">
          HINDSIGHT
        </Link>
      </div>

      <h1 className="text-ink-max mt-6 text-xl font-semibold" style={{ '--i': 1 } as React.CSSProperties}>
        Keep your record
      </h1>
      <p className="text-ink-lo mt-2 text-sm leading-relaxed" style={{ '--i': 2 } as React.CSSProperties}>
        Anything you have already played on this browser is bound to your account when you sign in —
        rounds, percentiles and today&rsquo;s daily included. Nothing is lost and nothing is replayed.
      </p>

      {error && (
        <div
          className="border-short-line bg-short-bg text-short-ink mt-4 rounded-md border p-3 text-xs"
          style={{ '--i': 3 } as React.CSSProperties}
          role="alert"
        >
          {error}
        </div>
      )}

      <form action="/api/auth/oauth" method="post" className="mt-6" style={{ '--i': 4 } as React.CSSProperties}>
        <input type="hidden" name="provider" value="google" />
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="primary" size="lg" block>
          Continue with Google
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3" style={{ '--i': 5 } as React.CSSProperties}>
        <span className="bg-line h-px flex-1" />
        <span className="text-ink-faint text-micro">or</span>
        <span className="bg-line h-px flex-1" />
      </div>

      <form action="/api/auth/magic-link" method="post" className="space-y-2" style={{ '--i': 6 } as React.CSSProperties}>
        <label className="block">
          <span className="text-ink-lo text-xs font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="border-line bg-surface-1 text-ink placeholder:text-ink-faint mt-1 h-11 w-full rounded-md border px-3 text-sm"
          />
        </label>
        <Button type="submit" variant="secondary" size="lg" block>
          Email me a link
        </Button>
      </form>

      <details className="mt-5" style={{ '--i': 7 } as React.CSSProperties}>
        <summary className="text-ink-dim hover:text-ink-lo cursor-pointer text-xs">
          Use a password instead
        </summary>
        <form action="/api/auth/password" method="post" className="mt-3 space-y-2">
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="Email"
            className="border-line bg-surface-1 text-ink placeholder:text-ink-faint h-11 w-full rounded-md border px-3 text-sm"
          />
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="current-password"
            placeholder="Password — at least 8 characters"
            className="border-line bg-surface-1 text-ink placeholder:text-ink-faint h-11 w-full rounded-md border px-3 text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" name="intent" value="sign-in" variant="secondary" block>
              Sign in
            </Button>
            <Button type="submit" name="intent" value="sign-up" variant="ghost" block>
              Create account
            </Button>
          </div>
        </form>
      </details>

      <p className="text-ink-faint mt-8 text-xs">
        <Link href="/play" className="underline underline-offset-4">
          Or just play
        </Link>{' '}
        — the daily and every tape are open without an account.
      </p>
    </div>
  );
}
