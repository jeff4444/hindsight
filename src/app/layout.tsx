import type { Metadata, Viewport } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import './globals.css';

/*
 * Inter for the interface, Geist Mono for numbers.
 *
 * Inter is deliberately the face with the least voice available. The register the scope document
 * writes in is austere and declarative, and that is not served by a typeface with opinions — it is
 * served by numbers that carry the voice and a UI face that gets out of their way.
 *
 * The mono choice is a jitter argument rather than a taste one. This product animates numbers: the
 * R-multiple counts up over 620ms, the reveal counter changes every 78ms at 1x, and the R:R readout
 * updates on every pointer-move during a rail drag. `tabular-nums` on a proportional face fixes
 * advance width but not rhythm — the decimal point still lands in a slightly different optical
 * position row to row. A mono face fixes both.
 *
 * `axes: ['opsz']` is new and it is most of what makes the display sizes look bought rather than
 * scaled. Inter v4 carries an optical-size axis; globals.css has always set
 * `font-optical-sizing: auto`, but that did nothing while next/font requested only the weight axis,
 * so the 92px R-multiple was being drawn with letterforms cut for body copy.
 */
const inter = Inter({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

/*
 * The motion preference, applied before the first paint.
 *
 * globals.css keys off `data-motion` and `useReducedMotion` reads the same attribute, but until
 * now nothing in the app ever wrote it — the setting was fully plumbed and completely inert.
 *
 * This has to be an inline, synchronous script. A deferred one runs after the first paint, by
 * which point the entrance animations on the first screen have already played, which is precisely
 * the thing a viewer asking for reduced motion is asking not to see.
 */
const MOTION_SCRIPT = `try{var m=localStorage.getItem('hs-motion');if(m==='reduced'||m==='full')document.documentElement.dataset.motion=m}catch(e){}`;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Hindsight',
    template: '%s · Hindsight',
  },
  description: 'Trade the past. Learn the future.',
  applicationName: 'Hindsight',
  openGraph: {
    type: 'website',
    siteName: 'Hindsight',
    title: 'Hindsight',
    description: 'Trade the past. Learn the future.',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export const viewport: Viewport = {
  // Matches --color-surface-0. The old literal here was #0A0B0F, left behind by an earlier ramp,
  // so the browser chrome and the page were two different blacks.
  themeColor: '#080b11',
  // The drag rails are the primary interaction and §16 requires them to work on touch from
  // the start. Pinch-zooming the page would fight the vertical drag. This is only defensible
  // because the type scale is in rem and therefore still responds to browser text zoom.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` covers exactly one attribute: `data-motion`, written by the
    // blocking script above before React hydrates. The server cannot know the viewer's stored
    // preference, so the two copies of <html> legitimately differ and React would otherwise warn
    // on every load. It suppresses the mismatch on this element only, not on its subtree.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body className="bg-surface-0 text-ink min-h-dvh font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
