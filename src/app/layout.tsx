import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hindsight',
  description: 'Trade the past. Learn the future.',
};

export const viewport: Viewport = {
  themeColor: '#020617',
  // The drag rails are the primary interaction and §16 requires them to work on touch from
  // the start. Pinch-zooming the page would fight the vertical drag.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-950 text-slate-200 antialiased">{children}</body>
    </html>
  );
}
