'use client';

import { useEffect } from 'react';

/**
 * The last resort: an error thrown by the root layout itself.
 *
 * This replaces `<html>` and `<body>` wholesale, which means none of the app's own CSS is
 * guaranteed to have loaded — a failure in the root layout is exactly the case where the
 * stylesheet may be the thing that failed. So everything here is inline, self-contained, and
 * duplicates the two colours it needs rather than reading a token that might not exist.
 *
 * There is deliberately no route link. If the root layout is throwing, every route is throwing,
 * and offering navigation would just be a slower way back to this same screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          background: '#080b11',
          color: '#c1c4c9',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: '26rem', textAlign: 'center' }}>
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden>
            <rect x="5.5" y="4" width="6" height="24" rx="2" fill="#26a69a" />
            <rect x="20.5" y="4" width="6" height="24" rx="2" fill="none" stroke="#6393fd" strokeWidth="2.2" />
            <rect x="10.5" y="13.9" width="11" height="3.2" rx="1.6" fill="#f7f8fa" />
          </svg>
          <h1 style={{ color: '#f7f8fa', fontSize: '1.5rem', margin: '1.5rem 0 0', letterSpacing: '-0.02em' }}>
            Hindsight could not start
          </h1>
          <p style={{ margin: '0.75rem 0 0', lineHeight: 1.6 }}>
            Something failed before the page could load. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: '1.75rem',
              background: '#f7f8fa',
              color: '#101119',
              border: 0,
              borderRadius: '0.75rem',
              padding: '0.75rem 1.5rem',
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: '1rem', fontFamily: 'ui-monospace, monospace', fontSize: '0.8125rem', color: '#60636a' }}>
              reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
