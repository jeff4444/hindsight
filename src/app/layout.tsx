import type { Metadata, Viewport } from 'next';
import { Fraunces, Red_Hat_Mono, Schibsted_Grotesk } from 'next/font/google';
import { THEME_SCRIPT } from '@/lib/theme-script';
import { InlineScript } from '@/components/InlineScript';
import './globals.css';

/*
 * Schibsted Grotesk for the interface, Red Hat Mono for numbers, Fraunces for the voice.
 *
 * Fraunces is the Ledger redesign's headline face: an old-style serif cut for display, set
 * semibold and soft-cornered (the SOFT axis) so a page title reads like a broadsheet headline
 * rather than a fashion magazine's. Its italic is the caption voice — the eyebrow over a figure —
 * which is why the italic is loaded too. `opsz` lets the 13px caption and the 72px headline each
 * get letterforms drawn for their size.
 *
 * Schibsted Grotesk was drawn for a newsroom, which is the register: sturdy, plain, legible at 13px
 * in a table and unremarkable at 17px in a paragraph, so the numbers and the headlines carry the
 * character and the interface face gets out of their way.
 *
 * The mono choice is a jitter argument rather than a taste one. This product animates numbers: the
 * P&L ticks every replayed minute and the order ticket's readouts update on every keystroke and
 * every drag of a price line. `tabular-nums` on a proportional face fixes advance width but not
 * rhythm — the decimal point still lands in a slightly different optical position row to row. A
 * mono face fixes both, and Red Hat Mono's open, slightly humanist figures keep a column of them
 * readable rather than mechanical.
 */
const sans = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-schibsted',
  display: 'swap',
});

const mono = Red_Hat_Mono({
  subsets: ['latin'],
  variable: '--font-redhat-mono',
  display: 'swap',
});

const serif = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT'],
  variable: '--font-fraunces',
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
  description: 'Paper trading on real market history. Real Binance markets replayed minute by minute at real prices, with market, limit and stop orders, real fees and margin, and the date held back until the close.',
  applicationName: 'Hindsight',
  openGraph: {
    type: 'website',
    siteName: 'Hindsight',
    title: 'Hindsight',
    description: 'Paper trading on real market history. Real Binance markets replayed minute by minute at real prices, with market, limit and stop orders, real fees and margin, and the date held back until the close.',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export const viewport: Viewport = {
  // Paper's --color-surface-0, so the browser chrome and the page are one sheet. Paper is the
  // default whatever the OS prefers, so there is one colour rather than one per scheme.
  themeColor: '#f5efe2',
  // No maximumScale. Pinch-zoom is an accessibility floor; the chart and the rails already opt out
  // of page gestures with `touch-action: none`, so zooming the page cannot fight a rail drag.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` covers the attributes the blocking scripts write before React
    // hydrates — `data-motion`, `data-theme` and `data-palette`. The server cannot know the
    // viewer's stored preferences, so the two copies of <html> legitimately differ. It suppresses
    // the mismatch on this element only, not on its subtree.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${serif.variable}`}
    >
      <body className="bg-surface-0 text-ink min-h-dvh font-sans antialiased">
        <InlineScript html={THEME_SCRIPT + MOTION_SCRIPT} />
        {children}
      </body>
    </html>
  );
}
