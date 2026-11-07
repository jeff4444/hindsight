import { routes } from '@/lib/routes';
import { Button } from '@/components/ui';
import { ChartArt } from '@/components/ui/ChartArt';
import { Wordmark } from '@/components/ui/icons';

/**
 * The root 404.
 *
 * Renders inside the root layout only, so there is no shell around it — hence its own wordmark and
 * its own way out. The way out is the game rather than the home page: somebody who mistyped a URL
 * has not yet been given a reason to care about the marketing copy. The picture is a chart that
 * runs straight into fog, which is as close as this page gets to a joke.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-5 py-16">
      <div className="w-full max-w-md text-center">
        <Wordmark size="md" className="justify-center" />
        <div className="border-line bg-surface-1 mt-10 overflow-hidden rounded-2xl border">
          <ChartArt seed={404} width={440} height={110} fog={0.55} />
        </div>
        <div className="numeral text-ink-dim mt-8 text-sm">404</div>
        <h1 className="font-display text-ink-max mt-1 text-4xl text-balance">There is no chart at this address.</h1>
        <p className="text-ink-lo mt-3 text-base">The link is wrong or the page has moved. Nothing in your account has been lost.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <Button href={routes.play.index} variant="primary" size="lg">
            Go to Play
          </Button>
          <Button href="/" variant="secondary" size="lg">
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
