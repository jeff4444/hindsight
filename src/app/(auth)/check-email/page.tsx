import { Button, Eyebrow, IconBadge } from '@/components/ui';
import { SubmitButton } from '@/components/auth/SubmitButton';

/**
 * The link has been sent.
 *
 * The one screen in the flow where the player can do nothing but wait, which makes the two things
 * it owes them precise: what address it went to, and a way to send another. It had the first.
 *
 * "Nothing arrived?" followed by a link back to an empty sign-in form is not a resend — it is the
 * same form again, and the address has to be retyped. The address is right there in the query
 * string, so the resend is a one-field form that posts it back.
 *
 * `mode` decides which link was sent, and so which handler a resend belongs to. Without it the
 * resend button on a password recovery would have quietly sent a *sign-in* link instead — which
 * works, in the sense that it signs them in, and then strands them on a page that still wants a
 * password they still do not have.
 */
export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; mode?: string }>;
}) {
  const { email, mode } = await searchParams;
  const reset = mode === 'reset';

  return (
    <div className="animate-rise">
      <IconBadge icon="check" tone="info" />
      <Eyebrow className="mt-5">Check your inbox</Eyebrow>
      <h1 className="text-ink-max mt-2 text-2xl font-semibold">
        {reset ? 'A password link is on its way' : 'A link is on its way'}
      </h1>
      <p className="text-ink-lo mt-3 text-base leading-relaxed">
        {email ? (
          <>
            Sent to <span className="text-ink-hi numeral">{email}</span>.
          </>
        ) : (
          'It is on its way.'
        )}{' '}
        {reset
          ? 'Open it on this device. If there is no account on that address, no email was sent — and we will not say which.'
          : 'Open it on this device, so the round history on this browser is the one that gets claimed.'}
      </p>
      <p className="text-ink-dim mt-6 text-sm leading-relaxed">
        Nothing arrived? It can take a minute, and it sometimes lands in spam. Links last an hour
        and work once.
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-2">
        {email && (
          <form action={reset ? '/api/auth/reset' : '/api/auth/magic-link'} method="post">
            <input type="hidden" name="email" value={email} />
            <SubmitButton variant="secondary" size="lg" pendingLabel="Sending…">
              Send another
            </SubmitButton>
          </form>
        )}
        <Button as="a" href={reset ? '/forgot-password' : '/sign-in'} variant="ghost" size="lg">
          Use a different address
        </Button>
        <Button as="a" href="/play/daily" variant="ghost" size="lg">
          Keep playing
        </Button>
      </div>
    </div>
  );
}
