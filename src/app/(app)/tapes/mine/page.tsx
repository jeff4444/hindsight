import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentViewer, listMyTapes } from '@/lib/viewer';
import { describeFilter } from '@/core/tapes';
import { Button, Chip, Eyebrow, EmptyState, Panel } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your tapes' };

/** The tapes you own (§11.2), with their published rule and where each one is visible. */
export default async function MyTapesPage() {
  const viewer = await currentViewer();
  if (!viewer.userId) redirect('/sign-in?next=/tapes/mine');

  const tapes = await listMyTapes(viewer.userId);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/tapes"
        className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <Icon name="arrow-left" size={14} />
        Tapes
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Yours</Eyebrow>
          <h1 className="text-ink-max mt-1.5 text-2xl font-semibold">Your tapes</h1>
        </div>
        <Button as="a" href="/tapes/new" variant="primary">
          New tape
        </Button>
      </div>

      {tapes.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="distribution"
            title="You have not made a tape yet"
            body="A tape is a slice of the library defined by a rule — a regime, a theme, a direction, or the charts where the schools disagree. Share one by link and everyone who plays it gets the same distribution."
            action={
              <Button as="a" href="/tapes/new" variant="primary" size="lg">
                Make one
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {tapes.map((tape) => (
            <Panel key={tape.slug} pad="md" className="flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-ink-max text-lg font-semibold">{tape.name}</h2>
                  <Chip tone={tape.visibility === 'public' ? 'info' : 'neutral'}>
                    {tape.visibility}
                  </Chip>
                  {tape.tierLocked && <Chip tone="attention">{tape.tier} only</Chip>}
                </div>
                <p className="text-ink-lo mt-2 text-sm">
                  <span className="numeral text-ink font-semibold">
                    {tape.charts.toLocaleString()}
                  </span>{' '}
                  charts
                </p>
                <ul className="text-ink-faint mt-2 space-y-0.5 text-xs">
                  {describeFilter(tape.filter).map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex gap-2">
                <Button as="a" href={`/tapes/${tape.slug}`} variant="secondary">
                  Open
                </Button>
                <Button as="a" href={`/tapes/${tape.slug}/cohort`} variant="ghost">
                  Cohort
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
