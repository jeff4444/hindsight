import type { Bar } from '@/core/bars';
import { mulberry32 } from '@/core/random';
import { TICK_SIZE } from '@/core/normalize';

/**
 * Shared fixtures for the Layer 2 suites.
 *
 * Everything here is deterministic. A seeded generator rather than a recorded fixture, because the
 * metamorphic relations need to transform the input and re-run, and a recorded fixture would have
 * to be transformed by hand once per relation.
 */

/** Snap to the tick grid, since real corpus prices always are and several predicates rely on it. */
export function tick(price: number): number {
  return Math.round(price / TICK_SIZE) * TICK_SIZE;
}

/**
 * A seeded random walk, indexed near 100 and tick-quantised, in the shape the corpus produces.
 *
 * `trend` biases the drift so a caller can ask for something a channel or a trendline has an
 * opinion about rather than pure noise.
 */
export function walk(length: number, seed = 7, trend = 0): Bar[] {
  const rng = mulberry32(seed);
  const bars: Bar[] = [];
  let price = 100;

  for (let i = 0; i < length; i++) {
    const open = price;
    const close = Math.max(1, open + (rng() - 0.5) * 1.6 + trend);
    const high = Math.max(open, close) + rng() * 0.7;
    const low = Math.min(open, close) - rng() * 0.7;
    bars.push({
      o: tick(open),
      h: tick(high),
      l: tick(low),
      c: tick(close),
      v: tick(10 + rng() * 40),
    });
    price = close;
  }

  return bars;
}

/** Bars from an explicit close path, with wicks a fixed fraction outside the body. */
export function fromCloses(closes: readonly number[], wick = 0.2): Bar[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return {
      o: tick(open),
      h: tick(Math.max(open, close) + wick),
      l: tick(Math.min(open, close) - wick),
      c: tick(close),
      v: 10,
    };
  });
}

/* ------------------------------------------------- metamorphic transformations */

/** P ← kP. Every relative threshold must survive this; an absolute one cannot. */
export function scaled(bars: readonly Bar[], k: number): Bar[] {
  return bars.map((b) => ({ ...b, o: b.o * k, h: b.h * k, l: b.l * k, c: b.c * k }));
}

/** P ← P + c. The weakest relation, and it exercises almost nothing. Included for completeness. */
export function shifted(bars: readonly Bar[], c: number): Bar[] {
  return bars.map((b) => ({ ...b, o: b.o + c, h: b.h + c, l: b.l + c, c: b.c + c }));
}

/**
 * P ← 2m − P, with high and low swapping because the reflection reverses order.
 *
 * The arithmetic reflection, for the detectors that work in linear space. Its log-space counterpart
 * is `mirrorBar` from `src/core/normalize.ts` — the product's own §12.2 mirror, which `space.ts`
 * shows *is* this relation exactly, in log coordinates.
 */
export function reflected(bars: readonly Bar[], about = 100): Bar[] {
  const flip = (price: number) => tick(2 * about - price);
  return bars.map((b) => ({ ...b, o: flip(b.o), h: flip(b.l), l: flip(b.h), c: flip(b.c) }));
}

/** Volume jitter with prices frozen. Price geometry must be exactly invariant. */
export function volumeJittered(bars: readonly Bar[], seed = 31): Bar[] {
  const rng = mulberry32(seed);
  return bars.map((b) => ({ ...b, v: b.v * (0.1 + rng() * 5) }));
}

/**
 * Every close, high, low and open perturbed by a quarter tick in a seeded direction.
 *
 * §6's stability probe. A quarter tick is below the quote resolution, so a detector that changes
 * its answer here is telling you its answer was never about the price.
 */
export function jittered(bars: readonly Bar[], seed = 17): Bar[] {
  const rng = mulberry32(seed);
  const nudge = (price: number) => price + (rng() < 0.5 ? -TICK_SIZE / 4 : TICK_SIZE / 4);
  return bars.map((b) => ({
    ...b,
    o: nudge(b.o),
    h: nudge(b.h),
    l: nudge(b.l),
    c: nudge(b.c),
  }));
}
