/**
 * The primitives.
 *
 * Deliberately *not* marked `'use client'`. Everything here is presentational — it renders from
 * props and holds no state — so leaving the directive off lets a server component import `cx` or
 * an `Eyebrow` directly, while a client component that imports the same module still bundles it.
 * Marking the file client-only made even the `cx` string helper a client reference, which a
 * server component cannot call. Anything that needs state, a ref or a portal lives in `./client`,
 * and this file must never import from there or the whole barrel becomes client-only.
 *
 * Before this the app hand-rolled eleven buttons, five panels, eight eyebrows and about a dozen
 * badges as class-string literals, and two components defined the same stat readout under
 * different names. Almost everything here is a consolidation of something that already existed at
 * least twice, plus `Gated`, which is a rule from the scope document rather than a widget.
 */

import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** `--i` drives the shared `[data-stagger]` entrance. Capped in CSS, not here. */
function stagger(index?: number): CSSProperties | undefined {
  return index === undefined ? undefined : ({ "--i": index } as CSSProperties);
}

/* ------------------------------------------------------------------ tone */

/**
 * The semantic vocabulary. `long`/`short` are directions; `gain`/`loss` are outcomes. They resolve
 * to the same hues, and keeping both names means a call site says which one it meant.
 *
 * `brand` is not in here on purpose. It is the one non-semantic hue in the system and it is
 * restricted to atmosphere: 18% alpha or less, 32px or larger, or inside the mark. A `Tone` is
 * what small opaque things are painted with, so admitting brand to this union is exactly how the
 * two categories would start to collide.
 */
export type Tone =
  "neutral" | "long" | "short" | "info" | "attention" | "restraint" | "gold";

const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-fill-2 text-ink ring-line",
  long: "bg-long-bg text-long-ink ring-long-line",
  short: "bg-short-bg text-short-ink ring-short-line",
  info: "bg-info-bg text-info-ink ring-info-line",
  attention: "bg-attention-bg text-attention-ink ring-attention-line",
  restraint: "bg-restraint-bg text-restraint-ink ring-restraint-line",
  gold: "bg-gold/12 text-gold-ink ring-gold-line",
};

const TONE_INK: Record<Tone, string> = {
  neutral: "text-ink-hi",
  long: "text-long-ink",
  short: "text-short-ink",
  info: "text-info-ink",
  attention: "text-attention-ink",
  restraint: "text-restraint-ink",
  gold: "text-gold-ink",
};

const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-ink-dim",
  long: "bg-long",
  short: "bg-short",
  info: "bg-info",
  attention: "bg-attention",
  restraint: "bg-restraint",
  gold: "bg-gold",
};

/** The glow colour for `Panel glow`, and for `--shadow-glow` anywhere else. */
const TONE_GLOW: Record<Tone | "brand", string> = {
  neutral: "var(--color-fill-3)",
  long: "var(--color-long-glow)",
  short: "var(--color-short-glow)",
  info: "var(--color-info-glow)",
  attention: "var(--color-attention-glow)",
  restraint: "var(--color-restraint-glow)",
  gold: "var(--color-gold-glow)",
  brand: "var(--color-brand-glow)",
};

export function toneInk(tone: Tone): string {
  return TONE_INK[tone];
}

/* --------------------------------------------------------------- Eyebrow */

export function Eyebrow({
  children,
  tone,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "eyebrow",
        tone ? TONE_INK[tone] : "text-ink-dim",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- Kbd */

/** The keyboard hint. Five buttons in the play loop carry one, and so does the hotkey legend. */
export function Kbd({
  children,
  muted,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <kbd
      className={cx(
        "font-mono text-micro",
        muted ? "text-ink-inv/55" : "text-ink-faint",
      )}
    >
      {children}
    </kbd>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant =
  "primary" | "secondary" | "ghost" | "danger" | "gold" | "accent" | "subtle";

/**
 * Hover states are explicit colours rather than `brightness()`.
 *
 * `filter: brightness()` creates a stacking context. On a button that is harmless — every button
 * in the product is a sibling of the chart frame, never an ancestor. But the Commit button lives
 * three lines from the frame in the same component, and it is one wrapper `<div>` away from being
 * the thing that silently kills the drag rails. Removing the property removes the class of bug.
 */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-surface-inv text-ink-inv hover:bg-white shadow-key",
  secondary:
    "bg-fill-2 text-ink-hi ring-1 ring-line hover:bg-fill-3 hover:ring-line-strong",
  ghost: "text-ink-lo hover:text-ink-hi hover:bg-fill-1",
  danger: "bg-short-bg text-short-ink ring-1 ring-short-line hover:bg-short/25",
  gold: "bg-gold/14 text-gold-ink ring-1 ring-gold-line hover:bg-gold/22",
  accent: "bg-brand-bg text-brand-ink ring-1 ring-brand-line hover:bg-brand/22",
  subtle:
    "text-ink-lo ring-1 ring-line-faint hover:text-ink-hi hover:ring-line",
};

const BUTTON_SIZE = {
  xs: "h-7 px-2.5 text-mini rounded-sm gap-1.5",
  sm: "h-8 px-3 text-xs rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-md gap-2",
  // 44px: the touch-target floor. §16 requires the interaction to work on a phone from the start.
  lg: "h-12 px-6 text-base rounded-lg gap-2",
  xl: "h-14 px-8 text-lg rounded-xl gap-2.5",
} as const;

type ButtonOwnProps = {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZE;
  /** The keyboard shortcut, rendered inline. */
  kbd?: string;
  loading?: boolean;
  block?: boolean;
  /** Lights the button with its tone. Reserve for the one primary action on a screen. */
  glow?: Tone | "brand";
  /** Render as an anchor. A button that navigates should be a link — middle-click, open in a new
   *  tab and "copy link address" all stop working the moment it is not. */
  as?: "button" | "a";
  href?: string;
};

export function Button({
  variant = "secondary",
  size = "md",
  kbd,
  loading,
  block,
  glow,
  className,
  children,
  as = "button",
  href,
  style,
  ...rest
}: ButtonOwnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const Tag = (as === "a" ? "a" : "button") as "button";
  return (
    <Tag
      {...rest}
      {...(as === "a" ? ({ href } as Record<string, unknown>) : {})}
      disabled={as === "a" ? undefined : rest.disabled || loading}
      aria-busy={loading || undefined}
      style={
        glow
          ? ({ ...style, "--glow-color": TONE_GLOW[glow] } as CSSProperties)
          : style
      }
      className={cx(
        "press relative inline-flex items-center justify-center font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        glow && "hover:shadow-glow",
        block && "w-full",
        className,
      )}
    >
      {/* The label keeps its width while busy, so the button does not resize mid-commit. */}
      {loading && <Spinner className="-ml-1" />}
      {children}
      {kbd && !loading && <Kbd muted={variant === "primary"}>{kbd}</Kbd>}
    </Tag>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("animate-spin shrink-0", className)}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        opacity="0.25"
      />
      <path
        d="M12.5 7A5.5 5.5 0 0 0 7 1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------ IconButton */

export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  className,
  ...rest
}: {
  icon: IconName;
  /** Required: the icon is the only label, so it has to exist for a screen reader. */
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: ButtonVariant;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const box = {
    sm: "h-8 w-8 rounded-md",
    md: "h-10 w-10 rounded-md",
    lg: "h-11 w-11 rounded-lg",
  }[size];
  const glyph = { sm: 15, md: 17, lg: 19 }[size];
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      aria-label={label}
      className={cx(
        "press inline-flex items-center justify-center transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        BUTTON_VARIANT[variant],
        box,
        className,
      )}
    >
      <Icon name={icon} size={glyph} />
    </button>
  );
}

/* ----------------------------------------------------------------- Panel */

const PAD = {
  none: "",
  sm: "p-4",
  md: "p-5 md:p-6",
  lg: "p-6 md:p-8",
} as const;

export function Panel({
  tone = "raised",
  elevation,
  glow,
  rim,
  interactive,
  pad = "sm",
  className,
  children,
  style,
  ...rest
}: {
  /** `over-chart` is translucent so candles stay legible underneath; the others are opaque. */
  tone?: "raised" | "inset" | "over-chart" | "flush" | "hero";
  elevation?: 0 | 1 | 2 | 3;
  glow?: Tone | "brand";
  rim?: boolean;
  interactive?: boolean;
  pad?: keyof typeof PAD;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  // The top-edge gradient is what makes a panel read as a lit face rather than a lighter
  // rectangle. It is a background-image, so it creates no stacking context and is legal anywhere.
  const tones = {
    raised:
      "bg-surface-2 bg-linear-to-b from-white/[0.038] to-transparent to-44% border border-line rounded-xl",
    inset: "bg-surface-1 border border-line-faint rounded-xl",
    "over-chart": "bg-scrim border border-line rounded-lg",
    flush: "bg-transparent rounded-xl",
    hero: "bg-surface-2 bg-linear-to-b from-white/[0.045] to-transparent to-40% border border-line rounded-2xl",
  } as const;

  const shadow = {
    0: "",
    1: "shadow-e1",
    2: "shadow-e2",
    3: "shadow-e3",
  }[
    elevation ??
      (tone === "hero" ? 2 : tone === "inset" || tone === "flush" ? 0 : 1)
  ];

  return (
    <div
      {...rest}
      style={
        glow
          ? ({ ...style, "--glow-color": TONE_GLOW[glow] } as CSSProperties)
          : style
      }
      className={cx(
        tones[tone],
        shadow,
        PAD[pad],
        glow && "shadow-glow",
        rim && "rim",
        interactive && "press hover:border-line-strong transition-colors",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Chip */

export function Chip({
  tone = "neutral",
  size = "sm",
  mono,
  dot,
  icon,
  title,
  className,
  children,
}: {
  tone?: Tone;
  size?: "sm" | "md";
  mono?: boolean;
  /** A leading status dot in the chip's own tone. */
  dot?: boolean;
  icon?: IconName;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1.5 rounded ring-1",
        size === "md" ? "px-2.5 py-1.5 text-xs" : "px-2 py-1 text-mini",
        mono && "font-mono tabular-nums",
        TONE_CHIP[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cx("h-1.5 w-1.5 shrink-0 rounded-full", TONE_FILL[tone])}
          aria-hidden
        />
      )}
      {icon && <Icon name={icon} size={size === "md" ? 14 : 12} />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Stat */

const STAT_SIZE = {
  sm: "text-sm",
  md: "text-xl",
  lg: "text-3xl",
  display: "text-display-sm",
} as const;

/**
 * One labelled figure.
 *
 * The default used to be `text-sm` — 13px — which set the size of every statistic in the product:
 * the debrief, the profile, the stats page, the record strip on home. Nothing on any screen was
 * bigger than anything else, and this line is most of the reason. A figure is the payload; it
 * should be the largest thing in its own block.
 */
export function Stat({
  label,
  value,
  hint,
  sublabel,
  delta,
  tone = "neutral",
  size = "md",
  mono = true,
  index,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  sublabel?: ReactNode;
  /** Signed change. Tones itself: positive is a gain, negative a loss. */
  delta?: number;
  tone?: Tone;
  size?: keyof typeof STAT_SIZE;
  mono?: boolean;
  index?: number;
  className?: string;
}) {
  return (
    <div title={hint} style={stagger(index)} className={className}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={cx(
            mono && "numeral",
            STAT_SIZE[size],
            "font-semibold",
            TONE_INK[tone],
          )}
        >
          {value}
        </span>
        {delta !== undefined && (
          <span
            className={cx(
              "numeral text-xs font-medium",
              delta > 0
                ? "text-gain-ink"
                : delta < 0
                  ? "text-loss-ink"
                  : "text-ink-dim",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>
      {sublabel && (
        <div className="text-ink-dim mt-0.5 text-xs">{sublabel}</div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Meter */

/**
 * n discrete segments. The daily is five charts, the sample gate is ten rounds, the share card is
 * ten blocks — all the same shape, previously hand-rolled three different ways.
 */
export function Meter({
  value,
  max,
  tone = "info",
  size = "md",
  label,
  className,
}: {
  value: number;
  max: number;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}) {
  const h = { sm: "h-1", md: "h-1.5", lg: "h-2.5" }[size];
  return (
    <div
      className={cx("flex gap-1", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cx(
            "flex-1 rounded-full transition-colors duration-(--dur-4)",
            h,
            i < value ? TONE_FILL[tone] : "bg-fill-2",
          )}
        />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- ProgressBar */

export function ProgressBar({
  value,
  max = 1,
  tone = "info",
  size = "sm",
  /**
   * `settle` eases over ~half a second, which is right for a bar that moves once.
   * `live` is a short linear ramp, for one that is being driven every frame — the reveal advances
   * a candle every 78ms, and an entrance ease at that cadence lags visibly behind the candles it
   * is supposed to be counting.
   */
  pace = "settle",
  label,
  className,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  size?: "xs" | "sm" | "md";
  pace?: "settle" | "live";
  label?: string;
  className?: string;
}) {
  const h = { xs: "h-1", sm: "h-1.5", md: "h-2.5" }[size];
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  return (
    <div
      className={cx("bg-fill-2 overflow-hidden rounded-full", h, className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className={cx(
          "h-full rounded-full transition-[width,background-color]",
          pace === "live"
            ? "duration-100 ease-linear"
            : "duration-(--dur-6) ease-(--ease-entrance)",
          TONE_FILL[tone],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ----------------------------------------------------------- ProgressArc */

/**
 * A ring, for the one figure on a screen that deserves to be a shape rather than a number.
 *
 * Drawn as a single stroked circle with `stroke-dasharray`, so it animates on the shared `draw`
 * keyframe and renders identically on the server.
 */
export function ProgressArc({
  value,
  max = 1,
  size = 120,
  thickness = 6,
  tone = "info",
  label,
  children,
  className,
}: {
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  tone?: Tone;
  label?: string;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0;
  const stroke = {
    neutral: "var(--color-ink-dim)",
    long: "var(--color-long)",
    short: "var(--color-short)",
    info: "var(--color-info)",
    attention: "var(--color-attention)",
    restraint: "var(--color-restraint)",
    gold: "var(--color-gold)",
  }[tone];

  return (
    <div
      className={cx("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {/* -90deg so the arc starts at twelve o'clock. A rotation on an SVG element, not on a
          DOM ancestor of anything — safe everywhere. */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-fill-2)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="transition-[stroke-dashoffset] duration-(--dur-7) ease-(--ease-entrance)"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 grid place-items-center">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Sparkline */

export function Sparkline({
  values,
  tone = "neutral",
  width = 72,
  height = 20,
  className,
}: {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const step = width / (values.length - 1);
  const d = values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(height - ((v - lo) / span) * height).toFixed(2)}`,
    )
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={TONE_INK[tone]}
      />
    </svg>
  );
}

/* ----------------------------------------------------------------- Gated */

/**
 * §4.9, as a component: "Do not display a number until the sample supports it. This is thematically
 * perfect — the game enforces the lesson that small samples mean nothing."
 *
 * It used to render the sentence `needs 6 more rounds` where a figure should be. A sentence in a
 * number's place is the loudest possible "this screen is unfinished" signal, and it appeared on
 * three separate pages. It says the same thing as a progress meter and a locked glyph, except the
 * meter also says how close you are — which turns a refusal into a goal.
 */
export function Gated({
  sample,
  min,
  label = "rounds",
  children,
}: {
  sample: number;
  min: number;
  label?: string;
  children: ReactNode;
}) {
  if (sample >= min) return <>{children}</>;
  return (
    <div
      className="flex items-center gap-2"
      title={`${min - sample} more ${label} until this means anything`}
    >
      <Icon name="lock" size={14} className="text-ink-faint shrink-0" />
      <Meter
        value={sample}
        max={min}
        tone="neutral"
        size="sm"
        className="w-16"
        label={`${sample} of ${min} ${label}`}
      />
      <span className="numeral text-ink-dim text-xs">
        {sample}/{min}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------- Segmented */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = "sm",
  className,
}: {
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "bg-fill-1 ring-line inline-flex rounded-md p-0.5 ring-1",
        className,
      )}
    >
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
              "press rounded-sm font-medium transition-colors disabled:opacity-35",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
              active
                ? "bg-surface-inv text-ink-inv"
                : "text-ink-lo hover:text-ink-hi enabled:hover:bg-fill-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- Skeleton */

/**
 * The loading placeholder.
 *
 * This existed before and was used exactly zero times, which is why four routes rendered a blank
 * screen for the length of a Supabase round trip. A skeleton is only worth anything if it has the
 * geometry of the thing it stands in for, so callers pass real heights rather than a generic box.
 */
export function Skeleton({
  variant = "block",
  lines = 1,
  className,
}: {
  variant?: "block" | "text" | "circle";
  lines?: number;
  className?: string;
}) {
  const base = "bg-fill-2 sheen-track animate-shimmer";
  if (variant === "text") {
    return (
      <div className={cx("flex flex-col gap-2", className)}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cx(base, "h-3.5 rounded")}
            // A ragged last line reads as text; a flush block reads as a box.
            style={{ width: i === lines - 1 && lines > 1 ? "62%" : "100%" }}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className={cx(
        base,
        variant === "circle" ? "rounded-full" : "rounded-lg",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "border-line-faint flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <span className="bg-fill-1 text-ink-dim grid h-12 w-12 place-items-center rounded-full">
          <Icon name={icon} size={22} />
        </span>
      )}
      <div className="text-ink-hi text-base font-medium">{title}</div>
      {body && <p className="text-ink-lo max-w-prose text-sm">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------- SectionHeader */

export function SectionHeader({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-end justify-between gap-4", className)}>
      <div>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="text-ink-max mt-1 text-xl font-semibold md:text-2xl">
          {title}
        </h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- Divider */

export function Divider({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  if (!label)
    return <hr className={cx("border-line-faint border-t", className)} />;
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <hr className="border-line-faint flex-1 border-t" />
      <span className="eyebrow text-ink-faint">{label}</span>
      <hr className="border-line-faint flex-1 border-t" />
    </div>
  );
}

/* ------------------------------------------------------------------ Tier */

/** The ruleset ladder. Rendered identically on the landing page and on a tape page. */
export function Tier({
  code,
  name,
  state,
  className,
}: {
  code: string;
  name: string;
  state: "live" | "soon" | "locked";
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-lg px-4 py-3",
        state === "live"
          ? "border-info-line bg-info-bg border"
          : "border-line-faint text-ink-dim border border-dashed",
        className,
      )}
    >
      <div
        className={cx(
          "numeral text-sm font-semibold",
          state === "live" ? "text-info-ink" : "text-ink-dim",
        )}
      >
        {code}
      </div>
      <div
        className={cx(
          "mt-0.5 text-xs",
          state === "live" ? "text-ink" : "text-ink-faint",
        )}
      >
        {name}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Field */

const INPUT_CLASS =
  "bg-surface-1 border-line text-ink placeholder:text-ink-faint h-12 w-full rounded-lg border px-3.5 text-base " +
  "transition-colors outline-none focus:border-focus";

export function Field({
  label,
  hint,
  error,
  mono,
  id,
  className,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  mono?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="text-ink-lo mb-1.5 block text-sm font-medium"
      >
        {label}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          INPUT_CLASS,
          mono && "font-mono",
          error && "border-short-line",
        )}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-short-ink mt-1.5 text-xs"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-ink-dim mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { INPUT_CLASS };

/* ------------------------------------------------------------- IconBadge */

/**
 * A tone-carrying disc behind an icon.
 *
 * The same 3rem circle was written out twice with different tones — once in `EmptyState` above and
 * once in `check-email`, which is the screen where it carries the most weight. Two copies of a
 * shape is how a design system starts drifting, and this one is small enough that nobody would
 * notice the day they stopped matching.
 */
export function IconBadge({
  icon,
  tone = "neutral",
  size = "md",
  className,
}: {
  icon: IconName;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const box =
    size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-12 w-12";
  const glyph = size === "sm" ? 16 : size === "lg" ? 26 : 22;
  return (
    <span
      className={cx(
        "grid place-items-center rounded-full ring-1",
        box,
        TONE_CHIP[tone],
        className,
      )}
    >
      <Icon name={icon} size={glyph} />
    </span>
  );
}

/* ----------------------------------------------------------------- Alert */

/**
 * A stated problem, or a stated fact worth interrupting for.
 *
 * There were three of these, all hand-rolled, all reaching for the same
 * `border-short-line bg-short-bg text-short-ink` triple and disagreeing about the rest: the sign-in
 * error at `rounded-lg p-3.5 text-sm`, the handle picker's at `rounded-md p-3 text-xs`, and
 * `Field`'s bare inline line. Three sizes of the same sentence.
 *
 * `role="alert"` only when it is a failure. An informational callout that announces itself the
 * moment it renders interrupts a screen reader mid-sentence for something the player did not do.
 */
export function Alert({
  tone = "short",
  title,
  icon,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: string;
  icon?: IconName;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const failure = tone === "short" || tone === "attention";
  return (
    <div
      role={failure ? "alert" : undefined}
      className={cx(
        "flex items-start gap-3 rounded-lg px-3.5 py-3 text-sm ring-1",
        TONE_CHIP[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={17} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && (
          <div className={cx("leading-relaxed", title && "mt-0.5 opacity-90")}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------- TextLink */

/**
 * An inline link inside prose.
 *
 * Three different class strings were doing this — `underline-offset-4` in auth, `-2` on the tapes
 * page, a third in the marketing footer. The offset is the whole legibility question for an
 * underline on a dark surface, so it is not a detail worth having three opinions about.
 */
export function TextLink({
  href,
  external,
  className,
  children,
  ...rest
}: {
  href: string;
  external?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a
      {...rest}
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : null)}
      className={cx(
        "text-ink-lo hover:text-ink-hi rounded-xs underline decoration-from-font underline-offset-4 transition-colors",
        className,
      )}
    >
      {children}
    </a>
  );
}

/* ---------------------------------------------------------------- Toggle */

/**
 * An independent on/off, as distinct from `Segmented`'s pick-one.
 *
 * The toolbox is the reason this exists. Its overlays were rendering through the same control as
 * its modal instruments, so "any number of these at once" and "exactly one of these" looked
 * identical and the difference had to be learned by clicking. A switch reads as a switch.
 *
 * `aria-pressed` rather than a checkbox `role`: this is a button that retains state, it takes
 * effect immediately, and there is no form to submit it with.
 */
export function Toggle({
  on,
  onChange,
  label,
  hint,
  disabled,
  swatch,
  className,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  /** A colour chip tying the row to what it draws on the chart. */
  swatch?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx(
        "press group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "enabled:hover:bg-fill-1",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          on ? "bg-info" : "bg-fill-3",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] duration-150",
            on ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink flex items-center gap-2 text-sm font-medium">
          {swatch && (
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: swatch }}
            />
          )}
          {label}
        </span>
        {hint && (
          <span className="text-ink-dim mt-0.5 block text-xs leading-relaxed">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------ Disclosure */

/**
 * A section that opens.
 *
 * Three of these were hand-rolled before it existed — the studies panel's exclusions, the sign-in
 * password form, the rules table of contents — and each one had to rediscover the same two things:
 * that `list-none` strips the native marker and leaves nothing behind unless you draw a chevron
 * yourself, and that rotating it needs `group-open:` on a `group` parent. Two of the three got it
 * right. That is the ratio a primitive exists to fix.
 *
 * Native `<details>` rather than state and a height transition. It is keyboard-operable, it is
 * announced as a disclosure, it survives find-in-page — Chrome and Firefox open a closed `<details>`
 * to reveal a match — and it costs nothing. A hand-built accordion gets none of that for free and
 * the animated-height version gets a layout thrash as well.
 *
 * The chevron is `rotate-180`, which is a transform, which creates a stacking context. That is
 * irrelevant here and worth saying once: this is an icon inside a summary, never an ancestor of the
 * chart frame, and `tests/stacking.test.ts` guards only the three files that are.
 */
export function Disclosure({
  label,
  aside,
  defaultOpen,
  tone = "plain",
  children,
  className,
}: {
  label: React.ReactNode;
  /** A count or a one-line summary, right-aligned — what the section says while it is shut. */
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  /** `panel` draws a border and padding; `plain` is a bare row for use inside something else. */
  tone?: "plain" | "panel";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cx(
        "group",
        tone === "panel" && "border-line rounded-lg border px-3 py-2.5",
        className,
      )}
    >
      <summary
        className={cx(
          "press text-ink-lo hover:text-ink-hi flex cursor-pointer list-none items-center gap-2",
          "rounded-md text-sm font-medium transition-colors",
          "focus-visible:ring-focus focus-visible:ring-2 focus-visible:outline-none",
        )}
      >
        <Icon
          name="chevron-down"
          size={14}
          className="text-ink-dim shrink-0 transition-transform group-open:rotate-180"
        />
        <span className="min-w-0 flex-1">{label}</span>
        {aside && (
          <span className="text-ink-faint shrink-0 text-xs">{aside}</span>
        )}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
