import { Button } from '@/components/ui';
import { Wordmark } from '@/components/ui/icons';

/**
 * The root 404.
 *
 * Renders inside the root layout only, so there is no shell around it — hence its own wordmark and
 * its own way out. The way out is the game rather than the home page: somebody who mistyped a URL
 * has not yet been given a reason to care about the marketing copy.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-md text-center">
        <Wordmark size="md" className="justify-center" />
        <div className="numeral text-ink-dim mt-10 text-display-sm">404</div>
        <h1 className="text-ink-max mt-2 text-2xl font-semibold text-balance">
          There is no chart at this address.
        </h1>
        <p className="text-ink-lo mt-3 text-base">
          The link is wrong or the page has moved. Nothing you played has been lost.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <Button as="a" href="/play/daily" variant="primary" size="lg">
            Play today&rsquo;s daily
          </Button>
          <Button as="a" href="/" variant="secondary" size="lg">
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
