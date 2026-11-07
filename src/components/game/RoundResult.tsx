'use client';

import type { ReactNode } from 'react';
import type { RoundPlayed, TradeLine } from '@/lib/game/types';
import { formatPrice, formatReplayTime, formatUsd } from '@/lib/trading/format';
import { cx } from '../ui';
import { Icon } from '../ui/icons';

/**
 * The end of a round: the grade, and what it was measured against (docs/rules.md §23.3).
 *
 * The best and the worst the tape allowed are printed beside the player's own result, because a
 * grade means nothing without them; sitting out's grade is printed too, because that is the bar a
 * trade had to clear to have been worth taking. In a duel the opponent's round follows, and a
 * school's working with it (§23.7).
 */

function exitText(trade: TradeLine): string {
  if (!trade.entry) return 'never filled';
  if (!trade.exit) return 'held to the end';
  switch (trade.exit.reason) {
    case 'take-profit':
      return 'out at the take-profit';
    case 'stop-loss':
      return 'stopped out';
    case 'liquidation':
      return 'lost the stake';
    default:
      return 'closed at the end';
  }
}

function TradeRow({ label, trade, played, tone }: { label: string; trade: TradeLine | null; played: RoundPlayed; tone?: 'gold' | 'dim' }) {
  const fmt = (price: number) => formatPrice(price, played.instrument);
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className={cx('text-sm font-medium', tone === 'gold' ? 'text-gold-ink' : tone === 'dim' ? 'text-ink-lo' : 'text-ink-hi')}>{label}</div>
        <div className="text-ink-dim text-mini truncate">
          {trade
            ? trade.entry
              ? `${trade.direction === 'long' ? 'Long' : 'Short'} ${fmt(trade.entry.price)} (${formatReplayTime(played.time, trade.entry.at)})${trade.exit ? ` → ${fmt(trade.exit.price)} (${formatReplayTime(played.time, trade.exit.at)})` : ''}, ${exitText(trade)}`
              : `${trade.direction === 'long' ? 'Long' : 'Short'} ${trade.entryType}, never filled`
            : 'Sat out'}
        </div>
      </div>
      <div className={cx('numeral shrink-0 text-sm font-semibold', (trade?.result ?? played.stake) >= played.stake ? 'text-long-ink' : 'text-short-ink')}>
        {formatUsd(trade?.result ?? played.stake)}
      </div>
    </div>
  );
}

export function RoundResult({ played, onClose, actions }: { played: RoundPlayed; onClose: () => void; actions?: ReactNode }) {
  const pnl = played.result - played.stake;
  const date = new Date(played.reveal.startMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const opponent = played.opponent;

  return (
    <div className="bg-surface-2 border-line shadow-e3 relative w-full max-w-lg rounded-2xl border p-5">
      <button type="button" onClick={onClose} aria-label="Hide the result to look at the chart" className="text-ink-dim hover:text-ink-hi absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md">
        <Icon name="x" size={16} />
      </button>

      <div className="eyebrow text-gold-ink">Graded</div>
      <div className="mt-1 flex items-end gap-3">
        <div className="numeral text-ink-max text-6xl font-semibold leading-none">{played.grade}</div>
        <div className="text-ink-dim pb-1 text-sm">/ 1000</div>
        <div className="ml-auto pb-1 text-right">
          <div className={cx('numeral text-xl font-semibold', pnl >= 0 ? 'text-long-ink' : 'text-short-ink')}>{formatUsd(played.result)}</div>
          <div className={cx('numeral text-xs', pnl >= 0 ? 'text-long-ink' : 'text-short-ink')}>{formatUsd(pnl, { sign: true })} on {formatUsd(played.stake, { decimals: 0 })}</div>
        </div>
      </div>

      <div className="bg-fill-2 relative mt-4 h-2 overflow-hidden rounded-full">
        <div className="bg-ink-dim absolute top-0 h-full w-0.5" style={{ left: `${played.sitOutGrade / 10}%` }} title={`Sitting out: ${played.sitOutGrade}`} />
        <div className="bg-gold h-full rounded-full" style={{ width: `${played.grade / 10}%` }} />
      </div>
      <div className="text-ink-dim text-mini mt-1 flex justify-between">
        <span>Worst the tape allowed</span>
        <span>Sitting out: {played.sitOutGrade}</span>
        <span>Best</span>
      </div>

      <div className="divide-line-faint mt-4 divide-y">
        <TradeRow label="You" trade={played.mine} played={played} />
        <TradeRow label="Best in hindsight" trade={played.best} played={played} tone="gold" />
        <TradeRow label="Worst in hindsight" trade={played.worst} played={played} tone="dim" />
      </div>

      {opponent && (
        <div className="border-line-faint mt-4 border-t pt-3">
          <div className="eyebrow text-ink-dim mb-1">{opponent.label.name}</div>
          {opponent.played ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="text-ink-hi text-sm">
                  Graded <span className="numeral font-semibold">{opponent.grade}</span>
                </span>
                <span className={cx('numeral text-sm font-semibold', (opponent.result ?? played.stake) >= played.stake ? 'text-long-ink' : 'text-short-ink')}>
                  {formatUsd(opponent.result ?? played.stake)}
                </span>
              </div>
              <TradeRow label="Their trade" trade={opponent.trade} played={played} />
              {opponent.read && (
                <div className="bg-surface-1 border-line-faint mt-2 rounded-lg border p-3">
                  <div className="text-ink-hi text-sm font-medium">{opponent.read.thesis}</div>
                  <p className="text-ink-lo mt-1 whitespace-pre-line text-xs leading-relaxed">{opponent.read.reasoning}</p>
                  {opponent.read.sitOutReason && <p className="text-ink-lo mt-1 text-xs">Sat out: {opponent.read.sitOutReason}</p>}
                  {opponent.read.levels.length > 0 && (
                    <ul className="text-mini mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {opponent.read.levels.map((level) => (
                        <li key={level.name} className="flex justify-between gap-2">
                          <span className="text-ink-dim truncate">{level.name}</span>
                          <span className="numeral text-ink-hi">{formatPrice(level.price, played.instrument)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-ink-lo text-sm">Has not played this tape yet. Their trade shows here once they have.</p>
          )}
        </div>
      )}

      <p className="text-ink-dim text-mini mt-4">
        {played.synthetic ? 'A synthetic market, generated for the demo.' : `This was ${played.instrument.display} from ${date}.`}
      </p>
      {actions && <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div>}
    </div>
  );
}
