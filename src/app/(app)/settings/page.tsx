import { currentViewer } from '@/lib/viewer';
import { SignaturePicker } from '@/components/profile/SignaturePicker';
import { saveProfile } from '@/app/actions/profile';
import { routes } from '@/lib/routes';
import { Alert, Button, PageHeader, Panel, TextLink } from '@/components/ui';
import { MotionPreference, PalettePreference, ThemePreference } from '@/components/ui/client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

/**
 * Settings: how the app looks, and your account.
 *
 * Appearance is for everyone — a player without an account still gets a theme, a colour-blind
 * palette and a motion setting. The profile and account panels appear once there is an account.
 * Saving the profile stays on this page; it used to eject you to your public profile.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string; saved?: string }>;
}) {
  const viewer = await currentViewer();
  const { password, saved } = await searchParams;
  const profile = viewer.profile;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="You" title="Settings" />

      {password === 'set' && (
        <Alert tone="long" icon="check" title="Password saved.">
          It works everywhere you sign in from now on. Sessions you already have stay signed in.
        </Alert>
      )}
      {saved === '1' && (
        <Alert tone="long" icon="check" title="Saved.">
          Your profile is updated.
        </Alert>
      )}

      <Panel pad="md" className="space-y-6 rounded-3xl md:p-6">
        <div>
          <h2 className="font-display text-ink-max text-2xl">Appearance</h2>
          <p className="text-ink-lo mt-1 text-sm">Every screen follows the theme, the trading terminal included.</p>
        </div>
        <Setting label="Theme">
          <ThemePreference />
        </Setting>
        <Setting label="Direction colours">
          <PalettePreference />
        </Setting>
        <Setting label="Motion">
          <MotionPreference />
        </Setting>
      </Panel>

      {profile ? (
        <>
          <Panel pad="md" className="rounded-3xl md:p-6">
            <h2 className="font-display text-ink-max text-2xl">Profile</h2>
            <p className="text-ink-lo mt-1 text-sm">Your signature, handle and the name other players see.</p>
            <div className="mt-6 max-w-md">
              <SignaturePicker
                initialHandle={profile.handle}
                initialSeed={profile.avatarSeed}
                initialAccent={profile.avatarAccent}
                initialDisplayName={profile.displayName}
                next={`${routes.settings}?saved=1`}
                action={saveProfile}
                submitLabel="Save profile"
              />
            </div>
          </Panel>

          <Panel pad="md" className="rounded-3xl md:p-6">
            <h2 className="font-display text-ink-max text-2xl">Account</h2>
            <div className="text-ink-dim mt-3 text-xs font-medium">Signed in as</div>
            <div className="text-ink-hi mt-1 text-base">{viewer.email}</div>
            <p className="text-ink-lo mt-4 max-w-prose text-sm leading-relaxed">
              <TextLink href="/reset-password">Set a password</TextLink> — useful if you signed up with Google or an
              email link and want another way in.
            </p>
            <form action="/auth/sign-out" method="post" className="mt-5">
              <Button type="submit" variant="secondary">
                Sign out
              </Button>
            </form>
            <p className="text-ink-dim mt-3 max-w-prose text-xs leading-relaxed">
              Signing out starts a fresh anonymous account, so anything traded afterwards on this browser stays
              separate from this one.
            </p>
          </Panel>
        </>
      ) : (
        <Panel pad="md" className="rounded-3xl md:p-6">
          <h2 className="font-display text-ink-max text-2xl">Account</h2>
          <p className="text-ink-lo mt-1 text-sm">Sign in to keep your rounds and duels on any device, and to put your name on your duels.</p>
          <Button href={routes.signIn(routes.settings)} variant="primary" className="mt-4">
            Keep your account
          </Button>
        </Panel>
      )}
    </div>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-line-faint grid gap-3 border-t pt-5 sm:grid-cols-[10rem_1fr] sm:items-start">
      <div className="text-ink-hi pt-2 text-sm font-medium">{label}</div>
      <div>{children}</div>
    </div>
  );
}
