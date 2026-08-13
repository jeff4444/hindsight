import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentViewer, listMyTapes } from '@/lib/viewer';
import { describeFilter } from '@/core/maps';
import { Button, Chip, Eyebrow, EmptyState, Panel } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your maps' };

/** The maps you own (§11.2), with their published rule and where each one is visible. */
export default async function MyMapsPage() {
  const viewer = await currentViewer();
  if (!viewer.userId) redirect('/sign-in?next=/tapes/mine');

  const maps = await listMyTapes(viewer.userId);

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
          <h1 className="text-ink-max mt-1.5 text-2xl font-semibold">Your maps</h1>
        </div>
        <Button as="a" href="/tapes/new" variant="primary">
          New map
        </Button>
      </div>

      {maps.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="distribution"
            title="You have not made a map yet"
            body="A map is a slice of the library defined by a rule — a regime, a theme, a direction, or the charts where the schools disagree. Share one by link and everyone who plays it gets the same distribution."
            action={
              <Button as="a" href="/tapes/new" variant="primary" size="lg">
                Make one
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {maps.map((map) => (
            <Panel key={map.slug} pad="md" className="flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-ink-max text-lg font-semibold">{map.name}</h2>
                  <Chip tone={map.visibility === 'public' ? 'info' : 'neutral'}>
                    {map.visibility}
                  </Chip>
                  {map.tierLocked && <Chip tone="attention">{map.tier} only</Chip>}
                </div>
                <p className="text-ink-lo mt-2 text-sm">
                  <span className="numeral text-ink font-semibold">
                    {map.charts.toLocaleString()}
                  </span>{' '}
                  charts
                </p>
                <ul className="text-ink-faint mt-2 space-y-0.5 text-xs">
                  {describeFilter(map.filter).map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 flex gap-2">
                <Button as="a" href={`/tapes/${map.slug}`} variant="secondary">
                  Open
                </Button>
                <Button as="a" href={`/tapes/${map.slug}/cohort`} variant="ghost">
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
