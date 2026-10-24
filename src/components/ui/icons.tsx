import { useId, type ReactElement } from 'react';
import { MARK } from './brand';

/**
 * The icon set.
 *
 * Rule: bespoke where the glyph names a *product concept*, a normalised stock path where it names
 * a *UI mechanic*.
 *
 * The original four icons in AppShell were right in spirit — a candle, a reel, a distribution
 * drawn from the product's own vocabulary, because a stock house/chart/person trio says nothing
 * about these particular destinations. That reasoning does not extend to a close button. Nobody
 * has ever been served by a bespoke X, and hand-drawing twenty utility glyphs reliably produces a
 * set that looks hand-drawn in the bad sense: inconsistent joins, drifting stroke weight, eight
 * different ideas about what a 2px radius is.
 *
 * So the product glyphs are redrawn from the 18px originals onto this grid, and the utility glyphs
 * are Lucide paths (ISC licence, https://lucide.dev) vendored rather than installed. Twenty paths
 * is not worth a dependency, and vendoring means the stroke weight is ours.
 *
 * One grid for everything: 24x24, 1.5 stroke, round caps and joins, `currentColor`, no fill except
 * inside a product mark where a filled candle body is the point.
 */

export type IconName =
  // product vocabulary
  | 'candle'
  | 'tape'
  | 'distribution'
  | 'signature'
  | 'freeze'
  | 'rail'
  | 'oracle'
  | 'rules'
  // ui mechanics
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'arrow-left'
  | 'arrow-up-right'
  | 'x'
  | 'check'
  | 'copy'
  | 'share'
  | 'settings'
  | 'info'
  | 'lock'
  | 'play'
  | 'pause'
  | 'skip-forward'
  | 'rotate-ccw'
  | 'keyboard'
  | 'alert'
  | 'sparkle'
  | 'dice'
  // the toolbox
  | 'ruler'
  | 'trendline'
  | 'level'
  | 'channel'
  | 'fib'
  | 'magnet'
  | 'activity'
  | 'log-scale'
  | 'trash'
  // modes and navigation (Lucide)
  | 'bolt'
  | 'heart'
  | 'swords'
  | 'flag'
  | 'sliders'
  | 'trophy'
  | 'sun'
  | 'book'
  | 'user'
  | 'log-out'
  | 'shield'
  | 'shuffle'
  | 'clock'
  | 'plus'
  | 'volume'
  | 'arrow-up'
  | 'arrow-down'
  | 'minus'
  | 'eye'
  | 'users'
  | 'grid';

/** `s` is the stroke width, so a caller can thin the set down without redrawing it. */
const GLYPHS: Record<IconName, (s: number) => ReactElement> = {
  /* ------------------------------------------------- product vocabulary */

  // Two candles, one taller. The Today destination: what is on the screen right now.
  candle: (s) => (
    <>
      <rect x="4" y="8" width="4" height="8" rx="1.3" fill="currentColor" stroke="none" />
      <path d="M6 5v3M6 16v3" strokeWidth={s} />
      <rect x="14" y="5.5" width="4" height="10.5" rx="1.3" fill="currentColor" stroke="none" opacity="0.55" />
      <path d="M16 3v2.5M16 16v4" strokeWidth={s} opacity="0.55" />
    </>
  ),

  // A reel. Tapes are recorded stretches of market you can replay.
  tape: (s) => (
    <>
      <rect x="3" y="5" width="18" height="13" rx="3" strokeWidth={s} />
      <circle cx="8.5" cy="11" r="2.1" strokeWidth={s} />
      <circle cx="15.5" cy="11" r="2.1" strokeWidth={s} />
      <path d="M8.5 15.5h7" strokeWidth={s} />
    </>
  ),

  // A right-skewed distribution — the literal shape of an achievable set.
  distribution: (s) => (
    <path d="M4.5 19.5v-5M9.5 19.5v-11M14.5 19.5v-8M19.5 19.5v-4" strokeWidth={s + 0.1} />
  ),

  signature: (s) => (
    <>
      <circle cx="12" cy="8.5" r="3.6" strokeWidth={s} />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" strokeWidth={s} />
    </>
  ),

  // The six-point asterisk already used for streak freezes.
  freeze: (s) => <path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10" strokeWidth={s} />,

  // A price level with a grab handle: the thing the whole game is played with.
  rail: (s) => (
    <>
      <path d="M2.5 12h19" strokeWidth={s} />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1.5" fill="currentColor" stroke="none" />
    </>
  ),

  // A path, and the best point on it.
  oracle: (s) => (
    <>
      <path d="M2.5 18l5-5 3.5 2.5 4-5" strokeWidth={s} />
      <path d="M19 3.8l.95 2.25L22.2 7l-2.25.95L19 10.2l-.95-2.25L15.8 7l2.25-.95z" fill="currentColor" stroke="none" />
    </>
  ),

  rules: (s) => (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="2.5" strokeWidth={s} />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" strokeWidth={s} />
    </>
  ),

  /* ------------------------------------------------------ ui mechanics */

  'chevron-down': (s) => <path d="m6 9 6 6 6-6" strokeWidth={s} />,
  'chevron-left': (s) => <path d="m15 18-6-6 6-6" strokeWidth={s} />,
  'chevron-right': (s) => <path d="m9 18 6-6-6-6" strokeWidth={s} />,
  'arrow-left': (s) => <path d="M19 12H5m7 7-7-7 7-7" strokeWidth={s} />,
  'arrow-up-right': (s) => <path d="M7 17 17 7M7 7h10v10" strokeWidth={s} />,
  x: (s) => <path d="M18 6 6 18M6 6l12 12" strokeWidth={s} />,
  check: (s) => <path d="M20 6 9 17l-5-5" strokeWidth={s} />,
  copy: (s) => (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth={s} />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeWidth={s} />
    </>
  ),
  share: (s) => <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" strokeWidth={s} />,
  settings: (s) => (
    <path
      d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"
      strokeWidth={s}
    />
  ),
  info: (s) => (
    <>
      <circle cx="12" cy="12" r="9.25" strokeWidth={s} />
      <path d="M12 16.5v-5M12 7.75h.01" strokeWidth={s} />
    </>
  ),
  lock: (s) => (
    <>
      <rect x="3.5" y="10.5" width="17" height="10.5" rx="2.5" strokeWidth={s} />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" strokeWidth={s} />
    </>
  ),
  play: (s) => <path d="M7.5 5.2v13.6a1 1 0 0 0 1.53.85l10.7-6.8a1 1 0 0 0 0-1.7L9.03 4.35a1 1 0 0 0-1.53.85z" strokeWidth={s} />,
  pause: (s) => <path d="M9.5 5v14M14.5 5v14" strokeWidth={s} />,
  'skip-forward': (s) => (
    <path d="M5 5.2v13.6a1 1 0 0 0 1.53.85l8.7-6.8a1 1 0 0 0 0-1.7L6.53 4.35A1 1 0 0 0 5 5.2zM19 5v14" strokeWidth={s} />
  ),
  'rotate-ccw': (s) => <path d="M3 3v6h6M3.5 9.5a9 9 0 1 0 2.6-4.1L3 9" strokeWidth={s} />,
  keyboard: (s) => (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2.5" strokeWidth={s} />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" strokeWidth={s} />
    </>
  ),
  alert: (s) => (
    <path
      d="M10.26 4a2 2 0 0 1 3.48 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.74-3zM12 9v4.5M12 17.2h.01"
      strokeWidth={s}
    />
  ),
  sparkle: (s) => <path d="M12 3.2l2.1 5.6 5.6 2.1-5.6 2.1L12 18.6l-2.1-5.6L4.3 10.9l5.6-2.1z" strokeWidth={s} />,
  dice: (s) => (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3.5" strokeWidth={s} />
      <path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" strokeWidth={s} />
    </>
  ),

  /* ---------------------------------------------------------- the toolbox */

  /**
   * Drawing instruments, and they are product vocabulary rather than UI mechanics — so they are
   * drawn here rather than borrowed. Every one of them is *the mark it makes*: the line tool is a
   * line with its two anchors, the channel is two parallel rails, the fib is unevenly spaced levels
   * because uneven spacing is the whole tell. A player should be able to read the palette without
   * the labels, which is the test an icon has to pass to be worth using at all.
   */

  // A ruler, ticks down. Universal at every rung, so it is the one instrument that is never locked.
  ruler: (s) => (
    <>
      <rect x="2.5" y="8.5" width="19" height="7" rx="1.6" strokeWidth={s} />
      <path d="M7 8.5v3M11.75 8.5v4.25M16.5 8.5v3" strokeWidth={s} />
    </>
  ),

  // A line and the two points that define it. The anchors are filled, matching `rail`'s handle.
  trendline: (s) => (
    <>
      <path d="M5.6 17.4 18.4 6.6" strokeWidth={s} />
      <circle cx="4.6" cy="18.4" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="19.4" cy="5.6" r="2.1" fill="currentColor" stroke="none" />
    </>
  ),

  // A horizontal level. Anchors at the ends, unlike `rail`, whose handle is in the middle.
  level: (s) => (
    <>
      <path d="M6 12h12" strokeWidth={s} />
      <circle cx="4" cy="12" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="20" cy="12" r="2.1" fill="currentColor" stroke="none" />
    </>
  ),

  channel: (s) => <path d="M3.5 16.2 16.2 4.5M7.8 19.5 20.5 7.8" strokeWidth={s} />,

  // Deliberately uneven: 0, .382, .5, .618, 1 is what a retracement looks like.
  fib: (s) => <path d="M3.5 4.5h17M3.5 10.4h17M3.5 12.9h17M3.5 15.4h17M3.5 19.5h17" strokeWidth={s} />,

  magnet: (s) => (
    <>
      <path d="M7 3.5v8.5a5 5 0 0 0 10 0V3.5" strokeWidth={s} />
      <path d="M4.5 3.5h5M14.5 3.5h5" strokeWidth={s} />
    </>
  ),

  // A trace with a spike. Stands for the studies as a group, where `distribution` is a histogram.
  activity: (s) => <path d="M2.5 12.5h4l3-7.5 4 14 3-6.5h5" strokeWidth={s} />,

  // Steep then flattening, against an axis: the shape a log scale imposes.
  'log-scale': (s) => (
    <>
      <path d="M4 3.5v17h17" strokeWidth={s} />
      <path d="M7 17.5c5.5 0 5-10 12-10.5" strokeWidth={s} />
    </>
  ),

  trash: (s) => (
    <>
      <path
        d="M3.5 6.5h17M9 6.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v1.5M17.5 6.5v13A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-13"
        strokeWidth={s}
      />
      <path d="M10.25 10.5v6M13.75 10.5v6" strokeWidth={s} />
    </>
  ),

  /* ------------------------------------------------ modes and navigation */

  bolt: (s) => (
    <path
      d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"
      strokeWidth={s}
    />
  ),
  heart: (s) => (
    <path
      d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
      strokeWidth={s}
    />
  ),
  swords: (s) => (
    <path
      d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M14.5 6.5 18 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"
      strokeWidth={s}
    />
  ),
  flag: (s) => <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" strokeWidth={s} />,
  sliders: (s) => (
    <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" strokeWidth={s} />
  ),
  trophy: (s) => (
    <path
      d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"
      strokeWidth={s}
    />
  ),
  sun: (s) => (
    <>
      <circle cx="12" cy="12" r="4" strokeWidth={s} />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" strokeWidth={s} />
    </>
  ),
  book: (s) => (
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" strokeWidth={s} />
  ),
  user: (s) => (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" strokeWidth={s} />
      <circle cx="12" cy="7" r="4" strokeWidth={s} />
    </>
  ),
  'log-out': (s) => <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeWidth={s} />,
  shield: (s) => (
    <path
      d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
      strokeWidth={s}
    />
  ),
  shuffle: (s) => (
    <path
      d="m18 14 4 4-4 4M18 2l4 4-4 4M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-7.6a4 4 0 0 1 3.3-1.7H22M2 6h1.972a4 4 0 0 1 3.6 2.2M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"
      strokeWidth={s}
    />
  ),
  clock: (s) => (
    <>
      <circle cx="12" cy="12" r="9.25" strokeWidth={s} />
      <path d="M12 7v5l3 2" strokeWidth={s} />
    </>
  ),
  plus: (s) => <path d="M12 5v14M5 12h14" strokeWidth={s} />,
  minus: (s) => <path d="M5 12h14" strokeWidth={s} />,
  volume: (s) => (
    <path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5zM16 9a5 5 0 0 1 0 6M19.4 18.4a9 9 0 0 0 0-12.8" strokeWidth={s} />
  ),
  'arrow-up': (s) => <path d="M12 19V5M5 12l7-7 7 7" strokeWidth={s} />,
  'arrow-down': (s) => <path d="M12 5v14M19 12l-7 7-7-7" strokeWidth={s} />,
  eye: (s) => (
    <>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" strokeWidth={s} />
      <circle cx="12" cy="12" r="3" strokeWidth={s} />
    </>
  ),
  users: (s) => (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeWidth={s} />
      <circle cx="9" cy="7" r="4" strokeWidth={s} />
    </>
  ),
  grid: (s) => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth={s} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth={s} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth={s} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth={s} />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  stroke = 1.5,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  /** Supply only when the icon is the sole label. Otherwise it stays `aria-hidden`. */
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {GLYPHS[name](stroke)}
    </svg>
  );
}

/**
 * The mark: two candle bodies form an H, and the bar between them is the entry line. Solid on the
 * left — the past, revealed. Hatched on the right — the future, still fog. Geometry lives in
 * `brand.ts`, which also feeds the favicon, the OG image and the error page.
 *
 * `tone="mono"` inherits `currentColor` — nav, footers. `tone="duo"` paints the future candle gold.
 */
export function Mark({
  size = 24,
  tone = 'mono',
  className,
  drawing = false,
}: {
  size?: number;
  tone?: 'mono' | 'duo';
  className?: string;
  /** Draws the future body in, using the shared `draw` keyframe. The mark reveals itself. */
  drawing?: boolean;
}) {
  // Sanitised: React's ids carry characters that are not legal inside `url(#…)`.
  const id = `hs-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { past, future, bar, hatch } = MARK;
  const ink = 'currentColor';
  const gold = tone === 'duo' ? 'var(--color-gold)' : 'currentColor';

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect {...past} fill={ink} />
      <clipPath id={id}>
        <rect x={future.x} y={future.y} width={future.width} height={future.height} rx={future.rx} />
      </clipPath>
      <g clipPath={`url(#${id})`} stroke={gold} strokeWidth="1.1" strokeLinecap="round" opacity="0.8">
        {hatch.map(([x1, y1, x2, y2]) => (
          <line key={y1} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <rect
        x={future.x}
        y={future.y}
        width={future.width}
        height={future.height}
        rx={future.rx}
        fill="none"
        stroke={gold}
        strokeWidth={future.stroke}
        className={drawing ? 'animate-draw' : undefined}
        style={drawing ? ({ strokeDasharray: 58, '--len': 58 } as React.CSSProperties) : undefined}
      />
      <rect {...bar} fill={ink} />
    </svg>
  );
}

/**
 * Mark plus logotype. The name is set in the serif, mixed case: the product's voice, at the one
 * size it appears on every screen.
 */
export function Wordmark({
  size = 'md',
  showMark = true,
  tone = 'duo',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showMark?: boolean;
  tone?: 'mono' | 'duo';
  className?: string;
}) {
  const mark = size === 'sm' ? 18 : size === 'lg' ? 30 : 22;
  const text = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-[1.75rem]' : 'text-[1.375rem]';
  return (
    <span className={['text-ink-max inline-flex items-center gap-2', className].filter(Boolean).join(' ')}>
      {showMark && <Mark size={mark} tone={tone} />}
      <span className={`font-display leading-none ${text}`}>Hindsight</span>
    </span>
  );
}
