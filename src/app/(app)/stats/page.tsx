import Link from 'next/link';
import { currentViewer, getPlayerStats } from '@/lib/viewer';
import { Eyebrow, Gated, Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const viewer = await currentViewer();
  const stats = await getPlayerStats(viewer);

  return (
    <div className="mx-auto max-w-3xl">
      <Eyebrow>Your record</Eyebrow>
      <h1 className="text-ink-max mt-1 text-xl font-semibold">Stats</h1>
      <p className="text-ink-lo mt-2 max-w-prose text-sm">
        §4.9: no number is shown until the sample supports it. That is not modesty — a percentile
        over four rounds is noise, and printing it would teach exactly the lesson this product
        exists to unteach.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2" data-stagger>
        <Panel className="p-4" style={{ '--i': 0 } as React.CSSProperties}>
          <Eyebrow>Rounds committed</Eyebrow>
          <div className="text-ink-max mt-1 font-mono text-2xl tabular-nums">{stats.rounds}</div>
        </Panel>
        <Panel className="p-4" style={{ '--i': 1 } as React.CSSProperties}>
          <Eyebrow>Mean percentile</Eyebrow>
          <div className="text-ink-max mt-1 font-mono text-2xl tabular-nums">
            <Gated sample={stats.rounds} min={10}>
              {stats.meanPercentile === null ? '—' : Math.round(stats.meanPercentile * 100)}
            </Gated>
          </div>
        </Panel>
        <Panel className="p-4" style={{ '--i': 2 } as React.CSSProperties}>
          <Eyebrow>Best</Eyebrow>
          <div className="text-ink-max mt-1 font-mono text-2xl tabular-nums">
            <Gated sample={stats.rounds} min={5}>
              {stats.bestPercentile === null ? '—' : Math.round(stats.bestPercentile * 100)}
            </Gated>
          </div>
        </Panel>
        <Panel className="p-4" style={{ '--i': 3 } as React.CSSProperties}>
          <Eyebrow>Traded / passed</Eyebrow>
          <div className="text-ink-max mt-1 font-mono text-2xl tabular-nums">
            {stats.traded}
            <span className="text-ink-faint"> / </span>
            {stats.passed}
          </div>
        </Panel>
      </div>

      <p className="text-ink-dim mt-6 text-xs leading-relaxed">
        Per-theme ratings, the three weakest axes and an edge report arrive with the council
        (§8.4, §10.5). Until engines exist there is nothing honest to put here.{' '}
        <Link href="/tapes" className="text-ink-lo underline underline-offset-2">Play more charts</Link>.
      </p>
    </div>
  );
}
