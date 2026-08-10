import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANDLE, exitColour } from '@/lib/palette';

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

  it('gain and loss alias direction rather than redeclaring it', () => {
    // The same hue serves an up candle, a target rail and a positive R. Aliasing keeps them from
    // being tuned apart by someone who only meant to change one of them.
    expect(themeValue('gain')).toBe('var(--color-long)');
    expect(themeValue('loss')).toBe('var(--color-short)');
  });
});

describe('exit markers', () => {
  it('draws a target as a gain and everything else as a loss', () => {
    expect(exitColour('target')).toBe(CANDLE.up);
    expect(exitColour('stop')).toBe(CANDLE.down);
    // A timeout marked to market can be positive, but it is not a target being hit, and the
    // marker says which of the three happened rather than whether it made money.
    expect(exitColour('timeout')).toBe(CANDLE.down);
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
