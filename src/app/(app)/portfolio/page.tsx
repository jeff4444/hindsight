import { currentViewer } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { formatPct, formatUsd } from '@/lib/trading/format';
import {
  MIN_BOARD_SESSIONS,
  getAccount,
  getEquityCurve,
  getOpenSession,
  getSessions,
  untouchedAccount,
  type SessionRow,
} from '@/lib/trading/server/queries';
import { Button, Chip, EmptyState, LinkTabs, PageHeader, Panel, Stat } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EquityCurve } from '@/components/trading/EquityCurve';
import { ResetAccount } from '@/components/portfolio/ResetAccount';

export const dynamic = 'force-dynamic';

/**
 * Portfolio: the account as a statement.
 *
 * What it is worth, how it got there, and every session behind it. Two accounts — main, which is
 * ranked, and practice, which may show dates and never is.
 */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const purpose = (await searchParams).account === 'practice' ? 'practice' : 'main';
  const viewer = await currentViewer();
  const owner = viewer.userId ?? viewer.sessionId;
  const [stored, open] = await Promise.all([getAccount(owner, purpose), getOpenSession(owner)]);
  const account = stored ?? untouchedAccount(purpose);
  const [sessions, curve] = await Promise.all([getSessions(account.id), getEquityCurve(account.id, account.starting)]);
  const tone = (value: number) => (value > 0 ? 'long' : value < 0 ? 'short' : 'neutral');

  const columns: Column<SessionRow>[] = [
    {
      key: 'market',
      header: 'Market',
      cell: (s) => (
        <span className="flex items-center gap-2">
          <span className="text-ink-max font-semibold">{s.symbol.replace(/USDT$/, '/USDT')}</span>
          {s.source === 'daily' && <Chip size="sm" tone="accent">Daily</Chip>}
          {s.source === 'scenario' && s.scenario && <Chip size="sm">{s.scenario}</Chip>}
          {s.status === 'open' && <Chip size="sm" tone="info" dot>Open</Chip>}
        </span>
      ),
    },
    {
      key: 'played',
      header: 'Traded',
      hideBelow: 'md',
      cell: (s) => <span className="text-ink-lo">{new Date(s.openedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>,
    },
    { key: 'trades', header: 'Trades', numeric: true, hideBelow: 'sm', cell: (s) => s.roundTrips ?? '—' },
    { key: 'fees', header: 'Fees', numeric: true, hideBelow: 'lg', cell: (s) => (s.fees === null ? '—' : formatUsd(s.fees)) },
    {
      key: 'pnl',
      header: 'P&L',
      numeric: true,
      cell: (s) =>
        s.ending === null ? (
          <span className="text-ink-dim">—</span>
        ) : (
          <span className={s.ending - s.starting >= 0 ? 'text-long-ink' : 'text-short-ink'}>{formatUsd(s.ending - s.starting, { sign: true })}</span>
        ),
    },
    {
      key: 'return',
      header: 'Return',
      numeric: true,
      cell: (s) =>
        s.returnPct === null ? (
          <span className="text-ink-dim">—</span>
        ) : (
          <span className={s.returnPct >= 0 ? 'text-long-ink' : 'text-short-ink'}>{formatPct(s.returnPct, { sign: true })}</span>
        ),
    },
    {
      key: 'go',
      header: '',
      align: 'right',
      cell: (s) =>
        s.status === 'open' ? (
          <Button size="xs" variant="primary" href={routes.trade.session(s.id)}>
            Resume
          </Button>
        ) : s.closeReason === 'superseded' ? (
          <span className="text-ink-dim text-mini">Superseded</span>
        ) : (
          <Button size="xs" variant="ghost" href={routes.trade.review(s.id)}>
            Review
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Portfolio"
        title={formatUsd(account.equity)}
        lede={
          account.sessions === 0
            ? `A ${purpose} account starts with $100,000 of paper money. It is yours the moment you place a trade.`
            : `${formatPct(account.returnPct, { sign: true })} since this account opened, over ${account.sessions} ${account.sessions === 1 ? 'session' : 'sessions'}.`
        }
        actions={
          <>
            <Button variant="primary" href={open ? routes.trade.session(open.id) : routes.trade.open({ kind: 'random' }, purpose)}>
              {open ? 'Resume session' : 'Trade a market'}
            </Button>
            {stored && <ResetAccount purpose={purpose} disabled={open !== null} />}
          </>
        }
      />

      <LinkTabs
        label="Account"
        active={purpose}
        tabs={[
          { value: 'main', label: 'Main', href: routes.portfolio('main') },
          { value: 'practice', label: 'Practice', href: routes.portfolio('practice') },
        ]}
      />

      {account.bankrupt && (
        <Panel tone="raised" glow="short">
          <div className="text-short-ink font-semibold">This account was liquidated.</div>
          <p className="text-ink-lo mt-1 text-sm">Its equity is gone. Reset it to start again from $100,000; the record stays archived as it is.</p>
        </Panel>
      )}

      <Panel tone="hero" pad="md" className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label="Total return" value={formatPct(account.returnPct, { sign: true })} tone={tone(account.returnPct)} />
        <Stat label="Realized P&L" value={formatUsd(account.realized, { sign: true })} tone={tone(account.realized)} />
        <Stat label="Fees paid" value={formatUsd(account.fees)} />
        <Stat label="Max drawdown" value={formatPct(account.maxDrawdown)} tone={account.maxDrawdown > 0.15 ? 'short' : 'neutral'} />
        <Stat label="Sessions" value={account.sessions} size="sm" />
        <Stat label="Trades" value={account.roundTrips} size="sm" />
        <Stat label="Win rate" value={account.winRate === null ? '—' : formatPct(account.winRate, { decimals: 0 })} size="sm" />
        <Stat label="Profit factor" value={account.profitFactor === null ? '—' : account.profitFactor.toFixed(2)} size="sm" />
      </Panel>

      <Panel pad="md">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-ink-hi text-sm font-medium">Equity, session by session</div>
          {purpose === 'main' && account.sessions < MIN_BOARD_SESSIONS && (
            <span className="text-ink-dim text-xs">
              {MIN_BOARD_SESSIONS - account.sessions} more {MIN_BOARD_SESSIONS - account.sessions === 1 ? 'session' : 'sessions'} to be ranked
            </span>
          )}
        </div>
        <EquityCurve values={curve} baseline={account.starting} height={160} label="Account equity after each session" />
      </Panel>

      <Panel pad="none">
        <div className="border-line-faint border-b px-4 py-3 text-sm font-medium">Sessions</div>
        {sessions.length === 0 ? (
          <EmptyState
            icon="candle"
            title="No sessions yet."
            body="Open a market, place a trade, and it shows up here with its result and a full review."
            action={<Button href={routes.markets()}>Browse markets</Button>}
            className="m-4"
          />
        ) : (
          <DataTable columns={columns} rows={sessions} rowKey={(s) => s.id} />
        )}
      </Panel>
    </div>
  );
}
