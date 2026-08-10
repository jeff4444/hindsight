import { describe, expect, it } from 'vitest';
import { aggregate, aggregateByCount, type TimedBar } from '@/core/bars';
import { atr } from '@/core/atr';
import { causal, visibleAt, type Causal } from '@/core/causal';
import { normalizeWindow } from '@/core/normalize';
import {
  closesStrictlyBefore,
  efficiencyRatio,
  volatilityPercentile,
} from '@/core/regime';
import { mulberry32 } from '@/core/random';
import { HOUR_MS } from '@/core/bars';

/**
 * The look-ahead suite — §14's exit condition for Phase 0.5.
 *
 * §15 names the failure precisely, and names it as something that has already happened twice in
 * public:
 *
 * > Both major open-source implementations of the structure primitives contain [look-ahead], one
 * > via a whole-dataset range and one via pre-confirmation stamping.
 *
 * Neither bug is visible in the output. A detector that normalises against the whole series
 * produces perfectly plausible numbers; one that stamps a swing high at the bar it occurred on
 * draws a perfectly plausible chart. What makes them detectable is not inspection but a
 * property:
 *
 *   **Change the future. Anything that was knowable before the change must not move.**
 *
 * That is the whole suite. It is generic, so Layer 2's detectors plug into it without it needing
 * to know what they compute — which is the point of building it a phase before they exist.
 *
 * A test suite that cannot fail is decoration, so this one carries canaries: deliberately broken
 * features reproducing both of §15's bugs, asserted to be *caught*. If the harness is ever
 * weakened, the canaries start passing and these tests go red.
 */

/* ------------------------------------------------------------------ fixtures */

function series(length: number, seed = 1): TimedBar[] {
  const rng = mulberry32(seed);
  const bars: TimedBar[] = [];
  let price = 100;

  for (let i = 0; i < length; i++) {
    const open = price;
    const drift = (rng() - 0.5) * 1.4;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + rng() * 0.6;
    const low = Math.min(open, close) - rng() * 0.6;
    bars.push({ t: i * HOUR_MS, o: open, h: high, l: low, c: close, v: 10 + rng() * 40 });
    price = close;
  }

  return bars;
}

/**
 * Replace everything after `after` with a wildly different future.
 *
 * Deliberately violent — a crash, a spike, a volatility regime change — because a feature that
 * peeks even slightly should move a lot when the future it peeked at is replaced wholesale.
 */
function mutateFuture(bars: TimedBar[], after: number, seed = 99): TimedBar[] {
  const kept = bars.slice(0, after + 1);
  const tail = series(bars.length - kept.length, seed).map((bar, i) => ({
    ...bar,
    t: (kept.length + i) * HOUR_MS,
    o: bar.o * 3,
    h: bar.h * 3.2,
    l: bar.l * 2.4,
    c: bar.c * 3,
    v: bar.v * 7,
  }));
  return [...kept, ...tail];
}

const CUTS = [20, 40, 60, 79];

/* ------------------------------------------------------------------- harness */

/**
 * For features computed on a prefix: the answer must depend on the prefix alone.
 *
 * This is the shape most of the codebase uses — hand the function the bars that were visible and
 * nothing else — and it makes look-ahead impossible by interface rather than by discipline.
 */
function assertPrefixCausal<T>(
  compute: (bars: TimedBar[]) => T,
  bars: TimedBar[],
  cuts: number[] = CUTS,
): void {
  for (const cut of cuts) {
    const fromOriginal = compute(bars.slice(0, cut + 1));
    const fromMutated = compute(mutateFuture(bars, cut).slice(0, cut + 1));
    expect(fromMutated).toEqual(fromOriginal);
  }
}

/**
 * For features emitting per-bar records over a whole series: what was visible at `cut` must not
 * change when the bars after `cut` do.
 *
 * This is the one that catches a whole-dataset range, because such a feature is handed the
 * future legitimately and simply must not let it reach the early outputs.
 */
function assertEmissionCausal<T>(
  compute: (bars: TimedBar[]) => Causal<T>[],
  bars: TimedBar[],
  cuts: number[] = CUTS,
): void {
  for (const cut of cuts) {
    const before = visibleAt(compute(bars), cut);
    const after = visibleAt(compute(mutateFuture(bars, cut)), cut);
    expect(after).toEqual(before);
  }
}

/* ------------------------------------------------------------------ canaries */

/** §15's first bug: normalised against the range of the whole series. */
function leakyDetector(bars: TimedBar[]): Causal<number>[] {
  const high = Math.max(...bars.map((b) => b.h));
  const low = Math.min(...bars.map((b) => b.l));
  const span = high - low || 1;
  return bars.map((bar, i) => causal((bar.c - low) / span, i, i));
}

/** The same thing done causally: normalised against the range seen so far. */
function causalDetector(bars: TimedBar[]): Causal<number>[] {
  const out: Causal<number>[] = [];
  let high = -Infinity;
  let low = Infinity;

  for (let i = 0; i < bars.length; i++) {
    high = Math.max(high, bars[i].h);
    low = Math.min(low, bars[i].l);
    const span = high - low || 1;
    out.push(causal((bars[i].c - low) / span, i, i));
  }

  return out;
}

/**
 * §15's second bug: a swing high stamped at the bar it occurred on.
 *
 * The high genuinely exists at bar `i`. Nobody can know it is a high until `confirm` further bars
 * have printed without exceeding it, so `knownAt` must be `i + confirm`. Claiming `i` puts the
 * annotation on the chart at a moment it could not have been drawn.
 */
function prematureSwings(bars: TimedBar[], confirm = 3): Causal<number>[] {
  const out: Causal<number>[] = [];
  for (let i = confirm; i < bars.length - confirm; i++) {
    const isHigh = bars
      .slice(i - confirm, i + confirm + 1)
      .every((bar, j) => j === confirm || bar.h <= bars[i].h);
    if (isHigh) out.push(causal(bars[i].h, i, i)); // knownAt should be i + confirm
  }
  return out;
}

/** The same detector, stamped honestly. */
function confirmedSwings(bars: TimedBar[], confirm = 3): Causal<number>[] {
  return prematureSwings(bars, confirm).map((feature) =>
    causal(feature.value, feature.existsAt, feature.existsAt + confirm),
  );
}

/* --------------------------------------------------------------------- tests */

describe('the harness can fail', () => {
  const bars = series(140);

  it('catches a whole-dataset range (§15, bug one)', () => {
    expect(() => assertEmissionCausal(leakyDetector, bars)).toThrow();
  });

  it('catches pre-confirmation stamping (§15, bug two)', () => {
    expect(() => assertEmissionCausal(prematureSwings, bars)).toThrow();
  });

  it('passes the same detectors once they are made causal', () => {
    expect(() => assertEmissionCausal(causalDetector, bars)).not.toThrow();
    expect(() => assertEmissionCausal(confirmedSwings, bars)).not.toThrow();
  });

  it('is not passing them for want of anything to compare', () => {
    // A harness that silently compares two empty lists would pass everything above.
    expect(visibleAt(causalDetector(bars), 79)).toHaveLength(80);
    expect(visibleAt(confirmedSwings(bars), 79).length).toBeGreaterThan(0);
  });
});

describe('every derived feature is causal', () => {
  const bars = series(140, 7);

  it('ATR(14)', () => {
    assertPrefixCausal((prefix) => atr(prefix), bars);
  });

  it('hour aggregation', () => {
    assertPrefixCausal((prefix) => aggregate(prefix, HOUR_MS), bars);
  });

  it('count aggregation, at every tier the chart can render', () => {
    for (const group of [1, 15, 30, 60]) {
      assertPrefixCausal((prefix) => aggregateByCount(prefix, group), bars);
    }
  });

  it('Kaufman efficiency ratio', () => {
    assertPrefixCausal((prefix) => efficiencyRatio(prefix.map((b) => b.c)), bars);
  });

  it('realised-volatility percentile', () => {
    const daily = series(500, 3);
    for (const cut of [400, 450, 499]) {
      const fromOriginal = volatilityPercentile(daily.slice(0, cut + 1).map((b) => b.c));
      const mutated = mutateFuture(daily, cut).slice(0, cut + 1);
      expect(volatilityPercentile(mutated.map((b) => b.c))).toEqual(fromOriginal);
      expect(fromOriginal).not.toBeNull();
    }
  });
});

describe('the volatility slice excludes the decision bar itself', () => {
  // volatilityPercentile is causal by interface, which moves the whole risk to this slice.
  const daily: TimedBar[] = series(30).map((bar, i) => ({ ...bar, t: i * 86_400_000 }));

  it('stops strictly before the timestamp, never at it', () => {
    const decision = 10 * 86_400_000;
    const closes = closesStrictlyBefore(daily, decision);
    expect(closes).toHaveLength(10);
    expect(closes[closes.length - 1]).toBe(daily[9].c);
  });

  it('is unmoved by anything at or after the decision', () => {
    const decision = 10 * 86_400_000;
    const before = closesStrictlyBefore(daily, decision);
    const tampered = daily.map((bar, i) => (i >= 10 ? { ...bar, c: bar.c * 100 } : bar));
    expect(closesStrictlyBefore(tampered, decision)).toEqual(before);
  });
});

describe('normalisation cannot see the reveal', () => {
  // The lead-in is indexed to 100 and volume-rebased from the lead-in alone. If the reveal ever
  // reached those, every chart in the corpus would encode its own future in its price scale.
  const leadIn = series(80, 11);
  const reveal = series(60, 12);
  const path = series(3600, 13);

  it('produces an identical lead-in whatever the future turns out to be', () => {
    const original = normalizeWindow(leadIn, reveal, path, false);
    const other = normalizeWindow(leadIn, series(60, 999), series(3600, 998), false);
    expect(other.leadIn).toEqual(original.leadIn);
    expect(other.indexFactor).toBe(original.indexFactor);
    expect(other.volumeBase).toBe(original.volumeBase);
  });

  it('mirrors on window identity, not on which way the reveal went', () => {
    const up = normalizeWindow(leadIn, reveal, path, true);
    const down = normalizeWindow(leadIn, series(60, 555), path, true);
    expect(down.leadIn).toEqual(up.leadIn);
  });
});

describe('causal records', () => {
  it('refuses a feature known before it exists', () => {
    expect(() => causal('x', 10, 9)).toThrow();
    expect(() => causal('x', 10, 10)).not.toThrow();
  });

  it('gates on knownAt, not existsAt', () => {
    const features = [causal('a', 5, 8), causal('b', 6, 6)];
    expect(visibleAt(features, 6).map((f) => f.value)).toEqual(['b']);
    expect(visibleAt(features, 8).map((f) => f.value)).toEqual(['a', 'b']);
  });
});
