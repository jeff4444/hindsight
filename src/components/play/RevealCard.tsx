'use client';

import type { ChartProvenance } from '@/lib/api-types';
import { Chip, cx } from '../ui';
import { Term } from '../ui/client';

/**
 * What it was — the punchline, turned over like a card.
 *
 * GeoGuessr's best moment is the map pin dropping on where you actually were. This is that moment:
 * the ticker, the venue and the date, released only after the commit (the server sends it with the
 * reveal and never before). It used to be the last, collapsed section of an eleven-part rail. Now it
 * sits near the top of the review and flips in.
 */
export function RevealCard({ provenance, className }: { provenance: ChartProvenance; className?: string }) {
  const { base, quote } = splitSymbol(provenance.symbol);

  return (
    <div className={cx('animate-flip border-line bg-surface-2 overflow-hidden rounded-2xl border', className)}>
      <div className="flex items-center gap-4 p-4">
        <span
          aria-hidden
          className={cx(
            'grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-bold ring-1',
            provenance.synthetic ? 'fog bg-fill-2 text-ink-lo ring-line' : 'bg-gold-bg text-gold-ink ring-gold-line',
          )}
        >
          {provenance.synthetic ? '?' : base.slice(0, 3)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-ink-dim">It was</div>
          {provenance.synthetic ? (
            <div className="text-ink-max mt-0.5 text-lg font-semibold">Not a real market</div>
          ) : (
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-ink-max text-xl font-semibold tracking-tight">{base}</span>
              {quote && <span className="text-ink-dim text-sm">/ {quote}</span>}
            </div>
          )}
          <div className="numeral text-ink-lo mt-0.5 truncate text-xs">
            {provenance.synthetic ? (provenance.sourceNote ?? 'Generated as a control') : `${provenance.venue} · ${formatMoment(provenance.decisionAt)}`}
          </div>
        </div>
      </div>
      <div className="border-line-faint bg-surface-1/60 flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
        {provenance.synthetic ? (
          <p className="text-ink-lo text-xs leading-relaxed">
            A few charts are generated, to measure whether reading charts is a skill at all. Your score on these
            is the control.
          </p>
        ) : (
          <>
            <span className="numeral text-ink-dim text-xs">entry {formatPrice(provenance.entryPriceReal)}</span>
            {provenance.mirrored && (
              <Chip tone="info">
                <Term id="mirrored">Mirrored</Term>
              </Chip>
            )}
            <span className="text-ink-dim ml-auto text-xs">Look it up — it really happened.</span>
          </>
        )}
      </div>
    </div>
  );
}

const QUOTES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'USD'];

function splitSymbol(symbol: string): { base: string; quote: string | null } {
  for (const quote of QUOTES) {
    if (symbol.length > quote.length && symbol.endsWith(quote)) {
      return { base: symbol.slice(0, -quote.length), quote };
    }
  }
  return { base: symbol, quote: null };
}

/** "Fri 16 Apr 2021, 08:00 UTC" — the real calendar moment, released only after the commit. */
function formatMoment(iso: string): string {
  return (
    new Date(iso).toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

/** Prices span nine orders of magnitude, so decimals follow the size. */
function formatPrice(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
