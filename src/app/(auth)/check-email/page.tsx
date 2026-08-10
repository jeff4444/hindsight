import Link from 'next/link';
import { Eyebrow } from '@/components/ui';

export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <div className="animate-rise">
      <Eyebrow>Check your inbox</Eyebrow>
      <h1 className="text-ink-max mt-2 text-xl font-semibold">A link is on its way</h1>
      <p className="text-ink-lo mt-3 text-sm leading-relaxed">
        Sent to <span className="text-ink-hi font-mono">{email ?? 'your email'}</span>. Open it on
        this device so the round history on this browser is the one that gets claimed.
      </p>
      <p className="text-ink-faint mt-6 text-xs">
        <Link href="/sign-in" className="underline underline-offset-4">
          Try a different address
        </Link>
      </p>
    </div>
  );
}
