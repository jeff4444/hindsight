/**
 * Synthetic controls — charts that are not a market, mixed in silently.
 *
 * §7.2 is the most valuable measurement in the document and the only mitigation §15 offers for its
 * top risk: *"the environment may have too little validity for the skill to exist."* Mix fake charts
 * into the corpus and measure whether players score higher on real ones. Three outcomes, all worth
 * having, and the product's claims depend on which arrives.
 *
 * ## The generator §7.2 names first cannot be used
 *
 * `docs/phase-4-research.md` §1.2 measures all three candidates on this corpus. Hourly log returns,
 * ACF(|r|) is the volatility-clustering signature and a Gaussian has kurtosis 3:
 *
 * | | ACF(&#124;r&#124;) lag 1 | kurtosis |
 * | --- | --- | --- |
 * | **real** | **0.183** | **13.02** |
 * | permutation | −0.004 | 12.96 |
 * | block bootstrap, 16 bars | 0.151 | 11.21 |
 * | **GBM** | **−0.001** | **2.98** |
 *
 * **GBM fails both stylised facts.** Kurtosis 2.98 against a real 13.0 means no fat tails at all —
 * no gaps, no shocks, nothing resembling a liquidation cascade. It is not a hard control, it is an
 * obviously fake chart, and §7.2 names it first. It is not implemented here.
 *
 * ## Two generators, because they answer different questions
 *
 * **Permutation** (`permuteBars`, built in Phase 0.5) is the *cleanest null*: it destroys exactly
 * the serial structure technical analysis claims to read and preserves the marginal distribution
 * perfectly — kurtosis 12.96 against 13.02. It is also **detectable**, and we know this precisely
 * because the experiment has been run:
 *
 * > Hasanhodzic, Lo & Viola, *Is It Real, or Is It Randomized?: A Financial Turing Test* (2010).
 * > Subjects distinguished real series from **cumulated random permutations of their returns** with
 * > p-values of at most 0.503% across eight datasets. The paper singles out immediate feedback as
 * > "a key feature", and subjects could practise first.
 *
 * Immediate feedback and unlimited practice is a description of this product. So a permutation
 * control is a control players can learn to spot.
 *
 * **Block bootstrap** is the *least detectable* and a **weaker null**: it preserves serial structure
 * inside each block, so a player who profits on it may be reading real structure that survived. A
 * 16-hour block inside an 80-candle window is a fifth of the chart left intact.
 *
 * Neither dominates, so both ship, tagged in `source_note`. **Disagreement between the two is the
 * finding**, not a problem to be resolved by picking one quietly.
 *
 * ## Why this operates on minute bars
 *
 * `resolve()` walks the one-minute path and §12.3's fill semantics depend on it. Generating hourly
 * candles and interpolating a minute path would fabricate the intrabar geometry that decides every
 * stop fill — making synthetic charts systematically easier or harder to resolve than real ones,
 * which is a confound in exactly the measurement this exists for. So the generators run at
 * one-minute resolution and the hourly candles are aggregated from the result.
 */

import type { Bar } from './bars';
import { mulberry32 } from './random';

/**
 * Pre-registered, on the §14 manifest pattern.
 *
 * `blockMinutes` was chosen from a measurement over this corpus, which under §14's own discipline
 * makes it a specification that must be frozen *before* synthetic charts are generated rather than
 * tuned afterwards to make detection rates look better. It is recorded here and in §16 so that a
 * later change is a deliberate act with a diff attached.
 */
export const SYNTHETIC_SPEC = {
  /**
   * Block length, in minutes. **16 hours.**
   *
   * The research measured clustering on *hourly* returns and found blocks of 16 and 32 hourly bars
   * indistinguishable from each other and closest to real. 16 is preferred because a longer block
   * reuses more contiguous real price action, and at 32 bars of an 80-candle window a "synthetic"
   * chart is mostly one real chart. Expressed in minutes because that is the resolution the
   * generator runs at.
   */
  blockMinutes: 16 * 60,
  /** Share of the corpus that is synthetic. Ours, and it decides the power of every later test. */
  mixShare: 0.1,
} as const;

/** How a synthetic chart was made. Written to `charts.source_note` and shown on the reveal. */
export type SyntheticMethod = 'block-bootstrap' | 'permutation';

/**
 * Moving-block bootstrap in log space, preserving intrabar geometry.
 *
 * Blocks of consecutive bars are drawn with replacement and stitched end to end. Each bar is
 * reattached by its **log ratios to its own open** — the same decomposition `permuteBars` uses — so
 * `high ≥ max(open, close)` and `low ≤ min(open, close)` keep holding wherever a bar lands. That is
 * what preserves candle realism through the resampling; shuffling raw prices would not.
 *
 * Serial structure survives *inside* a block and is destroyed *across* block boundaries, which is
 * precisely the trade-off in the header: more realism, weaker null.
 */
export function blockBootstrap(bars: readonly Bar[], blockLength: number, seed: number, length = bars.length): Bar[] {
  if (bars.length < 2 || blockLength < 1) return [];
  const rng = mulberry32(seed);
  const block = Math.min(blockLength, bars.length - 1);

  const out: Bar[] = [];
  // Anchor on the real first bar so the series starts at a real price and a real candle.
  let previousClose = bars[0].c;

  while (out.length < length) {
    // Blocks start anywhere with a predecessor, so every bar carries a well-defined gap.
    const start = 1 + Math.floor(rng() * (bars.length - 1 - block + 1));
    for (let k = 0; k < block && out.length < length; k++) {
      const source = bars[start + k];
      const before = bars[start + k - 1];
      if (!source || !before || !(before.c > 0) || !(source.o > 0)) continue;

      // The gap into this bar, and the bar's own shape, both as ratios.
      const open = previousClose * (source.o / before.c);
      out.push({
        o: open,
        h: open * (source.h / source.o),
        l: open * (source.l / source.o),
        c: open * (source.c / source.o),
        v: source.v,
      });
      previousClose = out[out.length - 1].c;
    }
  }

  return out;
}

/**
 * Aggregate one-minute bars into display bars.
 *
 * The inverse of the corpus's own resolution split, and the reason the generators run at minute
 * resolution: the hourly candles a player reads and the minute path the resolver walks are then
 * guaranteed to be the same series rather than two series that happen to agree at the close.
 */
export function aggregate(minutes: readonly Bar[], perBar: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i + perBar <= minutes.length; i += perBar) {
    const chunk = minutes.slice(i, i + perBar);
    out.push({
      o: chunk[0].o,
      h: Math.max(...chunk.map((b) => b.h)),
      l: Math.min(...chunk.map((b) => b.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((sum, b) => sum + b.v, 0),
    });
  }
  return out;
}
