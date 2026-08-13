import { Suspense } from 'react';
import Link from 'next/link';
import { currentViewer, getPercentileSeries, getPlayerStats, getStyleRounds } from '@/lib/viewer';
import { CardGridSkeleton, PageHeadSkeleton } from '@/components/shell/skeletons';
import {
  Button,
  EmptyState,
  Eyebrow,
  Meter,
  Panel,
  Sparkline,
  cx,
} from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { StyleProfile } from '@/components/profile/StyleProfile';

export const dynamic = 'force-dynamic';

/** Rounds before a percentile means anything. §4.9's rule, as a number. */
const SAMPLE_MIN = 10;

export const metadata = { title: 'Stats' };

/**
 * Your record.
 *
 * The rule this page is built around used to be quoted at the reader verbatim, section number and
 * all: "§4.9: no number is shown until the sample supports it." That is a note to an engineer. The
 * rule itself is good and worth keeping visible — a percentile over four rounds is noise — but it
 * is expressed here as a meter you can fill rather than as a citation and a refusal.
 */
export default function StatsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Eyebrow>Your record</Eyebrow>
      <h1 className="text-ink-max mt-1 text-2xl font-semibold">Stats</h1>
      <p className="text-ink-lo mt-3 max-w-prose text-base leading-relaxed">
        Nothing here is shown until enough rounds exist to mean it. A percentile over four charts is
        noise, and printing it would teach exactly the lesson this product exists to unteach.
      </p>

      <Suspense fallback={<StatsSkeleton />}>
        <Record />
      </Suspense>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <>
      <div className="mt-8">
        <PageHeadSkeleton lede={false} />
      </div>
      <CardGridSkeleton count={4} height="h-32" className="mt-6 grid gap-3 sm:grid-cols-2" />
    </>
  );
}

async function Record() {
  const viewer = await currentViewer();
  const [stats, series, styleRounds] = await Promise.all([
    getPlayerStats(viewer),
    getPercentileSeries(viewer, 20),
    getStyleRounds(viewer),
  ]);

  if (stats.rounds === 0) {
    return (
      <div className="mt-10">
        <EmptyState
          icon="distribution"
          title="No rounds yet"
          body="Play a chart and this fills in. Ten rounds is where the percentile starts to mean something."
          action={
            <Button as="a" href="/play" variant="primary" size="lg">
              Play today&rsquo;s daily
            </Button>
          }
        />
      </div>
    );
  }

  const ready = stats.rounds >= SAMPLE_MIN;

  return (
    <>
      {/* The gate, as a goal rather than a refusal. */}
      {!ready && (
        <Panel tone="inset" pad="sm" className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Eyebrow>Sample</Eyebrow>
              <p className="text-ink mt-1 text-sm">
                <span className="numeral text-ink-max font-semibold">
                  {SAMPLE_MIN - stats.rounds}
                </span>{' '}
                more {SAMPLE_MIN - stats.rounds === 1 ? 'round' : 'rounds'} until your percentile
                means anything.
              </p>
            </div>
            <Meter
              value={stats.rounds}
              max={SAMPLE_MIN}
              tone="info"
              size="lg"
              className="w-40"
              label={`${stats.rounds} of ${SAMPLE_MIN} rounds`}
            />
          </div>
        </Panel>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2" data-stagger>
        <Tile
          index={0}
          label="Rounds committed"
          value={stats.rounds}
          sub={`${stats.traded} traded · ${stats.passed} passed`}
        />
        <Tile
          index={1}
          label="Mean percentile"
          value={ready && stats.meanPercentile !== null ? Math.round(stats.meanPercentile * 100) : null}
          locked={!ready}
          series={ready ? series : undefined}
        />
        <Tile
          index={2}
          label="Best"
          value={stats.rounds >= 5 && stats.bestPercentile !== null ? Math.round(stats.bestPercentile * 100) : null}
          locked={stats.rounds < 5}
          sub={stats.rounds < 5 ? `${5 - stats.rounds} more rounds` : 'of 100'}
        />
        <Tile
          index={3}
          label="Restraint"
          value={Math.round((stats.passed / stats.rounds) * 100)}
          sub="of your decisions were a pass"
          suffix="%"
        />
      </div>

      {/* Traded versus passed, with the baseline that makes it interesting. */}
      <Panel pad="md" className="mt-3">
        <Eyebrow>Traded against passed</Eyebrow>
        <div className="bg-fill-2 mt-3 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`${stats.traded} traded, ${stats.passed} passed`}>
          <span className="bg-info h-full" style={{ width: `${(stats.traded / stats.rounds) * 100}%` }} />
          <span className="bg-restraint h-full" style={{ width: `${(stats.passed / stats.rounds) * 100}%` }} />
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-ink-lo flex items-center gap-1.5">
            <span className="bg-info h-2 w-2 rounded-full" aria-hidden /> traded {stats.traded}
          </span>
          <span className="text-ink-lo flex items-center gap-1.5">
            <span className="bg-restraint h-2 w-2 rounded-full" aria-hidden /> passed {stats.passed}
          </span>
        </div>
        <p className="text-ink-dim mt-3 max-w-prose text-sm leading-relaxed">
          Passing every chart scores a mean 61st percentile, so restraint is a real baseline rather
          than an absence of a decision. The interesting question is not how often you pass — it is
          whether the charts you traded beat the ones you stood aside on.
        </p>
      </Panel>

      {/* §5.12. Placed after the traded/passed split because it only speaks about charts you traded,
          and because the split is the thing that decides how many of those there are. */}
      <StyleProfile rounds={styleRounds} />

      <Panel tone="inset" pad="md" className="mt-3">
        <Eyebrow>Not here yet</Eyebrow>
        <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
          Per-theme ratings, your three weakest axes and an edge report all need scoring engines
          that do not exist yet. Until they do there is nothing honest to put here.{' '}
          <Link href="/tapes" className="text-brand-ink underline underline-offset-4">
            Play more charts
          </Link>
          .
        </p>
      </Panel>
    </>
  );
}

function Tile({
  label,
  value,
  sub,
  suffix,
  series,
  locked,
  index,
}: {
  label: string;
  value: number | null;
  sub?: string;
  suffix?: string;
  series?: number[];
  locked?: boolean;
  index: number;
}) {
  return (
    <Panel pad="md" style={{ '--i': index } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        {locked && <Icon name="lock" size={14} className="text-ink-faint shrink-0" />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className={cx('numeral font-semibold', locked ? 'text-ink-faint text-2xl' : 'text-ink-max text-display-sm')}>
          {value === null ? '—' : value}
          {value !== null && suffix && <span className="text-ink-dim text-xl">{suffix}</span>}
        </div>
        {series && series.length > 1 && (
          <Sparkline values={series} tone="info" width={92} height={28} className="mb-1.5 shrink-0" />
        )}
      </div>
      {sub && <div className="text-ink-dim mt-1.5 text-sm">{sub}</div>}
    </Panel>
  );
}
