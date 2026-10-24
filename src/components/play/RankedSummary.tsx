'use client';

import type { RankedPayload } from '@/lib/api-types';
import { FORFEIT_IMP } from '@/core/ranked';
import { Button, Eyebrow, cx, Panel } from '../ui';

/**
 * The end of a ranked session.
 *
 * Leads with the per-chart scores rather than the total, because the total is the least
 * interesting thing on the screen: §4.3 puts ranked standing in the Glicko rating, not in a sum,
 * precisely so that variance cannot buy position. What a player actually wants here is which of
 * the five went wrong.
 *
 * The quota is stated plainly when it was missed. §4.4 requires three entries out of five, and a
 * session that failed it should say so rather than quietly scoring lower.
 */
export function RankedSummary({ ranked }: { ranked: RankedPayload }) {
  const result = ranked.result;
  if (!result) return null;

  return (
    <Panel tone="hero" pad="none" className="animate-rise mx-auto w-full max-w-3xl p-5 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Eyebrow>Ranked session complete</Eyebrow>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span
              className={cx(
                'numeral text-display-sm font-semibold',
                result.total > 0 ? 'text-long-ink' : result.total < 0 ? 'text-short-ink' : 'text-ink-hi',
              )}
            >
              {result.total > 0 ? '+' : ''}
              {result.total}
            </span>
            <span className="text-ink-dim text-sm">compressed, across {ranked.total} charts</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button as="a" href="/today" variant="secondary" size="lg">
            Done
          </Button>
          <Button as="a" href="/play/ranked?new=1" variant="primary" size="lg">
            Another session
          </Button>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5" data-stagger>
        {result.imps.map((imp, i) => (
          <div
            key={i}
            style={{ '--i': i } as React.CSSProperties}
            title={`Chart ${i + 1}: ${imp > 0 ? '+' : ''}${imp}`}
            className={cx(
              'flex-1 rounded-md border px-2 py-3 text-center',
              imp === FORFEIT_IMP
                ? 'border-short-line bg-short-bg'
                : imp > 0
                  ? 'border-long-line bg-long-bg'
                  : imp < 0
                    ? 'border-line bg-fill-1'
                    : 'border-line bg-fill-1',
            )}
          >
            <div
              className={cx(
                'numeral text-xl font-semibold',
                imp > 0 ? 'text-long-ink' : imp < 0 ? 'text-short-ink' : 'text-ink-lo',
              )}
            >
              {imp > 0 ? '+' : ''}
              {imp}
            </div>
            <div className="text-ink-faint text-micro mt-0.5">
              {imp === FORFEIT_IMP ? 'forfeit' : `#${i + 1}`}
            </div>
          </div>
        ))}
      </div>

      <p className="text-ink-lo mt-5 max-w-prose text-sm leading-relaxed">
        {result.quotaMet ? (
          <>
            Traded {result.entries} of {ranked.total}, passed {result.passes}. Your rating moved on
            each chart against that chart&rsquo;s own rating — the total above is a scoreboard line,
            not the ladder. Standing lives in the rating precisely so a lottery ticket cannot buy it.
          </>
        ) : (
          <span className="text-attention-ink">
            Only {result.entries} entries. Ranked requires three out of five — a session that passes
            its way through is not a reading of anything, and the missing entries scored as
            forfeits.
          </span>
        )}
      </p>
    </Panel>
  );
}
