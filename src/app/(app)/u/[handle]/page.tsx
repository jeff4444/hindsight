import { notFound } from 'next/navigation';
import Link from 'next/link';
import { serviceClient } from '@/lib/supabase/server';
import { MarketSignature } from '@/components/ui/MarketSignature';
import { Button, EmptyState, Eyebrow, Gated, Panel, cx } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { isAccent } from '@/lib/avatar';
import { currentViewer, getCompletedDays } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

/** Days shown in the public activity strip. Two weeks reads as a habit without becoming a wall. */
const STRIP_DAYS = 21;

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

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

  const [{ data: rounds }, { data: streak }, { count: dailies }, activity] = await Promise.all([
    supabase
      .from('rounds')
      .select('passed, percentile')
      .eq('user_id', profile.user_id)
      .eq('superseded', false)
      .not('committed_at', 'is', null),
    supabase
      .from('player_streaks')
      .select('longest_length, longest_perfect')
      .eq('user_id', profile.user_id)
      .maybeSingle(),
    supabase
      .from('daily_completions')
      .select('day', { count: 'exact', head: true })
      .eq('user_id', profile.user_id),
    getCompletedDays(profile.user_id as string, STRIP_DAYS),
  ]);

  const { today, days: completed } = activity;
  const rows = rounds ?? [];
  const scored = rows.map((r) => r.percentile as number | null).filter((p): p is number => p !== null);
  const mean = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const accent = isAccent(profile.avatar_accent) ? profile.avatar_accent : 'ember';
  const perfect = (streak?.longest_perfect ?? 0) > 0;
  const isSelf = viewer.userId === profile.user_id;
  const name = profile.display_name ?? profile.handle_display ?? profile.handle;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Identity band. The signature is the largest thing on the page, because it is the only
          thing here that is actually this player's rather than a number about them. */}
      <Panel tone="hero" pad="lg" glow={perfect ? 'gold' : undefined}>
        <div className="flex flex-wrap items-center gap-6">
          <MarketSignature
            seed={profile.avatar_seed}
            accent={accent}
            size={112}
            ring={perfect ? 'gold' : 'accent'}
          />
          <div className="min-w-0">
            <h1 className="text-ink-max text-2xl font-semibold">{name}</h1>
            <div className="numeral text-ink-dim mt-1 text-base">@{profile.handle}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-ink-faint text-sm">
                Reading charts since{' '}
                {new Date(profile.created_at as string).toLocaleDateString('en-GB', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              {isSelf && (
                <Link
                  href="/settings"
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

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon="candle"
            title={isSelf ? 'You have not committed a round yet' : `${name} has not committed a round yet`}
            body={
              isSelf
                ? 'Play a chart and your record starts here.'
                : 'Nothing to show until they play one.'
            }
            action={
              isSelf ? (
                <Button as="a" href="/play" variant="primary" size="lg">
                  Play your first chart
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-stagger>
            <Tile label="Rounds" value={rows.length} index={0} />
            <Tile label="Dailies" value={dailies ?? 0} index={1} />
            <Tile label="Longest streak" value={streak?.longest_length ?? 0} index={2} />
            <Tile
              label="Mean percentile"
              index={3}
              gate={{ sample: rows.length, min: 10 }}
              value={mean === null ? '—' : Math.round(mean * 100)}
            />
          </div>

          {/* The public habit, without publishing anybody's scores. */}
          <Panel pad="md" className="mt-3">
            <Eyebrow>Last three weeks</Eyebrow>
            <div
              className="mt-3 flex gap-1"
              role="img"
              aria-label={`${completed.size} of the last ${STRIP_DAYS} dailies completed`}
            >
              {Array.from({ length: STRIP_DAYS }, (_, i) => {
                const day = today - STRIP_DAYS + 1 + i;
                const done = completed.has(day);
                return (
                  <span
                    key={day}
                    title={done ? `Daily #${day} — done` : `Daily #${day}`}
                    className={cx(
                      'h-7 min-w-0 flex-1 rounded-sm sm:h-8',
                      done ? (perfect ? 'bg-gold/70' : 'bg-long/70') : 'bg-fill-1',
                    )}
                  />
                );
              })}
            </div>
            <p className="text-ink-dim mt-3 text-sm">
              {completed.size} of the last {STRIP_DAYS} dailies. Which days, not which scores —
              results stay between a player and their own debrief.
            </p>
          </Panel>
        </>
      )}

      <p className="text-ink-dim mt-8 max-w-prose text-sm leading-relaxed">
        A style badge — the school this player actually trades as, derived from which engine their
        entries match — needs scoring engines that do not exist yet. It will be earned, never
        chosen, which is why there is a space for it here and nothing in it.
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  index,
  gate,
}: {
  label: string;
  value: number | string;
  index: number;
  gate?: { sample: number; min: number };
}) {
  const figure = <span className="numeral text-ink-max text-2xl font-semibold">{value}</span>;
  return (
    <Panel pad="md" style={{ '--i': index } as React.CSSProperties}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1.5">
        {gate ? (
          <Gated sample={gate.sample} min={gate.min}>
            {figure}
          </Gated>
        ) : (
          figure
        )}
      </div>
    </Panel>
  );
}
