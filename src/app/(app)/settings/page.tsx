import { redirect } from 'next/navigation';
import { currentViewer } from '@/lib/viewer';
import { SignaturePicker } from '@/components/profile/SignaturePicker';
import { saveProfile } from '@/app/actions/profile';
import { Button, Eyebrow, Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const viewer = await currentViewer();
  if (!viewer.profile) redirect('/sign-in');

  return (
    <div className="mx-auto max-w-md">
      <Eyebrow>Account</Eyebrow>
      <h1 className="text-ink-max mt-1 text-xl font-semibold">Settings</h1>

      <Panel className="mt-6 p-5">
        <Eyebrow>Signature and handle</Eyebrow>
        <div className="mt-4">
          <SignaturePicker
            initialHandle={viewer.profile.handle}
            initialSeed={viewer.profile.avatarSeed}
            initialAccent={viewer.profile.avatarAccent}
            action={saveProfile}
            submitLabel="Save"
          />
        </div>
      </Panel>

      <Panel className="mt-4 p-5">
        <Eyebrow>Signed in as</Eyebrow>
        <div className="text-ink-lo mt-1 font-mono text-sm">{viewer.email}</div>
        <form action="/auth/sign-out" method="post" className="mt-4">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
        <p className="text-ink-faint mt-3 text-xs leading-relaxed">
          Signing out also rotates the anonymous play session, so anything you play afterwards on
          this browser stays separate from this account.
        </p>
      </Panel>
    </div>
  );
}
