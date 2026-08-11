/**
 * Volume profile, from the stored one-minute bars.
 *
 * > **Correction to v0.2 as first drafted:** §1.1 listed "Volume Profile from OHLCV is a
 * > fabrication" among the architectural findings, and that was read as ruling the feature out. It
 * > does not. It rules out *synthesising* one.
 *
 * The distinction is the whole feature. Spreading an hour's volume uniformly or triangularly across
 * that hour's range is an invention: it looks like a profile, it has a point of control, and it
 * encodes nothing except the shape of the assumption. But TradingView does not do that either —
 * their documentation is explicit that "to compute a daily profile, the system loads all 1-minute
 * bars that were traded in that daily session."
 *
 * That is exactly the data this corpus stores. `scripts/build-corpus.ts` writes 4,800 lead-in
 * minute bars with volume before the 3,600 reveal bars, so POC, value-area high and value-area low
 * are buildable here at **the same construction, not an approximation of it** — and can be claimed
 * at parity honestly.
 *
 * The reverse warning from the same source holds and is why no delta appears in this file:
 * TradingView's own up/down volume split is *inferred from lower-timeframe bar direction*, so
 * anything branded delta or order flow there is already a proxy. Building the identical proxy would
 * be fine; calling it order flow would not, and the safest way to not call it order flow is to not
 * build it until something needs it.
 *
 * **Scope.** The minute path covers the base lead-in only. The extended history the No Tools tier
 * grants (`lead_in_extra`, 220 further display bars) has no minute detail — that was the Phase 1.5
 * decision that kept the payload from growing, and backfilling it would cost roughly 264 MB across
 * the corpus. So a profile is a statement about the base window, and `docs/rules.md` says so.
 */

import type { Bar } from '../bars';

export interface VolumeProfile {
  /** Price at the centre of the heaviest bin — the point of control. */
  poc: number;
  /** Upper edge of the value area. */
  vah: number;
  /** Lower edge of the value area. */
  val: number;
  /** Bin centres, ascending, with the volume that traded in each. */
  bins: { price: number; volume: number }[];
  /** Volume across every bin. */
  total: number;
}

/**
 * Share of total volume inside the value area.
 *
 * 70%, which is Market Profile's own definition — Steidlmayer took it as the one-standard-deviation
 * share of a normal distribution — and it is TradingView's default. Adopted rather than chosen,
 * which is the right relationship to have with a number that has been standard since the 1980s.
 */
export const VALUE_AREA_SHARE = 0.7;

/**
 * Bin height as a fraction of the chart's ATR.
 *
 * Volatility-scaled rather than fixed, so a profile means the same thing on a quiet chart and a
 * violent one, and so bin counts stay comparable across the corpus. A tenth of an average true
 * range puts roughly 30 to 60 bins across a typical lead-in, which is the range TradingView's
 * default row count lands in.
 */
export const BIN_ATR_MULTIPLE = 0.1;

/**
 * Build the profile from lower-timeframe bars.
 *
 * Each bar's volume is assigned to the bin holding its **typical price**, `(h + l + c) / 3`. This
 * is the one modelling choice in the file and it is small by construction: at one-minute
 * resolution a bar's range is a fraction of a bin, so the choice of representative price moves
 * almost nothing. Spreading the volume across a bar's range instead would be the fabrication above,
 * merely at a finer grain.
 *
 * Returns null when there is nothing to profile, rather than an empty profile with a POC of zero.
 */
export function volumeProfile(path: readonly Bar[], atr: number): VolumeProfile | null {
  if (path.length === 0 || !(atr > 0)) return null;

  const binHeight = BIN_ATR_MULTIPLE * atr;
  if (!(binHeight > 0)) return null;

  let low = Infinity;
  let high = -Infinity;
  for (const bar of path) {
    if (bar.l < low) low = bar.l;
    if (bar.h > high) high = bar.h;
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;

  const count = Math.max(1, Math.ceil((high - low) / binHeight) + 1);
  const volumes = new Array<number>(count).fill(0);

  let total = 0;
  for (const bar of path) {
    const typical = (bar.h + bar.l + bar.c) / 3;
    const bin = Math.min(count - 1, Math.max(0, Math.floor((typical - low) / binHeight)));
    volumes[bin] += bar.v;
    total += bar.v;
  }
  if (!(total > 0)) return null;

  const priceOf = (bin: number) => low + (bin + 0.5) * binHeight;

  // Point of control: the heaviest bin. Ties go to the lower bin — an explicit rule, because a tie
  // broken by iteration order is a determinism bug that only shows up on a flat profile.
  let pocBin = 0;
  for (let i = 1; i < count; i++) if (volumes[i] > volumes[pocBin]) pocBin = i;

  // Value area: grow outward from the POC, each step taking whichever neighbouring bin is heavier,
  // until the enclosed volume reaches the target share. This is Market Profile's own construction.
  let lowBin = pocBin;
  let highBin = pocBin;
  let enclosed = volumes[pocBin];
  const target = VALUE_AREA_SHARE * total;

  while (enclosed < target && (lowBin > 0 || highBin < count - 1)) {
    const below = lowBin > 0 ? volumes[lowBin - 1] : -Infinity;
    const above = highBin < count - 1 ? volumes[highBin + 1] : -Infinity;
    // Ties extend downward first, for the same reason the POC tie does: a stated rule beats a
    // reproducible accident.
    if (above > below) {
      highBin += 1;
      enclosed += volumes[highBin];
    } else {
      lowBin -= 1;
      enclosed += volumes[lowBin];
    }
  }

  return {
    poc: priceOf(pocBin),
    vah: priceOf(highBin) + binHeight / 2,
    val: priceOf(lowBin) - binHeight / 2,
    bins: volumes.map((volume, i) => ({ price: priceOf(i), volume })),
    total,
  };
}
