'use client';

import { useEffect } from 'react';
import { Button, EmptyState } from '@/components/ui';

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-5 py-24">
      <EmptyState
        icon="alert"
        title="That did not load"
        body="Something went wrong. The game itself is fine — you can go straight to it."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" size="lg" onClick={reset}>
              Try again
            </Button>
            <Button as="a" href="/play/daily" variant="secondary" size="lg">
              Play today
            </Button>
          </div>
        }
      />
    </div>
  );
}
