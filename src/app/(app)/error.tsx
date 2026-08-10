'use client';

import { useEffect } from 'react';
import { Button, EmptyState } from '@/components/ui';

/**
 * The app-side error boundary.
 *
 * Every inner route talks to Supabase, and until now a failed query produced the Next.js default
 * error screen in development and a blank one in production. `reset()` re-runs the segment, which
 * is genuinely the right first move here: almost everything that throws on these routes is a
 * transient network or connection-pool problem rather than a broken page.
 *
 * The copy avoids apologising twice and avoids blaming the player.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon="alert"
        title="That did not load"
        body="Something went wrong fetching this page. It is usually temporary."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" size="lg" onClick={reset}>
              Try again
            </Button>
            <Button as="a" href="/home" variant="secondary" size="lg">
              Back to today
            </Button>
          </div>
        }
      />
      {error.digest && (
        <p className="text-ink-faint mt-4 text-center font-mono text-xs">reference {error.digest}</p>
      )}
    </div>
  );
}
