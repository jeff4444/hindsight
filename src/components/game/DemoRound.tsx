'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { LocalDriver } from '@/lib/game/driver';
import { Button } from '../ui';
import { RoundShell } from './RoundShell';

/**
 * Training rounds on synthetic markets, with no server and no account.
 *
 * The same round core the API runs (`src/lib/game/round-core.ts`), inside the browser: the same
 * exchange, the same best and worst, the same grade — on candles that never happened, so nothing
 * here can be looked up and nothing here is stored.
 */
export function DemoRound({ seed = 7, exit, after }: { seed?: number; exit?: ReactNode; after?: ReactNode }) {
  const driver = useMemo(() => new LocalDriver(seed), [seed]);
  const [round, setRound] = useState(0);
  const start = useMemo(() => ({ deal: true as const, round }), [round]);

  return (
    <RoundShell
      key={round}
      driver={driver}
      start={start}
      exit={exit}
      actions={() => (
        <>
          {after}
          <Button variant="primary" onClick={() => setRound((n) => n + 1)}>
            Next tape
          </Button>
        </>
      )}
    />
  );
}
