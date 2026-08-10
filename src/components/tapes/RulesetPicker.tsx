'use client';

import { useRef } from 'react';
import { cx } from '../ui';

/**
 * The ruleset ladder, as a real radio group.
 *
 * It was five `<button aria-pressed>` elements, four of them permanently `disabled`. That is wrong
 * on both counts: a set of mutually exclusive options is a radio group, not five toggles, and a
 * `disabled` control is skipped by keyboard navigation entirely — so the four tiers that exist to
 * *show the ladder* were unreachable by the people most likely to want to read about them.
 *
 * They are `aria-disabled` instead: focusable and announced, but not selectable. The roving
 * tabindex means the whole group is one tab stop with arrow keys inside it, which is the pattern
 * every native radio group uses.
 */
export interface TierOption {
  code: string;
  name: string;
  live: boolean;
  hint: string;
}

export function RulesetPicker({ tiers, value }: { tiers: TierOption[]; value: string }) {
  const group = useRef<HTMLDivElement>(null);

  // Arrow keys move focus across the whole ladder, including the tiers that cannot be chosen —
  // reading the ladder is the point of showing it.
  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    const items = Array.from(group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const current = items.findIndex((el) => el === document.activeElement);
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + step + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label="Ruleset"
      className="flex flex-wrap gap-2"
      onKeyDown={onKeyDown}
    >
      {tiers.map((tier) => {
        const selected = tier.code === value;
        return (
          <button
            key={tier.code}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={!tier.live}
            title={tier.hint}
            tabIndex={selected ? 0 : -1}
            className={cx(
              'press rounded-lg border px-3.5 py-2.5 text-left transition-colors',
              selected
                ? 'border-info-line bg-info-bg text-info-ink'
                : tier.live
                  ? 'border-line text-ink-lo hover:border-line-strong'
                  : 'border-line-faint text-ink-faint cursor-not-allowed border-dashed',
            )}
          >
            <div className="numeral text-sm font-semibold">{tier.code}</div>
            <div className="mt-0.5 text-xs">{tier.live ? tier.name : 'soon'}</div>
          </button>
        );
      })}
    </div>
  );
}
