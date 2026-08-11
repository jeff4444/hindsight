'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '../ui';

/**
 * A submit button that knows the form is in flight.
 *
 * Every form in the auth flow is a native POST to a route handler — deliberately, because it means
 * there is no Supabase client in the browser and §12.1's guarantee is structural rather than a
 * promise. The cost is that nothing on the page knows a submission is happening: "Continue with
 * Google" sat completely inert through a round trip *and* a full OAuth redirect, which on a slow
 * connection is several seconds of a screen that looks like it ignored the click. The usual result
 * is a second click, and a second click on a magic link sends a second email.
 *
 * `useFormStatus` reads the pending state of the nearest enclosing form without turning the form
 * into a client-side submission — the POST is still a POST. This is the whole reason the hook
 * exists, and it has to be a child of the `<form>` rather than the component that renders it.
 *
 * `Button` already had `loading`; it simply had nothing to tell it.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...rest
}: {
  children: React.ReactNode;
  /** What to say while it is in flight. Falls back to the resting label. */
  pendingLabel?: string;
} & Omit<React.ComponentProps<typeof Button>, 'loading' | 'as' | 'href'>) {
  const { pending, data } = useFormStatus();

  /**
   * One form, two buttons, one of them pressed.
   *
   * The password form submits to the same handler for "Sign in" and "Create account" and tells them
   * apart with `name="intent"`. `useFormStatus` is per-form, so both buttons would spin — which
   * says the wrong thing twice, since only one of them was pressed. React 19 hands back the
   * `FormData` in flight, and a submit button's own name and value are in it only when that button
   * is the one that submitted, so this is exactly the question it can answer.
   */
  const mine =
    rest.name === undefined || data === null || data.get(rest.name) === String(rest.value);
  const busy = pending && mine;

  return (
    <Button {...rest} type="submit" loading={busy} disabled={rest.disabled || (pending && !mine)}>
      {busy ? (pendingLabel ?? children) : children}
    </Button>
  );
}
