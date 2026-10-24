'use client';

import type { RankedPayload } from '@/lib/api-types';
import { FORFEIT_IMP } from '@/core/ranked';
import { divisionProgress, isPlaced, roundsToPlacement } from '@/core/divisions';
import { routes } from '@/lib/routes';
import { Button, DivisionBadge, ProgressBar, cx } from '../ui';
import { Term } from '../ui/client';
import { SummaryShell } from './SummaryShell';

/**
 * The end of a ranked session: the rating it moved, and the five charts that moved it.
 *
 * The headline is the rating change and the division, because that is what a ranked session is
 * for. The points total is a scoreboard line beneath it, not the ladder — standing lives in the
 * rating precisely so one lucky chart cannot buy it.
 */
export function RankedSummary({ ranked }: { ranked: RankedPayload }) {
  const result = ranked.result;
  if (!result) return null;

  const { before, after, rd, attempts } = result.rating;
  const placed = after !== null && rd !== null && isPlaced(attempts, rd);
  const delta = before !== null && after !== null ? Math.round(after - before) : null;
  const progress = placed && after !== null ? divisionProgress(after) : null;

  return (
    <SummaryShell
      eyebrow="Ranked session"
      title={!result.quotaMet ? 'Not enough trades.' : delta === null || !placed ? 'Session in.' : delta >= 0 ? 'Up the ladder.' : 'A step back.'}
      figure={placed && delta !== null ? `${delta >= 0 ? '+' : ''}${delta}` : undefined}
      figureTone={delta === null ? 'text-ink-max' : delta >= 0 ? 'text-gain-ink' : 'text-loss-ink'}
      caption={
        placed && after !== null ? (
          <>
            <Term id="rating">rating</Term> · now <span className="numeral text-ink-hi">{Math.round(after)}</span>
          </>
        ) : (
          `${roundsToPlacement(attempts)} more rated charts until your first rating`
        )
      }
      actions={
        <>
          <Button href={routes.play.ranked(true)} variant="primary" size="lg">
            Another session
          </Button>
          <Button href={routes.today} variant="secondary" size="lg">
            Done
          </Button>
        </>
      }
      footnote={
        result.quotaMet
          ? `Traded ${result.entries} of ${ranked.total}, sat out ${result.passes}. Each chart moved your rating against that chart's own rating.`
          : `Only ${result.entries} trades — ranked asks for at least three of five, so the missing ones scored as forfeits.`
      }
    >
      <div className="space-y-6">
        {progress ? (
          <div className="border-line bg-surface-2 rounded-2xl border p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <DivisionBadge division={progress.division} />
              {progress.next && (
                <span className="text-ink-dim text-xs">
                  next: <span className="text-ink-hi">{progress.next.name}</span>
                </span>
              )}
            </div>
            <ProgressBar value={progress.progress} max={1} tone="gold" size="sm" className="mt-3" label="Progress to the next division" />
            <p className="text-ink-lo mt-2 text-xs">{progress.division.blurb}</p>
          </div>
        ) : (
          <div className="flex justify-center">
            <DivisionBadge division={null} placing={roundsToPlacement(attempts)} size="lg" />
          </div>
        )}

        <div>
          <div className="eyebrow text-ink-dim mb-2 text-left">
            <Term id="points">Points by chart</Term> · total {result.total > 0 ? '+' : ''}
            {result.total}
          </div>
          <div className="flex gap-1.5" data-stagger>
            {result.imps.map((imp, i) => (
              <div
                key={i}
                style={{ '--i': i } as React.CSSProperties}
                className={cx(
                  'flex-1 rounded-xl border px-2 py-3 text-center',
                  imp === FORFEIT_IMP
                    ? 'border-short-line bg-short-bg'
                    : imp > 0
                      ? 'border-long-line bg-long-bg'
                      : 'border-line bg-fill-1',
                )}
              >
                <div className={cx('numeral text-xl font-semibold', imp > 0 ? 'text-long-ink' : imp < 0 ? 'text-short-ink' : 'text-ink-lo')}>
                  {imp > 0 ? '+' : ''}
                  {imp}
                </div>
                <div className="text-ink-dim text-micro mt-0.5">{imp === FORFEIT_IMP ? 'forfeit' : `chart ${i + 1}`}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SummaryShell>
  );
}
