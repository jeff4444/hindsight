import Link from 'next/link';
import { ChartArt } from '@/components/ui/ChartArt';
import { Wordmark } from '@/components/ui/icons';

/**
 * The sign-in surface: the form on the right, and on the left the product in one picture — a chart
 * running into fog — with the promise that playing first costs nothing. The left panel is printed
 * in reverse in either theme, carbon with cream ink, so the page reads as a spread: the cover on
 * the left, the form on the right.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,44%)_minmax(0,1fr)]">
      <aside data-theme="dark" className="bg-surface-1 text-ink relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <Link href="/" aria-label="Hindsight home" className="rule-double relative pb-5">
          <Wordmark size="lg" />
        </Link>

        <div className="relative">
          <p className="font-display text-ink-max max-w-md text-6xl leading-[1.0]">Trade the past like it is live.</p>
          <p className="text-ink-lo mt-4 max-w-sm text-base leading-relaxed">
            Real markets replayed minute by minute at real prices — and a $100,000 paper account to trade them with.
          </p>
        </div>

        <div className="border-rule bg-surface-0 relative overflow-hidden rounded-2xl border p-2">
          <ChartArt seed={20261024} width={520} height={140} fog={0.24} />
        </div>
      </aside>

      <div className="grid place-items-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" aria-label="Hindsight home" className="mb-8 inline-block lg:hidden">
            <Wordmark size="md" />
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
