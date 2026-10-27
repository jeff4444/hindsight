import { Suspense } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { AccountChip, AccountChipSkeleton } from '@/components/shell/AccountChip';
import { ToastProvider } from '@/components/ui/client';
import { currentViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * The signed-in shell — except it does not require being signed in.
 *
 * Anonymous play is a first-class state (§14 calls the raw loop the most important gate in the
 * product, and §10.4 forbids metering the daily or practice), so the shell renders for everyone
 * and only the account-shaped surfaces ask for one.
 *
 * `ToastProvider` renders no wrapper element of its own, which is the only reason it is safe to
 * mount here: the play route lives under this layout, and a `<div>` wrapped around `children`
 * would be an ancestor of the chart frame.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer();

  return (
    <ToastProvider>
      <AppShell
        viewer={
          viewer.profile
            ? {
                handle: viewer.profile.handle,
                displayName: viewer.profile.displayName,
                avatarSeed: viewer.profile.avatarSeed,
                avatarAccent: viewer.profile.avatarAccent,
              }
            : null
        }
        launcher={
          <Suspense fallback={<AccountChipSkeleton />}>
            <AccountChip />
          </Suspense>
        }
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
