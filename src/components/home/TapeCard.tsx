import Link from 'next/link';
import type { Tape } from '@/lib/viewer';
import { Chip, cx } from '../ui';
import { Icon } from '../ui/icons';

/**
 * One tape.
 *
 * A `Tape` carries a slug, a name, a published filter description and a chart count — and nothing
 * about the shape of the market inside it. The redesign plan wanted a small "regime sparkline" per
 * card to give each tape a visual identity, and there is no honest way to draw one: the only
 * per-tape values available are its name and its count, so any line here would be a hash of the
 * slug dressed up as data. On a product whose whole argument is that it never shows a number the
 * sample cannot support, a decorative chart that looks like a measurement is exactly the wrong
 * ornament. The count is real, so the count is what gets the size.
 */
export function TapeCard({ tape, index }: { tape: Tape; index?: number }) {
  const locked = Boolean(tape.lockedReason);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className={cx('text-base font-semibold', locked ? 'text-ink-faint' : 'text-ink-max')}>
          {tape.name}
        </h3>
        <Chip tone={locked ? 'neutral' : 'info'} className="shrink-0">
          {locked ? <Icon name="lock" size={12} /> : null}
          {tape.tier}
        </Chip>
      </div>

      <p
        className={cx(
          'mt-2 line-clamp-3 text-sm leading-relaxed',
          locked ? 'text-ink-faint' : 'text-ink-lo',
        )}
      >
        {locked ? tape.lockedReason : tape.blurb}
      </p>

      <div className="mt-4 flex items-baseline gap-1.5">
        {locked ? (
          <span className="text-ink-faint text-sm">Not open yet</span>
        ) : (
          <>
            <span className="numeral text-ink-hi text-xl font-semibold">
              {tape.charts.toLocaleString()}
            </span>
            <span className="text-ink-dim text-sm">charts</span>
          </>
        )}
      </div>
    </>
  );

  const shell = cx(
    'block rounded-xl border p-5 transition-colors',
    locked
      ? 'border-line-faint border-dashed opacity-70'
      : 'border-line bg-surface-2 bg-linear-to-b from-white/[0.038] to-transparent to-44% shadow-e1 hover:border-line-strong press',
  );

  const style = index === undefined ? undefined : ({ '--i': index } as React.CSSProperties);

  if (locked) {
    return (
      <div className={shell} style={style}>
        {body}
      </div>
    );
  }

  return (
    <Link href={`/tapes/${tape.slug}`} className={shell} style={style}>
      {body}
    </Link>
  );
}
