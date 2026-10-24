import { notFound } from 'next/navigation';
import Link from 'next/link';
import { currentViewer, getTape } from '@/lib/viewer';
import { describeFilter } from '@/core/tapes';
import { routes } from '@/lib/routes';
import { Button, Chip, Panel } from '@/components/ui';
import { ChartArt, seedOf } from '@/components/ui/ChartArt';
import { Icon } from '@/components/ui/icons';
import { TapeLaunch } from '@/components/tapes/TapeLaunch';
import { Leaderboard } from '@/components/ranks/Leaderboard';
import { TAPE_BOARD_MIN_ROUNDS, getTapeBoard } from '@/lib/leaderboards';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await currentViewer();
  const tape = await getTape(slug, viewer.userId);
  return { title: tape?.name ?? 'Tape' };
}

/**
 * A tape: what is in it, and the one button that plays it.
 *
 * The launcher sits beside the description at desktop widths and sticks, because a page whose
 * purpose is one button should not scroll that button away while you read what it applies to.
 * The rule is printed as well as applied: a tape's definition is published, and for a tape someone
 * made it matters more — their description is marketing, the rule is not.
 */
export default async function TapePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await currentViewer();
  // Private tapes are not found rather than forbidden: a 403 would confirm the tape exists.
  const tape = await getTape(slug, viewer.userId);
  if (!tape) notFound();

  const locked = Boolean(tape.lockedReason);
  const conditions = describeFilter(tape.filter);
  const board = locked ? null : await getTapeBoard(tape.slug, 10);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={routes.tapes.index()}
        className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <Icon name="arrow-left" size={14} />
        Tapes
      </Link>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="space-y-6">
          <div className="border-line bg-surface-1 overflow-hidden rounded-3xl border">
            <ChartArt seed={seedOf(tape.slug)} width={720} height={180} fog={0.3} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow text-ink-dim">{tape.ownerId ? 'Made by a player' : 'Official tape'}</span>
              {tape.ownerId && <Chip tone="neutral">{tape.visibility}</Chip>}
            </div>
            <h1 className="font-display text-ink-max mt-2 text-[2.75rem] leading-none md:text-6xl">{tape.name}</h1>
            <p className="text-ink-lo mt-4 max-w-2xl text-lg leading-relaxed">{locked ? tape.lockedReason : tape.blurb}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border-line bg-surface-2 rounded-2xl border p-5">
              <div className="eyebrow text-ink-dim">The rule</div>
              {conditions.length > 0 ? (
                <ul className="text-ink mt-2 space-y-1.5 text-sm leading-relaxed">
                  {conditions.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden className="bg-gold mt-2 h-1 w-1 shrink-0 rounded-full" />
                      Charts where {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink mt-2 text-sm">Every chart in the library.</p>
              )}
            </div>
            <div className="border-line bg-surface-2 rounded-2xl border p-5">
              <div className="eyebrow text-ink-dim">In this tape</div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="numeral text-ink-max text-4xl font-semibold">{tape.charts.toLocaleString()}</span>
                <span className="text-ink-dim text-sm">charts</span>
              </div>
              <p className="text-ink-dim mt-2 text-xs leading-relaxed">
                Unlimited and never metered. Rated play here counts toward your rating like any other.
              </p>
            </div>
          </div>

          {board !== null && (
            <section aria-labelledby="board-heading" className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="board-heading" className="text-ink-max text-lg font-semibold">
                  Best on this tape
                </h2>
                <Link href={`${routes.ranks('tapes')}&tape=${encodeURIComponent(tape.slug)}`} className="text-ink-dim hover:text-ink-hi text-xs">
                  Full board
                </Link>
              </div>
              <Leaderboard
                rows={board}
                viewerId={viewer.userId}
                format={(value) => String(Math.round(value * 100))}
                detail={(row) => (row.detail === null ? null : `${row.detail} rounds`)}
                empty={
                  <p className="text-ink-dim text-sm">
                    Nobody yet. Players appear after {TAPE_BOARD_MIN_ROUNDS} rounds here, ranked by average score.
                  </p>
                }
              />
            </section>
          )}

          {tape.isOwner && (
            <div className="border-line bg-surface-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5">
              <div>
                <div className="text-ink-max font-semibold">Your cohort</div>
                <p className="text-ink-lo text-sm">How everyone who played this tape is doing, weakest areas first.</p>
              </div>
              <Button href={routes.tapes.cohort(tape.slug)} variant="secondary">
                Cohort results
              </Button>
            </div>
          )}
        </div>

        <Panel tone="hero" pad="md" className="rounded-3xl lg:sticky lg:top-8">
          <TapeLaunch slug={tape.slug} locked={locked} requiredTier={tape.tierLocked ? tape.tier : null} />
        </Panel>
      </div>
    </div>
  );
}
