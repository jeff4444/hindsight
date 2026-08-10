/**
 * The primitives.
 *
 * Deliberately *not* marked `'use client'`. Everything here is presentational — it renders from
 * props and holds no state — so leaving the directive off lets a server component import `cx` or
 * an `Eyebrow` directly, while a client component that imports the same module still bundles it.
 * Marking the file client-only made even the `cx` string helper a client reference, which a
 * server component cannot call.
 *
 * Before this the app hand-rolled eleven buttons, five panels, eight eyebrows and about a dozen
 * badges as class-string literals, and two components defined the same stat readout under different
 * names (`Stat` in ResultCard, `Figure` in Debrief). Everything here is a consolidation of
 * something that already existed at least twice, plus `Gated`, which is a rule from the scope
 * document rather than a widget.
 */

import type { ReactNode } from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ tone */

/**
 * The semantic vocabulary. `long`/`short` are directions; `gain`/`loss` are outcomes. They resolve
 * to the same hues, and keeping both names means a call site says which one it meant.
 */
export type Tone =
  | 'neutral'
  | 'long'
  | 'short'
  | 'info'
  | 'attention'
  | 'restraint'
  | 'gold';

const TONE_CHIP: Record<Tone, string> = {
  neutral: 'bg-fill-2 text-ink ring-line',
  long: 'bg-long-bg text-long-ink ring-long-line',
  short: 'bg-short-bg text-short-ink ring-short-line',
  info: 'bg-info-bg text-info-ink ring-info-line',
  attention: 'bg-attention-bg text-attention-ink ring-attention-line',
  restraint: 'bg-restraint-bg text-restraint-ink ring-restraint-line',
  gold: 'bg-gold/12 text-gold-ink ring-gold-line',
};

const TONE_INK: Record<Tone, string> = {
  neutral: 'text-ink-hi',
  long: 'text-long-ink',
  short: 'text-short-ink',
  info: 'text-info-ink',
  attention: 'text-attention-ink',
  restraint: 'text-restraint-ink',
  gold: 'text-gold-ink',
};

export function toneInk(tone: Tone): string {
  return TONE_INK[tone];
}

/* --------------------------------------------------------------- Eyebrow */

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx('eyebrow text-ink-dim', className)}>{children}</div>;
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-surface-inv text-ink-inv hover:brightness-108 shadow-key',
  secondary: 'bg-fill-2 text-ink-hi ring-1 ring-line hover:bg-fill-3',
  ghost: 'text-ink-lo hover:text-ink-hi hover:bg-fill-1',
  danger: 'bg-short-bg text-short-ink ring-1 ring-short-line hover:brightness-115',
  gold: 'bg-gold/14 text-gold-ink ring-1 ring-gold-line hover:brightness-115',
};

const BUTTON_SIZE = {
  sm: 'h-8 px-2.5 text-mini rounded-md gap-1.5',
  md: 'h-9 px-3.5 text-xs rounded-md gap-2',
  // 44px: the touch-target floor. §16 requires the interaction to work on a phone from the start.
  lg: 'h-11 px-5 text-sm rounded-lg gap-2',
} as const;

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZE;
  /** The keyboard shortcut, rendered inline. Five buttons in the play loop carry one. */
  kbd?: string;
  loading?: boolean;
  block?: boolean;
  /** Render as an anchor. A button that navigates should be a link — middle-click, open in a new
   *  tab and "copy link address" all stop working the moment it is not. */
  as?: 'button' | 'a';
  href?: string;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  kbd,
  loading,
  block,
  className,
  children,
  as = 'button',
  href,
  ...rest
}: ButtonOwnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const Tag = (as === 'a' ? 'a' : 'button') as 'button';
  return (
    <Tag
      {...rest}
      {...(as === 'a' ? ({ href } as Record<string, unknown>) : {})}
      disabled={as === 'a' ? undefined : rest.disabled || loading}
      className={cx(
        'press inline-flex items-center justify-center font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        block && 'w-full',
        className,
      )}
    >
      {children}
      {kbd && (
        <kbd
          className={cx(
            'ml-0.5 font-mono text-micro',
            variant === 'primary' ? 'text-ink-inv/55' : 'text-ink-faint',
          )}
        >
          {kbd}
        </kbd>
      )}
    </Tag>
  );
}

/* ----------------------------------------------------------------- Panel */

export function Panel({
  tone = 'raised',
  className,
  children,
  ...rest
}: {
  /** `over-chart` is translucent so candles stay legible underneath; the others are opaque. */
  tone?: 'raised' | 'inset' | 'over-chart';
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const tones = {
    raised: 'bg-surface-2 border border-line shadow-panel',
    inset: 'bg-surface-1 border border-line-faint',
    'over-chart': 'bg-scrim border border-line backdrop-brightness-100',
  } as const;
  return (
    <div {...rest} className={cx('rounded-lg', tones[tone], className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Chip */

export function Chip({
  tone = 'neutral',
  mono,
  title,
  className,
  children,
}: {
  tone?: Tone;
  mono?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1.5 rounded px-2 py-1 text-mini ring-1',
        mono && 'font-mono tabular-nums',
        TONE_CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Stat */

/**
 * One labelled figure. This is `ResultCard`'s `Stat` and `Debrief`'s `Figure` — the same component
 * under two names — with the hardcoded `animationDelay` replaced by a stagger index.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  index,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
  index?: number;
  className?: string;
}) {
  return (
    <div
      title={hint}
      style={index === undefined ? undefined : ({ '--i': index } as React.CSSProperties)}
      className={className}
    >
      <Eyebrow>{label}</Eyebrow>
      <div className={cx('mt-0.5 font-mono text-sm tabular-nums', TONE_INK[tone])}>{value}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- Gated */

/**
 * §4.9, as a component: "Do not display a number until the sample supports it. This is thematically
 * perfect — the game enforces the lesson that small samples mean nothing."
 *
 * It is a primitive rather than a helper because the document makes it a rule that applies to every
 * statistic in the app, and a rule that has to be remembered at each call site is a rule that will
 * eventually be forgotten at one.
 */
export function Gated({
  sample,
  min,
  label = 'more rounds',
  children,
}: {
  sample: number;
  min: number;
  label?: string;
  children: ReactNode;
}) {
  if (sample >= min) return <>{children}</>;
  return (
    <span className="text-ink-faint text-mini">
      needs {min - sample} {label}
    </span>
  );
}

/* ------------------------------------------------------------- Segmented */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
}: {
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cx('bg-fill-1 ring-line inline-flex rounded-md p-0.5 ring-1', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            title={option.title}
            disabled={option.disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              'press rounded-sm font-medium transition-colors disabled:opacity-35',
              size === 'sm' ? 'h-6 px-2 text-mini' : 'h-8 px-3 text-xs',
              active
                ? 'bg-surface-inv text-ink-inv'
                : 'text-ink-lo hover:text-ink-hi enabled:hover:bg-fill-2',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('bg-fill-2 animate-breathe rounded', className)} />;
}

/* ----------------------------------------------------------- EmptyState */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-line-faint flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <div className="text-ink-hi text-sm font-medium">{title}</div>
      {body && <p className="text-ink-lo max-w-prose text-xs">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
