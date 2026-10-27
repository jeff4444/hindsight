'use client';

import { useId, type ReactNode } from 'react';
import { cx } from './index';
import { Icon } from './icons';

/**
 * A number a trader types: a price, a quantity, a dollar amount.
 *
 * Controlled as a **string**, because a half-typed "0." or "43,1" is a legitimate state of the
 * field that a number cannot hold. Arrow keys and the two buttons step by `step` (Shift ×10), the
 * value snaps to `decimals` when it is stepped, and the unit sits inside the field where the eye
 * expects it.
 */
export function NumberInput({
  label,
  value,
  onChange,
  step,
  decimals,
  min = 0,
  unit,
  placeholder,
  disabled,
  hint,
  error,
  className,
  inputClassName,
  trailing,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  decimals: number;
  min?: number;
  unit?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  inputClassName?: string;
  /** Something to the right of the field, inside the frame: a toggle, a chip. */
  trailing?: ReactNode;
  id?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;

  const nudge = (direction: 1 | -1, big: boolean) => {
    const current = Number.parseFloat(value.replace(/,/g, ''));
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(min, base + direction * step * (big ? 10 : 1));
    onChange(next.toFixed(decimals));
  };

  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-ink-lo text-xs font-medium">
          {label}
        </label>
        {hint && <span className="text-ink-dim text-mini">{hint}</span>}
      </div>
      <div
        className={cx(
          'bg-surface-1 border-line flex h-10 items-center rounded-lg border transition-[border-color,box-shadow]',
          'focus-within:border-focus focus-within:ring-focus/30 focus-within:ring-3',
          error && 'border-short-line',
          disabled && 'opacity-50',
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Decrease ${label}`}
          disabled={disabled}
          onClick={(event) => nudge(-1, event.shiftKey)}
          className="text-ink-dim hover:text-ink-hi grid h-full w-8 shrink-0 place-items-center"
        >
          <Icon name="minus" size={14} />
        </button>
        <input
          id={inputId}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              nudge(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey);
            }
          }}
          className={cx(
            'numeral text-ink-hi placeholder:text-ink-faint h-full min-w-0 flex-1 bg-transparent text-right text-sm outline-none',
            inputClassName,
          )}
        />
        {unit && <span className="text-ink-dim pl-1.5 text-xs">{unit}</span>}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Increase ${label}`}
          disabled={disabled}
          onClick={(event) => nudge(1, event.shiftKey)}
          className="text-ink-dim hover:text-ink-hi grid h-full w-8 shrink-0 place-items-center"
        >
          <Icon name="plus" size={14} />
        </button>
        {trailing}
      </div>
      {error && (
        <p role="alert" className="text-short-ink mt-1 text-mini">
          {error}
        </p>
      )}
    </div>
  );
}
