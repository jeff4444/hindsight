/**
 * Identity destruction and risk preservation.
 *
 * Scope §3.1 states the governing principle: "Restrict identity, hindsight and crutches. Never
 * restrict risk arithmetic." §12.2 lists the four measures that together make the
 * identity-lookup exploit uneconomic. Three of them live here — indexing to 100, randomised
 * mirroring, and removing currency-denominated volume. The fourth (keeping the universe large
 * and private) is a corpus property, not a transform.
 */

import type { Bar, TimedBar } from './bars';
import { NORMALIZATION_VERSION } from './versions';

/** Every chart's first visible candle opens here. */
export const INDEX_BASE = 100;

/**
 * The game's tick, in index units. One basis point of the base.
 *
 * A uniform tick is a deliberate choice over carrying each instrument's real granularity.
 * §3.1 requires tick size to be preserved as risk arithmetic, but §3.2 names tick granularity
 * as one of the surfaces a determined player uses to fingerprint the instrument. A uniform
 * tick satisfies the first without feeding the second.
 */
export const TICK_SIZE = 0.01;

/** Round a price to the tick grid. */
export function toTick(price: number): number {
  return Math.round(price / TICK_SIZE) * TICK_SIZE;
}

/**
 * The multiplier that puts the first visible candle's open at 100.
 *
 * This same factor must be applied to the display bars and to the lower-timeframe resolution
 * path. Applying it to one and not the other silently desynchronises what the player sees
 * from what the resolver walks, and the resulting bug is invisible until someone's stop fires
 * at a price that is not on their chart.
 */
export function indexFactor(firstVisibleOpen: number): number {
  return INDEX_BASE / firstVisibleOpen;
}

/** Scale a bar's prices by `factor`. Volume is untouched. */
export function scaleBar<T extends Bar>(bar: T, factor: number): T {
  return { ...bar, o: bar.o * factor, h: bar.h * factor, l: bar.l * factor, c: bar.c * factor };
}

/**
 * Reflect a price about the index base in log space.
 *
 * Scope §3.3 defines the Mirror mod as the chart flipped vertically with price inverted, and
 * argues in §12.2 that it should be permanent and randomised in ranked play because it
 * destroys shape recall while costing the player nothing legitimate.
 *
 * The reflection is `BASE^2 / p` rather than `2 * BASE - p`. Price series are multiplicative:
 * a log reflection maps a +5% move to a -4.76% move, preserving the geometry of the candles
 * and the symmetry of returns. An arithmetic reflection distorts both, increasingly so the
 * further the chart travels from the base, and would make mirrored charts subtly readable as
 * mirrored — which defeats the purpose.
 */
export function mirrorPrice(price: number): number {
  return (INDEX_BASE * INDEX_BASE) / price;
}

/** Mirror a bar. High and low swap, because the reflection is order-reversing. */
export function mirrorBar<T extends Bar>(bar: T): T {
  return {
    ...bar,
    o: mirrorPrice(bar.o),
    h: mirrorPrice(bar.l),
    l: mirrorPrice(bar.h),
    c: mirrorPrice(bar.c),
  };
}

/**
 * Recover an instrument's real price from what the player was shown.
 *
 * The inverse of everything §12.2 does to hide identity: undo the mirror if one was applied,
 * then undo the indexing. Used only after an order is committed, when the reveal screen names
 * the instrument and the moment — §3.3 defines a *Silent* mod as "no ticker or date reveal even
 * after the round", which only makes sense because revealing them is the default.
 *
 * Order matters and is not symmetric: the pipeline scales first and mirrors second, so undoing
 * it means un-mirroring first and unscaling second.
 */
export function denormalizePrice(
  displayed: number,
  factor: number,
  mirrored: boolean,
): number {
  const unmirrored = mirrored ? mirrorPrice(displayed) : displayed;
  return unmirrored / factor;
}

/**
 * The forward transform: a real instrument price, as the player sees it.
 *
 * The exact inverse of `denormalizePrice`, and it exists for one caller — round-number levels,
 * which are a property of the *real* price lattice and have to be computed there and mapped
 * forward. See `src/core/geometry/roundNumbers.ts`, which also carries the §12.2 analysis of what
 * that mapping costs.
 *
 * Order matters and is not symmetric: the pipeline scales first and mirrors second, so this does
 * the same, and `denormalizePrice` undoes them in the opposite order.
 */
export function normalizePrice(real: number, factor: number, mirrored: boolean): number {
  const scaled = real * factor;
  return mirrored ? mirrorPrice(scaled) : scaled;
}

/** Median of a numeric array. Does not mutate the input. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Rebase volume against a reference level so it carries shape but not size.
 *
 * §12.2 requires stripping currency-denominated volume. Relative volume is what a reader
 * actually uses — "this bar is three times the recent average" — and it reveals nothing about
 * which instrument produced it.
 */
export function rebaseVolume<T extends Bar>(bar: T, base: number): T {
  return { ...bar, v: base > 0 ? bar.v / base : 0 };
}

export interface NormalizedWindow {
  /** The 80 candles the player sees. Indexed, mirrored, volume rebased. */
  leadIn: Bar[];
  /** The future candles, revealed only after the order is committed. */
  reveal: Bar[];
  /** The lower-timeframe path the resolver walks. Same transform, prices only. */
  path: Bar[];
  /** Multiplier applied to every price. Stored so the transform is reproducible. */
  indexFactor: number;
  /** Reference volume the rebasing divided by. */
  volumeBase: number;
  /** Whether the mirror was applied. */
  mirrored: boolean;
  version: string;
}

/**
 * Apply the full transform to one window.
 *
 * `leadInRaw` and `revealRaw` are display-timeframe bars; `pathRaw` is the lower-timeframe
 * path covering the reveal window. All three are raw exchange prices in the instrument's own
 * currency, and all three receive the identical factor and mirror.
 */
export function normalizeWindow(
  leadInRaw: TimedBar[],
  revealRaw: TimedBar[],
  pathRaw: TimedBar[],
  mirrored: boolean,
  options: {
    /**
     * Keep volume on the path.
     *
     * Off for the resolver's path, which never reads volume and would only pay to store it.
     * On for the client's zoom detail, where a one-minute candle needs a one-minute volume
     * bar under it — inventing one by spreading the hour's volume would be exactly the
     * fabrication §1.1 rejects for volume-at-price.
     */
    pathVolume?: boolean;
  } = {},
): NormalizedWindow {
  const factor = indexFactor(leadInRaw[0].o);
  const volumeBase = median(leadInRaw.map((b) => b.v));

  const transform = (bars: TimedBar[], withVolume: boolean): Bar[] =>
    bars.map((bar) => {
      let out: Bar = scaleBar(bar, factor);
      if (mirrored) out = mirrorBar(out);
      out = withVolume ? rebaseVolume(out, volumeBase) : { ...out, v: 0 };
      return { o: out.o, h: out.h, l: out.l, c: out.c, v: out.v };
    });

  return {
    leadIn: transform(leadInRaw, true),
    reveal: transform(revealRaw, true),
    // Volume is rebased against the same reference as the display bars, so aggregating sixty
    // minute bars reproduces the hour bar's volume exactly rather than merely proportionally.
    path: transform(pathRaw, options.pathVolume === true),
    indexFactor: factor,
    volumeBase,
    mirrored,
    version: NORMALIZATION_VERSION,
  };
}
