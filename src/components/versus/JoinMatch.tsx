'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui';

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

  if (status === 'done') {
    return <p className="text-ink-faint mt-6 text-sm">This match is over.</p>;
  }

  // Offering "play" on a duel with no charts is offering a button whose only outcome is an error.
  // Waiting is the actual state and it is worth naming, since the whole mode is asynchronous.
  if (joined && !ready) {
    return (
      <p className="text-ink-lo mt-6 max-w-prose text-sm leading-relaxed">
        Waiting for an opponent. Send them the link — the charts are drawn the moment they take the
        seat, and you will both play the same ones.
      </p>
    );
  }

  return (
    <div className="mt-6">
      {error && <p className="text-loss-ink mb-3 max-w-prose text-sm">{error}</p>}
      {joined ? (
        <Button as="a" href={`/play?mode=${mode}&match=${id}`} variant="primary" size="lg">
          Play your next chart
        </Button>
      ) : (
        <Button onClick={() => void join()} variant="primary" size="lg" disabled={busy}>
          {busy ? 'Taking a seat…' : 'Take a seat'}
        </Button>
      )}
    </div>
  );
}
