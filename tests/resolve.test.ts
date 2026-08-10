import { describe, expect, it } from 'vitest';
import { InvalidOrderError, NO_COSTS, resolve, validateOrder } from '@/core/resolve';
import { bar, flat, path } from './helpers';

const ENTRY = 100;

describe('order validation', () => {
  it('infers direction from which side the stop sits on', () => {
    expect(validateOrder({ entry: ENTRY, stop: 99, target: 103 })).toBe('long');
    expect(validateOrder({ entry: ENTRY, stop: 101, target: 97 })).toBe('short');
  });

  it('rejects a target on the same side as the stop', () => {
    expect(() => validateOrder({ entry: ENTRY, stop: 99, target: 98 })).toThrow(InvalidOrderError);
    expect(() => validateOrder({ entry: ENTRY, stop: 101, target: 102 })).toThrow(InvalidOrderError);
  });

  it('rejects a level sitting on the entry', () => {
    expect(() => validateOrder({ entry: ENTRY, stop: ENTRY, target: 103 })).toThrow(
      InvalidOrderError,
    );
    expect(() => validateOrder({ entry: ENTRY, stop: 99, target: ENTRY })).toThrow(
      InvalidOrderError,
    );
  });
});

describe('intrabar ambiguity — the reason the 1m path is stored (§12.3)', () => {
  // One hour bar spanning 98 to 104 touches both a stop at 99 and a target at 102. OHLC alone
  // cannot say which came first. The minute path can, and these two fixtures differ only in
  // the order the minutes arrive.
  const stop = 99;
  const target = 102;
  const order = { entry: ENTRY, stop, target };

  const targetFirst = [
    ...flat(10, 100),
    bar(100, 102.5, 99.9, 101), // target touched, stop untouched
    ...flat(10, 101),
    bar(101, 101, 98, 98.5), // stop would have been touched — but the trade is already out
    ...flat(39, 98.5),
  ];

  const stopFirst = [
    ...flat(10, 100),
    bar(100, 100.2, 98, 98.5), // stop touched first
    ...flat(10, 98.5),
    bar(98.5, 104, 98.5, 103), // target would have been touched later
    ...flat(39, 103),
  ];

  it('takes the target when the minutes reached it first', () => {
    const result = resolve(order, targetFirst, 60);
    expect(result.outcome).toBe('target');
    expect(result.rMultiple).toBeCloseTo(2, 10);
    expect(result.ambiguous).toBe(false);
  });

  it('takes the stop when the minutes reached it first', () => {
    const result = resolve(order, stopFirst, 60);
    expect(result.outcome).toBe('stop');
    expect(result.rMultiple).toBeCloseTo(-1, 10);
    expect(result.ambiguous).toBe(false);
  });

  it('aggregating either path to one hour bar loses the distinction entirely', () => {
    // Both paths produce an hour bar that engulfs stop and target. This is the failure the
    // stored path exists to avoid, asserted so the premise cannot silently stop being true.
    const hourOf = (p: ReturnType<typeof flat>) => ({
      h: Math.max(...p.map((b) => b.h)),
      l: Math.min(...p.map((b) => b.l)),
    });
    for (const p of [targetFirst, stopFirst]) {
      const hour = hourOf(p);
      expect(hour.h).toBeGreaterThanOrEqual(target);
      expect(hour.l).toBeLessThanOrEqual(stop);
    }
  });

  it('falls back to stop-first and flags the fill when one minute touches both (§12.3.2)', () => {
    const bothInOneMinute = [...flat(5, 100), bar(100, 103, 98, 99), ...flat(54, 99)];
    const result = resolve(order, bothInOneMinute, 60);
    expect(result.outcome).toBe('stop');
    expect(result.ambiguous).toBe(true);
  });
});

describe('fill rules', () => {
  it('triggers on the wick, not the close', () => {
    // The low pierces the stop but the bar closes back above it.
    const p = [...flat(5, 100), bar(100, 100.5, 98.9, 100.2), ...flat(54, 100.2)];
    const result = resolve({ entry: ENTRY, stop: 99, target: 103 }, p, 60);
    expect(result.outcome).toBe('stop');
  });

  it('fills a gapped stop at the open, not at the stop price (§12.3.4)', () => {
    const p = [...flat(5, 100), bar(97, 97.2, 96.5, 97), ...flat(54, 97)];
    const result = resolve({ entry: ENTRY, stop: 99, target: 103 }, p, 60);
    expect(result.outcome).toBe('stop');
    expect(result.exitFill).toBeCloseTo(97, 10);
    // Risk was 1.00, the gap cost 3.00. Being filled at the stop price would read -1R and
    // would understate the loss by two thirds.
    expect(result.rMultiple).toBeCloseTo(-3, 10);
  });

  it('fills a gapped target at the open, giving the trader the extra', () => {
    const p = [...flat(5, 100), bar(105, 105.5, 104.8, 105), ...flat(54, 105)];
    const result = resolve({ entry: ENTRY, stop: 99, target: 103 }, p, 60);
    expect(result.outcome).toBe('target');
    expect(result.rMultiple).toBeCloseTo(5, 10);
  });

  it('marks to market at the final close when neither level is touched', () => {
    const p = flat(60, 100).concat(flat(60, 100.5));
    const result = resolve({ entry: ENTRY, stop: 99, target: 103 }, p, 60);
    expect(result.outcome).toBe('timeout');
    expect(result.rMultiple).toBeCloseTo(0.5, 10);
  });

  it('reports the display bar the exit landed on', () => {
    const p = [...flat(130, 100), bar(100, 103.5, 100, 103), ...flat(100, 103)];
    const result = resolve({ entry: ENTRY, stop: 99, target: 103 }, p, 60);
    expect(result.exitPathIndex).toBe(130);
    expect(result.exitBarIndex).toBe(2);
  });
});

describe('shorts are symmetric', () => {
  it('resolves a short target', () => {
    const p = [...flat(5, 100), bar(100, 100.1, 96.5, 97), ...flat(54, 97)];
    const result = resolve({ entry: ENTRY, stop: 101, target: 97 }, p, 60);
    expect(result.direction).toBe('short');
    expect(result.outcome).toBe('target');
    expect(result.rMultiple).toBeCloseTo(3, 10);
  });

  it('resolves a short stop', () => {
    const p = [...flat(5, 100), bar(100, 101.5, 100, 101.2), ...flat(54, 101.2)];
    const result = resolve({ entry: ENTRY, stop: 101, target: 97 }, p, 60);
    expect(result.outcome).toBe('stop');
    expect(result.rMultiple).toBeCloseTo(-1, 10);
  });
});

describe('excursions (§4.6)', () => {
  it('separates trade-life excursion from the managed ceiling left behind', () => {
    // Stopped out early, then the market runs six points the trader's way.
    const p = [
      ...flat(5, 100),
      bar(100, 100.4, 98.9, 99),
      ...flat(10, 99),
      ...flat(45, 106),
    ];
    const result = resolve({ entry: ENTRY, stop: 99, target: 103 }, p, 60);

    expect(result.outcome).toBe('stop');
    // Over the life of the trade the best it ever showed was +0.4R.
    expect(result.mfeR).toBeCloseTo(0.4, 6);
    // Over the window, +6R was there. This is the number §4.6 wants on every result.
    expect(result.windowMfeR).toBeCloseTo(6, 6);
  });

  it('reports adverse excursion for a winning trade', () => {
    const p = [...flat(5, 100), bar(100, 100.1, 99.5, 99.6), ...flat(20, 99.6), bar(99.6, 103.2, 99.6, 103), ...flat(33, 103)];
    const result = resolve({ entry: ENTRY, stop: 99, target: 103 }, p, 60);
    expect(result.outcome).toBe('target');
    expect(result.maeR).toBeCloseTo(-0.5, 6);
  });
});

describe('determinism', () => {
  it('returns an identical result across repeated runs', () => {
    const p = path(3600, (i) => {
      const drift = 100 + Math.sin(i / 37) * 1.8 + i * 0.0004;
      return bar(drift, drift + 0.15, drift - 0.15, drift + 0.02);
    });
    const order = { entry: ENTRY, stop: 98.6, target: 104 };

    const first = resolve(order, p, 60, NO_COSTS);
    for (let run = 0; run < 5; run++) {
      expect(resolve(order, p, 60, NO_COSTS)).toEqual(first);
    }
  });
});

describe('cost seam (§7.5)', () => {
  const p = [...flat(5, 100), bar(100, 103.5, 100, 103), ...flat(54, 103)];
  const order = { entry: ENTRY, stop: 99, target: 103 };

  it('is a no-op at zero cost', () => {
    expect(resolve(order, p, 60, NO_COSTS).rMultiple).toBeCloseTo(3, 10);
  });

  it('charges the spread on both sides and reduces net R', () => {
    const costed = resolve(order, p, 60, { spreadBps: 10, stopSlippageBps: 0 });
    expect(costed.rMultiple).toBeLessThan(3);
    expect(costed.entryFill).toBeGreaterThan(ENTRY);
    expect(costed.exitFill).toBeLessThan(103);
  });

  it('charges slippage on stop fills only', () => {
    const stopped = [...flat(5, 100), bar(100, 100.2, 98.9, 99), ...flat(54, 99)];
    const clean = resolve(order, stopped, 60, NO_COSTS);
    const slipped = resolve(order, stopped, 60, { spreadBps: 0, stopSlippageBps: 20 });
    expect(slipped.rMultiple).toBeLessThan(clean.rMultiple);
  });
});
