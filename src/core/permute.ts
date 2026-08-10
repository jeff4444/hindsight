/**
 * Bar permutation.
 *
 * §6 Layer 0: "A bar-permutation generator that shuffles the intrabar geometry triple as a unit
 * and shuffles gaps separately, preserving candle realism and multiplicative scale. Used for the
 * honesty programme in §8 and for validating that the geometry layer is not finding structure in
 * noise."
 *
 * The point is a null that a chart reader cannot tell apart from the real thing by eye. Shuffling
 * closes would fail immediately — the result does not look like a market. Shuffling in log space,
 * with each bar's internal geometry moved as one piece, produces a series with the same marginal
 * distribution of gaps, the same marginal distribution of candle shapes, the same multiplicative
 * scale, and no serial structure at all.
 *
 * Two things it is for, both later:
 *
 *   §6 Layer 2  "a geometry layer that finds structure in shuffled data at the same rate as in
 *               real data is telling you nothing"
 *   §7.2        synthetic controls mixed into the corpus, which is Phase 4
 *
 * Phase 0.5 builds the generator and the tests. It does not put permuted charts in the corpus.
 */

import type { Bar } from './bars';
import { mulberry32 } from './random';

/**
 * One bar, decomposed relative to its own open, in log space.
 *
 * The triple is what §6 means by "intrabar geometry": where the high, low and close sat relative
 * to the open. Because it is taken from a real bar, `high ≥ max(0, close)` and
 * `low ≤ min(0, close)` hold, and they keep holding wherever the triple is reattached — which is
 * exactly why candle realism survives the shuffle.
 */
interface Geometry {
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PermutationParts {
  /** log(open_i) − log(close_{i−1}), one per bar after the first. */
  gaps: number[];
  /** Intrabar geometry, one per bar. */
  geometry: Geometry[];
  /** The first bar's open, which anchors the reconstruction. */
  anchor: number;
}

/** Split a series into the two things that get shuffled independently. */
export function decompose(bars: readonly Bar[]): PermutationParts {
  const gaps: number[] = [];
  const geometry: Geometry[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const logOpen = Math.log(bar.o);

    if (i > 0) gaps.push(logOpen - Math.log(bars[i - 1].c));

    geometry.push({
      high: Math.log(bar.h) - logOpen,
      low: Math.log(bar.l) - logOpen,
      close: Math.log(bar.c) - logOpen,
      // Volume travels with the bar's geometry rather than being shuffled separately. §6 does
      // not say which, so this is a choice: a bar's range and its volume belong to the same
      // event, and separating them would produce wide candles on no volume at a rate the real
      // series never shows — visible to anyone reading the volume pane.
      volume: bar.v,
    });
  }

  return { gaps, geometry, anchor: bars.length > 0 ? bars[0].o : 1 };
}

/** Rebuild a series multiplicatively from an anchor, a gap order and a geometry order. */
export function recompose(parts: PermutationParts): Bar[] {
  const { gaps, geometry, anchor } = parts;
  const bars: Bar[] = [];
  let open = anchor;

  for (let i = 0; i < geometry.length; i++) {
    if (i > 0) open = bars[i - 1].c * Math.exp(gaps[i - 1]);
    const shape = geometry[i];

    bars.push({
      o: open,
      h: open * Math.exp(shape.high),
      l: open * Math.exp(shape.low),
      c: open * Math.exp(shape.close),
      v: shape.volume,
    });
  }

  return bars;
}

/** Fisher–Yates over an index range, seeded. */
function permutation(length: number, rng: () => number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * A permuted series: same anchor, same multiset of gaps, same multiset of candle shapes, and
 * serial structure destroyed.
 *
 * Gaps and geometry get **independent** permutations, per §6. Reusing one order for both would
 * keep each gap attached to the candle that followed it, preserving a correlation the null is
 * supposed to remove.
 */
export function permuteBars(bars: readonly Bar[], seed: number): Bar[] {
  if (bars.length < 2) return bars.map((bar) => ({ ...bar }));

  const parts = decompose(bars);
  const gapRng = mulberry32(seed >>> 0);
  // Offset so the two permutations are drawn from different streams rather than the same one.
  const geometryRng = mulberry32((seed ^ 0x9e3779b9) >>> 0);

  const gapOrder = permutation(parts.gaps.length, gapRng);
  const geometryOrder = permutation(parts.geometry.length, geometryRng);

  return recompose({
    anchor: parts.anchor,
    gaps: gapOrder.map((i) => parts.gaps[i]),
    geometry: geometryOrder.map((i) => parts.geometry[i]),
  });
}

/**
 * Lag-1 autocorrelation of log returns.
 *
 * Not used in production — it is how the tests assert that the permutation did the one thing it
 * exists to do. A permuted series should keep the return *distribution* and lose the ordering.
 */
export function returnAutocorrelation(bars: readonly Bar[]): number {
  if (bars.length < 3) return 0;

  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) returns.push(Math.log(bars[i].c / bars[i - 1].c));

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < returns.length; i++) {
    const d = returns[i] - mean;
    denominator += d * d;
    if (i > 0) numerator += d * (returns[i - 1] - mean);
  }

  return denominator === 0 ? 0 : numerator / denominator;
}
