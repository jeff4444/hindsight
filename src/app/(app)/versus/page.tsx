import Link from 'next/link';
import { currentViewer, listMyMatches, listTapes } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { Chip, PageHeader, cx } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { VersusLauncher } from '@/components/versus/VersusLauncher';
import { DUEL_SPEC } from '@/core/duel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Versus' };

/**
 * Duels and races: set one up, or pick up one you are in.
 *
 * Both are the same primitive — a fixed ordered sequence several people play independently — and
 * both are honest about the thing a young product does not have, which is other people online at
 * the same moment. Nobody has to be.
 */
export default async function VersusPage({ searchParams }: { searchParams: Promise<{ tape?: string }> }) {
  const params = await searchParams;
  const viewer = await currentViewer();
  const [tapes, matches] = await Promise.all([listTapes(), listMyMatches(viewer)]);
  const open = tapes.filter((t) => !t.lockedReason).map((t) => ({ slug: t.slug, name: t.name, charts: t.charts }));
  const names = new Map(tapes.map((t) => [t.slug, t.slug === 'open' ? 'Shuffle' : t.name]));

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        eyebrow="Play"
        title="Versus"
        lede="The same charts as someone else. Nobody has to be online at the same time — each chart resolves when the second of you finishes it."
      />

      <VersusLauncher tapes={open} initialTape={params.tape} />

      <section aria-labelledby="matches-heading" className="space-y-4">
        <h2 id="matches-heading" className="text-ink-max text-xl font-semibold tracking-tight">
          Your matches
        </h2>
        {matches.length === 0 ? (
          <p className="text-ink-dim text-sm">Matches you open or join show up here, so a link is never the only way back.</p>
        ) : (
          <ul className="border-line bg-surface-2 divide-line-faint divide-y overflow-hidden rounded-2xl border">
            {matches.map((match) => (
              <li key={match.id}>
                <Link href={routes.versus.match(match.id)} className="hover:bg-fill-1 flex items-center gap-4 px-5 py-4 transition-colors">
                  <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', match.status === 'done' ? 'bg-fill-2 text-ink-dim' : 'bg-gold-bg text-gold-ink')}>
                    <Icon name={match.mode === 'duel' ? 'swords' : 'flag'} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink-max block text-sm font-semibold">
                      {match.mode === 'duel' ? 'Duel' : 'Race'} · {names.get(match.tape) ?? match.tape}
                    </span>
                    <span className="text-ink-dim block text-xs">
                      {match.charts}/{match.length} charts ·{' '}
                      {match.mode === 'duel'
                        ? `${match.health ?? DUEL_SPEC.health} health left`
                        : `${match.score >= 0 ? '+' : ''}${Math.round(match.score)} points`}
                    </span>
                  </span>
                  <Chip tone={match.status === 'done' ? 'neutral' : match.status === 'live' ? 'gold' : 'info'}>
                    {match.status === 'open' ? 'waiting' : match.status === 'live' ? 'in progress' : 'finished'}
                  </Chip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
