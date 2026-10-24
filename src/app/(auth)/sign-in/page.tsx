import {
  Alert,
  Disclosure,
  Divider,
  Eyebrow,
  Field,
  TextLink,
} from "@/components/ui";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { authError } from "@/lib/auth-errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

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
  const { error, next = "/today" } = await searchParams;
  const failure = authError(error);

  return (
    <div data-stagger>
      <div style={{ "--i": 0 } as React.CSSProperties}>
        <Eyebrow>Play first, sign in later</Eyebrow>
        <h1 className="font-display text-ink-max mt-2 text-4xl">
          Keep your record.
        </h1>
        <p className="text-ink-lo mt-3 text-base leading-relaxed">
          Everything you have played on this browser comes with you — scores,
          today&rsquo;s daily, all of it. Signing in adds a streak, a rating and
          tapes of your own.
        </p>
      </div>

      {failure && (
        <div style={{ "--i": 1 } as React.CSSProperties}>
          <Alert
            tone="short"
            icon="alert"
            title={failure.title}
            className="mt-5"
          >
            {failure.body}
          </Alert>
        </div>
      )}

      <form
        action="/api/auth/oauth"
        method="post"
        className="mt-7"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        <input type="hidden" name="provider" value="google" />
        <input type="hidden" name="next" value={next} />
        <SubmitButton
          variant="primary"
          size="lg"
          block
          pendingLabel="Taking you to Google…"
        >
          Continue with Google
        </SubmitButton>
      </form>

      <Divider label="or" className="my-6" />

      <form
        action="/api/auth/magic-link"
        method="post"
        className="space-y-3"
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <input type="hidden" name="next" value={next} />
        {/* Was a hand-rolled label/span/input — `Field` reimplemented eleven lines above two
            correct uses of it, and without the id and aria-describedby wiring. */}
        <Field
          id="magic-email"
          label="Email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        <SubmitButton
          variant="secondary"
          size="lg"
          block
          pendingLabel="Sending…"
        >
          Email me a link
        </SubmitButton>
      </form>

      <div style={{ "--i": 4 } as React.CSSProperties}>
        <Disclosure label="Use a password instead" className="mt-6">
          {/* Visible labels rather than placeholders. A placeholder disappears the moment you type,
            so it is the one form affordance that vanishes exactly when it is being relied on. */}
          <form
            action="/api/auth/password"
            method="post"
            className="mt-4 space-y-3"
          >
            <input type="hidden" name="next" value={next} />
            <Field
              id="pw-email"
              label="Email"
              type="email"
              name="email"
              required
              autoComplete="email"
            />
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
              <SubmitButton
                name="intent"
                value="sign-in"
                variant="secondary"
                size="lg"
                block
                pendingLabel="Signing in…"
              >
                Sign in
              </SubmitButton>
              <SubmitButton
                name="intent"
                value="sign-up"
                variant="ghost"
                size="lg"
                block
                pendingLabel="Creating…"
              >
                Create account
              </SubmitButton>
            </div>
          </form>
          <p className="text-ink-dim mt-4 text-sm">
            <TextLink href="/forgot-password">Forgotten it?</TextLink> We will email a link that
            opens straight into a new one.
          </p>
        </Disclosure>
      </div>

      <p
        className="text-ink-dim mt-10 text-sm"
        style={{ "--i": 5 } as React.CSSProperties}
      >
        <TextLink
          href={"/play/daily"}
        >
          Or just play
        </TextLink>{" "}
        — the daily and every tape are open without an account.
      </p>
    </div>
  );
}
