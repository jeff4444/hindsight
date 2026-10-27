import Link from 'next/link';
import { ChartArt } from '@/components/ui/ChartArt';
import { Wordmark } from '@/components/ui/icons';

/**
 * The sign-in surface: the form on the right, and on the left the product in one picture — a chart
 * running into fog — with the promise that playing first costs nothing. The left panel is dark in
 * either theme, like the stage it previews.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,44%)_minmax(0,1fr)]">
      <aside data-theme="dark" className="bg-surface-1 border-line-faint text-ink relative hidden flex-col justify-between overflow-hidden border-r p-10 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(110% 70% at 10% 0%, oklch(0.815 0.14 78 / 0.10), transparent 60%)' }}
        />
        <Link href="/" aria-label="Hindsight home" className="relative">
          <Wordmark size="lg" />
        </Link>

        <div className="relative">
          <p className="font-display text-ink-max max-w-md text-5xl leading-[1.05]">Trade the past like it is live.</p>
          <p className="text-ink-lo mt-4 max-w-sm text-base leading-relaxed">
            Real markets replayed minute by minute at real prices — and a $100,000 paper account to trade them with.
          </p>
        </div>

        <div className="border-line relative overflow-hidden rounded-2xl border">
          <ChartArt seed={20261024} width={520} height={140} fog={0} />
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
