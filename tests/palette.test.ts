import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANDLE, CANDLE_CB, CANDLE_NIGHT, PAPER_OVERLAY_L, candlesFor, exitColour, overlayInk } from '@/lib/palette';
import { TOOL_COLOUR } from '@/lib/toolOverlays';

/**
 * The chart draws through lightweight-charts, which takes plain strings and cannot read a custom
 * property. So the same two colours are declared twice — once in `palette.ts` for the canvas, once
 * in `@theme` for every panel that has to sit beside it. Two declarations of one fact drift, and
 * this is the test that notices.
 */
const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function themeValue(name: string): string | null {
  const match = css.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

describe('the canvas and the interface agree on what green and red mean', () => {
  it('--color-long is the up candle', () => {
    expect(themeValue('long')).toBe(CANDLE.up);
  });

  it('--color-short is the down candle', () => {
    expect(themeValue('short')).toBe(CANDLE.down);
  });

  it('night carries its own pair, and the chart draws the same one on carbon', () => {
    const night = css.slice(css.indexOf("[data-theme='dark'] {"));
    expect(night.match(/--color-long:\s*([^;]+);/)?.[1].trim()).toBe(CANDLE_NIGHT.up);
    expect(night.match(/--color-short:\s*([^;]+);/)?.[1].trim()).toBe(CANDLE_NIGHT.down);
    expect(candlesFor('standard', 'dark')).toBe(CANDLE_NIGHT);
    expect(candlesFor('standard', 'light')).toBe(CANDLE);
  });

  it('the colour-blind palette agrees too', () => {
    const cb = css.slice(css.indexOf("[data-palette='cb'] {"));
    expect(cb.match(/--color-long:\s*([^;]+);/)?.[1].trim()).toBe(CANDLE_CB.up);
    expect(cb.match(/--color-short:\s*([^;]+);/)?.[1].trim()).toBe(CANDLE_CB.down);
  });

  it('gain and loss alias direction rather than redeclaring it', () => {
    // The same hue serves an up candle, a target rail and a positive R. Aliasing keeps them from
    // being tuned apart by someone who only meant to change one of them.
    expect(themeValue('gain')).toBe('var(--color-long)');
    expect(themeValue('loss')).toBe('var(--color-short)');
  });
});

describe('study lines printed on paper', () => {
  /** `#rrggbb` → OKLCH, the space the overlay rules are written in. */
  function oklch(value: string): { l: number; c: number; h: number } {
    const lin = (n: number) => {
      const v = n / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(value.slice(i, i + 2), 16)));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const h = (Math.atan2(B, A) * 180) / Math.PI;
    return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
  }
  const swatches = Object.values(TOOL_COLOUR)
    .flat()
    .filter((hex) => oklch(hex).c >= 0.04);

  it('leaves night alone: the table is authored for carbon', () => {
    for (const hex of swatches) expect(overlayInk(hex, 'dark')).toBe(hex);
  });

  it('darkens every hue enough to read on newsprint', () => {
    // surface-1 is oklch(0.974 …); a 1px line needs to sit well under it to be seen at all.
    for (const hex of swatches) expect(oklch(overlayInk(hex, 'light')).l).toBeLessThanOrEqual(PAPER_OVERLAY_L + 0.02);
  });

  it('keeps each hue where it was, so the rules about hue still hold on paper', () => {
    const apart = (a: number, b: number) => {
      const d = Math.abs(a - b) % 360;
      return d > 180 ? 360 - d : d;
    };
    for (const hex of swatches) expect(apart(oklch(overlayInk(hex, 'light')).h, oklch(hex).h)).toBeLessThan(8);
  });

  it('prints the player\'s own marks in ink, because white on paper is nothing', () => {
    expect(oklch(overlayInk(TOOL_COLOUR.mark, 'light')).l).toBeLessThan(0.3);
  });
});

describe('exit markers', () => {
  it('draws a target as a gain and everything else as a loss', () => {
    expect(exitColour('target')).toBe(CANDLE.up);
    expect(exitColour('stop')).toBe(CANDLE.down);
    // A timeout marked to market can be positive, but it is not a target being hit, and the
    // marker says which of the three happened rather than whether it made money.
    expect(exitColour('timeout')).toBe(CANDLE.down);
    expect(exitColour('target', CANDLE_CB)).toBe(CANDLE_CB.up);
  });
});

describe('the raw palette is gone from the components', () => {
  // The ESLint rule catches this at author time; this catches it if the rule is ever relaxed.
  const sources = ['src/components', 'src/app'];

  it('no component names a Tailwind palette colour directly', () => {
    const offenders: string[] = [];
    for (const dir of sources) {
      const files = walk(join(process.cwd(), dir));
      for (const file of files) {
        const text = readFileSync(file, 'utf8');
        // globals.css declares the tokens themselves, so it is exempt by construction.
        if (file.endsWith('globals.css')) continue;
        const hit = text.match(/\b(?:bg|text|border|ring|from|to|via)-(?:slate|emerald|rose|sky|amber|violet|gray|zinc|neutral)-\d{2,3}\b/);
        if (hit) offenders.push(`${file.replace(process.cwd() + '/', '')}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}
