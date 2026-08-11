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
        {/* The panel has carried `relative overflow-hidden` since it was built, with nothing
            positioned inside it — hooks left for an atmospheric layer that never arrived, so the
            one full-height surface in the product was a flat fill. Two lights, the same cool key
            and indigo corner the body uses, at the alpha the rest of the system holds them to.

            A gradient, so there is no stacking context and nothing to think about. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 12% 0%, oklch(0.72 0.10 264 / 0.10), transparent 60%),' +
              'radial-gradient(90% 70% at 90% 100%, oklch(0.74 0.09 196 / 0.07), transparent 62%)',
          }}
        />

        <Link href="/" aria-label="Hindsight home" className="relative">
          <Wordmark size="lg" />
        </Link>

        <div className="relative">
          <p className="text-ink-max max-w-sm text-2xl font-semibold text-balance">
            Eighty candles, no ticker, no date. Then the next sixty, one at a time.
          </p>
          <p className="text-ink-lo mt-4 max-w-sm text-base leading-relaxed">
            Scored against every bracket that was placeable on that exact path — not against
            whether you happened to profit.
          </p>
        </div>

        <div className="relative">
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
