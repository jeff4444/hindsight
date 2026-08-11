'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useCountUp } from '@/lib/useTween';
import type { Beats } from '@/lib/useBeats';
import { cx } from './index';

type Animation = 'rise' | 'slam' | 'pop' | 'fade' | 'grow' | 'rail';

/**
 * One step of a choreographed sequence.
 *
 * `invisible` rather than unmounting, because the alternative is a panel that grows four times
 * while the sequence plays and drags everything below it down the page each time. `visibility`
 * reserves the layout, creates no stacking context, and is not caught by the reduced-motion
 * blanket rule.
 *
 * `aria-hidden` while waiting keeps a screen reader from announcing the same block twice, and the
 * beats are display-only — nothing here gates the content, so a reader that ignores the sequence
 * entirely still gets everything in source order.
 */
export function Beat({
  on,
  beats,
  animation = 'rise',
  as: Tag = 'div',
  className,
  style,
  children,
}: {
  on: number;
  beats: Beats;
  animation?: Animation;
  as?: 'div' | 'section' | 'li' | 'span';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const shown = beats.at(on);
  return (
    <Tag
      className={cx(shown ? `animate-${animation}` : 'invisible', className)}
      style={style}
      aria-hidden={shown ? undefined : true}
    >
      {children}
    </Tag>
  );
}

/**
 * A number that counts to its value on the shared clock.
 *
 * `tabular-nums` via `.numeral` is load-bearing: without it the width changes on almost every
 * frame and the label beside it walks across the screen.
 */
export function CountUp({
  value,
  ms,
  decimals = 0,
  sign,
  suffix,
  className,
}: {
  value: number | null;
  ms?: number;
  decimals?: number;
  sign?: boolean;
  suffix?: string;
  className?: string;
}) {
  const text = useCountUp(value, { ms, decimals, sign });
  return (
    <span className={cx('numeral', className)}>
      {text}
      {suffix}
    </span>
  );
}

/**
 * The stagger wrapper, so a call site stops hand-writing `style={{ '--i': n }}` on every child.
 * The delay itself is one CSS rule in globals.css; this only assigns the indices.
 */
export function Stagger({
  as: Tag = 'div',
  from = 0,
  className,
  children,
}: {
  as?: 'div' | 'ul' | 'dl';
  from?: number;
  className?: string;
  children: ReactNode[];
}) {
  return (
    <Tag data-stagger className={className}>
      {children.map((child, i) => (
        <div key={i} style={{ '--i': from + i } as CSSProperties}>
          {child}
        </div>
      ))}
    </Tag>
  );
}
