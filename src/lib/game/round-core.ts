/**
 * A round's rules, in one place, for the server and the browser alike.
 *
 * Like the trading terminal's `session-core.ts`, nothing here does I/O: the API and the demo's
 * in-browser driver both run a round through these functions, so the demo plays by exactly the
 * server's rules and only the storage differs.
 *
 * A round is settled once, at lock-in: the intent becomes an order in ticks, the exchange plays it
 * over the whole tape, the tape's best and worst are found, and the result is graded. Settling is
 * deterministic, so a stored round is re-settled from its intent whenever it is shown, and the
 * stored grade is only a copy for lists and boards.
 */

import type { Market } from '@/core/trading/market';
import { MICROS, fromTicks, toMicros, toTicks } from '@/core/trading/instrument';
import {
  ROUND_STAKE,
  ROUND_STAKE_USDT,
  checkRound,
  grade,
  resolveRound,
  tapeExtremes,
  type Extremes,
  type RoundOrder,
  type RoundOutcome,
} from '@/core/game';
import { REJECT_TEXT, instrumentView, wireBars } from '@/lib/trading/session-core';
import type {
  OpponentRound,
  RoundDuelContext,
  RoundIntent,
  RoundMode,
  RoundPlayed,
  RoundReading,
  TradeLine,
} from './types';

export interface RoundMeta {
  roundId: string;
  mode: RoundMode;
  duel: RoundDuelContext | null;
  synthetic: boolean;
}

const MIN_SIZE_USDT = 5;

const SIZE_TEXT = `Size a trade between $${MIN_SIZE_USDT} and $${ROUND_STAKE_USDT}.`;

/** An intent in the exchange's units, or why it cannot be one. `null` is a sit-out. */
export function intentOrder(market: Market, intent: RoundIntent): { order: RoundOrder | null } | { error: string } {
  if (intent.kind === 'sit-out') return { order: null };
  const { instrument } = market;
  if (!Number.isFinite(intent.size) || intent.size < MIN_SIZE_USDT || intent.size > ROUND_STAKE_USDT) {
    return { error: SIZE_TEXT };
  }
  const ticks = (price: number | undefined) =>
    price === undefined ? undefined : Number.isFinite(price) && price > 0 ? toTicks(price, instrument) : -1;

  const order: RoundOrder = { side: intent.side, type: intent.type, size: Math.min(ROUND_STAKE, toMicros(intent.size)) };
  if (intent.type !== 'market') {
    const price = ticks(intent.price);
    if (price === undefined || price <= 0) {
      return { error: intent.type === 'limit' ? 'A limit order needs a price.' : 'A stop order needs a trigger price.' };
    }
    if (intent.type === 'limit') order.price = price;
    else order.stopPrice = price;
  }
  const tp = ticks(intent.takeProfit);
  const sl = ticks(intent.stopLoss);
  if (tp !== undefined) {
    if (tp <= 0) return { error: 'That take-profit is not a price.' };
    order.takeProfit = tp;
  }
  if (sl !== undefined) {
    if (sl <= 0) return { error: 'That stop-loss is not a price.' };
    order.stopLoss = sl;
  }

  const check = checkRound(market, order);
  if (!check.ok) return { error: check.reason === 'size' ? SIZE_TEXT : REJECT_TEXT[check.reason] };
  return { order };
}

/** A round played: everything the review shows, in the exchange's units. */
export interface SettledRound {
  intent: RoundIntent;
  order: RoundOrder | null;
  outcome: RoundOutcome;
  extremes: Extremes;
  grade: number;
  sitOutGrade: number;
  rejected: string | null;
}

/**
 * Settle a round. An intent the exchange would refuse is played as a sit-out with its reason
 * recorded; the API refuses such an intent before this, so that only happens to a stored intent
 * replayed under rules that have since changed.
 */
export function settleRound(market: Market, intent: RoundIntent, extremes: Extremes = tapeExtremes(market)): SettledRound {
  const parsed = intentOrder(market, intent);
  const order = 'order' in parsed ? parsed.order : null;
  const outcome = resolveRound(market, order);
  const best = extremes.best.outcome.end;
  const worst = extremes.worst.outcome.end;
  return {
    intent,
    order,
    outcome,
    extremes,
    grade: grade(outcome.end, best, worst),
    sitOutGrade: grade(ROUND_STAKE, best, worst),
    rejected: 'error' in parsed ? parsed.error : null,
  };
}

/** A trade as the review draws it. */
export function tradeLine(market: Market, order: RoundOrder, outcome: RoundOutcome): TradeLine {
  const price = (ticks: number | undefined) => (ticks === undefined ? null : fromTicks(ticks, market.instrument));
  const usd = (micros: number) => micros / MICROS;
  const entryFill = outcome.fills.find((fill) => fill.role === 'entry') ?? null;
  const exitFill = entryFill ? ([...outcome.fills].reverse().find((fill) => fill.positionAfter === 0) ?? null) : null;
  return {
    direction: order.side === 'buy' ? 'long' : 'short',
    entryType: order.type,
    order: {
      price: order.type === 'limit' ? price(order.price) : order.type === 'stop' ? price(order.stopPrice) : null,
      takeProfit: price(order.takeProfit),
      stopLoss: price(order.stopLoss),
      size: usd(order.size),
    },
    entry: entryFill ? { at: entryFill.at, price: fromTicks(entryFill.price, market.instrument) } : null,
    exit:
      exitFill && outcome.exit
        ? { at: exitFill.at, price: fromTicks(exitFill.price, market.instrument), reason: outcome.exit }
        : null,
    result: usd(outcome.end),
    pnl: usd(outcome.pnl),
    fees: usd(outcome.fees),
  };
}

function base(meta: RoundMeta, market: Market) {
  return {
    roundId: meta.roundId,
    mode: meta.mode,
    instrument: instrumentView(market),
    chart: {
      hours: wireBars(market.historyHours),
      minutes: wireBars(market.historyMinutes),
      refClose: market.refClose,
    },
    // The date is withheld until the result (§22.9): weekday and time of day only.
    time: { kind: 'relative' as const, weekday: market.start.weekday, minuteOfDay: market.start.minuteOfDay },
    stake: ROUND_STAKE_USDT,
    duel: meta.duel,
    synthetic: meta.synthetic,
  };
}

/** A round being read: the history, and not one minute of the tape. */
export function readingView(meta: RoundMeta, market: Market): RoundReading {
  return { ...base(meta, market), status: 'reading' };
}

/** A round that is locked in: the whole tape, the result, and the best and worst beside it. */
export function playedView(meta: RoundMeta, market: Market, settled: SettledRound, opponent: OpponentRound | null = null): RoundPlayed {
  const { extremes } = settled;
  return {
    ...base(meta, market),
    status: 'locked',
    tape: wireBars(market.tape),
    intent: settled.intent,
    mine: settled.order ? tradeLine(market, settled.order, settled.outcome) : null,
    result: settled.outcome.end / MICROS,
    grade: settled.grade,
    best: tradeLine(market, extremes.best.order, extremes.best.outcome),
    worst: tradeLine(market, extremes.worst.order, extremes.worst.outcome),
    sitOutGrade: settled.sitOutGrade,
    rejected: settled.rejected,
    reveal: { startMs: market.startMs },
    opponent,
  };
}
