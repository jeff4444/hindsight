import { ImageResponse } from 'next/og';

/**
 * The share card for the site itself.
 *
 * Hard rule, and it is a product rule rather than a technical one: there is never a per-round or
 * per-daily OG image. §10.4 makes the daily share card plain Unicode with no image and no link
 * precisely so that sharing a result cannot leak the shape of a setup to somebody who has not
 * played it yet. An image keyed to `#day` would carry chart character in every pixel. If you are
 * here to add one, that is what you would be undoing.
 *
 * Everything below is deliberately generic: the mark, the promise, and a distribution that is not
 * any real chart's.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Hindsight — trade the past, learn the future.';

// Literal hex throughout: satori resolves no custom properties and no oklch.
const SURFACE_0 = '#080b11';
const INK_MAX = '#f7f8fa';
const INK_LO = '#a1a5ab';
const INK_DIM = '#84888f';
const LONG = '#26a69a';
const SHORT = '#ef5350';
const BRAND = '#6393fd';

/** A stand-in achievable set. Right-skewed, like a real one, but not a real one. */
const BARS = [2, 3, 5, 8, 12, 17, 23, 30, 38, 44, 47, 43, 36, 28, 21, 15, 11, 8, 6, 4, 3, 2];
const PLAYER_BIN = 14;

async function inter(weight: 400 | 600): Promise<ArrayBuffer | null> {
  try {
    // The .woff (not .woff2) endpoint: satori cannot parse woff2.
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    // A social card is not worth a 500. Satori falls back to its bundled face.
    return null;
  }
}

export default async function Image() {
  const [regular, semibold] = await Promise.all([inter(400), inter(600)]);
  const fonts = [
    regular && { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    semibold && { name: 'Inter', data: semibold, weight: 600 as const, style: 'normal' as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }[];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          backgroundColor: SURFACE_0,
          // The overhead key light from globals.css, flattened to what satori can draw.
          backgroundImage: `radial-gradient(1200px 620px at 50% -180px, rgba(99,147,253,0.20), transparent), radial-gradient(700px 500px at 100% 100%, rgba(38,166,154,0.10), transparent)`,
          fontFamily: fonts.length ? 'Inter' : undefined,
        }}
      >
        {/* the lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 32 32">
            <rect x="5.5" y="4" width="6" height="24" rx="2" fill={LONG} />
            <rect x="20.5" y="4" width="6" height="24" rx="2" fill="none" stroke={BRAND} strokeWidth="2.2" />
            <rect x="10.5" y="13.9" width="11" height="3.2" rx="1.6" fill={INK_MAX} />
          </svg>
          <span style={{ color: INK_MAX, fontSize: 26, fontWeight: 600, letterSpacing: 4.4 }}>HINDSIGHT</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: INK_MAX, fontSize: 68, fontWeight: 600, letterSpacing: -2.2, lineHeight: 1.06 }}>
            You cannot learn to trade
          </div>
          <div style={{ color: INK_MAX, fontSize: 68, fontWeight: 600, letterSpacing: -2.2, lineHeight: 1.06 }}>
            from a chart you can scroll.
          </div>
          <div style={{ color: INK_LO, fontSize: 27, marginTop: 26, lineHeight: 1.45 }}>
            Eighty candles, no ticker, no date. Place a bracket, watch sixty play out,
          </div>
          <div style={{ color: INK_LO, fontSize: 27, lineHeight: 1.45 }}>
            then see where you landed among every trade that was possible.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <span style={{ color: INK_DIM, fontSize: 21 }}>
            1,000 charts · 98 outcomes scored per chart · no account needed
          </span>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 108 }}>
            {BARS.map((v, i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: Math.max(4, (v / 47) * 108),
                  borderRadius: 3,
                  backgroundColor: i === PLAYER_BIN ? BRAND : i < 8 ? SHORT : LONG,
                  opacity: i === PLAYER_BIN ? 1 : 0.4,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
