'use client';

import { useMemo } from 'react';
import type { InstrumentView } from '@/lib/trading/types';
import type { RoundIntent } from '@/lib/game/types';
import { formatPct, formatPrice, formatQty, formatUsd, priceInput } from '@/lib/trading/format';
import { FEE_SCHEDULE } from '@/core/trading/costs';
import { Button, Segmented, Toggle, cx } from '../ui';
import { NumberInput } from '../ui/number-input';

/**
 * A round's ticket (docs/rules.md §23.1).
 *
 * One trade or none: a side, an entry type, a size in dollars up to the stake, and an optional
 * take-profit and stop-loss. Nothing on it can be changed once it is locked in, so it says what the
 * trade makes at its target and loses at its stop before the button is pressed, not after.
 *
 * Like the terminal's ticket, the draft is owned by the screen, because the chart draws it: the
 * entry, the target and the stop are lines to drag as well as numbers to type.
 */

export interface RoundDraft {
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  price: string;
  /** USDT. */
  size: string;
  tpOn: boolean;
  tp: string;
  slOn: boolean;
  sl: string;
}

export function emptyRoundDraft(stake: number): RoundDraft {
  return { side: 'buy', type: 'market', price: '', size: String(stake), tpOn: false, tp: '', slOn: false, sl: '' };
}

const num = (text: string) => {
  const value = Number.parseFloat(text.replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
};

export interface RoundQuote {
  /** Where the entry expects to trade. */
  reference: number | null;
  qty: number | null;
  /** Net at the take-profit and at the stop-loss, fees included. */
  atTarget: number | null;
  atStop: number | null;
  /** Reward over risk, when both are set. */
  ratio: number | null;
  problem: string | null;
}

/** What the draft would do, worked out the way the exchange will (§22.5's costs, approximately). */
export function quoteRound(draft: RoundDraft, last: number, stake: number, instrument: InstrumentView): RoundQuote {
  const buy = draft.side === 'buy';
  const spread = last * (FEE_SCHEDULE.halfSpreadBps / 10_000);
  const price = num(draft.price);
  const reference = draft.type === 'market' ? (buy ? last + spread : last - spread) : price;
  const size = num(draft.size);
  const tp = draft.tpOn ? num(draft.tp) : null;
  const sl = draft.slOn ? num(draft.sl) : null;

  let problem: string | null = null;
  if (size === null || size < instrument.minNotional || size > stake) {
    problem = `Size a trade between ${formatUsd(instrument.minNotional, { decimals: 0 })} and ${formatUsd(stake, { decimals: 0 })}.`;
  } else if (reference === null || !(reference > 0)) {
    problem = draft.type === 'limit' ? 'A limit order needs a price.' : 'A stop order needs a trigger price.';
  } else if (draft.type === 'stop' && (buy ? reference <= last : reference >= last)) {
    problem = buy ? 'A buy stop goes above the last price.' : 'A sell stop goes below the last price.';
  } else if (draft.tpOn && (tp === null || (buy ? tp <= reference : tp >= reference))) {
    problem = 'The take-profit belongs on the winning side of the entry.';
  } else if (draft.slOn && (sl === null || (buy ? sl >= reference : sl <= reference))) {
    problem = 'The stop-loss belongs on the losing side of the entry.';
  }

  const qty = size !== null && reference !== null && reference > 0 ? size / reference : null;
  const fee = (notional: number) => (notional * FEE_SCHEDULE.takerBps) / 10_000;
  const net = (exit: number | null) =>
    qty === null || reference === null || exit === null
      ? null
      : (buy ? 1 : -1) * qty * (exit - reference) - fee(qty * reference) - fee(qty * exit);
  const atTarget = draft.tpOn ? net(tp) : null;
  const atStop = draft.slOn ? net(sl) : null;
  const ratio =
    tp !== null && sl !== null && reference !== null && draft.tpOn && draft.slOn && Math.abs(reference - sl) > 0
      ? Math.abs(tp - reference) / Math.abs(reference - sl)
      : null;
  return { reference, qty, atTarget, atStop, ratio, problem };
}

/** The draft as what gets locked in. Null while it has a problem. */
export function draftIntent(draft: RoundDraft, quote: RoundQuote): RoundIntent | null {
  if (quote.problem) return null;
  const size = num(draft.size);
  if (size === null) return null;
  return {
    kind: 'trade',
    side: draft.side,
    type: draft.type,
    size,
    price: draft.type === 'market' ? undefined : (num(draft.price) ?? undefined),
    takeProfit: draft.tpOn ? (num(draft.tp) ?? undefined) : undefined,
    stopLoss: draft.slOn ? (num(draft.sl) ?? undefined) : undefined,
  };
}

export function RoundTicket({
  draft,
  onDraft,
  onLock,
  onSitOut,
  last,
  stake,
  instrument,
  busy,
  disabled,
  className,
}: {
  draft: RoundDraft;
  onDraft: (next: Partial<RoundDraft>) => void;
  onLock: (intent: RoundIntent) => void;
  onSitOut: () => void;
  /** The decision close, real price. */
  last: number;
  stake: number;
  instrument: InstrumentView;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const quote = useMemo(() => quoteRound(draft, last, stake, instrument), [draft, last, stake, instrument]);
  const buy = draft.side === 'buy';
  const offset = (text: string) => {
    const value = num(text);
    return value !== null && last > 0 ? formatPct(value / last - 1, { sign: true }) : null;
  };
  const intent = draftIntent(draft, quote);

  return (
    <form
      className={cx('flex flex-col gap-3', className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (intent && !disabled) onLock(intent);
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
              onClick={() => onDraft({ side, tp: '', sl: '' })}
              className={cx(
                'press h-9 rounded-md text-sm font-semibold transition-colors',
                active ? (side === 'buy' ? 'bg-long text-surface-0' : 'bg-short text-surface-0') : 'text-ink-lo hover:text-ink-hi',
              )}
            >
              {side === 'buy' ? 'Long' : 'Short'}
            </button>
          );
        })}
      </div>

      <Segmented
        label="Entry"
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
          <span className="text-ink-dim">Entry</span>
          <span className="numeral text-ink-hi">At the bell · ~{formatPrice(quote.reference ?? last, instrument)}</span>
        </div>
      ) : (
        <NumberInput
          label={draft.type === 'stop' ? 'Trigger price' : 'Limit price'}
          value={draft.price}
          onChange={(price) => onDraft({ price })}
          step={instrument.tickSize}
          decimals={instrument.priceDecimals}
          unit={instrument.quote}
          hint={offset(draft.price) ? `${offset(draft.price)} from the close · rests on the tape` : undefined}
        />
      )}

      <NumberInput
        label="Size"
        value={draft.size}
        onChange={(size) => onDraft({ size })}
        step={10}
        decimals={2}
        unit="USDT"
        hint={quote.qty !== null ? `≈ ${formatQty(quote.qty, instrument)} ${instrument.base}` : undefined}
      />
      <div className="grid grid-cols-4 gap-1.5">
        {[0.25, 0.5, 0.75, 1].map((share) => (
          <button
            key={share}
            type="button"
            onClick={() => onDraft({ size: String(stake * share) })}
            className={cx(
              'h-7 rounded-md text-xs font-medium transition-colors',
              num(draft.size) === stake * share ? 'bg-fill-3 text-ink-hi' : 'bg-fill-2 hover:bg-fill-3 text-ink-lo hover:text-ink-hi',
            )}
          >
            {formatUsd(stake * share, { decimals: 0 })}
          </button>
        ))}
      </div>

      <div className="border-line-faint flex flex-col gap-2.5 border-t pt-3">
        <Toggle
          on={draft.tpOn}
          onChange={(tpOn) =>
            onDraft({ tpOn, tp: tpOn && !draft.tp ? priceInput((quote.reference ?? last) * (buy ? 1.03 : 0.97), instrument) : draft.tp })
          }
          label="Take-profit"
          className="-mx-2.5 w-auto"
        />
        {draft.tpOn && (
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
            onDraft({ slOn, sl: slOn && !draft.sl ? priceInput((quote.reference ?? last) * (buy ? 0.985 : 1.015), instrument) : draft.sl })
          }
          label="Stop-loss"
          className="-mx-2.5 w-auto"
        />
        {draft.slOn && (
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
        )}
        {!draft.slOn && !buy && (
          <p className="text-ink-dim text-mini">A short with no stop is closed only if the price doubles, at a loss of the whole stake.</p>
        )}
      </div>

      <dl className="border-line-faint text-mini grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-3">
        <dt className="text-ink-dim">Stake</dt>
        <dd className="numeral text-ink-hi text-right">{formatUsd(stake, { decimals: 0 })}, this round only</dd>
        <dt className="text-ink-dim">Reward : risk</dt>
        <dd className="numeral text-ink-hi text-right">{quote.ratio !== null ? `${quote.ratio.toFixed(2)} : 1` : '—'}</dd>
        <dt className="text-ink-dim">Fees</dt>
        <dd className="numeral text-ink-hi text-right">{FEE_SCHEDULE.takerBps / 100}% a side</dd>
      </dl>

      {quote.problem && <p className="text-attention-ink text-xs">{quote.problem}</p>}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={busy}
        disabled={disabled || intent === null}
        className={cx(buy ? '!bg-long hover:!bg-long/90' : '!bg-short hover:!bg-short/90', '!text-surface-0')}
      >
        <span className="inline-flex items-center gap-2">Lock in {buy ? 'long' : 'short'}</span>
      </Button>
      <Button type="button" variant="ghost" block disabled={disabled || busy} onClick={onSitOut}>
        Sit this one out
      </Button>
      <p className="text-ink-dim text-mini text-center">Once locked in, nothing can be changed. Then the tape plays.</p>
    </form>
  );
}
