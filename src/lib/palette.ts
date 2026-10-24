/**
 * The colours the chart canvas draws with.
 *
 * lightweight-charts is configured imperatively and takes plain strings, so it cannot read a CSS
 * custom property. This module is the single source for the canvas; `@theme` in globals.css
 * carries the same values for `--color-long` and `--color-short`, and `tests/palette.test.ts`
 * parses the stylesheet and asserts the two agree — for the standard palette and the colour-blind
 * one.
 *
 * The chart is always drawn on the dark stage, in either app theme: the play route pins
 * `data-theme="dark"` on its own root. So there is one set of candles per palette, not per theme.
 *
 * No 'server-only' and no React: `Chart.tsx` is a client component and imports this directly.
 */

export type CandleColours = {
  up: string;
  down: string;
  upVolume: string;
  downVolume: string;
};

/** Mint and coral. The two body colours are the anchors `@theme` is held against. */
export const CANDLE: CandleColours = {
  up: '#3fd49b',
  down: '#ff6b57',
  upVolume: 'rgba(63,212,155,0.30)',
  downVolume: 'rgba(255,107,87,0.30)',
};

/** Blue and orange, which separate under every common colour-vision deficiency. */
export const CANDLE_CB: CandleColours = {
  up: '#4c9aff',
  down: '#ff9f1c',
  upVolume: 'rgba(76,154,255,0.30)',
  downVolume: 'rgba(255,159,28,0.30)',
};

export function candlesFor(palette: 'standard' | 'cb'): CandleColours {
  return palette === 'cb' ? CANDLE_CB : CANDLE;
}

/** Chart furniture — axis text, gridlines, the crosshair. Warm ink at low alpha, on the stage. */
export const CHART_CHROME = {
  axis: '#8a847b',
  grid: 'rgba(247,243,236,0.035)',
  border: 'rgba(247,243,236,0.09)',
  crosshair: 'rgba(247,243,236,0.22)',
} as const;

/** The best trade in hindsight, drawn on the chart. Same gold as `--color-gold`. */
export const HINDSIGHT_GOLD = '#f2b544';

/** The colour an exit marker is drawn in. A target is a gain, a stop or a timeout is not. */
export function exitColour(
  outcome: 'target' | 'stop' | 'timeout',
  candles: CandleColours = CANDLE,
): string {
  return outcome === 'target' ? candles.up : candles.down;
}
