/**
 * The best and the worst a tape allowed (docs/rules.md §23.2).
 *
 * "Allowed" is literal: the orders a round may lock in, at full size, filled and charged by the
 * exchange. The search has two stages.
 *
 * 1. **Which moves.** Every candidate entry and exit gets the price the exchange would actually
 *    give it — a resting limit fills half a spread inside the wick, a stop half a spread and its
 *    slippage outside it, a market order at the ask or bid of the decision close — and one pass
 *    over the tape keeps the best ratio of exit to entry for each of four trades: long and short,
 *    taken the right way round and the wrong way round.
 * 2. **What they paid.** Each of the four is then built as a real order and played through
 *    `resolveRound`, so the numbers the grade divides by are results the exchange produced, not
 *    estimates of them. The best is the better of the two right-way trades, the worst the worse
 *    of the two wrong-way ones.
 *
 * Commission is a fixed share of each leg and the size is fixed, so ranking by the price ratio
 * ranks by result; what stage 1 cannot see — the quantity rounding down to a step, commission
 * rounding up to a micro — is a few micro-dollars, and stage 2 prices it exactly.
 */

import { FEE_SCHEDULE, halfSpread, slippage } from '../trading/costs';
import type { Market } from '../trading/market';
import { resolveRound, type RoundOrder, type RoundOutcome } from './round';
import { MIN_MOVE, ROUND_STAKE } from './rules';

/** One of the tape's two biggest moves, in raw trade prices (§23.2). */
export interface Move {
  /** Share of the starting price. Positive for a rise and for a fall alike. */
  fraction: number;
  /** Minute it starts from; −1 is the decision close. */
  from: number;
  to: number;
  fromPrice: number;
  toPrice: number;
}

export interface Extreme {
  order: RoundOrder;
  outcome: RoundOutcome;
  direction: 'long' | 'short';
}

export interface Extremes {
  best: Extreme;
  worst: Extreme;
  rise: Move;
  fall: Move;
}

/**
 * The biggest rise (from the decision close or a minute's low to a later minute's high) and the
 * biggest fall (from the decision close or a minute's high to a later minute's low).
 */
export function biggestMoves(market: Pick<Market, 'tape' | 'refClose'>): { rise: Move; fall: Move } {
  const { tape, refClose } = market;
  let lowAt = -1;
  let low = refClose;
  let highAt = -1;
  let high = refClose;
  let rise: Move = { fraction: 0, from: -1, to: -1, fromPrice: refClose, toPrice: refClose };
  let fall: Move = { fraction: 0, from: -1, to: -1, fromPrice: refClose, toPrice: refClose };

  for (let j = 0; j < tape.length; j++) {
    const bar = tape[j];
    const up = bar.h / low - 1;
    if (up > rise.fraction) rise = { fraction: up, from: lowAt, to: j, fromPrice: low, toPrice: bar.h };
    const down = 1 - bar.l / high;
    if (down > fall.fraction) fall = { fraction: down, from: highAt, to: j, fromPrice: high, toPrice: bar.l };
    if (bar.l < low) {
      low = bar.l;
      lowAt = j;
    }
    if (bar.h > high) {
      high = bar.h;
      highAt = j;
    }
  }
  return { rise, fall };
}

/** The larger of the two, as a share. What §23.4's minimum is measured against. */
export function biggestMove(market: Pick<Market, 'tape' | 'refClose'>): number {
  const { rise, fall } = biggestMoves(market);
  return Math.max(rise.fraction, fall.fraction);
}

/** Whether a tape may be dealt at all (§23.4). */
export function dealable(market: Pick<Market, 'tape' | 'refClose'>): boolean {
  return biggestMove(market) >= MIN_MOVE;
}

/* --------------------------------------------------------------- prices */

const hs = (price: number) => halfSpread(price, FEE_SCHEDULE);
const slip = (price: number) => slippage(price, FEE_SCHEDULE);

/** The lowest buy limit that a minute trading down to `low` fills. The simulator fires a buy
 *  limit when the trade price reaches the limit less half a spread at the limit. */
function buyLimitAt(low: number): number {
  let limit = low + hs(low);
  while (limit - hs(limit) < low) limit += 1;
  while (limit - 1 > 0 && limit - 1 - hs(limit - 1) >= low) limit -= 1;
  return limit;
}

/** The highest sell limit that a minute trading up to `high` fills. */
function sellLimitAt(high: number): number {
  let limit = Math.max(1, high - hs(high));
  while (limit + 1 + hs(limit + 1) <= high) limit += 1;
  return limit;
}

interface Leg {
  /** Minute; −1 is a market order at the decision close. */
  at: number;
  /** What the exchange fills it at, ticks. */
  fill: number;
  /** The order's own price: the limit, the trigger, or the reference for a market order. */
  price: number;
}

/**
 * The best pair of legs over the tape: an entry at some minute, an exit at a later one, chosen to
 * maximise `score(entry, exit)`. Entries are tried at the decision close and at every minute;
 * an exit is only ever matched with an entry from an earlier minute.
 */
function bestPair(
  market: Pick<Market, 'tape' | 'refClose'>,
  entryAt: (minute: number) => Leg | null,
  exitAt: (minute: number) => Leg,
  score: (entry: Leg, exit: Leg) => number,
  better: (a: Leg, b: Leg) => boolean,
): { entry: Leg; exit: Leg } {
  let entry = entryAt(-1) as Leg;
  let found: { entry: Leg; exit: Leg; score: number } | null = null;
  for (let j = 0; j < market.tape.length; j++) {
    const exit = exitAt(j);
    const value = score(entry, exit);
    if (found === null || value > found.score) found = { entry, exit, score: value };
    const candidate = entryAt(j);
    if (candidate && better(candidate, entry)) entry = candidate;
  }
  return found ?? { entry, exit: exitAt(Math.max(0, market.tape.length - 1)) };
}

function legOrder(direction: 'long' | 'short', entry: Leg, exit: Leg, entryType: 'limit' | 'stop', exitKind: 'takeProfit' | 'stopLoss'): RoundOrder {
  const side = direction === 'long' ? 'buy' : 'sell';
  const order: RoundOrder =
    entry.at < 0
      ? { side, type: 'market', size: ROUND_STAKE }
      : entryType === 'limit'
        ? { side, type: 'limit', size: ROUND_STAKE, price: entry.price }
        : { side, type: 'stop', size: ROUND_STAKE, stopPrice: entry.price };
  return { ...order, [exitKind]: exit.price };
}

/** The four trades of §23.2, built and played. */
export function tapeExtremes(market: Market): Extremes {
  const { tape, refClose } = market;
  const { rise, fall } = biggestMoves(market);
  const ask = refClose + hs(refClose);
  const bid = refClose - hs(refClose);

  // Right way round: a long bought at the bottom of a rise and sold at its top.
  const longBest = bestPair(
    market,
    (m) => {
      if (m < 0) return { at: -1, fill: ask, price: ask };
      const limit = buyLimitAt(tape[m].l);
      return { at: m, fill: limit, price: limit };
    },
    (m) => {
      const limit = sellLimitAt(tape[m].h);
      return { at: m, fill: limit, price: limit };
    },
    (entry, exit) => exit.fill / entry.fill,
    (a, b) => a.fill < b.fill,
  );
  // A short sold at the top of a fall and covered at its bottom.
  const shortBest = bestPair(
    market,
    (m) => {
      if (m < 0) return { at: -1, fill: bid, price: bid };
      const limit = sellLimitAt(tape[m].h);
      return { at: m, fill: limit, price: limit };
    },
    (m) => {
      const limit = buyLimitAt(tape[m].l);
      return { at: m, fill: limit, price: limit };
    },
    (entry, exit) => entry.fill / exit.fill,
    (a, b) => a.fill > b.fill,
  );

  // Wrong way round: a long bought at the top of a fall by a stop, and stopped at its bottom. A
  // buy stop has to sit above the market when it is placed, so a minute whose high never got above
  // the decision close is no entry — buying the decision close itself is at least as bad.
  const longWorst = bestPair(
    market,
    (m) => {
      if (m < 0) return { at: -1, fill: ask, price: ask };
      const high = tape[m].h;
      if (high <= refClose) return null;
      return { at: m, fill: high + hs(high) + slip(high), price: high };
    },
    (m) => {
      const low = tape[m].l;
      return { at: m, fill: Math.max(1, low - hs(low) - slip(low)), price: low };
    },
    (entry, exit) => entry.fill / exit.fill,
    (a, b) => a.fill > b.fill,
  );
  // A short sold at the bottom of a rise by a stop, and stopped at its top.
  const shortWorst = bestPair(
    market,
    (m) => {
      if (m < 0) return { at: -1, fill: bid, price: bid };
      const low = tape[m].l;
      if (low >= refClose) return null;
      return { at: m, fill: Math.max(1, low - hs(low) - slip(low)), price: low };
    },
    (m) => {
      const high = tape[m].h;
      return { at: m, fill: high + hs(high) + slip(high), price: high };
    },
    (entry, exit) => exit.fill / entry.fill,
    (a, b) => a.fill < b.fill,
  );

  const play = (direction: 'long' | 'short', order: RoundOrder): Extreme => ({
    direction,
    order,
    outcome: resolveRound(market, order),
  });

  const bests = [
    play('long', legOrder('long', longBest.entry, longBest.exit, 'limit', 'takeProfit')),
    play('short', legOrder('short', shortBest.entry, shortBest.exit, 'limit', 'takeProfit')),
  ];
  const worsts = [
    play('long', legOrder('long', longWorst.entry, longWorst.exit, 'stop', 'stopLoss')),
    play('short', legOrder('short', shortWorst.entry, shortWorst.exit, 'stop', 'stopLoss')),
  ];

  const best = bests[0].outcome.end >= bests[1].outcome.end ? bests[0] : bests[1];
  const worst = worsts[0].outcome.end <= worsts[1].outcome.end ? worsts[0] : worsts[1];
  return { best, worst, rise, fall };
}
