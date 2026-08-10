/**
 * The market signature.
 *
 * GeoGuessr gives you an avatar. This is the trading equivalent, drawn from the only vocabulary
 * the product actually has: a short run of candles and the path through them.
 *
 * It is generated rather than uploaded, which is a decision with consequences worth stating —
 * there is no upload endpoint, no storage bucket, no CDN, no moderation surface and no way to
 * make a profile picture into a problem. The player still owns it: the seed is theirs to reroll
 * and the accent is theirs to choose, so the space is large enough that a signature reads as
 * *yours* rather than as a default.
 *
 * §10.5 says a *style badge* is "earned, never self-selected". That rule is about the badge
 * derived from engine fingerprinting, which arrives with the council in Phase 3 and sits beside
 * this. A chosen cosmetic and an earned diagnostic are different things and the profile has room
 * for both.
 *
 * Deterministic and pure: the same seed always draws the same mark, on the server for an OG image
 * or a leaderboard row and in the browser for the picker, with no coordination between them.
 */

export const ACCENTS = ['ember', 'signal', 'frost', 'moss', 'violet', 'slate'] as const;
export type Accent = (typeof ACCENTS)[number];

/** The accent only ever colours the sparkline and the ring — never a candle body. */
export const ACCENT_HEX: Record<Accent, string> = {
  ember: '#f0883e',
  signal: '#4ea3ff',
  frost: '#5ad2e6',
  moss: '#6fbf73',
  violet: '#a980f0',
  slate: '#9aa4b8',
};

export const ACCENT_LABEL: Record<Accent, string> = {
  ember: 'Ember',
  signal: 'Signal',
  frost: 'Frost',
  moss: 'Moss',
  violet: 'Violet',
  slate: 'Slate',
};

export interface SignatureCandle {
  /** 0–1 within the mark's box. */
  open: number;
  close: number;
  high: number;
  low: number;
  up: boolean;
}

export interface Signature {
  candles: SignatureCandle[];
  /** The close path, as 0–1 points, for the sparkline drawn over the candles. */
  path: { x: number; y: number }[];
}

/** mulberry32 — small, fast, and good enough that neighbouring seeds do not look alike. */
function rng(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN_CANDLES = 7;
const MAX_CANDLES = 11;

/**
 * Build the mark.
 *
 * The walk is deliberately given a drift and a volatility of its own, so signatures differ in
 * character and not just in noise — some trend, some chop, which is the same axis the corpus is
 * stratified on and makes the set feel like it belongs to this product.
 */
export function signatureFor(seed: number): Signature {
  const random = rng(seed);
  const count = MIN_CANDLES + Math.floor(random() * (MAX_CANDLES - MIN_CANDLES + 1));
  const drift = (random() - 0.5) * 0.16;
  const vol = 0.09 + random() * 0.13;

  const raw: SignatureCandle[] = [];
  let level = 0.5;

  for (let i = 0; i < count; i++) {
    const open = level;
    const move = drift + (random() - 0.5) * vol * 2;
    let close = open + move;
    close = Math.min(0.95, Math.max(0.05, close));
    const wick = vol * (0.25 + random() * 0.6);
    const high = Math.min(1, Math.max(open, close) + wick * random());
    const low = Math.max(0, Math.min(open, close) - wick * random());
    raw.push({ open, close, high, low, up: close >= open });
    level = close;
  }

  // Rescale to fill the box, so a flat walk is not a thin line lost in the middle of the frame.
  const highest = Math.max(...raw.map((c) => c.high));
  const lowest = Math.min(...raw.map((c) => c.low));
  const span = Math.max(highest - lowest, 0.0001);
  const norm = (v: number) => 0.06 + ((v - lowest) / span) * 0.88;

  const candles = raw.map((c) => ({
    open: norm(c.open),
    close: norm(c.close),
    high: norm(c.high),
    low: norm(c.low),
    up: c.up,
  }));

  const path = candles.map((c, i) => ({
    x: (i + 0.5) / candles.length,
    y: c.close,
  }));

  return { candles, path };
}

/** A fresh seed. Kept in one place so the picker and the sign-up default agree. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

export function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && (ACCENTS as readonly string[]).includes(value);
}
