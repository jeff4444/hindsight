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
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Hindsight',
  description: 'Trade the past. Learn the future.',
};

export const viewport: Viewport = {
  themeColor: '#0A0B0F',
  // The drag rails are the primary interaction and §16 requires them to work on touch from
  // the start. Pinch-zooming the page would fight the vertical drag. This is only defensible
  // because the type scale is in rem and therefore still responds to browser text zoom.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="bg-surface-0 text-ink min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
