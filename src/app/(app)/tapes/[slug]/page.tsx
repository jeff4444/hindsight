import { notFound } from 'next/navigation';
import Link from 'next/link';
import { currentViewer, getTape } from '@/lib/viewer';
import { describeFilter } from '@/core/tapes';
import { Button, Chip, Eyebrow, Panel } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { TapeLaunch } from '@/components/tapes/TapeLaunch';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await currentViewer();
  const tape = await getTape(slug, viewer.userId);
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
  const viewer = await currentViewer();
  // A private tape is not found rather than forbidden: 404 and 403 differ only in whether they
  // confirm the thing exists, and confirming it exists is exactly what private means it should not.
  const tape = await getTape(slug, viewer.userId);
  if (!tape) notFound();

  const locked = Boolean(tape.lockedReason);
  const conditions = describeFilter(tape.filter);

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
          <Eyebrow>{tape.ownerId ? 'A tape someone made' : 'Tape'}</Eyebrow>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h1 className="text-ink-max text-3xl font-semibold text-balance">{tape.name}</h1>
            {tape.ownerId && <Chip tone="neutral">{tape.visibility}</Chip>}
            {tape.tierLocked && <Chip tone="attention">{tape.tier} only</Chip>}
          </div>
          <p className="text-ink-lo mt-4 max-w-prose text-base leading-relaxed">
            {locked ? tape.lockedReason : tape.blurb}
          </p>

          {/* The rule, printed rather than merely applied. §11.1's requirement is that a tape's
              definition is published — and for a creator tape that matters more, not less, because
              the owner's own description is marketing and this is not. */}
          {conditions.length > 0 && (
            <div className="border-line-faint mt-6 border-t pt-4">
              <Eyebrow>What is in it</Eyebrow>
              <ul className="text-ink-lo mt-2 space-y-1 text-sm">
                {conditions.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>
          )}

          <Panel pad="md" className="mt-8">
            <TapeLaunch
              slug={tape.slug}
              locked={locked}
              requiredTier={tape.tierLocked ? tape.tier : null}
            />
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

          {tape.isOwner && (
            <div className="border-line-faint mt-4 border-t pt-4">
              <Button as="a" href={`/tapes/${tape.slug}/cohort`} variant="secondary" className="w-full">
                Cohort results
              </Button>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
