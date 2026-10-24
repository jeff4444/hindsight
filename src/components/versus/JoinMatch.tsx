'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui';
import { useToast } from '../ui/client';
import { Icon } from '../ui/icons';

/**
 * Take the seat, then play.
 *
 * Joining a duel is what draws its charts, so the failure worth handling is the one where it cannot:
 * between them the two players may have played too much of the tape for a fair sequence to exist. The
 * server refuses rather than shortening the duel or reusing a chart one of them has seen, and this
 * shows what it said.
 */
export function JoinMatch({
  id,
  mode,
  joined,
  status,
  ready,
}: {
  id: string;
  mode: 'duel' | 'race';
  joined: boolean;
  status: string;
  /** Whether the sequence exists. A duel opened and unanswered has no charts to offer. */
  ready: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/match/${id}/join`, { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? 'Could not join.');
      return;
    }
    router.refresh();
  }

  const copy = async () => {
    try {
      const link = window.location.href;
      if (navigator.share) await navigator.share({ text: 'Duel me on Hindsight', url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('Link copied', 'success');
      }
    } catch {
      // Dismissed.
    }
  };

  if (status === 'done') {
    return <p className="text-ink-dim mt-6 text-sm">This match is over.</p>;
  }

  // Offering "play" on a duel with no charts is offering a button whose only outcome is an error.
  // Waiting is the actual state and it is worth naming, since the whole mode is asynchronous.
  if (joined && !ready) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={() => void copy()} variant="primary" size="lg">
          <Icon name="share" size={15} />
          Send the link
        </Button>
        <p className="text-ink-lo max-w-sm text-sm leading-relaxed">
          Waiting for an opponent. The charts are drawn the moment they take the seat.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {error && <p className="text-loss-ink mb-3 max-w-prose text-sm">{error}</p>}
      {joined ? (
        <Button href={`/play/${mode}/${id}`} variant="primary" size="lg">
          <Icon name="play" size={15} />
          Play your next chart
        </Button>
      ) : (
        <Button onClick={() => void join()} variant="primary" size="lg" loading={busy}>
          {mode === 'duel' ? 'Accept the duel' : 'Join the race'}
        </Button>
      )}
    </div>
  );
}
