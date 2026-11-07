'use client';

import { useMemo, useState } from 'react';
import { LocalDriver } from '@/lib/trading/driver';
import type { SessionReview as Review } from '@/lib/trading/types';
import { Button } from '../ui';
import { TerminalShell } from './TerminalShell';
import { SessionReview } from './SessionReview';

/**
 * The terminal on a synthetic market, with no server and no account.
 *
 * It runs the same session core the API does (`src/lib/trading/session-core.ts`) inside the
 * browser, so everything here — fills, margin, the replay clock, the review and the schools' runs —
 * is the real logic on fictional candles, and says so.
 */
export function DemoTerminal({ seed = 7, exit, className }: { seed?: number; exit?: React.ReactNode; className?: string }) {
  const driver = useMemo(() => new LocalDriver(seed), [seed]);
  const [round, setRound] = useState(0);
  const [review, setReview] = useState<Review | null>(null);

  if (review) {
    return (
      <div className="bg-surface-0 text-ink min-h-dvh">
        <SessionReview
          review={review}
          actions={
            <Button
              variant="primary"
              onClick={() => {
                setReview(null);
                setRound((n) => n + 1);
              }}
            >
              Trade another market
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <TerminalShell
      key={round}
      className={className}
      driver={driver}
      exit={exit}
      start={{ request: { market: { kind: 'random' }, account: 'practice' } }}
      closedAction={(sessionId) => (
        <Button variant="primary" onClick={() => void driver.review(sessionId).then(setReview)}>
          See the review
        </Button>
      )}
    />
  );
}
