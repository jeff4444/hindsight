import Link from 'next/link';
import { DemoTerminal } from '@/components/trading/DemoTerminal';
import { ToastProvider } from '@/components/ui/client';
import { Icon } from '@/components/ui/icons';

export const metadata = { title: 'Try the terminal' };

/**
 * The terminal on a synthetic market, open to anyone, with nothing stored.
 *
 * The same session core the server runs, inside the browser: real order types, fills, fees, margin
 * and the review, on candles that never happened — so nothing here can be looked up, and nothing
 * here counts. The landing page sends visitors here before asking them for anything.
 */
export default function DemoPage() {
  return (
    <ToastProvider>
      <DemoTerminal
        exit={
          <Link
            href="/"
            aria-label="Back to the front page"
            className="text-ink-lo hover:text-ink-hi hover:bg-fill-2 grid h-9 w-9 shrink-0 place-items-center rounded-md"
          >
            <Icon name="arrow-left" size={18} />
          </Link>
        }
      />
    </ToastProvider>
  );
}
