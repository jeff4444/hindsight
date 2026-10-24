'use client';

import type { ReactNode } from 'react';
import { cx } from '../ui';

/**
 * The end of a session, whatever the mode.
 *
 * Daily, ranked, Storm, Survival, a duel and a race all end on the same shape: what this was, the
 * one number that sums it up, the charts that made it, and what to do next. Each used to be its own
 * panel with its own layout and its own closing paragraph of rules. The rules moved to Learn; the
 * shape is now one component, so every ending reads the same way.
 */
export function SummaryShell({
  eyebrow,
  title,
  figure,
  figureTone = 'text-ink-max',
  caption,
  children,
  actions,
  footnote,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  figure?: ReactNode;
  figureTone?: string;
  caption?: ReactNode;
  /** Tiles, a card, a scoreboard — the detail behind the figure. */
  children?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('animate-rise mx-auto flex w-full max-w-xl flex-col items-center text-center', className)}>
      <div className="eyebrow text-ink-dim">{eyebrow}</div>
      <h2 className="font-display text-ink-max mt-3 text-[2.5rem] leading-[1.05] sm:text-5xl">{title}</h2>
      {figure !== undefined && (
        <div className={cx('numeral mt-6 text-display font-semibold sm:text-display-lg', figureTone)}>{figure}</div>
      )}
      {caption && <p className="text-ink-lo mt-2 text-sm">{caption}</p>}
      {children && <div className="mt-8 w-full">{children}</div>}
      {actions && <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">{actions}</div>}
      {footnote && <p className="text-ink-dim mt-5 max-w-md text-xs leading-relaxed">{footnote}</p>}
    </div>
  );
}
