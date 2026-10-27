import { notFound } from 'next/navigation';
import Link from 'next/link';
import { serviceClient } from '@/lib/supabase/server';
import { MarketSignature } from '@/components/ui/MarketSignature';
import { Button, EmptyState, Panel, Stat } from '@/components/ui';
import { Icon } from '@/components/ui/icons';
import { isAccent } from '@/lib/avatar';
import { currentViewer } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { formatPct, formatUsd } from '@/lib/trading/format';
import { MIN_BOARD_SESSIONS, getAccount, getEquityCurve } from '@/lib/trading/server/queries';
import { EquityCurve } from '@/components/trading/EquityCurve';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

/**
 * A trader, in public: who they are and what their main account has done.
 *
 * Aggregates only. The sessions behind them — which pairs, on which days — stay on the trader's own
 * Portfolio, because a list of someone's markets and results is a list of hints about markets other
 * people have not traded yet. Practice is never shown: it is where a trader is allowed to look at
 * dates, and it is nobody's record.
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

  const account = await getAccount(profile.user_id as string, 'main');
  const curve = account ? await getEquityCurve(account.id, account.starting) : [];
  const accent = isAccent(profile.avatar_accent) ? profile.avatar_accent : 'ember';
  const isSelf = viewer.userId === profile.user_id;
  const name = profile.display_name ?? profile.handle_display ?? profile.handle;
  const traded = account !== null && account.sessions > 0;
  const tone = (value: number) => (value > 0 ? 'long' : value < 0 ? 'short' : 'neutral');

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
                Trading since{' '}
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

      {!traded || !account ? (
        <div className="mt-6">
          <EmptyState
            icon="candle"
            title={isSelf ? 'You have not traded a market yet' : `${name} has not traded a market yet`}
            body={isSelf ? 'Close a session and your record starts here.' : 'Nothing to show until they close a session.'}
            action={
              isSelf ? (
                <Button href={routes.markets()} variant="primary" size="lg">
                  Trade your first market
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <Panel tone="raised" pad="md" className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Stat label="Equity" value={formatUsd(account.equity)} />
            <Stat label="Return" value={formatPct(account.returnPct, { sign: true })} tone={tone(account.returnPct)} />
            <Stat label="Max drawdown" value={formatPct(account.maxDrawdown)} />
            <Stat label="Sessions" value={String(account.sessions)} />
            <Stat label="Win rate" value={account.winRate === null ? '—' : formatPct(account.winRate, { decimals: 0 })} />
            <Stat label="Profit factor" value={account.profitFactor === null ? '—' : account.profitFactor.toFixed(2)} />
          </Panel>

          <Panel pad="md" className="mt-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-hi text-sm font-medium">Equity, session by session</span>
              <span className="text-ink-dim text-xs">
                {account.sessions >= MIN_BOARD_SESSIONS
                  ? 'On the leaderboard'
                  : `${MIN_BOARD_SESSIONS - account.sessions} more sessions to be ranked`}
              </span>
            </div>
            <EquityCurve values={curve} baseline={account.starting} height={176} className="mt-4" label={`${name}’s equity, session by session`} />
          </Panel>

          {isSelf && (
            <div className="mt-4 flex justify-end">
              <Button href={routes.portfolio()} variant="secondary">
                Every session, in Portfolio
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
