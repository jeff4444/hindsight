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
 * Gold while it leads somewhere — back to the session you have open, or into a market. Streamed
 * rather than awaited in the layout, so the rail paints before the account query lands.
 */
export async function AccountChip() {
  const viewer = await currentViewer();
  const owner = viewer.userId ?? viewer.sessionId;
  const [account, open] = await Promise.all([getAccount(owner, 'main'), getOpenSession(owner)]);
  const equity = account?.equity ?? STARTING_BALANCE_USDT;
  const change = account?.returnPct ?? 0;

  return (
    <Link
      href={open ? routes.trade.session(open.id) : routes.trade.open({ kind: 'random' })}
      className="press bg-gold text-on-gold shadow-key hover:bg-gold-hover flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 transition-colors lg:items-stretch lg:px-3.5 lg:py-3"
    >
      <span className="flex items-center justify-center gap-2 lg:justify-between">
        <span className="flex items-center gap-2">
          <Icon name={open ? 'play' : 'candle'} size={15} />
          <span className="hidden text-sm font-semibold lg:inline">{open ? `Resume ${open.symbol.replace(/USDT$/, '/USDT')}` : 'Start trading'}</span>
        </span>
        <Icon name="chevron-right" size={14} className="hidden opacity-70 lg:block" />
      </span>
      <span className="text-micro font-semibold lg:hidden">{open ? 'Resume' : 'Trade'}</span>
      <span className="hidden items-baseline justify-between gap-2 lg:flex">
        <span className="numeral text-xs font-semibold">{formatUsd(equity)}</span>
        <span className={cx('numeral text-mini font-medium opacity-80')}>{formatPct(change, { sign: true })}</span>
      </span>
    </Link>
  );
}

export function AccountChipSkeleton() {
  return <Skeleton className="h-[3.75rem] w-full rounded-xl lg:h-[4.25rem]" />;
}
