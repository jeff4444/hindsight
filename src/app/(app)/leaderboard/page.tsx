import { routes } from '@/lib/routes';
import { dailyNumber } from '@/lib/daily';
import { formatPct, formatUsd } from '@/lib/trading/format';
import {
  MIN_BOARD_SESSIONS,
  getDailyBoard,
  getLeaderboard,
  type BoardEntry,
  type DailyEntry,
} from '@/lib/trading/server/queries';
import { EmptyState, LinkTabs, PageHeader, Panel } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Trader } from '@/components/leaderboard/Trader';

export const dynamic = 'force-dynamic';

type Board = 'all' | 'daily' | 'strategies';

const pnl = (value: number) => (value > 0 ? 'text-long-ink' : value < 0 ? 'text-short-ink' : 'text-ink-hi');

/**
 * The leaderboard, in money.
 *
 * Everyone ranked by what their main account has done: return, and beside it the numbers that say
 * whether the return was luck — sessions, trades, win rate, drawdown, profit factor. The schools are
 * on the same board, labelled as schools. A player appears after ten ranked sessions.
 */
export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ board?: string }> }) {
  const requested = (await searchParams).board;
  const board: Board = requested === 'daily' || requested === 'strategies' ? requested : 'all';
  const day = todayNumber();

  const overall = board === 'daily' ? null : await getLeaderboard('return', 100);
  const daily = board === 'daily' ? await getDailyBoard(day, 100) : null;
  const rows = board === 'strategies' ? (overall ?? []).filter((r) => r.kind === 'bot') : (overall ?? []);

  const columns: Column<BoardEntry>[] = [
    { key: 'rank', header: '#', cell: (_r, i) => <span className="numeral text-ink-dim">{i + 1}</span> },
    { key: 'who', header: 'Trader', cell: (r, i) => <Trader {...r} highlight={i === 0} /> },
    { key: 'equity', header: 'Equity', numeric: true, hideBelow: 'md', cell: (r) => formatUsd(r.equity, { compact: true }) },
    { key: 'return', header: 'Return', numeric: true, cell: (r) => <span className={pnl(r.returnPct)}>{formatPct(r.returnPct, { sign: true })}</span> },
    { key: 'sessions', header: 'Sessions', numeric: true, hideBelow: 'sm', cell: (r) => r.sessions },
    { key: 'trades', header: 'Trades', numeric: true, hideBelow: 'lg', cell: (r) => r.roundTrips },
    { key: 'win', header: 'Win rate', numeric: true, hideBelow: 'md', cell: (r) => (r.winRate === null ? '—' : formatPct(r.winRate, { decimals: 0 })) },
    { key: 'dd', header: 'Max DD', numeric: true, hideBelow: 'lg', cell: (r) => formatPct(r.maxDrawdown) },
    { key: 'pf', header: 'PF', numeric: true, hideBelow: 'lg', cell: (r) => (r.profitFactor === null ? '—' : r.profitFactor.toFixed(2)) },
  ];

  const dailyColumns: Column<DailyEntry>[] = [
    { key: 'rank', header: '#', cell: (_r, i) => <span className="numeral text-ink-dim">{i + 1}</span> },
    { key: 'who', header: 'Trader', cell: (r, i) => <Trader {...r} highlight={i === 0} /> },
    { key: 'pnl', header: 'P&L', numeric: true, hideBelow: 'sm', cell: (r) => <span className={pnl(r.pnl)}>{formatUsd(r.pnl, { sign: true })}</span> },
    { key: 'return', header: 'Return', numeric: true, cell: (r) => <span className={pnl(r.returnPct)}>{formatPct(r.returnPct, { sign: true })}</span> },
    { key: 'trades', header: 'Trades', numeric: true, hideBelow: 'sm', cell: (r) => r.roundTrips },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Leaderboard"
        title="Ranked by what the money did."
        lede={`Main accounts only, after ${MIN_BOARD_SESSIONS} sessions. Practice never counts, and the schools trade the same markets beside you.`}
      />
      <LinkTabs
        label="Board"
        active={board}
        tabs={[
          { value: 'all', label: 'Everyone', href: routes.leaderboard('all') },
          { value: 'daily', label: 'Today’s market', href: routes.leaderboard('daily') },
          { value: 'strategies', label: 'Schools', href: routes.leaderboard('strategies') },
        ]}
      />
      <Panel pad="none">
        {board === 'daily' ? (
          daily === null ? (
            <EmptyState icon="trophy" title="Today’s board is not available yet." className="m-4" />
          ) : (
            <DataTable columns={dailyColumns} rows={daily} rowKey={(r, i) => `${r.kind}-${r.handle ?? r.botCode}-${i}`} empty="Nobody has finished today’s market yet." />
          )
        ) : overall === null ? (
          <EmptyState icon="trophy" title="The leaderboard is not available yet." body="It fills in once the trading tables are in place and the first accounts have traded." className="m-4" />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.accountId}
            empty={board === 'strategies' ? 'The schools have not traded the library yet.' : `Nobody has ${MIN_BOARD_SESSIONS} sessions yet. Be the first.`}
          />
        )}
      </Panel>
    </div>
  );
}

/** Today's market number. A helper rather than inline, so the clock read stays out of render. */
function todayNumber(): number {
  return dailyNumber(Date.now());
}
