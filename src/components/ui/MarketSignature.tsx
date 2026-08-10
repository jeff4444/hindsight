import { ACCENT_HEX, signatureFor, type Accent } from '@/lib/avatar';
import { CANDLE } from '@/lib/palette';

/**
 * A player's generative avatar, drawn as inline SVG.
 *
 * Candle bodies always use the product's own up and down colours, and the accent only touches the
 * sparkline and the ring — so a player's chosen colour can never collide with the one meaning that
 * is fixed across the whole interface, which is which way price went.
 *
 * No 'use client': it is deterministic from its props, so it server-renders and never ships a
 * byte of JavaScript unless something around it is interactive.
 */
export function MarketSignature({
  seed,
  accent,
  size = 40,
  ring = 'none',
  className,
  animate = false,
}: {
  seed: number;
  accent: Accent;
  size?: number;
  /** `gold` marks §10.3's perfect streak. Nothing else earns it. */
  ring?: 'none' | 'accent' | 'gold';
  className?: string;
  animate?: boolean;
}) {
  const { candles, path } = signatureFor(seed);
  const stroke = ACCENT_HEX[accent];
  const W = 100;
  const H = 100;
  const slot = W / candles.length;
  const bodyW = Math.max(slot * 0.46, 3);

  const y = (v: number) => H - v * H;
  const line = path.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * W).toFixed(2)},${y(p.y).toFixed(2)}`).join(' ');

  const ringColour = ring === 'gold' ? 'var(--color-gold)' : stroke;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        borderRadius: '50%',
        padding: ring === 'none' ? 0 : Math.max(2, size * 0.055),
        boxShadow: ring === 'none' ? undefined : `inset 0 0 0 1.5px ${ringColour}`,
        background: 'var(--color-surface-1)',
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        role="img"
        aria-label="Market signature"
        style={{ borderRadius: '50%', display: 'block' }}
      >
        <rect width={W} height={H} fill="var(--color-surface-1)" />
        {candles.map((c, i) => {
          const cx = slot * (i + 0.5);
          const top = y(Math.max(c.open, c.close));
          const bottom = y(Math.min(c.open, c.close));
          const colour = c.up ? CANDLE.up : CANDLE.down;
          return (
            <g key={i} opacity={0.92}>
              <line x1={cx} x2={cx} y1={y(c.high)} y2={y(c.low)} stroke={colour} strokeWidth={1.4} />
              <rect
                x={cx - bodyW / 2}
                y={top}
                width={bodyW}
                height={Math.max(bottom - top, 2)}
                fill={colour}
                rx={0.8}
              />
            </g>
          );
        })}
        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.95}
          style={
            animate
              ? { strokeDasharray: 400, animation: 'draw var(--dur-5) var(--ease-entrance) both', ['--len' as string]: 400 }
              : undefined
          }
        />
      </svg>
    </span>
  );
}
