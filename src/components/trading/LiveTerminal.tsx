'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RemoteDriver } from '@/lib/trading/driver';
import { routes } from '@/lib/routes';
import { Button } from '../ui';
import { Icon } from '../ui/icons';
import { TerminalShell } from './TerminalShell';

/** The terminal on a real session: every request goes to the server, which holds the clock and the log. */
export function LiveTerminal({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  return (
    <TerminalShell
      driver={RemoteDriver}
      start={{ sessionId }}
      exit={
        <Link
          href={routes.markets()}
          aria-label="Back to Markets"
          className="text-ink-lo hover:text-ink-hi hover:bg-fill-2 grid h-9 w-9 shrink-0 place-items-center rounded-md"
        >
          <Icon name="arrow-left" size={18} />
        </Link>
      }
      onClosed={() => router.refresh()}
      closedAction={(id) => (
        <>
          <Button variant="primary" href={routes.trade.review(id)}>
            See the review
          </Button>
          <Button variant="ghost" href={routes.markets()}>
            Markets
          </Button>
        </>
      )}
    />
  );
}
