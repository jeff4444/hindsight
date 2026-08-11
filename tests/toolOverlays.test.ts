import { describe, expect, it } from 'vitest';
import { MA_LENGTHS, measureReadout, overlaysFor } from '@/lib/toolOverlays';
import { TIERS, tierByCode, type ToolCode } from '@/core/tiers';
import { atr } from '@/core/atr';
import { walk } from './geometry/fixtures';

/**
 * What a granted tool actually draws.
 *
 * The interactive half lives in `DrawLayer` and needs a browser; this is the half that does not,
 * and it is the half where a mistake is silent — an indicator drawn from the wrong series still
 * looks like an indicator.
 */

const bars = walk(120, 17);
const ATR = atr(bars) ?? 1;
const context = { bars, atr: ATR };

const draw = (tools: ToolCode[]) => overlaysFor(tools, context);

describe('nothing is drawn that was not granted', () => {
  it('draws nothing for an empty toolbox', () => {
    // Every rung below Full Desk grants none, so this is the Naked and Blackout case: the tier
    // table is the only gate, and it is upstream of here.
    expect(draw([])).toEqual([]);
  });

  it('draws nothing without an ATR to denominate against', () => {
    // Every threshold in Layer 2 and every band here is in ATR. Zero would divide by nothing and
    // produce plausible-looking garbage.
    expect(overlaysFor(['ma', 'geometry'], { bars, atr: 0 })).toEqual([]);
    expect(overlaysFor(['ma'], { bars: [], atr: ATR })).toEqual([]);
  });

  it('adds only what each tool asks for', () => {
    const before = draw(['ma']).length;
    const after = draw(['ma', 'donchian']).length;
    expect(after).toBeGreaterThan(before);
  });

  it('omits a moving average the window is too short to define', () => {
    // The same "decline rather than invent" rule the indicators themselves follow, one layer up.
    // This fixture is 120 bars, so EMA(20) and EMA(50) draw and EMA(200) does not — an average
    // seeded on data that is not there would be a line about nothing.
    expect(MA_LENGTHS).toEqual([20, 50, 200]);
    expect(draw(['ma'])).toHaveLength(2);

    // Given enough history all three appear. Full Desk serves 300 candles, so the longest is
    // defined over the last hundred of them.
    const long = overlaysFor(['ma'], { bars: walk(300, 4), atr: ATR });
    expect(long).toHaveLength(3);
  });
});

describe('the oscillators go in their own pane', () => {
  it('puts RSI and MACD below, and everything else on the price', () => {
    // An RSI of 71 plotted against a price axis around 100 is a flat line halfway up the chart.
    for (const overlay of draw(['rsi'])) expect(overlay.pane).toBe(1);
    for (const overlay of draw(['macd'])) expect(overlay.pane).toBe(1);
    for (const overlay of draw(['ma', 'bollinger', 'donchian', 'geometry'])) {
      expect(overlay.pane ?? 0).toBe(0);
    }
  });

  it('draws the 30 and 70 rails with the RSI, because a reading needs a reference', () => {
    const rails = draw(['rsi']).filter((o) => o.dashed);
    expect(rails).toHaveLength(2);
    const prices = rails.map((rail) => rail.points[0].price).sort((a, b) => a - b);
    expect(prices).toEqual([30, 70]);
  });
});

describe('the volume profile is built or absent, never faked', () => {
  it('draws nothing without the one-minute bars', () => {
    // Falling back to display bars would be exactly the fabrication §1.1 rejects — a profile that
    // looks identical and encodes the shape of the assumption rather than the trades.
    expect(draw(['volumeProfile'])).toEqual([]);
  });

  it('draws the point of control and the value area when the minutes are there', () => {
    const minutes = bars.flatMap((bar) => Array.from({ length: 4 }, () => bar));
    const drawn = overlaysFor(['volumeProfile'], { bars, atr: ATR, minutes, minutesPerBar: 4 });
    expect(drawn).toHaveLength(3);
    // POC solid and heavier; the value-area edges dashed.
    expect(drawn.filter((o) => o.dashed)).toHaveLength(2);
  });
});

describe('every overlay is a drawable polyline', () => {
  const all = TIERS.flatMap((tier) => tier.tools);
  const drawn = overlaysFor([...new Set(all)], {
    bars,
    atr: ATR,
    minutes: bars.flatMap((bar) => [bar, bar]),
    minutesPerBar: 2,
  });

  it('produces something for a full toolbox', () => {
    expect(drawn.length).toBeGreaterThan(15);
  });

  it('never emits a one-point line, which renders as nothing', () => {
    for (const overlay of drawn) expect(overlay.points.length).toBeGreaterThanOrEqual(2);
  });

  it('never emits a null or a NaN, which renders as a gap in the middle of an indicator', () => {
    for (const overlay of drawn) {
      for (const point of overlay.points) {
        expect(Number.isFinite(point.price)).toBe(true);
        expect(Number.isInteger(point.index)).toBe(true);
      }
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(draw(['ma', 'geometry', 'donchian']))).toBe(
      JSON.stringify(draw(['ma', 'geometry', 'donchian'])),
    );
  });
});

describe('the stop algorithms are drawn for exactly one rung', () => {
  it('is Sandbox, and it is unrated', () => {
    // They are literally stop-placement algorithms, and the skill this product measures is placing
    // a stop. `tests/tiers.test.ts` holds the ladder to it; this holds the renderer to it.
    const granted = TIERS.filter((tier) => tier.tools.includes('stopAlgos'));
    expect(granted.map((tier) => tier.code)).toEqual(['SBX']);
    expect(granted[0].rated).toBe(false);
    expect(draw(['stopAlgos']).length).toBeGreaterThan(0);
  });
});

describe('the measure tool speaks in the units the trade is scored in', () => {
  it('converts a distance into ATR and R', () => {
    // The §3.1 argument for it being universal: on a chart with no ticker and no absolute price,
    // these are the only units that survive normalisation.
    const read = measureReadout(100, 104, 2, 1);
    expect(read.delta).toBe(4);
    expect(read.atr).toBe(2);
    expect(read.r).toBe(4);
    expect(read.percent).toBeCloseTo(4, 9);
  });

  it('declines to quote an R before there is a stop to divide by', () => {
    expect(measureReadout(100, 104, 2, null).r).toBeNull();
    expect(measureReadout(100, 104, 2, 0).r).toBeNull();
  });

  it('signs a downward measurement negative in every unit', () => {
    const read = measureReadout(104, 100, 2, 1);
    expect(read.delta).toBeLessThan(0);
    expect(read.atr).toBeLessThan(0);
    expect(read.r).toBeLessThan(0);
    expect(read.percent).toBeLessThan(0);
  });

  it('is available at the tier that takes everything else away', () => {
    // Blackout removes volume, most of the history and all but twenty seconds. It does not remove
    // the ruler, and there is no field that could.
    expect(tierByCode('NTVZ')!.tools).toEqual([]);
    expect(measureReadout(100, 101, 1, 1).atr).toBe(1);
  });
});
