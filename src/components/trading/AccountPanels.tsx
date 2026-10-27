'use client';

import { useState } from 'react';
import type {
  AccountView,
  FillView,
  InstrumentView,
  OrderView,
  PositionView,
  SessionTime,
  TripView,
} from '@/lib/trading/types';
import { formatPct, formatPrice, formatQty, formatReplayTime, formatUsd } from '@/lib/trading/format';
import { Button, Chip, cx, type Tone } from '../ui';
import { Tabs } from '../ui/client';
import { DataTable, type Column } from '../ui/data-table';

/**
 * The account, under the chart: a strip of the numbers that move, and the tabs a platform keeps
 * there — positions, open orders, the order history and every fill.
 */

const tone = (value: number): Tone => (value > 0 ? 'long' : value < 0 ? 'short' : 'neutral');
const ink = (value: number) => (value > 0 ? 'text-long-ink' : value < 0 ? 'text-short-ink' : 'text-ink-hi');

function Figure({ label, value, className, valueClassName }: { label: string; value: string; className?: string; valueClassName?: string }) {
  return (
    <div className={cx('min-w-0 shrink-0', className)}>
      <div className="eyebrow text-ink-dim truncate">{label}</div>
      <div className={cx('numeral mt-0.5 truncate text-sm font-semibold', valueClassName ?? 'text-ink-hi')}>{value}</div>
    </div>
  );
}

export function AccountStrip({ account, className }: { account: AccountView; className?: string }) {
  return (
    <div className={cx('no-scrollbar flex items-center gap-6 overflow-x-auto px-4 py-2.5', className)}>
      <Figure label="Equity" value={formatUsd(account.equity)} />
      <Figure
        label="Session P&L"
        value={`${formatUsd(account.sessionPnl, { sign: true })} (${formatPct(account.sessionReturn, { sign: true })})`}
        valueClassName={ink(account.sessionPnl)}
      />
      <Figure label="Unrealized" value={formatUsd(account.unrealizedPnl, { sign: true })} valueClassName={ink(account.unrealizedPnl)} />
      <Figure label="Realized" value={formatUsd(account.realizedPnl, { sign: true })} valueClassName={ink(account.realizedPnl)} />
      <Figure label="Cash" value={formatUsd(account.cash)} />
      <Figure label="Buying power" value={formatUsd(account.buyingPower)} />
      <Figure label="Fees" value={formatUsd(account.fees)} />
      <div className="min-w-[7rem] shrink-0">
        <div className="eyebrow text-ink-dim">Margin used</div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="bg-fill-2 h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className={cx('h-full rounded-full', account.marginUsed > 0.85 ? 'bg-short' : account.marginUsed > 0.6 ? 'bg-attention' : 'bg-info')}
              style={{ width: `${Math.round(account.marginUsed * 100)}%` }}
            />
          </div>
          <span className="numeral text-ink-lo text-mini">{Math.round(account.marginUsed * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  entry: 'Entry',
  'take-profit': 'Take-profit',
  'stop-loss': 'Stop-loss',
  close: 'Close',
  liquidation: 'Liquidation',
  flatten: 'Session close',
};

const TYPE_LABEL = { market: 'Market', limit: 'Limit', stop: 'Stop' } as const;

const REASON_LABEL: Record<string, string> = {
  user: 'Cancelled',
  oco: 'Cancelled · other leg filled',
  'position-closed': 'Cancelled · position closed',
  'parent-canceled': 'Cancelled with entry',
  margin: 'Cancelled · margin',
  liquidation: 'Cancelled · liquidation',
  'session-end': 'Cancelled · session end',
};

export type TabKey = 'positions' | 'orders' | 'history' | 'fills' | 'trades';

export function AccountTabs({
  instrument,
  time,
  position,
  orders,
  history,
  fills,
  trips,
  onClose,
  onReverse,
  onCancel,
  onCancelAll,
  closed,
  className,
}: {
  instrument: InstrumentView;
  time: SessionTime;
  position: PositionView | null;
  orders: OrderView[];
  history: OrderView[];
  fills: FillView[];
  trips: TripView[];
  onClose: (fraction: 0.25 | 0.5 | 1) => void;
  onReverse: () => void;
  onCancel: (orderId: string) => void;
  onCancelAll: () => void;
  closed: boolean;
  className?: string;
}) {
  const [tab, setTab] = useState<TabKey>('positions');
  const price = (value: number | null) => (value === null ? '—' : formatPrice(value, instrument));
  const qty = (value: number | null) => (value === null ? '—' : formatQty(value, instrument));
  const when = (at: number | null) => (at === null ? '—' : formatReplayTime(time, at));

  const positionColumns: Column<PositionView>[] = [
    {
      key: 'side',
      header: 'Position',
      cell: (p) => (
        <span className="flex items-center gap-2">
          <Chip tone={p.side === 'long' ? 'long' : 'short'}>{p.side === 'long' ? 'Long' : 'Short'}</Chip>
          <span className="text-ink-hi font-medium">{instrument.display}</span>
        </span>
      ),
    },
    { key: 'qty', header: 'Size', numeric: true, cell: (p) => `${qty(p.qty)} ${instrument.base}` },
    { key: 'avg', header: 'Avg price', numeric: true, cell: (p) => price(p.avgPrice) },
    { key: 'mark', header: 'Mark', numeric: true, cell: (p) => price(p.markPrice) },
    { key: 'value', header: 'Value', numeric: true, hideBelow: 'md', cell: (p) => formatUsd(p.notional) },
    {
      key: 'pnl',
      header: 'Unrealized P&L',
      numeric: true,
      cell: (p) => (
        <span className={ink(p.unrealizedPnl)}>
          {formatUsd(p.unrealizedPnl, { sign: true })} <span className="text-mini">({formatPct(p.unrealizedPct, { sign: true })})</span>
        </span>
      ),
    },
    { key: 'liq', header: 'Liq. price', numeric: true, hideBelow: 'lg', cell: (p) => price(p.liquidationPrice) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: () => (
        <span className="flex justify-end gap-1.5">
          {([0.25, 0.5] as const).map((fraction) => (
            <Button key={fraction} size="xs" variant="ghost" disabled={closed} onClick={() => onClose(fraction)}>
              {fraction * 100}%
            </Button>
          ))}
          <Button size="xs" variant="secondary" disabled={closed} onClick={() => onClose(1)}>
            Close
          </Button>
          <Button size="xs" variant="ghost" disabled={closed} onClick={onReverse}>
            Reverse
          </Button>
        </span>
      ),
    },
  ];

  const orderColumns: Column<OrderView>[] = [
    {
      key: 'side',
      header: 'Order',
      cell: (o) => (
        <span className="flex items-center gap-2">
          <span className={o.side === 'buy' ? 'text-long-ink font-semibold' : 'text-short-ink font-semibold'}>{o.side === 'buy' ? 'Buy' : 'Sell'}</span>
          <span className="text-ink-lo">{TYPE_LABEL[o.type]}</span>
          {o.role !== 'entry' && <Chip size="sm">{ROLE_LABEL[o.role] ?? o.role}</Chip>}
          {o.status === 'pending' && <Chip size="sm" tone="info">Waits for entry</Chip>}
        </span>
      ),
    },
    { key: 'qty', header: 'Size', numeric: true, cell: (o) => qty(o.qty) },
    { key: 'price', header: 'Price', numeric: true, cell: (o) => price(o.type === 'stop' ? o.stopPrice : o.price) },
    { key: 'placed', header: 'Placed', numeric: true, hideBelow: 'md', cell: (o) => when(o.placedAt) },
    {
      key: 'cancel',
      header: orders.length > 1 ? (
        <button type="button" className="text-ink-lo hover:text-short-ink normal-case" onClick={onCancelAll} disabled={closed}>
          Cancel all
        </button>
      ) : (
        ''
      ),
      align: 'right',
      cell: (o) => (
        <Button size="xs" variant="ghost" disabled={closed} onClick={() => onCancel(o.id)}>
          Cancel
        </Button>
      ),
    },
  ];

  const historyColumns: Column<OrderView>[] = [
    {
      key: 'side',
      header: 'Order',
      cell: (o) => (
        <span className="flex items-center gap-2">
          <span className={o.side === 'buy' ? 'text-long-ink font-semibold' : 'text-short-ink font-semibold'}>{o.side === 'buy' ? 'Buy' : 'Sell'}</span>
          <span className="text-ink-lo">{TYPE_LABEL[o.type]}</span>
          {o.role !== 'entry' && <span className="text-ink-dim text-mini">{ROLE_LABEL[o.role] ?? o.role}</span>}
        </span>
      ),
    },
    { key: 'qty', header: 'Size', numeric: true, cell: (o) => qty(o.filledQty ?? o.qty) },
    { key: 'price', header: 'Price', numeric: true, cell: (o) => price(o.fillPrice ?? (o.type === 'stop' ? o.stopPrice : o.price)) },
    {
      key: 'status',
      header: 'Status',
      cell: (o) =>
        o.status === 'filled' ? (
          <span className="text-long-ink">Filled</span>
        ) : o.status === 'rejected' ? (
          <span className="text-short-ink">Rejected</span>
        ) : (
          <span className="text-ink-lo">{REASON_LABEL[o.reason ?? 'user'] ?? 'Cancelled'}</span>
        ),
    },
    { key: 'time', header: 'Time', numeric: true, hideBelow: 'md', cell: (o) => when(o.closedAt) },
  ];

  const fillColumns: Column<FillView>[] = [
    { key: 'time', header: 'Time', numeric: false, cell: (f) => <span className="numeral text-ink-lo">{when(f.at)}</span> },
    {
      key: 'side',
      header: 'Side',
      cell: (f) => (
        <span className="flex items-center gap-2">
          <span className={f.side === 'buy' ? 'text-long-ink font-semibold' : 'text-short-ink font-semibold'}>{f.side === 'buy' ? 'Buy' : 'Sell'}</span>
          <span className="text-ink-dim text-mini">{ROLE_LABEL[f.role] ?? f.role}</span>
          {f.ambiguous && (
            <span title="This minute could have gone two ways; the worse one was taken." className="text-attention-ink text-mini">
              worst case
            </span>
          )}
        </span>
      ),
    },
    { key: 'qty', header: 'Size', numeric: true, cell: (f) => qty(f.qty) },
    { key: 'price', header: 'Price', numeric: true, cell: (f) => price(f.price) },
    { key: 'value', header: 'Value', numeric: true, hideBelow: 'md', cell: (f) => formatUsd(f.notional) },
    { key: 'fee', header: 'Fee', numeric: true, cell: (f) => <span className="text-ink-lo">{formatUsd(f.fee)}</span> },
    { key: 'pnl', header: 'Realized', numeric: true, cell: (f) => (f.realized === 0 ? <span className="text-ink-dim">—</span> : <span className={ink(f.realized)}>{formatUsd(f.realized, { sign: true })}</span>) },
  ];

  const tripColumns: Column<TripView>[] = [
    { key: 'side', header: 'Trade', cell: (t) => <Chip tone={t.side === 'long' ? 'long' : 'short'}>{t.side === 'long' ? 'Long' : 'Short'}</Chip> },
    { key: 'opened', header: 'Opened', numeric: true, hideBelow: 'md', cell: (t) => when(t.openedAt) },
    { key: 'entry', header: 'Entry', numeric: true, cell: (t) => price(t.entryAvg) },
    { key: 'exit', header: 'Exit', numeric: true, cell: (t) => price(t.exitAvg) },
    { key: 'size', header: 'Max size', numeric: true, hideBelow: 'md', cell: (t) => qty(t.maxQty) },
    { key: 'net', header: 'Net P&L', numeric: true, cell: (t) => <span className={ink(t.net)}>{formatUsd(t.net, { sign: true })}</span> },
  ];

  const working = orders.filter((o) => o.status === 'working' || o.status === 'pending');

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <Tabs
        label="Account"
        value={tab}
        onChange={setTab}
        className="px-2"
        tabs={[
          { value: 'positions', label: 'Positions', count: position ? 1 : 0 },
          { value: 'orders', label: 'Open orders', count: working.length },
          { value: 'history', label: 'Order history' },
          { value: 'fills', label: 'Fills', count: fills.length },
          { value: 'trades', label: 'Trades', count: trips.length },
        ]}
      />
      <div className="min-h-0 flex-1">
        {tab === 'positions' && (
          <DataTable
            caption="Open positions"
            columns={positionColumns}
            rows={position ? [position] : []}
            rowKey={() => 'position'}
            empty="No open position. Place an order to open one."
          />
        )}
        {tab === 'orders' && (
          <DataTable caption="Open orders" columns={orderColumns} rows={working} rowKey={(o) => o.id} empty="No working orders." maxHeight="14rem" />
        )}
        {tab === 'history' && (
          <DataTable caption="Order history" columns={historyColumns} rows={history} rowKey={(o) => `${o.id}-${o.status}`} empty="No orders yet." maxHeight="14rem" />
        )}
        {tab === 'fills' && (
          <DataTable caption="Fills" columns={fillColumns} rows={[...fills].reverse()} rowKey={(f) => String(f.n)} empty="No fills yet." maxHeight="14rem" />
        )}
        {tab === 'trades' && (
          <DataTable caption="Closed trades" columns={tripColumns} rows={[...trips].reverse()} rowKey={(t, i) => `${t.openedAt}-${i}`} empty="No closed trades yet." maxHeight="14rem" />
        )}
      </div>
    </div>
  );
}

export { tone as pnlChipTone };
