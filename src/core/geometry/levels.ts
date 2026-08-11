/**
 * Support and resistance, by kernel density on log price.
 *
 * This is the best-evidenced component in Layer 2 and the one that survives the research intact.
 *
 * **Osler (2000)** is the study the design copies. She took the levels six FX firms actually
 * published to customers, January 1996 to March 1998 on one-minute quotes, and compared bounce
 * frequency against *artificial* levels: **56.2% artificial against 60.8% published, with all 16
 * firm–currency pairs showing published above artificial and 13 of 16 significant at 5%.** The
 * placebo design is the template, and it is the same shape as the permutation control 2c will run.
 *
 * **Chung & Bellotti (2021)** is why touch count is the strength weight: bounce probability rises
 * *monotonically* with the number of prior touches, reaching about 0.8 at eight touches against
 * about 0.5 for shuffled-returns controls. There is no comparable result for volume, so volume is
 * not a weight here however natural it looks.
 *
 * Two method choices, both with the alternative named:
 *
 * **Log price with an ATR-scaled bandwidth**, so a bandwidth means the same thing on a $60,000
 * instrument and a $1.08 one. Charts here are all indexed to 100, which would make a fixed
 * bandwidth *appear* to work — and then fail silently the first time the corpus admits a different
 * normalisation. Scale-freeness is cheap now and expensive to retrofit.
 *
 * **Prominence, not a fixed level count.** k-means is methodologically wrong for this: it forces
 * every extreme into a cluster and it requires a k. Prominence lets a chart have two levels or nine
 * because that is how many it has.
 *
 * A determinism trap, and the reason every constant below is written out longhand: scipy's
 * `'silverman'` for d=1 is the *normal reference* rule (1.0592·n^−1/5), not Silverman's robust rule
 * that R's `bw.nrd0` gives (0.9·min(σ, IQR/1.34)), and scipy's `'scott'` is 1.0 where the
 * literature says 1.06. **Three things called "Silverman" or "Scott" differ by up to 18%.** No
 * named library rule appears in this file.
 */

import type { Causal } from '../causal';
import { causal } from '../causal';
import { snap, toLog } from './space';
import type { Swing } from './swings';

export interface Level {
  /** The level, in displayed price, snapped to the tick grid. */
  price: number;
  /** Swing extremes within the touch band. The strength weight, per Chung & Bellotti. */
  touches: number;
  /** Density prominence, relative to the tallest peak. In [0, 1]. */
  prominence: number;
  /** Whether the supporting extremes are highs, lows, or both. */
  kind: 'resistance' | 'support' | 'both';
}

/**
 * Kernel bandwidth as a multiple of ATR, in relative terms.
 *
 * A quarter of an average true range. Wider and two adjacent swing highs a third of a range apart
 * merge into one level that is at neither of them; narrower and every wick becomes its own level.
 * Chosen once and published, in the spirit of Lo, Mamaysky & Wang's own note that shrinking their
 * cross-validated bandwidth was "admittedly an ad hoc approach" — said out loud, fixed before the
 * statistics were run, and never revised afterwards.
 */
export const BANDWIDTH_ATR_MULTIPLE = 0.25;

/** Grid resolution for evaluating the density, as a fraction of the bandwidth. */
export const GRID_STEP_FRACTION = 1 / 8;

/** A density peak must stand this fraction of the tallest peak above its saddle to count. */
export const MIN_PROMINENCE = 0.2;

/** How near a swing extreme must be to a level to count as touching it, in ATR. */
export const TOUCH_BAND_ATR_MULTIPLE = 0.25;

/** Gaussian kernel, written out rather than imported. */
function gaussian(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

/**
 * Topographic prominence of every local maximum of a sampled curve.
 *
 * A peak's prominence is its height above the highest saddle separating it from any higher peak —
 * the same 0-dimensional persistence idea `swings.ts` runs on price, applied here to density. The
 * highest peak has no higher neighbour and takes the full drop to the curve's minimum.
 *
 * O(m²) in the number of peaks, which on a bandwidth-resolved density is a handful.
 */
function prominences(density: readonly number[]): { index: number; height: number; prominence: number }[] {
  const peaks: number[] = [];
  for (let i = 1; i < density.length - 1; i++) {
    if (density[i] > density[i - 1] && density[i] >= density[i + 1]) peaks.push(i);
  }

  return peaks.map((peak) => {
    let bestSaddle = -Infinity;

    // Walk both ways tracking the lowest point reached, stopping at ground higher than the peak or
    // at the edge of the curve. Either way the answer is that running minimum; the two cases differ
    // only in where the walk stops. The key col is the *higher* of the two, which is why a peak
    // beside a taller neighbour gets only the shallow saddle between them.
    for (const direction of [-1, 1] as const) {
      let saddle = density[peak];
      for (let i = peak + direction; i >= 0 && i < density.length; i += direction) {
        if (density[i] > density[peak]) break;
        if (density[i] < saddle) saddle = density[i];
      }
      bestSaddle = Math.max(bestSaddle, saddle);
    }

    return { index: peak, height: density[peak], prominence: density[peak] - bestSaddle };
  });
}

/**
 * Levels from a set of settled swings.
 *
 * `atr` is the chart's pinned ATR — see `ATR_WINDOW_BARS` in `src/core/config.ts` for why it is a
 * fixed window at every tier. The reference price anchors the conversion of an ATR (a price
 * difference) into a log-space width; the geometric middle of the observed extremes is the natural
 * choice and, because these charts are indexed to 100, always close to it.
 *
 * A level is `knownAt` the moment its **last** counted touch settles, never the first. Reporting
 * "five touches" at the bar of the second one would be a look-ahead of exactly the kind
 * `src/core/causal.ts` exists to make impossible to write by accident.
 */
export function levelsFrom(swings: readonly Causal<Swing>[], atr: number): Causal<Level>[] {
  if (swings.length < 2 || !(atr > 0)) return [];

  const logs = swings.map((swing) => toLog(swing.value.price));
  const reference = Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
  const bandwidth = (BANDWIDTH_ATR_MULTIPLE * atr) / reference;
  if (!(bandwidth > 0)) return [];

  const lo = Math.min(...logs) - 3 * bandwidth;
  const hi = Math.max(...logs) + 3 * bandwidth;
  const step = bandwidth * GRID_STEP_FRACTION;

  // The grid is built outward from the centre of the range rather than upward from its bottom, and
  // that is not cosmetic. An upward grid leaves a sub-step remainder at the top, so reflecting the
  // input shifts every sample point by a fraction of a step and moves each density peak with it. A
  // centred grid maps onto itself reversed under reflection, exactly, which is what makes this
  // detector's mirror behaviour a property of the kernel rather than of the rounding.
  const centre = (lo + hi) / 2;
  const half = Math.max(1, Math.ceil((hi - lo) / (2 * step)));
  const points = 2 * half + 1;

  const grid: number[] = new Array(points);
  const density: number[] = new Array(points);
  for (let i = 0; i < points; i++) {
    const x = centre + (i - half) * step;
    grid[i] = x;
    let sum = 0;
    for (const value of logs) sum += gaussian((x - value) / bandwidth);
    density[i] = sum / (logs.length * bandwidth);
  }

  const peaks = prominences(density);
  const tallest = peaks.reduce((max, peak) => Math.max(max, peak.prominence), 0);
  if (!(tallest > 0)) return [];

  // The touch band is measured in the same metric as the kernel bandwidth — log space. Mixing them
  // is a live bug and not a subtle one: a linear band of ±0.25 around a level at 90 becomes a band
  // that is not symmetric about the reflected level at 111, so a chart and its §12.2 mirror
  // disagree about which extremes touch which level.
  const logBand = (TOUCH_BAND_ATR_MULTIPLE * atr) / reference;
  const out: Causal<Level>[] = [];

  for (const peak of peaks) {
    const relative = peak.prominence / tallest;
    if (relative < MIN_PROMINENCE) continue;

    const logPrice = grid[peak.index];
    const price = Math.exp(logPrice);
    const supporters = swings.filter((_, i) => Math.abs(logs[i] - logPrice) <= logBand);
    if (supporters.length < 2) continue;

    const highs = supporters.filter((swing) => swing.value.kind === 'high').length;
    const lows = supporters.length - highs;

    out.push(
      causal<Level>(
        {
          price: snap(price),
          touches: supporters.length,
          prominence: relative,
          kind: highs > 0 && lows > 0 ? 'both' : highs > 0 ? 'resistance' : 'support',
        },
        Math.min(...supporters.map((swing) => swing.existsAt)),
        Math.max(...supporters.map((swing) => swing.knownAt)),
      ),
    );
  }

  // Strongest first, then by price, so the order is total and reproducible.
  out.sort(
    (a, b) =>
      b.value.touches - a.value.touches ||
      b.value.prominence - a.value.prominence ||
      a.value.price - b.value.price,
  );
  return out;
}
