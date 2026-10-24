import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serviceClient } from '@/lib/supabase/server';
import { currentViewer } from '@/lib/viewer';
import { DUEL_SPEC } from '@/core/duel';
import { Chip, Eyebrow, Panel } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { JoinMatch } from '@/components/versus/JoinMatch';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: 'A match' };
}

/**
 * The other end of a share link.
 *
 * Taking the seat is what *creates* a duel's charts, so this page is not decoration — it is the step
 * that draws a sequence neither player has seen. Until someone lands here, the duel has no charts at
 * all, which is why it says so rather than showing an empty board.
 *
 * Rows are keyed by seat, never by owner. This is a server component, React serialises element keys
 * into the payload it sends the browser, and an anonymous player's owner is their session id — the
 * `hs_session` cookie itself. Keying by owner handed every visitor the cookies of everyone seated.
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
    .select('owner, seat, health, score, charts, clean, finished_at')
    .eq('match_id', id)
    .order('seat');
  const players = seats ?? [];
  const mine = players.find((p) => p.owner === owner) ?? null;
  const mode = match.mode as 'duel' | 'race';

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/versus"
        className="text-ink-dim hover:text-ink-hi inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
      >
        <Icon name="arrow-left" size={14} />
        Versus
      </Link>

      <div className="mt-5">
        <Eyebrow>{mode === 'duel' ? 'Duel' : 'Race'}</Eyebrow>
        <h1 className="text-ink-max mt-1.5 flex flex-wrap items-center gap-2 text-2xl font-semibold">
          {match.length} charts on {match.tape}
          <Chip tone={match.status === 'done' ? 'neutral' : 'info'}>{match.status}</Chip>
        </h1>
      </div>

      <Panel pad="md" className="mt-6">
        <Eyebrow>Players</Eyebrow>
        <ul className="mt-3 space-y-2">
          {players.map((p) => (
            <li key={`seat-${p.seat as number}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink">
                {p.owner === owner ? 'You' : `Seat ${(p.seat as number) + 1}`}
                {p.clean === false && (
                  <>
                    {' '}
                    <Chip tone="attention">seen before</Chip>
                  </>
                )}
              </span>
              <span className="numeral text-ink-lo">
                {mode === 'duel'
                  ? `${p.health ?? DUEL_SPEC.health} hp · ${p.charts ?? 0}/${match.length}`
                  : `${Math.round((p.score as number) ?? 0)} · ${p.charts ?? 0}/${match.length}`}
              </span>
            </li>
          ))}
          {players.length === 0 && <li className="text-ink-faint text-sm">Nobody yet.</li>}
        </ul>

        {mode === 'duel' && !match.chart_ids && (
          <p className="text-ink-faint mt-4 max-w-prose text-xs leading-relaxed">
            This duel has no charts yet. They are drawn when the second player takes a seat, from
            charts neither of you has played — a chart one of you has already seen is one you have
            already been shown the answer to.
          </p>
        )}
      </Panel>

      <JoinMatch
        id={id}
        mode={mode}
        joined={Boolean(mine)}
        status={match.status as string}
        ready={Boolean(match.chart_ids)}
      />
    </div>
  );
}
