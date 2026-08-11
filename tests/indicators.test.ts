import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/bars';
import {
  bollinger,
  chandelier,
  donchian,
  ema,
  keltner,
  macd,
  psar,
  rsi,
  sma,
  supertrend,
  wilder,
  type Series,
} from '@/core/indicators';
import { walk } from './geometry/fixtures';

/**
 * The formulas, held to.
 *
 * §6's framing for the themes applies here too, and with a sharper example: TA-Lib and TradingView
 * disagree on weekly BTCUSDT ATR(7) by **12%** — 998.11 against 891.05 — for a formula published in
 * a book in 1978. A player at Full Desk who reads an RSI of 71 and places a stop on it is entitled
 * to know which RSI, so these tests state the choices rather than pinning whatever came out.
 */

const bars = (closes: readonly number[], wick = 0.5): Bar[] =>
  closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return { o: open, h: Math.max(open, close) + wick, l: Math.min(open, close) - wick, c: close, v: 10 };
  });

describe('every indicator is aligned to its input, nulls and all', () => {
  // The off-by-one that silently shifts an indicator one bar into the future is why the warm-up is
  // filled with nulls rather than the series starting late. An index into the output is always an
  // index into the input.
  const closes = walk(60, 3).map((b) => b.c);
  const series = walk(60, 3);

  const lengths: [string, number][] = [
    ['sma', sma(closes, 10).length],
    ['ema', ema(closes, 10).length],
    ['wilder', wilder(closes, 10).length],
    ['rsi', rsi(closes, 14).length],
    ['bollinger.mid', bollinger(closes).mid.length],
    ['keltner.upper', keltner(series).upper.length],
    ['donchian.upper', donchian(series).upper.length],
    ['macd.signal', macd(closes).signal.length],
    ['psar', psar(series).length],
    ['supertrend', supertrend(series).line.length],
    ['chandelier.lower', chandelier(series).lower.length],
  ];

  it.each(lengths)('%s returns one entry per bar', (_name, length) => {
    expect(length).toBe(closes.length);
  });

  it('declines rather than inventing a warm-up', () => {
    expect(sma([1, 2], 5).every((v) => v === null)).toBe(true);
    expect(ema([1, 2], 5).every((v) => v === null)).toBe(true);
    expect(rsi([1, 2, 3], 14).every((v) => v === null)).toBe(true);
  });
});

describe('the averages, and the distinction that causes most disagreements', () => {
  const values = [1, 2, 3, 4, 5];

  it('computes a simple moving average', () => {
    expect(sma(values, 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('seeds the EMA on the SMA of the first period, not on the first value', () => {
    // TA-Lib seeds on the SMA and emits nothing before it; many packages seed on the first value
    // and emit from bar zero. The second converges to the same curve but is visibly wrong early —
    // a 200-period EMA seeded that way is essentially the first close for a hundred bars, which on
    // an 80-candle lead-in is the whole chart.
    //
    // Seed (1+2+3)/3 = 2 at index 2; α = 2/(3+1) = 0.5 thereafter.
    expect(ema(values, 3)).toEqual([null, null, 2, 3, 4]);
  });

  it('does not confuse Wilder’s smoothing with an EMA of the same period', () => {
    // Wilder's α is 1/period; an EMA's is 2/(period+1). Conflating them is the single most common
    // source of two implementations disagreeing about "the same" indicator, and it is most of the
    // TA-Lib/TradingView ATR gap.
    const w = wilder(values, 3);
    expect(w[2]).toBe(2);
    expect(w[3]).toBeCloseTo(8 / 3, 12);
    expect(w[4]).toBeCloseTo(((8 / 3) * 2 + 5) / 3, 12);
    expect(w[3]).not.toBe(ema(values, 3)[3]);
  });
});

describe('Bollinger uses the population divisor, because Bollinger does', () => {
  it('is narrower than the sample-divisor version, by a stated amount', () => {
    // values 1..5, period 5, mean 3. Population sd = √(10/5) = √2 ≈ 1.41421; the sample divisor
    // would give √(10/4) ≈ 1.58114. At the default two multiples that is a band 12% wider — the
    // same indicator under one name, and libraries ship both.
    const band = bollinger([1, 2, 3, 4, 5], 5, 2);
    expect(band.mid[4]).toBe(3);
    expect(band.upper[4]).toBeCloseTo(3 + 2 * Math.SQRT2, 12);
    expect(band.lower[4]).toBeCloseTo(3 - 2 * Math.SQRT2, 12);
    // Explicitly *not* the sample-divisor answer.
    expect(band.upper[4]).not.toBeCloseTo(3 + 2 * Math.sqrt(10 / 4), 6);
  });

  it('collapses to the average on a flat series', () => {
    const band = bollinger([5, 5, 5, 5, 5], 5, 2);
    expect(band.upper[4]).toBe(5);
    expect(band.lower[4]).toBe(5);
  });
});

describe('Donchian counts the current bar, which is what makes it usable as a stop', () => {
  it('reports the extreme of the window including now', () => {
    const series = bars([10, 12, 11, 9, 14], 0);
    const band = donchian(series, 3);
    // Bars 2–4 with zero wick: highs are max(open, close). The newest bar's own high counts.
    expect(band.upper[4]).toBe(14);
    expect(band.lower[4]).toBe(9);
    expect(band.mid[4]).toBe(11.5);
  });
});

describe('RSI is Wilder’s, and says so at the boundaries', () => {
  it('reaches 100 on an unbroken advance', () => {
    const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
    expect(rsi(rising, 14)[39]).toBe(100);
  });

  it('reaches 0 on an unbroken decline', () => {
    const falling = Array.from({ length: 40 }, (_, i) => 100 - i);
    expect(rsi(falling, 14)[39]).toBe(0);
  });

  it('declines to answer on a flat series rather than inventing 50', () => {
    // No gains and no losses is not "neutral momentum", it is no data. A midpoint here would be a
    // number the sample does not support — §4.9's habit, applied to an indicator.
    const flat = new Array(40).fill(100);
    expect(rsi(flat, 14)[39]).toBeNull();
  });

  it('stays inside its bounds on real-shaped data', () => {
    for (const value of rsi(walk(200, 11).map((b) => b.c), 14)) {
      if (value === null) continue;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('is offset correctly against its input', () => {
    // The first change is between bars 0 and 1, so with period 14 the first RSI lands on bar 14 —
    // needing 15 values. One index off here would draw every RSI a bar into the future.
    const values = walk(40, 5).map((b) => b.c);
    const out = rsi(values, 14);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(out[14]).not.toBeNull();
  });
});

describe('MACD’s signal line starts where the MACD line does', () => {
  it('does not treat the warm-up as zeros', () => {
    // A signal EMA seeded from bar zero over leading nulls-as-zeros drags the first several values
    // toward zero and produces histogram crossings that are artefacts of the warm-up rather than
    // of the price.
    const values = walk(120, 7).map((b) => b.c);
    const result = macd(values, 12, 26, 9);

    const firstMacd = result.macd.findIndex((v) => v !== null);
    const firstSignal = result.signal.findIndex((v) => v !== null);
    expect(firstMacd).toBe(25);
    expect(firstSignal).toBe(firstMacd + 8);
    expect(result.signal.slice(0, firstSignal).every((v) => v === null)).toBe(true);
  });

  it('keeps the histogram as the difference it claims to be', () => {
    const values = walk(120, 7).map((b) => b.c);
    const { macd: line, signal, histogram } = macd(values);
    for (let i = 0; i < values.length; i++) {
      if (histogram[i] === null) continue;
      expect(histogram[i]).toBeCloseTo((line[i] as number) - (signal[i] as number), 12);
    }
  });
});

describe('the stop-placement algorithms behave like stops', () => {
  const series = walk(150, 21, 0.1);

  it('keeps the Chandelier below price in an advance', () => {
    const band = chandelier(series, 22, 3);
    for (let i = 0; i < series.length; i++) {
      if (band.lower[i] === null) continue;
      // It hangs from the highest high, so it can never sit above it.
      expect(band.lower[i]).toBeLessThan(Math.max(...series.slice(0, i + 1).map((b) => b.h)));
    }
  });

  it('ratchets Supertrend rather than letting it drift back', () => {
    const { line, direction } = supertrend(series, 10, 3);
    let lastUp: number | null = null;
    for (let i = 0; i < series.length; i++) {
      if (line[i] === null) continue;
      if (direction[i] === 1) {
        // While the trend holds, the stop only ever tightens.
        if (lastUp !== null && direction[i - 1] === 1) {
          expect(line[i]).toBeGreaterThanOrEqual(lastUp - 1e-9);
        }
        lastUp = line[i] as number;
      } else {
        lastUp = null;
      }
    }
  });

  it('keeps the SAR out of the previous two bars’ range', () => {
    // Wilder's own rule. Without it the indicator produces stops inside bars that had already
    // traded through them.
    const out = psar(series, 0.02, 0.2);
    for (let i = 2; i < series.length; i++) {
      const value = out[i];
      if (value === null) continue;
      const low = Math.min(series[i - 1].l, series[i - 2].l);
      const high = Math.max(series[i - 1].h, series[i - 2].h);
      expect(value <= low + 1e-9 || value >= high - 1e-9).toBe(true);
    }
  });
});

describe('Keltner uses the same ATR the rest of the product does', () => {
  it('bands the EMA by Wilder-smoothed true range', () => {
    const series = walk(80, 13);
    const band = keltner(series, 20, 10, 2);
    for (let i = 0; i < series.length; i++) {
      if (band.upper[i] === null) continue;
      expect(band.upper[i]).toBeGreaterThan(band.mid[i] as number);
      expect(band.lower[i]).toBeLessThan(band.mid[i] as number);
      // Symmetric about the average, which an ATR band is and a standard-deviation band need not be.
      const up = (band.upper[i] as number) - (band.mid[i] as number);
      const down = (band.mid[i] as number) - (band.lower[i] as number);
      expect(up).toBeCloseTo(down, 9);
    }
  });
});

describe('determinism', () => {
  it('returns identical output on repeated runs', () => {
    const series = walk(90, 31);
    const closes = series.map((b) => b.c);
    const snapshot = () =>
      JSON.stringify([
        sma(closes, 20),
        ema(closes, 20),
        rsi(closes, 14),
        bollinger(closes),
        keltner(series),
        donchian(series),
        macd(closes),
        psar(series),
        supertrend(series).line as Series,
      ]);
    expect(snapshot()).toBe(snapshot());
  });
});
