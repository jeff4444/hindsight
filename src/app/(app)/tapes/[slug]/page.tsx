import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTape } from '@/lib/viewer';
import { Eyebrow, Panel } from '@/components/ui';
import { TapeLaunch } from '@/components/tapes/TapeLaunch';

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

      <Panel className="mt-7 p-5">
        <TapeLaunch slug={tape.slug} locked={locked} />
      </Panel>

      <p className="text-ink-dim mt-4 text-xs">Unlimited. Never metered.</p>
    </div>
  );
}
