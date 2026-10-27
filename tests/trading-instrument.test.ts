import { describe, expect, it } from 'vitest';
import {
  decimalExponent,
  deriveInstrument,
  fromTicks,
  pow10,
  toRealBar,
  toSteps,
  toTicks,
} from '@/core/trading/instrument';
import { marketFromChart } from '@/core/trading/market';
import { mirrorBar, normalizePrice } from '@/core/normalize';
import { bar } from './helpers';

describe('tick and step', () => {
  it.each([
    [43_120.5, 4, 0.1, 0.00001],
    [2_000, 3, 0.01, 0.0001],
    [1, 0, 0.00001, 0.1],
    [9.99, 0, 0.00001, 0.1],
    [0.5, -1, 0.000001, 1],
    [0.00001234, -5, 1e-10, 10_000],
  ])('price %s has exponent %i, tick %s and step %s', (price, e, tick, step) => {
    expect(decimalExponent(price)).toBe(e);
    const instrument = deriveInstrument('XUSDT', price);
    expect(instrument.tickSize).toBe(tick);
    expect(instrument.qtyStep).toBe(step);
  });

  it('make ticks × steps exactly one micro-USDT at every scale', () => {
    for (const price of [0.000001, 0.0042, 0.31, 7, 88, 1_234, 65_000]) {
      const instrument = deriveInstrument('XUSDT', price);
      expect(instrument.tickExp + instrument.qtyExp).toBe(-6);
    }
  });

  it('put exact powers of ten on the right side of the boundary', () => {
    expect(decimalExponent(1000)).toBe(3);
    expect(decimalExponent(0.001)).toBe(-3);
    expect(pow10(-7)).toBe(1e-7);
  });

  it('round prices to ticks and quantities down to steps', () => {
    const instrument = deriveInstrument('BTCUSDT', 43_000);
    expect(toTicks(43_120.56, instrument)).toBe(431_206);
    expect(fromTicks(431_206, instrument)).toBeCloseTo(43_120.6, 6);
    expect(toSteps(0.123456, instrument)).toBe(12_345);
    expect(toSteps(0.3, deriveInstrument('XUSDT', 1))).toBe(3);
  });

  it('names the pair', () => {
    expect(deriveInstrument('BTCUSDT', 1).display).toBe('BTC/USDT');
  });
});

describe('back to real prices', () => {
  it('undoes the mirror (swapping high and low back) and then the index', () => {
    const factor = 100 / 2.5;
    const real = bar(2.5, 2.8, 2.4, 2.6, 1234);
    const stored = mirrorBar({
      o: normalizePrice(real.o, factor, false),
      h: normalizePrice(real.h, factor, false),
      l: normalizePrice(real.l, factor, false),
      c: normalizePrice(real.c, factor, false),
      v: 2,
    });
    const back = toRealBar(stored, factor, true, 617);
    expect(back.o).toBeCloseTo(2.5, 12);
    expect(back.h).toBeCloseTo(2.8, 12);
    expect(back.l).toBeCloseTo(2.4, 12);
    expect(back.c).toBeCloseTo(2.6, 12);
    expect(back.v).toBe(1234);
  });

  it('builds a market whose clock starts the hour after the decision bar', () => {
    const leadIn = Array.from({ length: 80 }, () => bar(100, 101, 99, 100));
    const market = marketFromChart({
      chartId: 'c',
      symbol: 'ETHUSDT',
      decisionAt: '2021-05-16T23:00:00Z', // a Sunday
      indexFactor: 100 / 2_000,
      mirrored: false,
      volumeBase: 10,
      leadInBars: leadIn,
      leadInExtra: null,
      revealBars: Array.from({ length: 60 }, () => bar(100, 101, 99, 100)),
      path: Array.from({ length: 3600 }, () => bar(100, 100.5, 99.5, 100, 0)),
      detail: Array.from({ length: 4800 + 3600 }, () => bar(100, 100.5, 99.5, 100, 0.5)),
    });
    expect(market.start).toEqual({ weekday: 0, minuteOfDay: 0 }); // Monday 00:00
    expect(market.refClose).toBe(200_000); // $2,000.00 at a 0.01 tick
    expect(market.tape).toHaveLength(3600);
    expect(market.tape[0].v).toBe(5);
    expect(market.historyMinutes).toHaveLength(4800);
  });
});
