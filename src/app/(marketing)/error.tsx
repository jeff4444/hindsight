'use client';

import { useEffect } from 'react';
import { routes } from '@/lib/routes';
import { Button, EmptyState } from '@/components/ui';

/** The front door's error boundary. The game is a separate route, so it offers that as the way on. */
export default function MarketingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-5 py-24">
      <EmptyState
        icon="alert"
        title="That did not load"
        body="Something went wrong with this page. Your account is fine — you can go straight to the markets."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="secondary" size="lg" onClick={reset}>
              Try again
            </Button>
            <Button href={routes.play.index} variant="primary" size="lg">
              Go to Play
            </Button>
          </div>
        }
      />
      {error.digest && <p className="numeral text-ink-dim mt-4 text-center text-xs">reference {error.digest}</p>}
    </div>
  );
}
