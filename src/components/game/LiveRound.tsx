'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DuelClient, RemoteDriver } from '@/lib/game/driver';
import type { RoundPlayed } from '@/lib/game/types';
import { routes } from '@/lib/routes';
import { Button } from '../ui';
import { useToast } from '../ui/client';
import { Icon } from '../ui/icons';
import { RoundShell } from './RoundShell';

/**
 * A stored round, played through the server. A fresh training round is dealt on arrival and put in
 * the address bar, so a reload comes back to the same tape rather than dealing another.
 */
export function LiveRound({ roundId }: { roundId: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const start = useMemo(() => (roundId ? { roundId } : { deal: true as const }), [roundId]);

  const onDealt = useCallback((id: string) => {
    window.history.replaceState(null, '', routes.play.round(id));
  }, []);

  const nextDuelTape = useCallback(
    (code: string) => {
      setBusy(true);
      DuelClient.play(code)
        .then(({ roundId: next }) => router.push(routes.play.round(next)))
        .catch((reason: unknown) => {
          toast(reason instanceof Error ? reason.message : 'The next tape could not be dealt.', 'error');
          router.push(routes.duel(code));
        })
        .finally(() => setBusy(false));
    },
    [router, toast],
  );

  const actions = (played: RoundPlayed) =>
    played.duel ? (
      <>
        <Button href={routes.duel(played.duel.code)} variant="secondary">
          Back to the duel
        </Button>
        {played.duel.index + 1 < played.duel.tapes && (
          <Button variant="primary" loading={busy} onClick={() => nextDuelTape(played.duel!.code)}>
            Next tape
          </Button>
        )}
      </>
    ) : (
      <>
        <Button href={routes.play.index} variant="secondary">
          Back to Play
        </Button>
        <Button href={routes.play.new} variant="primary">
          Next tape
        </Button>
      </>
    );

  return (
    <RoundShell
      driver={RemoteDriver}
      start={start}
      onDealt={roundId ? undefined : onDealt}
      actions={actions}
      exit={
        <Link
          href={routes.play.index}
          aria-label="Back to Play"
          className="text-ink-lo hover:text-ink-hi hover:bg-fill-2 grid h-9 w-9 shrink-0 place-items-center rounded-md"
        >
          <Icon name="arrow-left" size={18} />
        </Link>
      }
    />
  );
}
