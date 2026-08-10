import { AppShell } from '@/components/shell/AppShell';
import { currentViewer, getStreak } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/**
 * The signed-in shell — except it does not require being signed in.
 *
 * Anonymous play is a first-class state (§14 calls the raw loop the most important gate in the
 * product, and §10.4 forbids metering the daily or practice), so the shell renders for everyone
 * and only the account-shaped surfaces ask for one.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await currentViewer();
  const streak = viewer.profile ? await getStreak(viewer) : null;

  return (
    <AppShell
      viewer={
        viewer.profile
          ? {
              handle: viewer.profile.handle,
              displayName: viewer.profile.displayName,
              avatarSeed: viewer.profile.avatarSeed,
              avatarAccent: viewer.profile.avatarAccent,
              perfectStreak: streak?.perfect ?? false,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
