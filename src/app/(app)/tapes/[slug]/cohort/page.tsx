import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentViewer, getTape } from '@/lib/viewer';
import { getCohort } from '@/lib/cohort';
import { Chip, EmptyState, Eyebrow, Gated, PageHeader, Panel, Stat } from '@/components/ui';
import { Icon } from '@/components/ui/icons';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Cohort — ${slug}` };
}

/**
 * §11.2's cohort dashboard.
 *
 * > "Cohort dashboards for the owner: aggregate scores, weakest axes across the group, per-student
 * > progress, per-theme ratings."
 *
 * This is the one surface in the product that cannot be checked against a null, and the page says so
 * on itself rather than in a document nobody opens. It aggregates over a group of players and there
 * is, today, one player — so *"the group's weakest axis"* is that player's weakest axis with extra
 * words. Every figure carries its sample size and the same §4.9 gate a player's own percentile gets.
 *
 * Owner-only, and 404 rather than 403 for anyone else: a page that says "forbidden" confirms the tape
 * exists, which is the one thing a private tape must not do.
 */
export default async function CohortPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await currentViewer();
  if (!viewer.userId) redirect(`/sign-in?next=/tapes/${slug}/cohort`);

  const tape = await getTape(slug, viewer.userId);
  if (!tape || !tape.isOwner) notFound();

  const cohort = await getCohort(slug);
  const single = cohort.players.length <= 1;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href={`/tapes/${slug}`}
        className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <Icon name="arrow-left" size={14} />
        {tape.name}
      </Link>

      <PageHeader
        className="mt-5"
        eyebrow="Your cohort"
        title={tape.name}
        lede={`Everyone who has played this tape — ${tape.visibility === 'public' ? 'it is public, so that may be anyone' : 'whoever you gave the link to'}. Weakest areas first.`}
      />

      {cohort.rounds === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon="distribution"
            title="Nobody has played it yet"
            body="Share the tape's link. Results appear here as rounds are committed — nothing is counted until an order is placed, so an opened-and-abandoned chart never inflates the numbers."
          />
        </div>
      ) : (
        <>
          <section className="mt-8">
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <Stat label="Players" value={cohort.players.length} />
              <Stat label="Rounds" value={cohort.rounds} />
              <Stat label="Traded" value={cohort.traded} />
              <Stat label="Sat out" value={cohort.passed} tone="restraint" />
              <div>
                <Eyebrow>Average score</Eyebrow>
                <div className="mt-1">
                  <Gated sample={cohort.rounds} min={10}>
                    <span className="numeral text-ink-hi text-xl font-semibold">
                      {cohort.meanPercentile === null
                        ? '—'
                        : Math.round(cohort.meanPercentile * 100)}
                    </span>
                  </Gated>
                </div>
              </div>
            </div>

            {single && (
              <p className="text-attention-ink bg-attention/10 ring-attention/30 mt-5 max-w-prose rounded-md px-3 py-2 text-sm leading-relaxed ring-1">
                One player has results on this tape, so nothing below is a group statistic. A
                cohort&rsquo;s weakest axis needs a cohort; this is one person&rsquo;s weakest axis
                with a wider heading.
              </p>
            )}
          </section>

          <section className="mt-10">
            <Eyebrow>Weakest first</Eyebrow>
            <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
              Mean percentile per theme and per regime, lowest at the top. A chart carries several
              themes and counts towards each, so these add to more than the round total. Axes with
              fewer than {cohort.axisFloor} rounds are not shown at all.
            </p>

            {cohort.axes.length === 0 ? (
              <p className="text-ink-dim mt-4 text-sm">
                No axis has {cohort.axisFloor} rounds behind it yet.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-1.5">
                {cohort.axes.map((axis) => (
                  <li key={axis.key} className="flex items-center gap-3 text-sm">
                    <span className="text-ink-lo w-44 shrink-0 truncate">
                      {axis.key.startsWith('regime:')
                        ? axis.key.slice('regime:'.length)
                        : axis.key.replace(/-/g, ' ')}
                    </span>
                    <span className="bg-fill-2 relative h-2.5 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-info absolute inset-y-0 left-0"
                        style={{ width: `${axis.meanPercentile * 100}%` }}
                      />
                    </span>
                    <span className="numeral text-ink-lo w-10 shrink-0 text-right">
                      {Math.round(axis.meanPercentile * 100)}
                    </span>
                    <span className="text-ink-dim w-16 shrink-0 text-right text-xs">
                      {axis.rounds} rounds
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <Eyebrow>Per player</Eyebrow>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-md text-sm">
                <thead>
                  <tr className="text-ink-dim border-line-faint border-b text-left text-xs">
                    <th className="pb-2 font-medium">Player</th>
                    <th className="pb-2 text-right font-medium">Rounds</th>
                    <th className="pb-2 text-right font-medium">Traded</th>
                    <th className="pb-2 text-right font-medium">Passed</th>
                    <th className="pb-2 text-right font-medium">Mean %ile</th>
                  </tr>
                </thead>
                <tbody>
                  {cohort.players.map((player, i) => (
                    <tr key={i} className="border-line-faint border-b last:border-0">
                      <td className="text-ink py-2">
                        {player.handle ?? <Chip tone="neutral">no account</Chip>}
                      </td>
                      <td className="numeral text-ink-lo py-2 text-right">{player.rounds}</td>
                      <td className="numeral text-ink-lo py-2 text-right">{player.traded}</td>
                      <td className="numeral text-restraint-ink py-2 text-right">{player.passed}</td>
                      <td className="numeral text-ink-hi py-2 text-right">
                        <Gated sample={player.rounds} min={10}>
                          {player.meanPercentile === null
                            ? '—'
                            : Math.round(player.meanPercentile * 100)}
                        </Gated>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Panel pad="md" className="mt-10">
            <Eyebrow>What this is not</Eyebrow>
            <p className="text-ink-lo mt-2 max-w-prose text-sm leading-relaxed">
              Every other number in this product is published beside a measured null — a shuffle, a
              coin flip, a random engine. This page has none available: there is no second cohort to
              compare yours against, and no baseline for what a group of a given size should score on
              a tape of a given difficulty. Read it as a description of who did what, not as evidence
              that the tape taught anybody anything.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
