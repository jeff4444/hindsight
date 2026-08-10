import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTape } from '@/lib/viewer';
import { Button, Chip, Eyebrow, Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * A tape, and the settings you play it under.
 *
 * The tier selector shows all five of §3.2's tiers with only NTZ enabled. Hiding the other four
 * would be tidier and less honest — the ladder is the product's spine, and showing what is coming
 * (greyed, labelled) is worth more than pretending the shape does not exist.
 */
export default async function TapePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tape = await getTape(slug);
  if (!tape) notFound();

  const locked = Boolean(tape.lockedReason);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/tapes" className="text-ink-dim hover:text-ink-hi text-xs font-medium transition-colors">
        ← Tapes
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Eyebrow>Tape</Eyebrow>
          <h1 className="text-ink-max mt-1 text-2xl font-semibold">{tape.name}</h1>
        </div>
        <div className="text-right">
          <div className="text-ink-max font-mono text-xl tabular-nums">
            {tape.charts.toLocaleString()}
          </div>
          <div className="eyebrow text-ink-dim">charts</div>
        </div>
      </div>

      <p className="text-ink-lo mt-4 max-w-prose text-sm leading-relaxed">
        {locked ? tape.lockedReason : tape.blurb}
      </p>

      <Panel className="mt-7 p-4">
        <Eyebrow>Settings</Eyebrow>
        <div className="mt-3">
          <div className="text-ink-lo text-xs font-medium">Ruleset</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ['FD', 'Full Desk'],
              ['NN', 'News Blind'],
              ['NT', 'No Tools'],
              ['NTZ', 'Naked'],
              ['NTVZ', 'Blackout'],
            ].map(([code, name]) => {
              const live = code === 'NTZ';
              return (
                <button
                  key={code}
                  type="button"
                  disabled={!live}
                  aria-pressed={live}
                  title={live ? '80 candles, one timeframe, volume, ATR badge, set and forget' : 'Arrives with the ladder'}
                  className={
                    live
                      ? 'border-info-line bg-info-bg text-info-ink press rounded-md border px-3 py-2 text-left'
                      : 'border-line-faint text-ink-faint cursor-not-allowed rounded-md border border-dashed px-3 py-2 text-left opacity-60'
                  }
                >
                  <div className="font-mono text-xs font-semibold">{code}</div>
                  <div className="text-micro mt-0.5">{live ? name : 'soon'}</div>
                </button>
              );
            })}
          </div>
          <p className="text-ink-dim mt-3 text-xs leading-relaxed">
            Naked is the ranked standard and the only tier built. The rest arrive with the ladder,
            each removing one reading aid from the one above it.
          </p>
        </div>
      </Panel>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        {locked ? (
          <Chip tone="neutral">Locked</Chip>
        ) : (
          <Button as="a" href={`/play?mode=tape&tape=${tape.slug}`} variant="primary" size="lg">
            Play this tape
          </Button>
        )}
        <span className="text-ink-dim text-xs">Unlimited. Never metered.</span>
      </div>
    </div>
  );
}
