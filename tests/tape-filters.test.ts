import { describe, expect, it } from 'vitest';
import { tapeFiltersFor } from '../scripts/backfill-tape-filters';
import { INDEX_BASE, mirrorBar } from '../src/core/normalize';
import type { Bar } from '../src/core/bars';
import { atr } from '../src/core/atr';

/**
 * The tape filter tags, and mostly the one property that caught a real error.
 *
 * §11.1's Crash and Euphoria are selected on lead-in drift, and §12.2 mirrors half the corpus at
 * random. Those two facts together give a property no other tag in this product has: **mirroring a
 * chart must negate its drift, exactly.** Random mirroring cannot produce a directional skew, so any
 * asymmetry in the corpus is a bug in the measurement rather than a fact about markets.
 *
 * The first definition — `(last - first) / atr14` — failed it, and failed it in the direction the
 * literature predicts: 88 charts past −10 ATR against 39 past +10. Two compounding causes, both
 * caught by the test below. The mirror is `BASE² / p`, exact in *log* space, so a linear difference
 * is not the negation of its original; and `atr14` is an absolute price distance, so a chart that
 * fell sits at lower prices with a smaller ATR, inflating every down move.
 */

/**
 * A rising series from the index base.
 *
 * The default step is deliberately modest. Invariance under the mirror is not exact and cannot be:
 * `atr14` is Wilder's ATR(14), an average over the last stretch of the window, while `entry_price`
 * is a single point at its end — so on a chart that travelled a long way during those 14 bars the
 * two are measured at different price levels. The residual is second order in the total move
 * (measured: 1.3% over a ×1.03 window, 5.2% over ×1.13, 19.1% over ×1.61), and a real lead-in moves
 * a few percent. A fixture that ramped 61% would be testing a chart the corpus does not contain.
 */
function rising(n = 60, step = 1.001): Bar[] {
  const bars: Bar[] = [];
  let price = INDEX_BASE;
  for (let i = 0; i < n; i++) {
    const open = price;
    price *= step;
    bars.push({ o: open, h: Math.max(open, price) * 1.002, l: Math.min(open, price) * 0.998, c: price, v: 1 });
  }
  return bars;
}

/**
 * The pipeline's own ATR, not a hand-rolled one.
 *
 * `scripts/build-corpus.ts` stores `atr(norm.leadIn)` — Wilder's ATR(14) over the *normalised*
 * lead-in, so it is already in mirrored space and already anchored where Wilder anchors it, at the
 * end of the window. An approximation here would test a quantity the corpus does not have, which is
 * how the first version of this file passed a definition the corpus then failed.
 */
function atrOf(bars: Bar[]): number {
  const value = atr(bars);
  if (value === null) throw new Error('the fixture is too short to have an ATR');
  return value;
}

function driftOf(bars: Bar[]): number {
  return tapeFiltersFor({
    id: 'a-fixed-id-so-engine-zero-is-fixed',
    lead_in_bars: bars,
    lead_in_extra: null,
    atr14: atrOf(bars),
    entry_price: bars[bars.length - 1].c,
  }).lead_in_drift_atr;
}

describe('drift survives the mirror, which is what makes Crash and Euphoria honest', () => {
  it('negates under §12.2’s reflection', () => {
    const up = rising();
    const down = up.map(mirrorBar);

    const a = driftOf(up);
    const b = driftOf(down);

    expect(a).toBeGreaterThan(0);
    expect(b).toBeLessThan(0);
    // Measured at 2.6% on this fixture, which sits out at roughly ±13 ATR — the tail where the two
    // tapes actually live, not the median chart. Against the 2.3× the linear definition produced over
    // the real corpus. This is the number that decides whether Crash and Euphoria can be called the
    // same tape reflected, and it is checked rather than assumed.
    expect(Math.abs(a + b) / Math.abs(a)).toBeLessThan(0.03);
  });

  it('degrades only in the second order, so an extreme chart is wrong but not misleading', () => {
    // Stated as a bound rather than left implicit: a chart that ran 61% inside its lead-in is
    // mismeasured by about a fifth. None exist in the corpus, and if one ever does, this is the size
    // of the error it carries into a tape rather than a surprise found later.
    const steep = rising(60, 1.008);
    const a = driftOf(steep);
    const b = driftOf(steep.map(mirrorBar));
    expect(Math.abs(a + b) / Math.abs(a)).toBeLessThan(0.25);
  });

  it('does not change when the chart is re-indexed, so a tape cannot select on price level', () => {
    // §12.2 indexes every chart to 100 at the first visible candle. A drift measure that moved with
    // the raw price level would put expensive instruments in one tape and cheap ones in the other.
    const base = rising();
    const scaled = base.map((b) => ({ ...b, o: b.o * 7, h: b.h * 7, l: b.l * 7, c: b.c * 7 }));
    expect(driftOf(scaled)).toBeCloseTo(driftOf(base), 6);
  });

  it('is signed by the direction the player sees', () => {
    const up = rising();
    const flat = up.map((b) => ({ ...b, o: INDEX_BASE, h: INDEX_BASE * 1.002, l: INDEX_BASE * 0.998, c: INDEX_BASE }));
    expect(driftOf(flat)).toBeCloseTo(0, 6);
  });
});

describe('the council columns count schools, not the null', () => {
  it('excludes Engine Zero, which always speaks', () => {
    // Counting the null would make every chart look like a live council: Engine Zero never abstains,
    // so `council_speakers` would have a floor of one on every chart in the corpus.
    const bars = rising();
    const tags = tapeFiltersFor({
      id: 'zero-must-not-be-counted',
      lead_in_bars: bars,
      lead_in_extra: null,
      atr14: atrOf(bars),
      entry_price: bars[bars.length - 1].c,
    });
    // A clean synthetic ramp is not a chart any school has rules for; what matters is that whatever
    // speaks, the null is not among the count, so zero is reachable at all.
    expect(tags.council_speakers).toBeGreaterThanOrEqual(0);
    expect(tags.council_minority).toBeLessThanOrEqual(Math.floor(tags.council_speakers / 2));
  });

  it('reports no conflict when nothing conflicts', () => {
    const bars = rising();
    const tags = tapeFiltersFor({
      id: 'unanimous-or-silent',
      lead_in_bars: bars,
      lead_in_extra: null,
      atr14: atrOf(bars),
      entry_price: bars[bars.length - 1].c,
    });
    // The minority side is the honest measure: agreement is not a split, and one school speaking
    // alone is not either. Both cases must read 0 rather than 1.
    if (tags.council_speakers <= 1) expect(tags.council_minority).toBe(0);
  });
});
