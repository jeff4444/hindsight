'use client';

import { useMemo, useState } from 'react';
import { routes } from '@/lib/routes';
import { Button, Chip } from '../ui';
import { DataTable, type Column } from '../ui/data-table';
import { Icon } from '../ui/icons';

export interface MarketRow {
  symbol: string;
  windows: number;
  delisted: boolean;
}

/** Every pair in the library, searchable, each one a button into a replay of it. */
export function MarketTable({ markets, account }: { markets: MarketRow[]; account: 'main' | 'practice' }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return q ? markets.filter((m) => m.symbol.includes(q)) : markets;
  }, [markets, query]);

  const columns: Column<MarketRow>[] = [
    {
      key: 'pair',
      header: 'Pair',
      cell: (m) => (
        <span className="flex items-center gap-2">
          <span className="text-ink-max font-semibold">{m.symbol.replace(/USDT$/, '')}</span>
          <span className="text-ink-dim">/USDT</span>
          {m.delisted && (
            <Chip size="sm" tone="attention" title="Since delisted from Binance. Kept so the library is not only survivors.">
              Delisted
            </Chip>
          )}
        </span>
      ),
    },
    { key: 'windows', header: 'Replays', numeric: true, cell: (m) => m.windows, hideBelow: 'sm' },
    {
      key: 'go',
      header: '',
      align: 'right',
      cell: (m) => (
        <Button size="xs" variant="secondary" href={routes.trade.open({ kind: 'pair', symbol: m.symbol }, account)}>
          Trade
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <label className="bg-surface-1 border-line focus-within:border-focus flex h-10 items-center gap-2 rounded-lg border px-3">
        <Icon name="eye" size={15} className="text-ink-dim" />
        <span className="sr-only">Search pairs</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pairs — BTC, ETH, SOL…"
          className="text-ink-hi placeholder:text-ink-faint min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <DataTable columns={columns} rows={rows} rowKey={(m) => m.symbol} maxHeight="26rem" empty="No pair matches that." />
    </div>
  );
}
