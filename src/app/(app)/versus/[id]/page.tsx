import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/server';
import { currentViewer, getTape } from '@/lib/viewer';
import { DUEL_SPEC } from '@/core/duel';
import { isAccent } from '@/lib/avatar';
import { routes } from '@/lib/routes';
import { Chip, ProgressBar, cx } from '@/components/ui';
import { MarketSignature } from '@/components/ui/MarketSignature';
import { Icon } from '@/components/ui/icons';
import { JoinMatch } from '@/components/versus/JoinMatch';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'A match' };

/**
 * The other end of a share link.
 *
 * Taking the seat is what creates a duel's charts, so this page is a step, not decoration: it draws
 * a sequence neither player has seen. Players are shown by handle where they have one — "Seat 2"
 * told the person who sent the link nothing — and a race's board is ordered by score, not by seat.
 */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await currentViewer();
  const owner = viewer.userId ?? viewer.sessionId;

  const supabase = serviceClient();
  const { data: match } = await supabase
    .from('matches')
    .select('id, mode, tape, length, status, chart_ids, created_at')
    .eq('id', id)
    .maybeSingle();
  if (!match) notFound();

  const { data: seats } = await supabase
    .from('match_players')
    .select('owner, user_id, seat, health, score, charts, clean, finished_at')
    .eq('match_id', id)
    .order('seat');
  const players = seats ?? [];
  const userIds = players.map((p) => p.user_id as string | null).filter((u): u is string => Boolean(u));
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('user_id, handle, avatar_seed, avatar_accent').in('user_id', userIds)
    : { data: [] };
  const byUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));

  const mine = players.find((p) => p.owner === owner) ?? null;
  const mode = match.mode as 'duel' | 'race';
  const tape = await getTape(match.tape as string, viewer.userId);
  const tapeName = match.tape === 'open' ? 'Shuffle' : (tape?.name ?? (match.tape as string));
  const ordered = mode === 'race' ? [...players].sort((a, b) => ((b.score as number) ?? 0) - ((a.score as number) ?? 0)) : players;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={routes.versus.index} className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors">
        <Icon name="arrow-left" size={14} />
        Versus
      </Link>

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow text-ink-dim">{mode === 'duel' ? 'Duel' : 'Race'}</span>
          <Chip tone={match.status === 'done' ? 'neutral' : match.status === 'live' ? 'gold' : 'info'}>
            {match.status === 'open' ? 'waiting for players' : match.status === 'live' ? 'in progress' : 'finished'}
          </Chip>
        </div>
        <h1 className="font-display text-ink-max mt-2 text-[2.75rem] leading-none md:text-6xl">
          {mode === 'duel' ? 'Head to head.' : 'The race is on.'}
        </h1>
        <p className="text-ink-lo mt-3 text-base">
          {match.length} charts from {tapeName}. {mode === 'duel' ? `${DUEL_SPEC.health} health each; the gap on every chart is damage.` : 'Same charts for every runner, scored on reading, not speed.'}
        </p>
      </header>

      <section className="border-line bg-surface-2 mt-8 overflow-hidden rounded-2xl border">
        <div className="border-line-faint flex items-center justify-between border-b px-5 py-3">
          <span className="eyebrow text-ink-dim">{mode === 'duel' ? 'Players' : 'Standings'}</span>
          <span className="numeral text-ink-dim text-xs">{players.length} {players.length === 1 ? 'player' : 'players'}</span>
        </div>
        <ul className="divide-line-faint divide-y">
          {ordered.map((p, rank) => {
            const profile = p.user_id ? byUser.get(p.user_id as string) : null;
            const you = p.owner === owner;
            const name = you ? 'You' : profile ? `@${profile.handle}` : `Player ${(p.seat as number) + 1}`;
            const health = (p.health as number | null) ?? DUEL_SPEC.health;
            // Keyed by seat, never by owner: React sends keys to the browser, and an anonymous
            // player's owner is their session cookie.
            return (
              <li key={`seat-${p.seat as number}`} className={cx('flex items-center gap-4 px-5 py-4', you && 'bg-fill-1')}>
                {mode === 'race' && <span className={cx('numeral w-6 text-sm font-semibold', rank === 0 ? 'text-gold-ink' : 'text-ink-dim')}>{rank + 1}</span>}
                {profile ? (
                  <MarketSignature seed={profile.avatar_seed as number} accent={isAccent(profile.avatar_accent) ? profile.avatar_accent : 'slate'} size={34} ring="accent" />
                ) : (
                  <span className="bg-fill-2 text-ink-dim grid h-[34px] w-[34px] place-items-center rounded-full">
                    <Icon name="user" size={16} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-ink-max flex items-center gap-2 text-sm font-semibold">
                    {name}
                    {p.clean === false && <Chip tone="attention">seen before</Chip>}
                  </div>
                  {mode === 'duel' ? (
                    <ProgressBar value={health} max={DUEL_SPEC.health} tone={you ? 'info' : 'short'} size="xs" className="mt-1.5 max-w-56" label={`${name} health`} />
                  ) : (
                    <div className="text-ink-dim text-xs">{(p.charts as number) ?? 0} of {match.length} charts</div>
                  )}
                </div>
                <span className="numeral text-ink-hi text-sm font-semibold">
                  {mode === 'duel' ? `${health}` : `${((p.score as number) ?? 0) >= 0 ? '+' : ''}${Math.round((p.score as number) ?? 0)}`}
                </span>
              </li>
            );
          })}
          {players.length === 0 && <li className="text-ink-dim px-5 py-4 text-sm">Nobody yet.</li>}
          {mode === 'duel' && players.length === 1 && (
            <li className="fog text-ink-dim flex items-center gap-4 px-5 py-4 text-sm">
              <span className="border-line-strong grid h-[34px] w-[34px] place-items-center rounded-full border border-dashed">?</span>
              An empty seat
            </li>
          )}
        </ul>
      </section>

      <JoinMatch id={id} mode={mode} joined={Boolean(mine)} status={match.status as string} ready={Boolean(match.chart_ids)} />
    </div>
  );
}
