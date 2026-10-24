import { redirect } from 'next/navigation';
import { Alert, Eyebrow, Field, TextLink } from '@/components/ui';
import { SubmitButton } from '@/components/auth/SubmitButton';
import { authError } from '@/lib/auth-errors';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New password' };

/**
 * Set the new password.
 *
 * Reached only with a live session, because the recovery link mints one on the way through the
 * callback — so the guard here is `userId`, not a token in the URL. Someone who opens this page
 * cold has either let the link expire or never followed one, and both of those are the same
 * sentence to them: send another.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const viewer = await currentViewer();
  if (!viewer.userId) redirect('/forgot-password?error=session-required');

  const failure = authError(error);

  return (
    <div data-stagger>
      <div style={{ '--i': 0 } as React.CSSProperties}>
        <Eyebrow>Password</Eyebrow>
        <h1 className="text-ink-max mt-2 text-2xl font-semibold">Choose a new one</h1>
        <p className="text-ink-lo mt-3 text-base leading-relaxed">
          For <span className="text-ink-hi numeral">{viewer.email}</span>. You are signed in on this
          browser already — this is so the next one works too.
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
        action="/api/auth/password/update"
        method="post"
        className="mt-7 space-y-3"
        style={{ '--i': 2 } as React.CSSProperties}
      >
        <Field
          id="new-password"
          label="New password"
          hint="At least 8 characters."
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <Field
          id="confirm-password"
          label="Again"
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <SubmitButton variant="primary" size="lg" block pendingLabel="Saving…">
          Save it
        </SubmitButton>
      </form>

      <p className="text-ink-dim mt-8 text-sm" style={{ '--i': 3 } as React.CSSProperties}>
        <TextLink href="/today">Skip for now</TextLink> — you are signed in either way, but the link
        you followed will not work twice.
      </p>
    </div>
  );
}
