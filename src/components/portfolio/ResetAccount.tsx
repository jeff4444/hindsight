'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui';
import { Dialog, useToast } from '../ui/client';

/** Start an account again from $100,000. The old one is archived, not edited. */
export function ResetAccount({ purpose, disabled }: { purpose: 'main' | 'practice'; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const reset = async () => {
    setBusy(true);
    const response = await fetch('/api/trade/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'reset', purpose }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setOpen(false);
    if (!response.ok) {
      toast(body.error ?? 'The account could not be reset.', 'error');
      return;
    }
    toast('Account reset to $100,000.', 'success');
    router.refresh();
  };

  return (
    <>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        Reset account
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reset your ${purpose} account?`}
        description="A new account starts at $100,000 with no history. The old one is archived as it stands — nothing about it is edited or deleted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep this account
            </Button>
            <Button variant="danger" loading={busy} onClick={reset}>
              Reset to $100,000
            </Button>
          </>
        }
      >
        <p className="text-ink-lo text-sm">
          {purpose === 'main'
            ? 'Your leaderboard record restarts with it: a new account needs ten sessions before it is ranked.'
            : 'Practice never reaches a leaderboard, so nothing else changes.'}
        </p>
      </Dialog>
    </>
  );
}
