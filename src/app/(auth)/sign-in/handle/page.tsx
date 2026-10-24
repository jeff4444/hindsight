import { redirect } from 'next/navigation';
import { currentViewer } from '@/lib/viewer';
import { SignaturePicker } from '@/components/profile/SignaturePicker';
import { saveProfile } from '@/app/actions/profile';
import { safeNext } from '@/lib/auth-redirect';
import { Eyebrow } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ClaimHandlePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const viewer = await currentViewer();
  const next = safeNext((await searchParams).next);
  if (!viewer.userId) redirect('/sign-in');
  if (viewer.profile) redirect(next);

  // Seeded from the account id so the first signature offered is already personal — a reroll is
  // then a choice rather than an obligation.
  const seed = Math.abs(hash(viewer.userId)) % 2147483647;

  return (
    <div className="animate-rise">
      <Eyebrow>One last thing</Eyebrow>
      <h1 className="font-display text-ink-max mt-2 text-4xl">Pick your signature.</h1>
      <p className="text-ink-lo mt-3 text-base leading-relaxed">
        A little chart that is yours, generated rather than uploaded. Reroll until one feels right — it turns gold
        while your streak is perfect.
      </p>
      <div className="mt-8">
        <SignaturePicker initialSeed={seed} action={saveProfile} submitLabel="Claim it" next={next} />
      </div>
    </div>
  );
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
