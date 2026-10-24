import { ImageResponse } from 'next/og';
import { BRAND_HEX, FAVICON, markSvg } from '@/components/ui/brand';

/**
 * The share card for the site itself.
 *
 * Hard rule, and it is a product rule rather than a technical one: there is never a per-round or
 * per-daily OG image. The daily share card is plain Unicode with no image and no link precisely so
 * that sharing a result cannot leak the shape of a setup to somebody who has not played it yet. An
 * image keyed to `#day` would carry chart character in every pixel. If you are here to add one,
 * that is what you would be undoing.
 *
 * Everything below is deliberately generic: the mark, the promise, and a walk that is not any real
 * chart, running into the fog.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Hindsight — every chart has already happened.';

// Literal hex throughout: satori resolves no custom properties and no oklch.
const { canvas: CANVAS, ink: INK, inkLo: INK_LO, gold: GOLD, long: LONG, short: SHORT } = BRAND_HEX;
const INK_DIM = '#8a847b';

async function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    // An old user agent gets truetype rather than woff2, which satori cannot parse.
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    // A social card is not worth a 500. Satori falls back to its bundled face.
    return null;
  }
}

/** A fixed, made-up walk: a base, a push, a pullback — then the fog where the answer would be. */
function chartSvg(width: number, height: number): string {
  let state = 20251024;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const candles: { o: number; c: number; h: number; l: number }[] = [];
  let level = 0.42;
  for (let i = 0; i < 46; i++) {
    const drift = i < 14 ? 0.002 : i < 32 ? 0.012 : -0.008;
    const o = level;
    const c = o + drift + (random() - 0.5) * 0.06;
    candles.push({ o, c, h: Math.max(o, c) + random() * 0.025, l: Math.min(o, c) - random() * 0.025 });
    level = c;
  }
  const hi = Math.max(...candles.map((k) => k.h));
  const lo = Math.min(...candles.map((k) => k.l));
  const y = (v: number) => (height - 16 - ((v - lo) / (hi - lo)) * (height - 32)).toFixed(1);
  const past = width * 0.68;
  const step = past / (candles.length + 0.5);
  const body = step * 0.58;

  const bars = candles
    .map((k, i) => {
      const x = step * (i + 0.75);
      const colour = k.c >= k.o ? LONG : SHORT;
      const top = y(Math.max(k.o, k.c));
      const h = Math.max(2, Math.abs(Number(y(k.o)) - Number(y(k.c))));
      return (
        `<line x1="${x}" x2="${x}" y1="${y(k.h)}" y2="${y(k.l)}" stroke="${colour}" stroke-width="1.5"/>` +
        `<rect x="${x - body / 2}" y="${top}" width="${body}" height="${h}" rx="1.2" fill="${colour}"/>`
      );
    })
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><pattern id="fog" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="10" stroke="${INK}" stroke-opacity="0.14" stroke-width="2"/></pattern></defs>` +
    bars +
    `<rect x="${past}" y="0" width="${width - past}" height="${height}" fill="url(#fog)"/>` +
    `<line x1="${past}" x2="${past}" y1="0" y2="${height}" stroke="${INK_DIM}" stroke-width="1.5" stroke-dasharray="3 5"/>` +
    `</svg>`
  );
}

const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

export default async function Image() {
  const [serif, regular, semibold] = await Promise.all([
    googleFont('Instrument+Serif', 400),
    googleFont('Inter', 400),
    googleFont('Inter', 600),
  ]);
  const fonts = [
    serif && { name: 'Instrument Serif', data: serif, weight: 400 as const, style: 'normal' as const },
    regular && { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    semibold && { name: 'Inter', data: semibold, weight: 600 as const, style: 'normal' as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }[];
  const display = serif ? 'Instrument Serif' : undefined;
  const chartWidth = 1200;
  const chartHeight = 230;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: CANVAS,
          backgroundImage: `radial-gradient(900px 520px at 85% 110%, rgba(242,181,68,0.13), transparent)`,
          fontFamily: regular ? 'Inter' : undefined,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', padding: '64px 72px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={dataUri(markSvg({ ...FAVICON, tile: undefined }, 46))} width={46} height={46} alt="" />
            <span style={{ color: INK, fontSize: 38, fontFamily: display, letterSpacing: -0.5 }}>Hindsight</span>
          </div>
          <div style={{ color: INK, fontSize: 92, fontFamily: display, lineHeight: 1.0, letterSpacing: -1.5, marginTop: 44 }}>
            Every chart has already happened.
          </div>
          <div style={{ color: INK_LO, fontSize: 28, lineHeight: 1.4, marginTop: 22, maxWidth: 860 }}>
            Call the trade, watch what came next, and see how it ranks against every trade you could have made.
          </div>
        </div>

        <div style={{ display: 'flex', position: 'absolute', left: 0, bottom: 0, width: chartWidth, height: chartHeight }}>
          <img src={dataUri(chartSvg(chartWidth, chartHeight))} width={chartWidth} height={chartHeight} alt="" />
          <div style={{ position: 'absolute', left: chartWidth * 0.68 + 18, top: 14, display: 'flex', color: INK_DIM, fontSize: 20 }}>
            60h ahead
          </div>
          <div style={{ position: 'absolute', right: 72, bottom: 30, display: 'flex', color: GOLD, fontSize: 22, fontWeight: 600 }}>
            A new daily every day
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
