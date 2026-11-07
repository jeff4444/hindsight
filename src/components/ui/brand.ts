/**
 * The mark, as data.
 *
 * Two candle bodies form the stems of an H and the bar between them is the entry line. The left
 * body is solid ink — the past, printed. The right body is drawn in the pen and hatched — the
 * future, still fog. You commit at the line between them, which is the whole game in one glyph.
 * Square-cornered, like everything else set in Ledger.
 *
 * This file is the only place the geometry lives. `Mark` renders it as JSX; `markSvg` renders it as
 * a string for the favicon, the OG image and the global error page, none of which can import a
 * component or resolve a custom property. Before this the mark was copied by hand into four files
 * with four sets of hex literals, and they had already drifted. `tests/brand.test.ts` holds
 * `src/app/icon.svg` against `markSvg(FAVICON)`.
 */

export const MARK = {
  viewBox: 32,
  past: { x: 5.5, y: 4, width: 6, height: 24, rx: 0.5 },
  future: { x: 20.5, y: 4, width: 6, height: 24, rx: 0.5, stroke: 2 },
  bar: { x: 10.5, y: 13.9, width: 11, height: 3.2, rx: 0 },
  /** Hatch lines inside the future candle, as segments clipped to its body. */
  hatch: [
    [20.5, 9.5, 26.5, 3.5],
    [20.5, 14.5, 26.5, 8.5],
    [20.5, 19.5, 26.5, 13.5],
    [20.5, 24.5, 26.5, 18.5],
    [20.5, 29.5, 26.5, 23.5],
  ] as const,
} as const;

/** Literal colours for contexts with no CSS: paper, carbon ink and the pen. */
export const BRAND_HEX = {
  canvas: '#f5efe2',
  ink: '#17140f',
  inkLo: '#5e584e',
  inkDim: '#857d70',
  accent: '#2f3fd8',
  long: '#17915b',
  short: '#d6432a',
} as const;

export interface MarkColours {
  past: string;
  future: string;
  bar: string;
  /** A rounded tile behind the mark, for the favicon. Omit for a bare mark. */
  tile?: string;
}

export const FAVICON: MarkColours = {
  past: BRAND_HEX.ink,
  future: BRAND_HEX.accent,
  bar: BRAND_HEX.ink,
  tile: BRAND_HEX.canvas,
};

/** The mark as a standalone SVG document. */
export function markSvg(colours: MarkColours, size = 32): string {
  const { past, future, bar, hatch } = MARK;
  const tile = colours.tile
    ? `<rect x="0.75" y="0.75" width="30.5" height="30.5" rx="2" fill="${colours.tile}" stroke="${colours.past}" stroke-width="1.5"/><g transform="translate(16 16) scale(0.74) translate(-16 -16)">`
    : '<g>';
  const lines = hatch
    .map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`)
    .join('');
  return (
    `<svg viewBox="0 0 32 32" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    tile +
    `<rect x="${past.x}" y="${past.y}" width="${past.width}" height="${past.height}" rx="${past.rx}" fill="${colours.past}"/>` +
    `<clipPath id="hs-future"><rect x="${future.x}" y="${future.y}" width="${future.width}" height="${future.height}" rx="${future.rx}"/></clipPath>` +
    `<g clip-path="url(#hs-future)" stroke="${colours.future}" stroke-width="1.1" stroke-linecap="round" opacity="0.8">${lines}</g>` +
    `<rect x="${future.x}" y="${future.y}" width="${future.width}" height="${future.height}" rx="${future.rx}" fill="none" stroke="${colours.future}" stroke-width="${future.stroke}"/>` +
    `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="${bar.rx}" fill="${colours.bar}"/>` +
    `</g></svg>`
  );
}
