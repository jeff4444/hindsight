/**
 * The null — does Layer 2 find structure that is actually there?
 *
 * §6 sets this as a first-class requirement rather than a nice-to-have:
 *
 * > Also run the detector on **permuted bars**: a geometry layer that finds structure in shuffled
 * > data at the same rate as in real data is telling you nothing, and that is a test v0.1 did not
 * > contemplate.
 *
 * And §14 makes it Phase 2's exit condition: "demonstrably no better than chance at finding
 * structure in permuted bars, **with that comparison published rather than merely passed**."
 *
 * ## The template, and the number that makes it worth copying
 *
 * Lo, Mamaysky & Wang (2000, *Journal of Finance*) ran their own detectors against simulated
 * geometric Brownian motion calibrated to the data. Head-and-shoulders: **1,611 real against 577
 * random** — a real effect. Broadening tops: **725 real against 1,227 random** — *random data
 * produced nearly twice as many*.
 *
 * That second row is the whole reason to build this. A detector can be perfectly deterministic,
 * perfectly causal, perfectly stable under perturbation, and still be finding a pattern that noise
 * produces more readily than markets do. Nothing else in the test suite catches that, and nobody in
 * this space has published the comparison since 2000.
 *
 * So `Verdict` has three values, not two, and `inverted` is a real outcome that gets published
 * rather than quietly retried with different thresholds.
 *
 * ## Two nulls, and why the order matters
 *
 * **Permutation is the strong null.** `src/core/permute.ts` shuffles the intrabar geometry triple
 * as a unit and the gaps separately, so the permuted series keeps the *exact* marginal distribution
 * of returns — fat tails, the real spread of candle shapes, the real volume distribution — and
 * loses only the ordering. A detector that beats this null is responding to *sequence*, which is
 * the only thing a chart reader can be reading.
 *
 * **Geometric Brownian motion is the weak null**, and it is here because it is what LMW used and
 * the comparison should be reproducible against them. It assumes normal log returns, which markets
 * violate badly. So a detector that beats GBM but *not* the permutation null is exploiting fat
 * tails rather than structure — an artefact that would look like a discovery if GBM were the only
 * null run. Both are reported; the permutation one is the one that decides.
 *
 * ## Why the effect size leads and the p-value does not
 *
 * With a thousand charts and twenty permutations each, almost any difference is "significant".
 * Park & Irwin (2007) reviewed 95 studies of technical analysis and named the failure directly —
 * "data snooping, ex post selection of trading rules". A ratio with a confidence interval says how
 * *much* better than chance; a p-value only says the sample was large. The ratio leads.
 */

import type { Bar } from '../bars';
import { mulberry32 } from '../random';

export type Verdict = 'discriminates' | 'no better than chance' | 'inverted';

export interface Comparison {
  /** Share of real charts the detector fired on. */
  realRate: number;
  /** Share of null charts the detector fired on, pooled over every draw. */
  nullRate: number;
  /** realRate / nullRate. 1.0 means the detector cannot tell markets from noise. */
  ratio: number;
  /** Bootstrap 95% interval on the ratio, resampling charts. */
  ci: { low: number; high: number };
  /** Charts compared, and null draws per chart. */
  charts: number;
  draws: number;
  verdict: Verdict;
}

/** Resamples used for the bootstrap interval. */
export const BOOTSTRAP_RESAMPLES = 2000;

/**
 * Compare a detector's hit rate on real charts against its hit rate on nulls.
 *
 * `real[i]` is whether the detector fired on chart *i*; `nulls[i]` is the same for each null draw
 * built from *that same chart*. Pairing matters: the charts differ enormously in volatility and
 * shape, and an unpaired comparison would let the null's composition drift away from the real
 * one's. Each null series inherits its chart's own return distribution.
 *
 * The bootstrap resamples **charts**, not individual observations, because a chart is the unit of
 * independence — its twenty permutations are twenty views of one object, and treating them as
 * twenty independent draws would shrink the interval by a factor of √20 for free.
 */
function compare(
  real: readonly number[],
  nulls: readonly (readonly number[])[],
  seed: number,
  options: { resamples?: number; rng?: () => number },
): Comparison {
  const charts = Math.min(real.length, nulls.length);
  const draws = charts > 0 ? nulls[0].length : 0;
  if (charts === 0 || draws === 0) {
    return {
      realRate: 0,
      nullRate: 0,
      ratio: NaN,
      ci: { low: NaN, high: NaN },
      charts,
      draws,
      verdict: 'no better than chance',
    };
  }

  const rng = options.rng ?? mulberry32(seed);
  const resamples = options.resamples ?? BOOTSTRAP_RESAMPLES;

  const meanOf = (indices: readonly number[]) => {
    let realSum = 0;
    let nullSum = 0;
    let nullTotal = 0;
    for (const i of indices) {
      realSum += real[i];
      for (const value of nulls[i]) {
        nullSum += value;
        nullTotal += 1;
      }
    }
    return {
      real: realSum / indices.length,
      null: nullTotal > 0 ? nullSum / nullTotal : 0,
    };
  };

  // A null rate of zero makes the ratio infinite rather than undefined: the detector fired on real
  // charts and never on noise, which is the strongest possible result and should not be discarded
  // as a division error.
  const ratioOf = (m: { real: number; null: number }) =>
    m.null > 0 ? m.real / m.null : m.real > 0 ? Infinity : 1;

  const observed = meanOf(Array.from({ length: charts }, (_, i) => i));

  const ratios: number[] = [];
  for (let r = 0; r < resamples; r++) {
    const sample = Array.from({ length: charts }, () => Math.floor(rng() * charts));
    ratios.push(ratioOf(meanOf(sample)));
  }
  ratios.sort((a, b) => a - b);

  const ci = {
    low: ratios[Math.floor(0.025 * (ratios.length - 1))],
    high: ratios[Math.floor(0.975 * (ratios.length - 1))],
  };

  return {
    realRate: observed.real,
    nullRate: observed.null,
    ratio: ratioOf(observed),
    ci,
    charts,
    draws,
    verdict: ci.low > 1 ? 'discriminates' : ci.high < 1 ? 'inverted' : 'no better than chance',
  };
}

export function compareRates(
  real: readonly boolean[],
  nulls: readonly (readonly boolean[])[],
  options: { resamples?: number; rng?: () => number } = {},
): Comparison {
  return compare(
    real.map((hit) => (hit ? 1 : 0)),
    nulls.map((row) => row.map((hit) => (hit ? 1 : 0))),
    0x2c_2c_2c,
    options,
  );
}

/**
 * The same comparison for a count rather than a hit — swings per chart, hull edges per chart.
 *
 * A separate entry point rather than one generic function, because the two answer different
 * questions and a caller that confuses them gets a plausible number back: "how often does this
 * fire" and "how much does it find" are not the same test. The arithmetic underneath is shared,
 * since a proportion is a mean of indicators.
 */
export function compareCounts(
  real: readonly number[],
  nulls: readonly (readonly number[])[],
  options: { resamples?: number; rng?: () => number } = {},
): Comparison {
  return compare(real, nulls, 0x2c_2c_2d, options);
}

/* ------------------------------------------------------------------ the weak null */

/**
 * Geometric Brownian motion calibrated to one chart's own volatility.
 *
 * The null Lo, Mamaysky & Wang used, reproduced so the comparison is theirs as well as ours. It is
 * deliberately the *weaker* of the two: normal log returns discard the fat tails that every real
 * price series has, so a detector can beat this null by responding to a single outsized bar and
 * look like it has found something.
 *
 * Calibrated per chart rather than corpus-wide — the corpus spans a 4×4 volatility grid, and one
 * pooled σ would make the null too quiet for the violent charts and too violent for the quiet ones,
 * which is not a null, it is a different question asked of each half of the library.
 *
 * Candle geometry is drawn around the close path in proportion to σ, so the bars look like bars.
 * They are not real candle shapes — that is exactly what the permutation null preserves and this
 * one does not, and it is why this one does not decide anything.
 */
export function gbmBars(bars: readonly Bar[], seed: number): Bar[] {
  if (bars.length < 2) return bars.map((bar) => ({ ...bar }));

  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) returns.push(Math.log(bars[i].c / bars[i - 1].c));
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  const sigma = Math.sqrt(variance);

  const rng = mulberry32(seed >>> 0);
  // Box–Muller, written out rather than imported, for the same reason the kernel is.
  const normal = () => {
    const u = Math.max(1e-12, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  };

  const out: Bar[] = [];
  let close = bars[0].o;
  for (let i = 0; i < bars.length; i++) {
    const open = close;
    close = open * Math.exp(mean + sigma * normal());
    const wick = sigma * Math.abs(normal()) * open;
    out.push({
      o: open,
      h: Math.max(open, close) + wick,
      l: Math.min(open, close) - wick,
      c: close,
      v: bars[i].v,
    });
  }
  return out;
}
