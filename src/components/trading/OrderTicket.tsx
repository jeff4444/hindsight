'use client';

import { useMemo } from 'react';
import type { SessionOp } from '@/lib/trading/schemas';
import type { AccountView, InstrumentView, PositionView } from '@/lib/trading/types';
import { formatPct, formatPrice, formatQty, formatUsd, priceInput, qtyInput } from '@/lib/trading/format';
import { FEE_SCHEDULE, MARGIN } from '@/core/trading/costs';
import { Button, Chip, Segmented, Toggle, cx } from '../ui';
import { NumberInput } from '../ui/number-input';

/**
 * The order ticket.
 *
 * Everything an exchange's ticket asks for and nothing a game's did: a side, an order type, a
 * price where the type needs one, a quantity in coins or in dollars, and an optional take-profit
 * and stop-loss that ride along as a one-cancels-other pair. Underneath it says what the order
 * costs, what the exchange will charge, and how much buying power is left — before you press the
 * button rather than after.
 *
 * The draft is owned by the terminal, not by this component, because the chart draws it: a limit
 * price or a stop-loss is a line you can drag as well as a number you can type.
 */

export interface TicketDraft {
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  price: string;
  qty: string;
  unit: 'base' | 'quote';
  tpOn: boolean;
  tp: string;
  slOn: boolean;
  sl: string;
  reduceOnly: boolean;
}

export function emptyDraft(): TicketDraft {
  return { side: 'buy', type: 'market', price: '', qty: '', unit: 'quote', tpOn: false, tp: '', slOn: false, sl: '', reduceOnly: false };
}

const num = (text: string) => {
  const value = Number.parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
};

export interface TicketQuote {
  /** Where the order expects to trade. */
  reference: number | null;
  qty: number | null;
  notional: number | null;
  fee: number | null;
  /** P&L at the take-profit and the stop-loss, if set. */
  atTarget: number | null;
  atStop: number | null;
  /** What the ticket's "100%" means, in base units. */
  maxQty: number;
  problem: string | null;
}

/** What the draft would do, worked out the way the exchange will work it out. */
export function quoteDraft(
  draft: TicketDraft,
  last: number,
  instrument: InstrumentView,
  account: AccountView,
  position: PositionView | null,
): TicketQuote {
  const spread = Math.max(instrument.tickSize, (last * FEE_SCHEDULE.halfSpreadBps) / 10_000);
  const marketPrice = draft.side === 'buy' ? last + spread : last - spread;
  const reference = draft.type === 'market' ? marketPrice : num(draft.price);
  const opposite = position !== null && (position.side === 'long') !== (draft.side === 'buy');
  const maxQty =
    reference && reference > 0
      ? Math.max(0, account.buyingPower / reference + (opposite && position ? position.qty : 0))
      : 0;

  const entered = num(draft.qty);
  const qty =
    entered === null || reference === null || !(reference > 0)
      ? null
      : draft.unit === 'base'
        ? entered
        : entered / reference;
  const notional = qty !== null && reference !== null ? qty * reference : null;
  const isMaker = draft.type === 'limit' && reference !== null && (draft.side === 'buy' ? reference < last : reference > last);
  const fee = notional !== null ? (notional * (isMaker ? FEE_SCHEDULE.makerBps : FEE_SCHEDULE.takerBps)) / 10_000 : null;

  const sign = draft.side === 'buy' ? 1 : -1;
  const tp = draft.tpOn ? num(draft.tp) : null;
  const sl = draft.slOn ? num(draft.sl) : null;
  const atTarget = tp !== null && qty !== null && reference !== null ? sign * (tp - reference) * qty : null;
  const atStop = sl !== null && qty !== null && reference !== null ? sign * (sl - reference) * qty : null;

  let problem: string | null = null;
  if (draft.type !== 'market' && reference === null) problem = 'Enter a price.';
  else if (draft.type === 'stop' && reference !== null && (draft.side === 'buy' ? reference <= last : reference >= last)) {
    problem = draft.side === 'buy' ? 'A buy stop goes above the market.' : 'A sell stop goes below the market.';
  } else if (qty === null || !(qty > 0)) problem = 'Enter a quantity.';
  else if (!draft.reduceOnly && notional !== null && notional < instrument.minNotional) problem = `Orders start at ${formatUsd(instrument.minNotional)}.`;
  else if (!draft.reduceOnly && qty > maxQty * 1.0001) problem = 'More than your buying power allows.';
  else if (tp !== null && reference !== null && sign * (tp - reference) <= 0) problem = 'Take-profit is on the wrong side.';
  else if (sl !== null && reference !== null && sign * (sl - reference) >= 0) problem = 'Stop-loss is on the wrong side.';

  return { reference, qty, notional, fee, atTarget, atStop, maxQty, problem };
}

/** The draft as the request the session accepts. */
export function draftToOp(draft: TicketDraft, quote: TicketQuote, id: string): SessionOp | null {
  if (quote.problem || quote.qty === null) return null;
  return {
    op: 'place',
    clientOrderId: id,
    side: draft.side,
    type: draft.type,
    qty: quote.qty,
    price: draft.type === 'limit' ? (num(draft.price) ?? undefined) : undefined,
    stopPrice: draft.type === 'stop' ? (num(draft.price) ?? undefined) : undefined,
    reduceOnly: draft.reduceOnly || undefined,
    takeProfit: draft.tpOn && !draft.reduceOnly ? (num(draft.tp) ?? undefined) : undefined,
    stopLoss: draft.slOn && !draft.reduceOnly ? (num(draft.sl) ?? undefined) : undefined,
  };
}

const RISK_SHARES = [0.005, 0.01, 0.02] as const;

export function OrderTicket({
  draft,
  onDraft,
  onSubmit,
  last,
  instrument,
  account,
  position,
  disabled,
  busy,
  className,
}: {
  draft: TicketDraft;
  onDraft: (next: Partial<TicketDraft>) => void;
  onSubmit: () => void;
  last: number;
  instrument: InstrumentView;
  account: AccountView;
  position: PositionView | null;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const quote = useMemo(() => quoteDraft(draft, last, instrument, account, position), [draft, last, instrument, account, position]);
  const buy = draft.side === 'buy';
  const opensShort = !buy && (position === null || position.side === 'short') && !draft.reduceOnly;

  const setQtyUnits = (units: number) => {
    if (!(units > 0)) return;
    const reference = quote.reference ?? last;
    onDraft(draft.unit === 'base' ? { qty: qtyInput(units, instrument) } : { qty: (units * reference).toFixed(2) });
  };

  /** Size the order so the stop-loss costs this share of equity. */
  const sizeByRisk = (share: number) => {
    const reference = quote.reference;
    const sl = num(draft.sl);
    if (reference === null || sl === null || !draft.slOn) return;
    const risk = Math.abs(reference - sl);
    if (!(risk > 0)) return;
    setQtyUnits(Math.min(quote.maxQty, (account.equity * share) / risk));
  };

  const priceLabel = draft.type === 'stop' ? 'Trigger price' : 'Limit price';
  /** How far a price sits from the last trade, which is the distance a trader reads. */
  const offset = (text: string) => {
    const value = num(text);
    return value !== null && last > 0 ? formatPct(value / last - 1, { sign: true }) : null;
  };

  return (
    <form
      className={cx('flex flex-col gap-3', className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (!quote.problem && !disabled) onSubmit();
      }}
    >
      <div className="bg-fill-2 grid grid-cols-2 gap-1 rounded-lg p-1" role="radiogroup" aria-label="Side">
        {(['buy', 'sell'] as const).map((side) => {
          const active = draft.side === side;
          return (
            <button
              key={side}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onDraft({ side })}
              className={cx(
                'press h-9 rounded-md text-sm font-semibold transition-colors',
                active
                  ? side === 'buy'
                    ? 'bg-long text-surface-0'
                    : 'bg-short text-surface-0'
                  : 'text-ink-lo hover:text-ink-hi',
              )}
            >
              {side === 'buy' ? 'Buy' : 'Sell'}
            </button>
          );
        })}
      </div>

      <Segmented
        label="Order type"
        block
        value={draft.type}
        onChange={(type) => onDraft({ type, price: type === 'market' ? '' : draft.price || priceInput(last, instrument) })}
        options={[
          { value: 'market', label: 'Market' },
          { value: 'limit', label: 'Limit' },
          { value: 'stop', label: 'Stop' },
        ]}
      />

      {draft.type === 'market' ? (
        <div className="bg-surface-1 border-line-faint flex h-10 items-center justify-between rounded-lg border px-3 text-sm">
          <span className="text-ink-dim">Price</span>
          <span className="numeral text-ink-hi">Market · ~{formatPrice(quote.reference ?? last, instrument)}</span>
        </div>
      ) : (
        <NumberInput
          label={priceLabel}
          value={draft.price}
          onChange={(price) => onDraft({ price })}
          step={instrument.tickSize}
          decimals={instrument.priceDecimals}
          unit={instrument.quote}
          hint={offset(draft.price) ? `${offset(draft.price)} from last` : undefined}
        />
      )}

      <NumberInput
        label="Amount"
        value={draft.qty}
        onChange={(qty) => onDraft({ qty })}
        step={draft.unit === 'base' ? instrument.qtyStep : 10}
        decimals={draft.unit === 'base' ? instrument.qtyDecimals : 2}
        placeholder="0"
        hint={
          quote.qty !== null && quote.notional !== null
            ? draft.unit === 'base'
              ? `≈ ${formatUsd(quote.notional)}`
              : `≈ ${formatQty(quote.qty, instrument)} ${instrument.base}`
            : undefined
        }
        trailing={
          <button
            type="button"
            onClick={() => {
              const reference = quote.reference ?? last;
              const value = num(draft.qty);
              if (draft.unit === 'quote') {
                onDraft({ unit: 'base', qty: value !== null ? qtyInput(value / reference, instrument) : '' });
              } else {
                onDraft({ unit: 'quote', qty: value !== null ? (value * reference).toFixed(2) : '' });
              }
            }}
            className="border-line-faint text-ink-lo hover:text-ink-hi h-full border-l px-2.5 text-xs font-semibold"
            aria-label="Switch amount unit"
          >
            {draft.unit === 'base' ? instrument.base : instrument.quote}
          </button>
        }
      />

      <div className="grid grid-cols-4 gap-1.5">
        {[0.1, 0.25, 0.5, 1].map((share) => (
          <button
            key={share}
            type="button"
            onClick={() => setQtyUnits(quote.maxQty * share * (share === 1 ? 0.995 : 1))}
            className="bg-fill-2 hover:bg-fill-3 text-ink-lo hover:text-ink-hi h-7 rounded-md text-xs font-medium transition-colors"
          >
            {share * 100}%
          </button>
        ))}
      </div>

      <div className="border-line-faint flex flex-col gap-2.5 border-t pt-3">
        <Toggle
          on={draft.tpOn}
          onChange={(tpOn) =>
            onDraft({
              tpOn,
              tp: tpOn && !draft.tp ? priceInput((quote.reference ?? last) * (buy ? 1.02 : 0.98), instrument) : draft.tp,
            })
          }
          label="Take-profit"
          className="-mx-2.5 w-auto"
          disabled={draft.reduceOnly}
        />
        {draft.tpOn && !draft.reduceOnly && (
          <NumberInput
            label="Take-profit price"
            value={draft.tp}
            onChange={(tp) => onDraft({ tp })}
            step={instrument.tickSize}
            decimals={instrument.priceDecimals}
            unit={instrument.quote}
            hint={
              quote.atTarget !== null ? (
                <span className="text-long-ink">
                  {offset(draft.tp)} · {formatUsd(quote.atTarget, { sign: true })}
                </span>
              ) : undefined
            }
          />
        )}
        <Toggle
          on={draft.slOn}
          onChange={(slOn) =>
            onDraft({
              slOn,
              sl: slOn && !draft.sl ? priceInput((quote.reference ?? last) * (buy ? 0.99 : 1.01), instrument) : draft.sl,
            })
          }
          label="Stop-loss"
          className="-mx-2.5 w-auto"
          disabled={draft.reduceOnly}
        />
        {draft.slOn && !draft.reduceOnly && (
          <>
            <NumberInput
              label="Stop-loss price"
              value={draft.sl}
              onChange={(sl) => onDraft({ sl })}
              step={instrument.tickSize}
              decimals={instrument.priceDecimals}
              unit={instrument.quote}
              hint={
                quote.atStop !== null ? (
                  <span className="text-short-ink">
                    {offset(draft.sl)} · {formatUsd(quote.atStop, { sign: true })}
                  </span>
                ) : undefined
              }
            />
            <div className="flex items-center gap-1.5">
              <span className="text-ink-dim text-mini">Size to risk</span>
              {RISK_SHARES.map((share) => (
                <button
                  key={share}
                  type="button"
                  onClick={() => sizeByRisk(share)}
                  className="bg-fill-2 hover:bg-fill-3 text-ink-lo hover:text-ink-hi h-6 rounded-md px-2 text-mini font-medium"
                >
                  {formatPct(share, { decimals: share < 0.01 ? 1 : 0 })}
                </button>
              ))}
            </div>
          </>
        )}
        <Toggle
          on={draft.reduceOnly}
          onChange={(reduceOnly) => onDraft({ reduceOnly })}
          label="Reduce only"
          className="-mx-2.5 w-auto"
          disabled={position === null}
        />
      </div>

      <dl className="border-line-faint text-mini grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-3">
        <dt className="text-ink-dim">Order value</dt>
        <dd className="numeral text-ink-hi text-right">{quote.notional !== null ? formatUsd(quote.notional) : '—'}</dd>
        <dt className="text-ink-dim">Est. fee</dt>
        <dd className="numeral text-ink-hi text-right">{quote.fee !== null ? formatUsd(quote.fee) : '—'}</dd>
        <dt className="text-ink-dim">Buying power</dt>
        <dd className="numeral text-ink-hi text-right">{formatUsd(account.buyingPower)}</dd>
        <dt className="text-ink-dim">Max</dt>
        <dd className="numeral text-ink-hi text-right">
          {formatQty(quote.maxQty, instrument)} {instrument.base}
        </dd>
      </dl>

      {quote.problem && draft.qty !== '' && <p className="text-attention-ink text-xs">{quote.problem}</p>}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={busy}
        disabled={disabled || quote.problem !== null}
        className={cx(buy ? '!bg-long hover:!bg-long/90' : '!bg-short hover:!bg-short/90', '!text-surface-0')}
      >
        {buy ? 'Buy' : 'Sell'}
        {quote.qty !== null && quote.qty > 0 ? ` ${formatQty(quote.qty, instrument)} ${instrument.base}` : ` ${instrument.base}`}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {opensShort ? (
          <Chip tone="short" size="sm">
            Opens a short
          </Chip>
        ) : (
          <span />
        )}
        <span className="text-ink-dim text-mini">
          {MARGIN.maxGrossLeverage}× margin · {FEE_SCHEDULE.takerBps / 100}% fee
        </span>
      </div>
    </form>
  );
}
