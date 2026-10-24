import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentViewer } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { PageHeader } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { TapeBuilder } from '@/components/tapes/TapeBuilder';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Make a tape' };

/**
 * Make a tape: a rule over the library, a ruleset, a name. The library does the picking — a set
 * assembled chart by chart has no reproducible difficulty, so nothing computed on it would mean
 * what it seems to. That argument lives in Methods now; the page just builds.
 */
export default async function NewTapePage() {
  const viewer = await currentViewer();
  if (!viewer.userId) redirect(routes.signIn(routes.tapes.create));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Link href={routes.tapes.index()} className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors">
        <Icon name="arrow-left" size={14} />
        Tapes
      </Link>
      <PageHeader
        eyebrow="Make a tape"
        title="Build a playlist of charts"
        lede="Pick a rule and the library finds every chart that fits. Share it with a class, a group chat, or just yourself."
      />
      <TapeBuilder />
    </div>
  );
}
