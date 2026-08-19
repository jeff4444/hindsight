import { Alert, Eyebrow, Field, TextLink } from '@/components/ui';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { authError } from '@/lib/auth-errors';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Forgot password' };

/**
 * Ask for a new password link.
 *
 * The page does not promise that an account exists — see `api/auth/reset`, which answers the same
 * way whether it does or not — so the copy here is careful to describe what was *sent*, not what
 * was *found*.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const failure = authError(error);

  return (
    <div data-stagger>
      <div style={{ '--i': 0 } as React.CSSProperties}>
        <Eyebrow>Password</Eyebrow>
        <h1 className="text-ink-max mt-2 text-2xl font-semibold">Set a new one</h1>
        <p className="text-ink-lo mt-3 text-base leading-relaxed">
          Tell us the address on the account and we will email a link that opens straight into a
          new password. Nothing changes until you set one.
        </p>
      </div>

      {failure && (
        <div style={{ '--i': 1 } as React.CSSProperties}>
          <Alert tone="short" icon="alert" title={failure.title} className="mt-5">
            {failure.body}
          </Alert>
        </div>
      )}

      <form
        action="/api/auth/reset"
        method="post"
        className="mt-7 space-y-3"
        style={{ '--i': 2 } as React.CSSProperties}
      >
        <Field
          id="reset-email"
          label="Email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        <SubmitButton variant="primary" size="lg" block pendingLabel="Sending…">
          Email me a link
        </SubmitButton>
      </form>

      <p className="text-ink-dim mt-8 text-sm" style={{ '--i': 3 } as React.CSSProperties}>
        <TextLink href="/sign-in">Back to sign in</TextLink> — a sign-in link works too, and needs
        no password at all.
      </p>
    </div>
  );
}
