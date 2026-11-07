'use client';

import { useEffect } from 'react';
import { BRAND_HEX, FAVICON, markSvg } from '@/components/ui/brand';

/**
 * The last resort: an error thrown by the root layout itself.
 *
 * This replaces `<html>` and `<body>` wholesale, which means none of the app's own CSS is
 * guaranteed to have loaded — a failure in the root layout is exactly the case where the
 * stylesheet may be the thing that failed. So everything here is inline and self-contained, and
 * the colours and the mark come from `brand.ts` as literals rather than from tokens that might not
 * exist.
 *
 * There is deliberately no route link. If the root layout is throwing, every route is throwing,
 * and offering navigation would just be a slower way back to this same screen.
 */
const MARK_HTML = markSvg({ ...FAVICON, tile: undefined }, 36);

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: BRAND_HEX.canvas,
          color: BRAND_HEX.inkLo,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: '26rem', textAlign: 'center' }}>
          <div aria-hidden style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: MARK_HTML }} />
          <h1
            style={{
              color: BRAND_HEX.ink,
              fontFamily: 'ui-serif, Georgia, serif',
              fontWeight: 600,
              fontSize: '2rem',
              margin: '1.25rem 0 0',
              letterSpacing: '-0.01em',
            }}
          >
            Hindsight could not start
          </h1>
          <p style={{ margin: '0.75rem 0 0', lineHeight: 1.6 }}>
            Something failed before the page could load. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1.75rem',
              background: BRAND_HEX.accent,
              color: '#ffffff',
              border: `1px solid ${BRAND_HEX.ink}`,
              boxShadow: `3px 3px 0 0 ${BRAND_HEX.ink}`,
              borderRadius: '2px',
              padding: '0.75rem 1.75rem',
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: '1rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem', color: BRAND_HEX.inkLo }}>
              reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
