import { cx } from '../ui';

/**
 * An equity curve: a line over time with its starting level marked, green above it and red below.
 *
 * SVG and server-safe, so a statement can draw one without shipping a charting library. Values are
 * in whatever units the caller passes; only their shape is drawn.
 */
export function EquityCurve({
  values,
  height = 120,
  baseline,
  className,
  label,
}: {
  values: readonly number[];
  height?: number;
  /** The level the curve is measured against. Defaults to the first value. */
  baseline?: number;
  className?: string;
  label: string;
}) {
  if (values.length < 2) {
    return <div className={cx('text-ink-dim grid place-items-center text-xs', className)} style={{ height }}>Not enough history to draw yet.</div>;
  }
  const width = 600;
  const base = baseline ?? values[0];
  const lo = Math.min(base, ...values);
  const hi = Math.max(base, ...values);
  const span = hi - lo || 1;
  const pad = 6;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => pad + (height - 2 * pad) * (1 - (v - lo) / span);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const baseY = y(base);
  const last = values[values.length - 1];
  const up = last >= base;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cx('w-full', className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id="equity-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={width} y1={baseY} y2={baseY} className="stroke-line-strong" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <g className={up ? 'text-long' : 'text-short'}>
        <path d={`${d} L${width},${height} L0,${height} Z`} fill="url(#equity-fill)" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
