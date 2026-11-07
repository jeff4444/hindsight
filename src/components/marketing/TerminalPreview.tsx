import Link from 'next/link';
import { ChartArt } from '../ui/ChartArt';
import { cx } from '../ui';
import { Icon } from '../ui/icons';

/**
 * The terminal, drawn, for the front page: a long position with its stop and target resting, a
 * limit order in the ticket, and the account under it. A picture rather than the live terminal,
 * because the real one wants the whole screen; the whole picture is a door to `/demo`, where it is
 * live. Printed on the page like a figure in a broadsheet — ink outline, hard shadow — and in the
 * page's own theme, because the terminal it pictures follows the theme too.
 *
 * Decorative. Every figure is fiction on a fictional pair, and the link carries the meaning.
 */
export function TerminalPreview({ className }: { className?: string }) {
  return (
    <Link
      href="/demo"
      aria-label="Open the demo terminal"
      className={cx(
        'group lift bg-surface-2 text-ink border-rule shadow-e3 relative block overflow-hidden rounded-3xl border hover:shadow-e4!',
        className,
      )}
    >
      <div aria-hidden>
        <div className="border-rule flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-ink-max font-semibold">DEMO</span>
            <span className="text-ink-dim text-sm">/USDT</span>
            <span className="numeral text-long-ink ml-2 font-semibold">142.318</span>
            <span className="numeral text-long-ink text-xs">+1.84%</span>
          </div>
          <div className="text-ink-lo flex items-center gap-2 text-xs">
            <span className="ring-line-strong grid h-7 w-7 place-items-center rounded-sm ring-1 ring-inset">
              <Icon name="pause" size={13} />
            </span>
            <span className="numeral ring-line-strong rounded-sm px-2 py-1 ring-1 ring-inset">15×</span>
            <span className="numeral hidden sm:inline">Tue 14:35</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="bg-surface-1 relative px-2 pt-3 pb-2">
            <ChartArt seed={3141} width={440} height={220} fog={0} />
            <Level top="20%" tone="long" label="TP 147.90" />
            <Level top="52%" tone="ink" label="Long 250 · +$412.80" solid />
            <Level top="80%" tone="short" label="SL 138.60" />
          </div>

          <div className="border-line hidden flex-col gap-2.5 border-l p-3 sm:flex">
            <div className="ring-line-strong grid grid-cols-2 rounded-sm p-0.5 text-xs font-semibold ring-1 ring-inset">
              <span className="bg-long text-on-accent rounded-xs py-1.5 text-center">Buy</span>
              <span className="text-ink-lo py-1.5 text-center">Sell</span>
            </div>
            <div className="text-ink-lo flex gap-3 text-xs">
              <span>Market</span>
              <span className="text-ink-max decoration-accent underline underline-offset-4">Limit</span>
              <span>Stop</span>
            </div>
            <Field label="Price" value="141.900" />
            <Field label="Quantity" value="250" />
            <div className="text-ink-dim grid grid-cols-4 gap-1 text-center text-[10px]">
              {['10%', '25%', '50%', '100%'].map((p) => (
                <span key={p} className="ring-line rounded-xs py-1 ring-1 ring-inset">
                  {p}
                </span>
              ))}
            </div>
            <span className="bg-long text-on-accent mt-auto rounded-sm py-2 text-center text-xs font-semibold">Buy 250 DEMO</span>
          </div>
        </div>

        <div className="border-rule flex gap-6 overflow-hidden border-t px-4 py-2.5">
          <Figure label="Equity" value="$100,412.80" />
          <Figure label="Unrealized" value="+$412.80" tone="long" />
          <Figure label="Buying power" value="$164,770.00" />
          <Figure label="Fees" value="$35.48" className="hidden sm:block" />
        </div>
      </div>

      <span className="bg-accent text-on-accent border-rule shadow-key absolute bottom-16 left-4 flex items-center gap-1.5 rounded-sm border px-3.5 py-2 text-sm font-semibold transition-transform group-hover:-translate-y-0.5">
        Try it live
        <Icon name="chevron-right" size={14} />
      </span>
    </Link>
  );
}

function Level({ top, tone, label, solid }: { top: string; tone: 'long' | 'short' | 'ink'; label: string; solid?: boolean }) {
  const line = tone === 'long' ? 'border-long' : tone === 'short' ? 'border-short' : 'border-ink-hi';
  const chip = tone === 'long' ? 'bg-long text-on-accent' : tone === 'short' ? 'bg-short text-on-accent' : 'bg-ink-max text-ink-inv';
  return (
    <div className="absolute inset-x-2" style={{ top }}>
      <div className={cx('border-t', solid ? 'border-solid' : 'border-dashed', line)} />
      <span className={cx('numeral absolute right-1 -translate-y-1/2 rounded-xs px-1.5 py-0.5 text-[10px] font-semibold', chip)}>{label}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 border-line-strong rounded-sm border px-2 py-1.5">
      <div className="text-ink-dim text-[10px]">{label}</div>
      <div className="numeral text-ink-max text-xs">{value}</div>
    </div>
  );
}

function Figure({ label, value, tone, className }: { label: string; value: string; tone?: 'long'; className?: string }) {
  return (
    <div className={cx('min-w-0 shrink-0', className)}>
      <div className="eyebrow text-ink-dim">{label}</div>
      <div className={cx('numeral mt-0.5 text-sm font-semibold', tone === 'long' ? 'text-long-ink' : 'text-ink-hi')}>{value}</div>
    </div>
  );
}
