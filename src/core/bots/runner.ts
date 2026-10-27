/**
 * One school trading one market.
 *
 * At every hourly close while it is flat, the bot shows its engine every bar that has closed —
 * the stored history plus the tape hours so far, indexed and un-mirrored exactly as the council
 * sees a chart — and does what the verdict says. Its orders go through the same simulator a
 * player's do, so its fills obey every rule a player's fills obey, and the log it produces replays
 * to the same account through `simulate`.
 *
 * Decisions are stamped at the hour's last minute: the bot acts on a closed bar and the market
 * fills at that close, the way a player who presses Buy at the close would be filled.
 */

import type { Bar } from '../bars';
import { atr } from '../atr';
import { ATR_WINDOW_BARS, PATH_BARS_PER_DISPLAY_BAR } from '../config';
import { hashString } from '../random';
import type { Verdict } from '../engines/contract';
import { Simulator } from '../trading/simulator';
import { halfSpread, type FeeSchedule, type MarginRules } from '../trading/costs';
import { pow10 } from '../trading/instrument';
import type { Market } from '../trading/market';
import type { AccountState, OrderEvent } from '../trading/types';
import { BOT_VERSION } from '../versions';
import { BOT_PARAMS, type BotSpec } from './spec';
import { closedBeyondAverage, opposingSignal, trailingExtreme } from './exits';

export interface BotDecision {
  /** Tape hour whose close it was made at; −1 is the decision bar. */
  hour: number;
  at: number;
  action: 'enter' | 'trail' | 'exit';
  direction: 'long' | 'short';
  rules: string[];
}

export interface BotRun {
  code: string;
  events: OrderEvent[];
  state: AccountState;
  decisions: BotDecision[];
  /** How many times the engine was asked. */
  reads: number;
}

export interface BotRunOptions {
  fees?: FeeSchedule;
  margin?: MarginRules;
  liquidityShare?: number;
}

/** Prices on the council's scale (indexed, un-mirrored) back to the market's ticks. */
function indexedToTicks(price: number, market: Market): number {
  return Math.round((price / market.indexFactor) * pow10(-market.instrument.tickExp));
}

export function runBot(spec: BotSpec, market: Market, starting: number, options: BotRunOptions = {}): BotRun {
  const sim = new Simulator({ market, starting, ...options });
  const events: OrderEvent[] = [];
  const decisions: BotDecision[] = [];
  let seq = 0;
  let reads = 0;

  const hours = Math.floor(market.tape.length / PATH_BARS_PER_DISPLAY_BAR);
  const tapeHours = market.indexedTape.slice(0, hours);
  /** The verdict behind the open position, for its exit rule. */
  let active: Verdict | null = null;
  let activeLong = true;

  const emit = (event: OrderEvent) => {
    events.push(event);
    return sim.apply(event);
  };

  // The last close is the end of the tape, which flattens; nothing new is opened there.
  for (let hour = -1; hour < hours - 1; hour++) {
    const at = hour < 0 ? -1 : (hour + 1) * PATH_BARS_PER_DISPLAY_BAR - 1;
    sim.advance(at);
    const book = sim.peek();
    if (book.bankrupt) break;

    const bars: Bar[] = [...market.indexedHistory, ...tapeHours.slice(0, hour + 1)];
    if (bars.length === 0) continue;
    const window = bars.slice(-ATR_WINDOW_BARS);
    const atrNow = atr(window) ?? 0;

    if (book.qty === 0) {
      // Flat, whether it never entered or a resting stop or target closed it since the last close.
      active = null;
      reads += 1;
      const verdict = spec.engine.read({
        bars,
        entry: bars[bars.length - 1].c,
        atr: atrNow,
        seed: hashString(`${market.chartId}|${hour}|${BOT_VERSION}`),
      });
      if (verdict.direction === null || verdict.bracket === null) continue;

      const long = verdict.direction === 'long';
      const mark = sim.mark;
      const fill = long ? mark + halfSpread(mark, sim.fees) : mark - halfSpread(mark, sim.fees);
      const stop = indexedToTicks(verdict.bracket.stop, market);
      const target = indexedToTicks(verdict.bracket.target, market);
      if (long ? !(stop < fill) : !(stop > fill)) continue;
      if (spec.takeProfit && (long ? !(target > fill) : !(target < fill))) continue;

      // Risk per step in micro-USDT is the stop distance in ticks (ticks × steps = micros).
      const riskPerStep = Math.abs(fill - stop);
      const wanted = Math.floor((book.equity * BOT_PARAMS.riskFraction) / riskPerStep);
      const qty = Math.min(wanted, sim.maxQty(long ? 'buy' : 'sell', fill));
      if (qty <= 0 || qty * fill < market.instrument.minNotional) continue;

      seq += 1;
      const result = emit({
        kind: 'place',
        seq,
        at,
        order: {
          id: `${spec.code.toLowerCase()}-${seq}`,
          side: long ? 'buy' : 'sell',
          type: 'market',
          qty,
          reduceOnly: false,
          role: 'entry',
        },
        stopLoss: stop,
        takeProfit: spec.takeProfit ? target : undefined,
      });
      if (result.rejected) continue;
      active = verdict;
      activeLong = long;
      decisions.push({ hour, at, action: 'enter', direction: verdict.direction, rules: verdict.rules });
      continue;
    }

    // In a position: does the school say to leave, or to move its stop?
    if (active === null) continue;
    const long = activeLong;
    const direction = long ? 'long' : 'short';

    if (spec.exit === 'native' && active.exit?.kind === 'opposite-extreme') {
      const trail = trailingExtreme(bars, active.exit.bars, long);
      const stopOrder = book.open.find((o) => o.role === 'stop-loss' && o.status === 'working');
      if (trail !== null && stopOrder) {
        const level = indexedToTicks(trail, market);
        const current = stopOrder.stopPrice as number;
        const tighter = long ? level > current : level < current;
        if (tighter) {
          const through = long ? level >= sim.mark : level <= sim.mark;
          seq += 1;
          if (through) {
            emit({ kind: 'close-position', seq, at, fraction: 1 });
            decisions.push({ hour, at, action: 'exit', direction, rules: [active.exit.description] });
          } else {
            emit({ kind: 'modify', seq, at, orderId: stopOrder.id, stopPrice: level });
            decisions.push({ hour, at, action: 'trail', direction, rules: [active.exit.description] });
          }
        }
      }
    } else if (spec.exit === 'native' && active.exit?.kind === 'close-beyond-ma') {
      if (closedBeyondAverage(bars, active.exit.period, long)) {
        seq += 1;
        emit({ kind: 'close-position', seq, at, fraction: 1 });
        decisions.push({ hour, at, action: 'exit', direction, rules: [active.exit.description] });
      }
    } else if (spec.exit === 'opposing-signal') {
      reads += 1;
      if (opposingSignal(bars, atrNow, long)) {
        seq += 1;
        emit({ kind: 'close-position', seq, at, fraction: 1 });
        decisions.push({ hour, at, action: 'exit', direction, rules: ['an opposing VSA signal printed'] });
      }
    }
  }

  sim.finish();
  return { code: spec.code, events, state: sim.snapshot(), decisions, reads };
}

export interface SeriesResult {
  runs: BotRun[];
  /** Equity at the end of each market, micro-USDT. */
  equity: number[];
  bankrupt: boolean;
}

/**
 * A school's account across many markets, in the order given: each one starts with what the last
 * one ended with. Stops at bankruptcy, as a player's account would have to be reset.
 */
export function runSeries(spec: BotSpec, markets: Iterable<Market>, starting: number, options: BotRunOptions = {}): SeriesResult {
  const runs: BotRun[] = [];
  const equity: number[] = [];
  let cash = starting;
  for (const market of markets) {
    const run = runBot(spec, market, cash, options);
    runs.push(run);
    cash = run.state.cash;
    equity.push(cash);
    if (run.state.bankrupt || cash <= 0) return { runs, equity, bankrupt: true };
  }
  return { runs, equity, bankrupt: false };
}
