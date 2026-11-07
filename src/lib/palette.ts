/**
 * The colours the chart canvas draws with.
 *
 * lightweight-charts is configured imperatively and takes plain strings, so it cannot read a CSS
 * custom property. This module is the single source for the canvas; `@theme` in globals.css
 * carries the same values for `--color-long` and `--color-short`, and `tests/palette.test.ts`
 * parses the stylesheet and asserts the two agree — for paper, for night and for the colour-blind
 * palette.
 *
 * The chart follows the app's theme, so there is a set of candles per theme as well as per palette:
 * ledger green and accounting red on paper, a step brighter on carbon. The colour-blind pair sits
 * at mid lightness and serves both.
 *
 * No 'server-only' and no React: `Chart.tsx` is a client component and imports this directly.
 */

export type ChartTheme = 'light' | 'dark';

export type CandleColours = {
  up: string;
  down: string;
  upVolume: string;
  downVolume: string;
};

/** Ledger green and accounting red, on paper. The anchors the first `@theme` declarations are held to. */
export const CANDLE: CandleColours = {
  up: '#17915b',
  down: '#d6432a',
  upVolume: 'rgba(23,145,91,0.26)',
  downVolume: 'rgba(214,67,42,0.24)',
};

/** The same pair lifted for carbon, held to the `[data-theme='dark']` block. */
export const CANDLE_NIGHT: CandleColours = {
  up: '#3dbb7c',
  down: '#f0684c',
  upVolume: 'rgba(61,187,124,0.28)',
  downVolume: 'rgba(240,104,76,0.28)',
};

/** Blue and orange, which separate under every common colour-vision deficiency. */
export const CANDLE_CB: CandleColours = {
  up: '#2f86d6',
  down: '#e08a12',
  upVolume: 'rgba(47,134,214,0.28)',
  downVolume: 'rgba(224,138,18,0.28)',
};

export function candlesFor(palette: 'standard' | 'cb', theme: ChartTheme = 'light'): CandleColours {
  if (palette === 'cb') return CANDLE_CB;
  return theme === 'dark' ? CANDLE_NIGHT : CANDLE;
}

export interface ChartChrome {
  axis: string;
  grid: string;
  border: string;
  crosshair: string;
  /** The crosshair's axis label: ink on paper, cream on carbon. */
  label: string;
}

/** Chart furniture on paper — axis text, gridlines, the crosshair. Carbon ink at low alpha. */
export const CHART_CHROME: ChartChrome = {
  axis: '#6f685d',
  grid: 'rgba(40,33,24,0.055)',
  border: 'rgba(40,33,24,0.22)',
  crosshair: 'rgba(40,33,24,0.42)',
  label: '#221e18',
};

/** The same on carbon. Cream ink at low alpha. */
export const CHART_CHROME_NIGHT: ChartChrome = {
  axis: '#9a9184',
  grid: 'rgba(245,238,224,0.04)',
  border: 'rgba(245,238,224,0.12)',
  crosshair: 'rgba(245,238,224,0.3)',
  label: '#efe7d6',
};

export function chromeFor(theme: ChartTheme): ChartChrome {
  return theme === 'dark' ? CHART_CHROME_NIGHT : CHART_CHROME;
}

/** The best trade in hindsight, drawn on the chart. The pen, as `--color-accent` sets it on paper. */
export const HINDSIGHT_ACCENT = '#2f3fd8';

/** The colour an exit marker is drawn in. A target is a gain, a stop or a timeout is not. */
export function exitColour(
  outcome: 'target' | 'stop' | 'timeout',
  candles: CandleColours = CANDLE,
): string {
  return outcome === 'target' ? candles.up : candles.down;
}

/* ------------------------------------------------------------ overlay ink */

/** `#rrggbb` → OKLab. */
function toOklab(hex: string): [number, number, number] {
  const lin = (n: number) => {
    const v = n / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(parseInt(hex.slice(1, 3), 16));
  const g = lin(parseInt(hex.slice(3, 5), 16));
  const b = lin(parseInt(hex.slice(5, 7), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → `#rrggbb`, clamped into sRGB. */
function fromOklab([L, A, B]: [number, number, number]): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const channel = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)}${channel(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  )}${channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)}`;
}

/** The lightness a study line is printed at on paper: dark enough to read on newsprint at 1px. */
export const PAPER_OVERLAY_L = 0.56;

/**
 * A study colour for the theme it is drawn on.
 *
 * `TOOL_COLOUR` is authored once, light enough to read on carbon. On paper the same hue is printed
 * darker: lightness is brought down to `PAPER_OVERLAY_L` in OKLab and chroma scaled with it, so
 * hue — which is what the overlay rules are about — does not move. A near-neutral (the player's
 * own marks) becomes ink, because white on paper is nothing.
 */
export function overlayInk(hex: string, theme: ChartTheme): string {
  if (theme === 'dark' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [L, A, B] = toOklab(hex);
  if (Math.hypot(A, B) < 0.04) return CHART_CHROME.label;
  if (L <= PAPER_OVERLAY_L) return hex;
  const k = PAPER_OVERLAY_L / L;
  return fromOklab([PAPER_OVERLAY_L, A * Math.min(1.15, k * 1.35), B * Math.min(1.15, k * 1.35)]);
}
