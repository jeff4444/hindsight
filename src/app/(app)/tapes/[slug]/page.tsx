import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTape } from '@/lib/viewer';
import { Eyebrow, Panel } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { TapeLaunch } from '@/components/tapes/TapeLaunch';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tape = await getTape(slug);
  return { title: tape?.name ?? 'Tape' };
}

/**
 * A tape, and the settings you play it under.
 *
 * `TapeLaunch` owns the ruleset, the mods and the button, because those three are one decision —
 * the href it builds carries the tier and the mods, so splitting the button away from the choice
 * would mean two components agreeing about a query string. The sticky panel beside it holds what
 * does not change: how many charts are in here, and the fact that none of it is metered.
 *
 * Two columns at `lg`. On a page whose whole purpose is one button, that button should not scroll
 * away while you read the filter it applies to.
 */
export default async function TapePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tape = await getTape(slug);
  if (!tape) notFound();

  const locked = Boolean(tape.lockedReason);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/tapes"
        className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <Icon name="arrow-left" size={14} />
        Tapes
      </Link>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div>
          <Eyebrow>Tape</Eyebrow>
          <h1 className="text-ink-max mt-1.5 text-3xl font-semibold text-balance">{tape.name}</h1>
          <p className="text-ink-lo mt-4 max-w-prose text-base leading-relaxed">
            {locked ? tape.lockedReason : tape.blurb}
          </p>

          <Panel pad="md" className="mt-8">
            <TapeLaunch slug={tape.slug} locked={locked} />
          </Panel>
        </div>

        <Panel tone="hero" pad="md" className="lg:sticky lg:top-6">
          <Eyebrow>In this tape</Eyebrow>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="numeral text-ink-max text-display-sm font-semibold">
              {tape.charts.toLocaleString()}
            </span>
            <span className="text-ink-dim text-sm">charts</span>
          </div>

          <p className="text-ink-dim mt-4 text-sm leading-relaxed">
            Unlimited and never metered. Practice rounds are scored the same way the daily is, and
            they count towards your record.
          </p>
        </Panel>
      </div>
    </div>
  );
}
