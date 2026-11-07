import { notFound } from 'next/navigation';
import Link from 'next/link';
import { serviceClient } from '@/lib/supabase/server';
import { MarketSignature } from '@/components/ui/MarketSignature';
import { Button, EmptyState, Panel, Stat } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { isAccent } from '@/lib/avatar';
import { currentViewer } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { getPublicRecord } from '@/lib/game/server/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

/**
 * A player, in public: who they are and what they have played (docs/rules.md §23).
 *
 * Aggregates only. The rounds behind them — which pairs, on which days — stay on the player's own
 * Play page, because a list of someone's tapes is a list of hints about tapes other people have not
 * played yet.
 */
export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = serviceClient();
  const viewer = await currentViewer();

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_id, handle, handle_display, display_name, avatar_seed, avatar_accent, created_at')
    .eq('handle', handle.toLowerCase())
    .maybeSingle();

  if (!profile) notFound();

  const record = await getPublicRecord(profile.user_id as string);
  const accent = isAccent(profile.avatar_accent) ? profile.avatar_accent : 'ember';
  const isSelf = viewer.userId === profile.user_id;
  const name = profile.display_name ?? profile.handle_display ?? profile.handle;
  const played = record.rounds > 0;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Identity band. The signature is the largest thing on the page, because it is the only
          thing here that is actually this trader's rather than a number about them. */}
      <Panel tone="hero" pad="lg" className="rounded-3xl">
        <div className="flex flex-wrap items-center gap-6">
          <MarketSignature seed={profile.avatar_seed} accent={accent} size={112} ring="accent" />
          <div className="min-w-0">
            <h1 className="font-display text-ink-max text-4xl leading-none md:text-5xl">{name}</h1>
            <div className="text-ink-dim mt-1.5 text-base">@{profile.handle}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-ink-dim text-sm">
                Playing since{' '}
                {new Date(profile.created_at as string).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </span>
              {isSelf && (
                <Link
                  href={routes.settings}
                  className="text-ink-lo hover:text-ink-hi inline-flex items-center gap-1 text-sm font-medium transition-colors"
                >
                  <Icon name="settings" size={14} />
                  Edit
                </Link>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {!played ? (
        <div className="mt-6">
          <EmptyState
            icon="candle"
            title={isSelf ? 'You have not played a tape yet' : `${name} has not played a tape yet`}
            body={isSelf ? 'Lock in a round and your record starts here.' : 'Nothing to show until they play a round.'}
            action={
              isSelf ? (
                <Button href={routes.play.new} variant="primary" size="lg">
                  Deal your first tape
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Panel tone="raised" pad="md" className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Stat label="Rounds" value={String(record.rounds)} />
          <Stat label="Average grade" value={record.meanGrade === null ? '—' : String(record.meanGrade)} />
          <Stat label="Duels" value={`${record.won}–${record.lost}${record.drawn > 0 ? `–${record.drawn}` : ''}`} />
        </Panel>
      )}
    </div>
  );
}
