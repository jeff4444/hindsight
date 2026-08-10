import type { Bar } from '@/core/bars';

/**
 * A chart for the front door.
 *
 * Deliberately synthetic and deliberately deterministic.
 *
 * Synthetic, because the landing page is the most-visited surface in the product and a real path
 * shown there would be a path a returning player has already seen — §12.2 hides identity so a chart
 * cannot be looked up before the decision, and putting a memorisable one on the marquee undercuts
 * that for no gain.
 *
 * Deterministic, because it renders on the server and again on the client, and a random walk that
 * disagreed between the two is a hydration mismatch on the first thing anybody loads.
 *
 * This is not a corpus chart and is never scored. It exists to be looked at.
 */

/** mulberry32 — small, fast, and identical in every JS engine, which is the only requirement. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A walk with a little trend and a little clustering of volatility, which is enough to look like a
 * market at thumbnail size. It is not trying to be a realistic price process — it is trying to be
 * an honest picture of what the mechanic does to one.
 */
export function demoBars(seed = 20_260_811, count = 140): Bar[] {
  const random = rng(seed);
  const bars: Bar[] = [];
  let price = 100;
  let vol = 0.9;
  let drift = 0.04;

  for (let i = 0; i < count; i++) {
    // Regime changes, so the lead-in has something to read and the reveal has somewhere to go.
    if (i === 46) drift = -0.10;
    if (i === 80) drift = 0.16;
    if (i === 108) drift = 0.05;

    vol = Math.max(0.45, Math.min(2.0, vol + (random() - 0.5) * 0.22));
    const open = price;
    const move = drift + (random() - 0.5) * vol * 2.1;
    const close = Math.max(5, open + move);
    const wick = vol * (0.35 + random() * 0.75);
    bars.push({
      o: open,
      h: Math.max(open, close) + wick * random(),
      l: Math.min(open, close) - wick * random(),
      c: close,
      v: 40 + random() * 90 + (Math.abs(move) / vol) * 55,
    });
    price = close;
  }

  return bars;
}

/** The lead-in the demo shows before the reveal starts. */
export const DEMO_LEAD_IN = 80;
