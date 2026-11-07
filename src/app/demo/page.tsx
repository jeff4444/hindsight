import Link from 'next/link';
import { DemoRound } from '@/components/game/DemoRound';
import { Button } from '@/components/ui';
import { ToastProvider } from '@/components/ui/client';
import { Icon } from '@/components/ui/icons';

export const metadata = { title: 'Try a round' };

/**
 * A training round on a synthetic market, open to anyone, with nothing stored.
 *
 * The same round core the server runs, inside the browser: one trade on $500, the tape played, and
 * a grade against the best and worst the tape allowed — on candles that never happened, so nothing
 * here can be looked up, and nothing here counts. The landing page sends visitors here before
 * asking them for anything.
 */
export default function DemoPage() {
  return (
    <ToastProvider>
      <DemoRound
        exit={
          <Link
            href="/"
            aria-label="Back to the front page"
            className="text-ink-lo hover:text-ink-hi hover:bg-fill-2 grid h-9 w-9 shrink-0 place-items-center rounded-md"
          >
            <Icon name="arrow-left" size={18} />
          </Link>
        }
        after={
          <Button href="/play" variant="secondary">
            Play real tapes
          </Button>
        }
      />
    </ToastProvider>
  );
}
