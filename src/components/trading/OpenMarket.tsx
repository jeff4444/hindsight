'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DriverError, RemoteDriver } from '@/lib/trading/driver';
import type { OpenRequest } from '@/lib/trading/schemas';
import { routes } from '@/lib/routes';
import { Button, EmptyState } from '../ui';

/**
 * Opens a market and goes to it. If a session is already open on the account, goes there instead
 * — one open session per account (§22.8) — rather than failing.
 */
export function OpenMarket({ request }: { request: OpenRequest }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    RemoteDriver.open(request)
      .then((open) => router.replace(routes.trade.session(open.sessionId)))
      .catch((reason: unknown) => {
        const openId = reason instanceof DriverError ? reason.detail?.openSessionId : undefined;
        if (typeof openId === 'string') {
          router.replace(routes.trade.session(openId));
          return;
        }
        setError(reason instanceof Error ? reason.message : 'The market could not be opened.');
      });
  }, [request, router]);

  return (
    <div data-theme="dark" className="bg-surface-0 text-ink grid min-h-dvh place-items-center p-6">
      {error ? (
        <EmptyState
          icon="alert"
          title="That market did not open."
          body={error}
          action={<Button href={routes.markets()}>Back to Markets</Button>}
        />
      ) : (
        <div className="text-ink-dim flex flex-col items-center gap-3 text-sm">
          <span className="bg-gold h-2 w-2 animate-pulse rounded-full" />
          Opening the market…
        </div>
      )}
    </div>
  );
}
