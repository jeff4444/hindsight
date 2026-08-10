/**
 * The colours the chart canvas draws with.
 *
 * lightweight-charts is configured imperatively at `createChart` time and takes plain strings, so
 * it cannot read a CSS custom property. That left the four candle literals duplicated in three
 * places — `Chart.tsx` for the series, and twice in `Play.tsx` for the exit markers — with the
 * panel UI meanwhile using `emerald-400` and `rose-400`, which are different greens and reds
 * entirely. During the reveal those sat forty pixels apart on the same screen.
 *
 * This module is the single source. `@theme` in globals.css carries the same values for
 * `--color-long` and `--color-short`, and `tests/palette.test.ts` parses the stylesheet and asserts
 * the two agree — the same shape as `tests/api-leak.test.ts`, which asserts a runtime payload
 * against its declared type rather than trusting that they were kept in step by hand.
 *
 * No 'server-only' and no React: `Chart.tsx` is a client component and imports this directly.
 */

/** Candle and volume colours. The two body colours are the anchors `@theme` is held against. */
export const CANDLE = {
  up: '#26a69a',
  down: '#ef5350',
  upVolume: 'rgba(38,166,154,0.32)',
  downVolume: 'rgba(239,83,80,0.32)',
} as const;

/** Chart furniture — axis text, gridlines, the crosshair. Not semantic, never reused in the UI. */
export const CHART_CHROME = {
  axis: '#6B7280',
  grid: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  crosshair: 'rgba(255,255,255,0.18)',
} as const;

/** The colour an exit marker is drawn in. A target is a gain, a stop or a timeout is not. */
export function exitColour(outcome: 'target' | 'stop' | 'timeout'): string {
  return outcome === 'target' ? CANDLE.up : CANDLE.down;
}
