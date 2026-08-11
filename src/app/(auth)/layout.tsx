import Link from 'next/link';
import { MarketSignature } from '@/components/ui/MarketSignature';
import { Wordmark } from '@/components/ui/icons';

/**
 * The auth shell.
 *
 * It used to be seven lines — a centred `max-w-sm` box on an empty page, with no wordmark, no
 * context and nothing to say why an account is worth having. That is the one screen where a
 * visitor is deciding whether this product is real, and it was the only screen in the app with no
 * brand on it at all.
 *
 * The left panel exists at `lg` and up because that is where the space is free. Below that it
 * collapses to a lockup over the form: on a phone the form *is* the screen and anything above it
 * is something to scroll past.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,42%)_minmax(0,1fr)]">
      <aside className="bg-surface-1 border-line-faint relative hidden flex-col justify-between overflow-hidden border-r p-10 lg:flex">
        <Link href="/" aria-label="Hindsight home">
          <Wordmark size="lg" />
        </Link>

        <div>
          <p className="text-ink-max max-w-sm text-2xl font-semibold text-balance">
            Eighty candles, no ticker, no date. Then the next sixty, one at a time.
          </p>
          <p className="text-ink-lo mt-4 max-w-sm text-base leading-relaxed">
            Scored against every bracket that was placeable on that exact path — not against
            whether you happened to profit.
          </p>
        </div>

        <div>
          <div className="flex items-center gap-3">
            {[10_193, 4_402_919, 88_317].map((seed, i) => (
              <MarketSignature
                key={seed}
                seed={seed}
                accent={(['ember', 'signal', 'frost'] as const)[i]}
                size={40}
                ring="accent"
              />
            ))}
          </div>
          <p className="text-ink-faint numeral mt-4 text-xs">
            1,000 charts · 98 outcomes scored per chart · no future data on the client
          </p>
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
