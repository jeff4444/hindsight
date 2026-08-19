import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentViewer } from '@/lib/viewer';
import { Eyebrow } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { MapBuilder } from '@/components/tapes/MapBuilder';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'New map' };

/**
 * §11.2's builder.
 *
 * Sign-in is required and enforced here as well as in `/api/tapes`. A map is a thing an operator
 * comes back to, shares by link and reads a cohort off — none of which survives an anonymous session
 * whose only identity is a cookie the player may clear.
 */
export default async function NewMapPage() {
  const viewer = await currentViewer();
  if (!viewer.userId) redirect('/sign-in?next=/tapes/new');

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/tapes"
        className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <Icon name="arrow-left" size={14} />
        Tapes
      </Link>

      <div className="mt-5">
        <Eyebrow>Make a map</Eyebrow>
        <h1 className="text-ink-max mt-1.5 text-3xl font-semibold text-balance">
          A slice of the library, defined by a rule
        </h1>
        <p className="text-ink-lo mt-4 max-w-prose text-base leading-relaxed">
          Pick the conditions and the library does the picking. Hand-choosing charts is deliberately
          not offered: a set someone assembled chart by chart has no reproducible difficulty
          distribution, so nothing computed on it — a percentile, a leaderboard, a cohort average —
          means what it appears to mean.
        </p>
      </div>

      <div className="mt-8">
        <MapBuilder />
      </div>
    </div>
  );
}
