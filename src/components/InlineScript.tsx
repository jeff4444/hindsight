/**
 * An inline script that runs before first paint and is left alone by React afterwards.
 *
 * React warns when it renders a `<script>` on the client, because a script inserted by React never
 * executes. This one only needs to execute once, during HTML parsing, so it ships as
 * `text/javascript` from the server and as inert `text/plain` on the client;
 * `suppressHydrationWarning` covers the type mismatch. The pattern is Next's own, from its guide
 * on preventing flash before hydration.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
