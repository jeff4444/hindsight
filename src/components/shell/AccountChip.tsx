import Link from 'next/link';
import { currentViewer } from '@/lib/viewer';
import { routes } from '@/lib/routes';
import { getAccount, getOpenSession } from '@/lib/trading/server/queries';
import { formatPct, formatUsd } from '@/lib/trading/format';
import { STARTING_BALANCE_USDT } from '@/core/trading/costs';
import { Skeleton, cx } from '../ui';
import { Icon } from '../ui/icons';

/**
 * The account, from anywhere in the app: what it is worth, and the one thing to do next.
 *
 * Set in the masthead like a paper's price box: the equity and its change as a small ledger
 * readout, then the pen's button — back to the session you have open, or into a market. Streamed
 * rather than awaited in the layout, so the masthead paints before the account query lands.
 */
export async function AccountChip() {
  const viewer = await currentViewer();
  const owner = viewer.userId ?? viewer.sessionId;
  const [account, open] = await Promise.all([getAccount(owner, 'main'), getOpenSession(owner)]);
  const equity = account?.equity ?? STARTING_BALANCE_USDT;
  const change = account?.returnPct ?? 0;

  return (
    <div className="flex items-center gap-4">
      <div className="hidden flex-col items-end leading-tight xl:flex">
        <span className="eyebrow text-ink-dim">Equity</span>
        <span className="flex items-baseline gap-2">
          <span className="numeral text-ink-max text-sm font-semibold">{formatUsd(equity)}</span>
          <span
            className={cx(
              'numeral text-mini font-medium',
              change > 0 ? 'text-gain-ink' : change < 0 ? 'text-loss-ink' : 'text-ink-dim',
            )}
          >
            {formatPct(change, { sign: true })}
          </span>
        </span>
      </div>
      <Link
        href={open ? routes.trade.session(open.id) : routes.trade.open({ kind: 'random' })}
        className="btn-key bg-accent text-on-accent border-rule hover:bg-accent-hover flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-semibold whitespace-nowrap"
      >
        <Icon name={open ? 'play' : 'candle'} size={15} />
        <span className="hidden xl:inline">{open ? `Resume ${open.symbol.replace(/USDT$/, '/USDT')}` : 'Start trading'}</span>
        <span className="xl:hidden">{open ? 'Resume' : 'Start trading'}</span>
      </Link>
    </div>
  );
}

export function AccountChipSkeleton() {
  return <Skeleton className="h-10 w-32 rounded-md xl:w-64" />;
}
