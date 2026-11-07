'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DuelClient } from '@/lib/game/driver';
import { routes } from '@/lib/routes';
import { Button } from '../ui';
import { useToast } from '../ui/client';

/**
 * Start a duel and go to it: against a player, a link to send them; against a school, ten tapes
 * dealt at once (docs/rules.md §23.6, §23.7).
 */
export function StartDuelButton({
  school,
  label,
  variant = 'primary',
  block,
}: {
  /** A school's code, or nothing for a duel against a player. */
  school?: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  block?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      block={block}
      loading={busy}
      onClick={() => {
        setBusy(true);
        DuelClient.create(school ? { kind: 'school', school } : { kind: 'player' })
          .then((duel) => router.push(routes.duel(duel.code)))
          .catch((reason: unknown) => {
            toast(reason instanceof Error ? reason.message : 'The duel could not be started.', 'error');
            setBusy(false);
          });
      }}
    >
      {label}
    </Button>
  );
}
