import Link from 'next/link';
import type { Tape } from '@/lib/viewer';
import { Chip, cx } from '../ui';

export function TapeCard({ tape, index }: { tape: Tape; index?: number }) {
  const locked = Boolean(tape.lockedReason);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className={cx('text-sm font-semibold', locked ? 'text-ink-faint' : 'text-ink-max')}>
          {tape.name}
        </h3>
        <Chip tone={locked ? 'neutral' : 'info'} className="shrink-0">
          {tape.tier}
        </Chip>
      </div>
      <p className={cx('mt-2 line-clamp-3 text-xs leading-relaxed', locked ? 'text-ink-faint' : 'text-ink-lo')}>
        {locked ? tape.lockedReason : tape.blurb}
      </p>
      <div className="text-ink-dim text-mini mt-3 font-mono tabular-nums">
        {locked ? 'Locked' : `${tape.charts.toLocaleString()} charts`}
      </div>
    </>
  );

  const shell = cx(
    'block rounded-lg border p-4 transition-colors',
    locked
      ? 'border-line-faint border-dashed opacity-70'
      : 'border-line bg-surface-2 shadow-panel hover:border-line-strong press',
  );

  if (locked) {
    return (
      <div className={shell} style={index === undefined ? undefined : ({ '--i': index } as React.CSSProperties)}>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/tapes/${tape.slug}`}
      className={shell}
      style={index === undefined ? undefined : ({ '--i': index } as React.CSSProperties)}
    >
      {body}
    </Link>
  );
}
