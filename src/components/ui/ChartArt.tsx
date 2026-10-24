import { signatureFor } from '@/lib/avatar';

/**
 * A small generated chart, for anything that wants to look like what it is.
 *
 * Deterministic from a seed, so a tape always wears the same picture and the server and client draw
 * the same one. The right-hand share is fog — the future the tape's charts will reveal — so even a
 * thumbnail carries the product's one idea. Drawn in the direction tokens, so it follows the theme
 * and the colour-blind palette like everything else.
 *
 * Decorative: `aria-hidden`, never the only carrier of meaning.
 */
export function ChartArt({
  seed,
  width = 240,
  height = 88,
  fog = 0.28,
  className,
}: {
  seed: number;
  width?: number;
  height?: number;
  /** Fraction of the width given to the fog, 0 for none. */
  fog?: number;
  className?: string;
}) {
  // Signatures end to end, one per ~110px, so a wide banner gets a long walk rather than a few
  // enormous candles. Each segment is re-based on the last close so the walk is continuous.
  const segments = Math.max(2, Math.round(width / 110));
  const candles: { open: number; close: number; high: number; low: number; up: boolean }[] = [];
  let offset = 0;
  for (let k = 0; k < segments; k++) {
    const part = signatureFor(seed * (k + 1) * 7 + 13 * k).candles;
    const shift = k === 0 ? 0 : offset - part[0].open;
    for (const c of part) {
      candles.push({ open: c.open + shift, close: c.close + shift, high: c.high + shift, low: c.low + shift, up: c.up });
    }
    offset = candles[candles.length - 1].close;
  }
  // Rescale the joined walk into the box.
  const hi = Math.max(...candles.map((c) => c.high));
  const lo = Math.min(...candles.map((c) => c.low));
  const span = Math.max(hi - lo, 1e-6);
  for (const c of candles) {
    c.open = 0.06 + ((c.open - lo) / span) * 0.88;
    c.close = 0.06 + ((c.close - lo) / span) * 0.88;
    c.high = 0.06 + ((c.high - lo) / span) * 0.88;
    c.low = 0.06 + ((c.low - lo) / span) * 0.88;
  }
  const pastWidth = width * (1 - fog);
  const step = pastWidth / (candles.length + 0.5);
  const body = Math.max(2, step * 0.56);
  const y = (v: number) => height - v * height;
  const id = `art-${seed}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      {fog > 0 && (
        <defs>
          <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-ink-max)" strokeOpacity="0.1" strokeWidth="1.5" />
          </pattern>
        </defs>
      )}
      {candles.map((c, i) => {
        const x = step * (i + 0.75);
        const colour = c.up ? 'var(--color-long)' : 'var(--color-short)';
        const top = y(Math.max(c.open, c.close));
        const h = Math.max(1.5, Math.abs(y(c.open) - y(c.close)));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={colour} strokeWidth="1" />
            <rect x={x - body / 2} y={top} width={body} height={h} rx="0.75" fill={colour} />
          </g>
        );
      })}
      {fog > 0 && (
        <>
          <rect x={pastWidth} y="0" width={width - pastWidth} height={height} fill={`url(#${id})`} />
          <line
            x1={pastWidth}
            x2={pastWidth}
            y1="0"
            y2={height}
            stroke="var(--color-ink-dim)"
            strokeDasharray="2 3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  );
}

/** A stable numeric seed from a string, so a tape's slug picks its picture. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647 || 1;
}
