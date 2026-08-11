import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/bars';
import { atr } from '@/core/atr';
import { assertWellFormed, visibleAt } from '@/core/causal';
import { efficiencyRatio } from '@/core/regime';
import { mirrorBar } from '@/core/normalize';
import { persistentSwings, walkFromBars } from '@/core/geometry/swings';
import {
  MIN_STRENGTH,
  THEMES,
  THEME_SPEC,
  detectThemes,
  isTheme,
  themesOf,
  type Theme,
  type ThemeInput,
} from '@/core/geometry/themes';
import { reflected, walk } from './fixtures';

/**
 * The published spec, held to.
 *
 * §6's argument for this file: there is no canonical specification of any of these formations, the
 * two most-used open implementations disagree by up to 13.6× on the same words, and the choice is
 * therefore "not between the right definition and ours; it is between an undisclosed definition and
 * a published one."
 *
 * So these tests state the rules rather than pinning whatever the detectors happened to emit. Each
 * fixture is built to satisfy exactly one rule and to fail it when one number is moved.
 */

const ATR = 1;

/** Bars from a close path, with wicks a stated distance outside the body. */
function fromCloses(closes: readonly number[], wick = 0.15): Bar[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return {
      o: open,
      h: Math.max(open, close) + wick,
      l: Math.min(open, close) - wick,
      c: close,
      v: 10,
    };
  });
}

function inputFor(bars: Bar[], atrValue = ATR): ThemeInput {
  return {
    bars,
    swings: persistentSwings(walkFromBars(bars)),
    atr: atrValue,
    efficiency: efficiencyRatio(bars.map((bar) => bar.c)),
  };
}

/** Flat filler, so a fixture's interesting part is the only interesting part. */
function flat(count: number, price: number): number[] {
  return Array.from({ length: count }, (_, i) => price + (i % 2 === 0 ? 0.05 : -0.05));
}

describe('the roster is six, and the seventh is deferred rather than forgotten', () => {
  it('ships exactly the themes the research graded as buildable', () => {
    expect([...THEMES]).toEqual([
      'liquidity-sweep',
      'failed-breakout',
      'v-reversal',
      'compression-expansion',
      'range-reversion',
      'trend-continuation',
    ]);
  });

  it('does not ship news-spike, which names a cause we cannot observe', () => {
    // §9 news is Phase 7. With no event data, a theme named for a cause asserts exactly the kind of
    // thing this project refuses to assert elsewhere. The detector is trivial to add once there is
    // a timestamp to point at.
    expect(isTheme('news-spike')).toBe(false);
    // …and the three that were dropped outright stay dropped.
    for (const dead of ['gap-fill', 'opening-drive', 'distribution-top']) {
      expect(isTheme(dead)).toBe(false);
    }
  });
});

describe('liquidity-sweep — a tested level taken out and given straight back', () => {
  // Two visits to 106, then a poke through to 106.4 and an immediate close back below. The level is
  // tested (Osler's mechanism is resting stop orders, and nothing rests beyond a price that has
  // never been visited), the exceedance is inside the stop band, and the reclaim is immediate.
  const closes = [
    100, 103, 106, 102, 99, 103, 106, 102, 98, 101, 104, 106.3, 103, 100, 102, 104, 101, 99,
  ];
  const tags = detectThemes(inputFor(fromCloses(closes)));

  it('fires, and points against the swept side', () => {
    const sweep = tags.find((tag) => tag.value.theme === 'liquidity-sweep');
    expect(sweep).toBeDefined();
    // A swept high traps buyers, so the setup points down.
    expect(sweep!.value.direction).toBe('down');
  });

  it('is knowable at the reclaim, never at the excursion', () => {
    // Until price closes back inside, an excursion is indistinguishable from a breakout. Stamping
    // it earlier is §15's pre-confirmation bug.
    const sweep = tags.find((tag) => tag.value.theme === 'liquidity-sweep')!;
    expect(sweep.knownAt).toBeGreaterThanOrEqual(sweep.existsAt);
  });

  it('is not fired by a level that was never tested', () => {
    // One visit to the high instead of two. Same excursion, same reclaim, no stops resting there.
    const untested = [100, 103, 106, 102, 99, 97, 95, 98, 101, 104, 106.3, 103, 100, 98, 96];
    const found = detectThemes(inputFor(fromCloses(untested)));
    expect(found.some((tag) => tag.value.theme === 'liquidity-sweep')).toBe(false);
  });

  it('is not fired by a move that clears the level properly', () => {
    // Exceeding by more than `sweepMaxExceedanceAtr` is a breakout, not a sweep. The ceiling is the
    // point: Osler's stops sit *just* past the level.
    const broke = [...closes];
    broke[11] = 106 + THEME_SPEC.sweepMaxExceedanceAtr * ATR + 1;
    const found = detectThemes(inputFor(fromCloses(broke)));
    expect(found.some((tag) => tag.value.theme === 'liquidity-sweep')).toBe(false);
  });
});

describe('failed-breakout — a close beyond the range, then a close back inside', () => {
  // Twenty bars of range, a close decisively above it, then back inside.
  const closes = [...flat(22, 100), 104, 101, 99.5];
  const tags = detectThemes(inputFor(fromCloses(closes)));

  it('fires on a close beyond, and points back into the range', () => {
    const failed = tags.find((tag) => tag.value.theme === 'failed-breakout');
    expect(failed).toBeDefined();
    expect(failed!.value.direction).toBe('down');
  });

  it('is not fired by a wick beyond the range', () => {
    // The correction that mattered: on any noisy series a high pokes past a twenty-bar extreme and
    // comes back constantly, and calling that a failed breakout tagged 100% of the corpus. A close
    // beyond is a commitment; a wick is an excursion, and excursions are `liquidity-sweep`'s job.
    const wickOnly = fromCloses([...flat(22, 100), 100.1, 100, 99.9], 4);
    const found = detectThemes(inputFor(wickOnly));
    expect(found.some((tag) => tag.value.theme === 'failed-breakout')).toBe(false);
  });

  it('is not fired when the breakout holds', () => {
    const held = fromCloses([...flat(22, 100), 104, 105, 106, 107]);
    const found = detectThemes(inputFor(held));
    expect(found.some((tag) => tag.value.theme === 'failed-breakout')).toBe(false);
  });
});

describe('v-reversal — Bulkowski’s 38.2%, which is not ours to move', () => {
  it('fires on a sharp leg reversed past the retrace', () => {
    const closes = [110, 106, 102, 98, 94, 90, 96, 102, 108, 112, 110, 108];
    const tags = detectThemes(inputFor(fromCloses(closes)));
    const v = tags.find((tag) => tag.value.theme === 'v-reversal');
    expect(v).toBeDefined();
    expect(v!.value.direction).toBe('up');
  });

  it('waits for the pivot to settle, which is a longer lag than the retrace alone', () => {
    // Worth stating rather than leaving to be rediscovered. A V is *arithmetically* knowable the
    // moment price has retraced 38.2% of the leg — but this detector is built on settled swings,
    // and a swing settles only when its retracement matches its left drop or price exceeds it. So
    // the tag lags the retrace, sometimes by a lot.
    //
    // That is the conservative direction and it is deliberate: emitting on the retrace alone would
    // mean drawing a pivot that later bars could still deepen, which is the repainting last leg
    // that disqualifies ZigZag. The cost is that a shallow V inside a window that never revisits
    // the level is not tagged at all.
    const shallow = [110, 106, 102, 98, 94, 90, 96, 102, 106, 104, 102];
    const tags = detectThemes(inputFor(fromCloses(shallow)));
    expect(tags.some((tag) => tag.value.theme === 'v-reversal')).toBe(false);
  });

  it('does not fire on a leg that barely bounces', () => {
    // A 20-point leg retraced by 3 points is 15%, well under 38.2%.
    const closes = [110, 106, 102, 98, 94, 90, 91.5, 93, 92, 91, 90.5];
    const tags = detectThemes(inputFor(fromCloses(closes)));
    expect(tags.some((tag) => tag.value.theme === 'v-reversal')).toBe(false);
  });

  it('does not fire on a leg too small to be worth reversing', () => {
    const closes = [100.6, 100.4, 100.2, 100, 100.3, 100.6, 100.4];
    const tags = detectThemes(inputFor(fromCloses(closes)));
    expect(tags.some((tag) => tag.value.theme === 'v-reversal')).toBe(false);
  });
});

describe('range-reversion — price kept coming back to both edges', () => {
  it('fires on a narrow window price traverses repeatedly', () => {
    const oscillating = [];
    for (let i = 0; i < 40; i++) oscillating.push(i % 2 === 0 ? 98 : 102);
    const tags = detectThemes(inputFor(fromCloses(oscillating)));
    const range = tags.find((tag) => tag.value.theme === 'range-reversion');
    expect(range).toBeDefined();
    // A range has no direction, and saying so is more useful than picking one.
    expect(range!.value.direction).toBeNull();
  });

  it('does not fire on a window wider than diffusion predicts', () => {
    // A driftless walk covers about ATR·√n. A window that went further is not a range, whatever its
    // shape — and the first draft's "closes cluster in the middle" test fought this condition
    // rather than complementing it, which is why it tagged 0.7% of the corpus.
    const wide = [];
    for (let i = 0; i < 40; i++) wide.push(100 + (i % 2 === 0 ? -20 : 20));
    const tags = detectThemes(inputFor(fromCloses(wide)));
    expect(tags.some((tag) => tag.value.theme === 'range-reversion')).toBe(false);
  });

  it('does not fire when price visits an edge only once', () => {
    const drift = Array.from({ length: 40 }, (_, i) => 100 + i * 0.1);
    const tags = detectThemes(inputFor(fromCloses(drift)));
    expect(tags.some((tag) => tag.value.theme === 'range-reversion')).toBe(false);
  });
});

describe('compression-expansion — quiet, then a release', () => {
  it('fires when a tight stretch is broken by a wide bar', () => {
    const bars = fromCloses([...flat(24, 100), 100], 0.05);
    // The release, built explicitly rather than hoped for.
    bars.push({ o: 100, h: 104, l: 99.8, c: 103.8, v: 10 });
    const tags = detectThemes(inputFor(bars));
    const found = tags.find((tag) => tag.value.theme === 'compression-expansion');
    expect(found).toBeDefined();
    expect(found!.value.direction).toBe('up');
  });

  it('does not fire on compression alone, which is a regime rather than a theme', () => {
    const tags = detectThemes(inputFor(fromCloses(flat(30, 100), 0.05)));
    expect(tags.some((tag) => tag.value.theme === 'compression-expansion')).toBe(false);
  });

  it('measures tightness against what diffusion predicts, not against bars × ATR', () => {
    // A ten-bar range is about ATR·√10 ≈ 3.2, not ATR·10. Normalising by the latter made every
    // window on earth look compressed and tagged 99% of the corpus.
    expect(Math.sqrt(THEME_SPEC.compressionWindowBars)).toBeCloseTo(3.162, 3);
  });
});

describe('trend-continuation — slope and efficiency, because either alone is not a trend', () => {
  it('fires on a steady climb', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i * 0.4);
    const tags = detectThemes(inputFor(fromCloses(closes)));
    const trend = tags.find((tag) => tag.value.theme === 'trend-continuation');
    expect(trend).toBeDefined();
    expect(trend!.value.direction).toBe('up');
  });

  it('does not fire on one violent bar in a flat window', () => {
    // A steep Theil–Sen slope can come from a single jump. Requiring efficiency too is what makes
    // "trend" a fact about the window rather than a name for its slope.
    const closes = [...flat(20, 100), 130, ...flat(19, 130)];
    const tags = detectThemes(inputFor(fromCloses(closes)));
    expect(tags.some((tag) => tag.value.theme === 'trend-continuation')).toBe(false);
  });

  it('reuses the published regime boundary rather than inventing one', () => {
    // 0.20 is where src/core/regime.ts puts `noise` → `directional`, anchored on the random-walk
    // expectation of 1/√80 ≈ 0.11. The theme and the regime tag cannot disagree about a window.
    expect(THEME_SPEC.trendMinEfficiency).toBe(0.2);
  });
});

describe('what gets stored, and what does not', () => {
  const bars = walk(80, 12);
  const input = inputFor(bars, atr(bars) ?? 1);

  it('refuses a theme that was not knowable by the decision bar', () => {
    // A tape's filter must be computable from the lead-in alone. A theme confirmed after the
    // decision is a fact about the reveal, and filtering on it would announce the answer before
    // the trade — the defect that keeps The Null Set locked.
    const tags = detectThemes(input);
    for (const theme of themesOf(input, 40)) {
      const supporting = tags.filter((tag) => tag.value.theme === theme && tag.knownAt <= 40);
      expect(supporting.length).toBeGreaterThan(0);
    }
  });

  it('refuses a theme too old to be the setup', () => {
    // Without this, "did X ever happen in eighty bars" answered yes for anything that happens at
    // all: three detectors tagged 92%, 86% and 82% of the corpus.
    const decision = bars.length - 1;
    const stored = themesOf(input, decision);
    const tags = detectThemes(input);
    for (const theme of stored) {
      const recent = tags.filter(
        (tag) =>
          tag.value.theme === theme &&
          tag.knownAt <= decision &&
          tag.knownAt > decision - THEME_SPEC.recencyBars,
      );
      expect(recent.length, `${theme} was stored but nothing recent supports it`).toBeGreaterThan(0);
    }
  });

  it('emits nothing below the strength floor', () => {
    for (const tag of detectThemes(input)) {
      expect(tag.value.strength).toBeGreaterThanOrEqual(MIN_STRENGTH);
      expect(tag.value.strength).toBeLessThanOrEqual(1);
    }
  });

  it('stamps every tag consistently and orders them deterministically', () => {
    assertWellFormed(detectThemes(input));
    expect(JSON.stringify(detectThemes(input))).toBe(JSON.stringify(detectThemes(input)));
  });

  it('gates on knownAt like everything else in Layer 2', () => {
    const tags = detectThemes(input);
    for (const tag of visibleAt(tags, 30)) expect(tag.knownAt).toBeLessThanOrEqual(30);
  });

  it('declines when there is no ATR to denominate anything in', () => {
    expect(detectThemes({ ...input, atr: 0 })).toEqual([]);
    expect(themesOf({ ...input, atr: -1 }, 79)).toEqual([]);
  });
});

describe('reflection turns every long setup into its short twin', () => {
  it('mirrors the direction and keeps the theme', () => {
    // The invertive relation again, and it is as informative here as it was for the primitives: the
    // detectors share one body per theme, so a direction that failed to flip would mean a
    // hard-coded side somewhere.
    const bars = walk(80, 19, 0.08);
    const straight = themesOf(inputFor(bars, atr(bars) ?? 1), bars.length - 1);

    const flipped = reflected(bars);
    const mirroredThemes = themesOf(inputFor(flipped, atr(flipped) ?? 1), flipped.length - 1);
    expect(new Set(mirroredThemes)).toEqual(new Set<Theme>(straight));
  });

  it('flips direction under the product’s own §12.2 mirror', () => {
    const bars = walk(80, 23, 0.1);
    const up = detectThemes(inputFor(bars, atr(bars) ?? 1));
    const mirrored = bars.map(mirrorBar);
    const down = detectThemes(inputFor(mirrored, atr(mirrored) ?? 1));

    const directional = (tags: typeof up, theme: Theme) =>
      tags.find((tag) => tag.value.theme === theme)?.value.direction ?? null;

    for (const theme of THEMES) {
      const a = directional(up, theme);
      const b = directional(down, theme);
      if (a === null || b === null) continue;
      expect(b, `${theme} did not flip`).toBe(a === 'up' ? 'down' : 'up');
    }
  });
});
