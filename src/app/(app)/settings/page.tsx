import { redirect } from 'next/navigation';
import { currentViewer } from '@/lib/viewer';
import { SignaturePicker } from '@/components/profile/SignaturePicker';
import { saveProfile } from '@/app/actions/profile';
import { Button, Eyebrow, Panel } from '@/components/ui';
import { MotionPreference } from '@/components/ui/client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

/**
 * Three panels: who you are, how it behaves, and the account itself.
 *
 * The motion control is the point of the restructure. `data-motion` has been read by the
 * stylesheet and by `useReducedMotion` since the design system was written, and seeded before
 * first paint by a blocking script — but nothing in the product ever *wrote* it, so the whole
 * feature was plumbed end to end and completely inert. This is the missing end.
 */
export default async function SettingsPage() {
  const viewer = await currentViewer();
  if (!viewer.profile) redirect('/sign-in');

  return (
    <div className="mx-auto max-w-2xl">
      <Eyebrow>Account</Eyebrow>
      <h1 className="text-ink-max mt-1 text-2xl font-semibold">Settings</h1>

      <Panel pad="md" className="mt-7">
        <Eyebrow>Signature and handle</Eyebrow>
        <p className="text-ink-lo mt-1.5 text-sm">
          Generated from a seed, never uploaded. It gilds when your streak is perfect.
        </p>
        <div className="mt-5">
          <SignaturePicker
            initialHandle={viewer.profile.handle}
            initialSeed={viewer.profile.avatarSeed}
            initialAccent={viewer.profile.avatarAccent}
            action={saveProfile}
            submitLabel="Save"
          />
        </div>
      </Panel>

      <Panel pad="md" className="mt-3">
        <Eyebrow>Motion</Eyebrow>
        <p className="text-ink-lo mt-1.5 max-w-prose text-sm leading-relaxed">
          Entrances, count-ups and the camera glide. The reveal itself always plays — the candles
          arriving one at a time are the content, not decoration.
        </p>
        <div className="mt-4">
          <MotionPreference />
        </div>
      </Panel>

      <Panel pad="md" className="mt-3">
        <Eyebrow>Signed in as</Eyebrow>
        <div className="numeral text-ink mt-1.5 text-base">{viewer.email}</div>
        <form action="/auth/sign-out" method="post" className="mt-5">
          <Button type="submit" variant="secondary" size="lg">
            Sign out
          </Button>
        </form>
        <p className="text-ink-dim mt-3.5 max-w-prose text-sm leading-relaxed">
          Signing out also rotates the anonymous play session, so anything you play afterwards on
          this browser stays separate from this account.
        </p>
      </Panel>
    </div>
  );
}
