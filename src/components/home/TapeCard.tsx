import Link from 'next/link';
import { describeFilter } from '@/core/tapes';
import { tierByCode } from '@/core/tiers';
import type { Tape } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { Chip, cx } from '../ui';
import { ChartArt, seedOf } from '../ui/ChartArt';
import { Icon } from '../ui/icons';

/**
 * A tape: a playlist of charts that share one rule.
 *
 * Every card wears a picture generated from its slug, with the fog on the right, so a grid of
 * tapes reads as a shelf rather than a spreadsheet. The rule is printed in plain words — a tape's
 * definition is published, not just applied — and the ruleset appears only when the tape requires
 * one. The old card put a tier code on every tape, locked or not.
 */
export function TapeCard({ tape, index, best }: { tape: Tape; index?: number; best?: number | null }) {
  const locked = Boolean(tape.lockedReason);
  const rule = describeFilter(tape.filter);
  const tier = tape.tierLocked ? tierByCode(tape.tier) : null;
  const style = index === undefined ? undefined : ({ '--i': index } as React.CSSProperties);

  const body = (
    <>
      <div className={cx('border-line-faint bg-surface-1 relative overflow-hidden border-b', locked && 'opacity-60')}>
        <ChartArt seed={seedOf(tape.slug)} width={320} height={96} />
        {locked && (
          <span className="bg-scrim text-ink-lo absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs">
            <Icon name="lock" size={12} />
            Not open yet
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className={cx('text-base font-semibold', locked ? 'text-ink-dim' : 'text-ink-max')}>{tape.name}</h3>
          {tier && <Chip tone="neutral" icon="shield">{tier.name}</Chip>}
        </div>
        <p className={cx('mt-1.5 line-clamp-2 text-sm leading-relaxed', locked ? 'text-ink-dim' : 'text-ink-lo')}>
          {locked ? tape.lockedReason : tape.blurb}
        </p>
        {rule.length > 0 && !locked && (
          <p className="text-ink-dim mt-2 line-clamp-1 text-xs">Charts where {rule.join(', and ')}</p>
        )}
        <div className="mt-auto flex items-baseline justify-between gap-3 pt-4">
          <span className="text-ink-dim text-sm">
            <span className="numeral text-ink-hi font-semibold">{tape.charts.toLocaleString()}</span> charts
          </span>
          {best !== undefined && best !== null && (
            <span className="text-ink-dim text-xs">
              your best <span className="numeral text-ink-hi">{Math.round(best * 100)}</span>
            </span>
          )}
        </div>
      </div>
    </>
  );

  const shell = cx(
    'flex flex-col overflow-hidden rounded-2xl border transition-colors',
    locked ? 'border-line-faint border-dashed' : 'border-line bg-surface-2 hover:border-line-strong press',
  );

  if (locked) {
    return (
      <div className={shell} style={style}>
        {body}
      </div>
    );
  }

  return (
    <Link href={routes.tapes.show(tape.slug)} className={shell} style={style}>
      {body}
    </Link>
  );
}
