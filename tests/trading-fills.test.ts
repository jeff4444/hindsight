import { describe, expect, it } from 'vitest';
import { Simulator, simulate } from '@/core/trading/simulator';
import { FEE_SCHEDULE, NO_FEES, MARGIN } from '@/core/trading/costs';
import type { OrderEvent } from '@/core/trading/types';
import { FLAT_10BPS, K, flatMinutes, m, nextSeq, place, testMarket } from './trading/fixtures';

/**
 * Golden fills. Prices are ticks of $0.01, quantities steps of 0.0001, money micro-USDT: 100
 * units (1,000,000 steps) at $100.00 (10,000 ticks) is a notional of 1e10 micros, $10,000.
 */

const START = 100 * K; // $100,000
const UNITS_100 = 1_000_000;

function run(tape: ReturnType<typeof flatMinutes>, events: OrderEvent[], upTo = tape.length, fees = FLAT_10BPS, refClose = 10_000) {
  return simulate(testMarket(tape, refClose), events, { starting: START, upTo, fees });
}

describe('market orders', () => {
  it('fill at the decision close, charge the taker fee, and open a long', () => {
    const { state } = run(flatMinutes(10, 10_000), [place(-1, { side: 'buy', type: 'market', qty: UNITS_100 })], 5);
    expect(state.fills).toHaveLength(1);
    expect(state.fills[0]).toMatchObject({ at: -1, price: 10_000, notional: 10_000_000_000, fee: 10_000_000, liquidity: 'taker' });
    expect(state.position).toEqual({ qty: UNITS_100, basis: 10_000_000_000 });
    expect(state.cash).toBe(START - 10_000_000);
    expect(state.equity).toBe(START - 10_000_000);
  });

  it('buy the ask and sell the bid when there is a spread', () => {
    const { state } = run(flatMinutes(10, 10_000), [place(-1, { side: 'buy', type: 'market', qty: UNITS_100 })], 5, FEE_SCHEDULE);
    // 1 bp of 10,000 ticks is one tick.
    expect(state.fills[0].price).toBe(10_001);
  });

  it('mark open positions to the last close', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_000, 10_500, 10_000, 10_500), ...flatMinutes(3, 10_500)];
    const { state } = run(tape, [place(-1, { side: 'buy', type: 'market', qty: UNITS_100 })], 5);
    expect(state.mark).toBe(10_500);
    expect(state.unrealized).toBe(UNITS_100 * 10_500 - 10_000_000_000);
  });
});

describe('limit orders', () => {
  it('rest, then fill at the limit when price trades down to it, as a maker', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_000, 10_000, 9_800, 9_900), ...flatMinutes(3, 9_900)];
    const { state } = run(tape, [place(-1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 9_850 })]);
    const entry = state.fills.find((f) => f.role === 'entry')!;
    expect(entry).toMatchObject({ at: 3, price: 9_850, liquidity: 'maker', gap: false });
  });

  it('fill at a better open when price gaps through the limit', () => {
    const tape = [...flatMinutes(3, 10_000), m(9_700, 9_750, 9_650, 9_700), ...flatMinutes(3, 9_700)];
    const { state } = run(tape, [place(-1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 9_850 })]);
    const entry = state.fills.find((f) => f.role === 'entry')!;
    expect(entry).toMatchObject({ at: 3, price: 9_700, gap: true, liquidity: 'maker' });
  });

  it('fill at once, as a taker, when already marketable', () => {
    const { state } = run(flatMinutes(5, 10_000), [place(-1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 10_200 })], 2);
    expect(state.fills[0]).toMatchObject({ at: -1, price: 10_000, liquidity: 'taker' });
  });

  it('are never live in the minute they were placed', () => {
    // Placed at the close of minute 1; minute 1 itself traded through the level and must not fill it.
    const tape = [m(10_000, 10_000, 10_000, 10_000), m(10_000, 10_000, 9_500, 10_000), ...flatMinutes(3, 10_000)];
    const { state } = run(tape, [place(1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 9_800 })]);
    expect(state.fills.filter((f) => f.role === 'entry')).toHaveLength(0);
  });
});

describe('stop orders', () => {
  it('trigger on the wick and fill at the stop plus slippage', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_000, 10_300, 10_000, 10_100), ...flatMinutes(3, 10_100)];
    const { state } = run(tape, [place(-1, { side: 'buy', type: 'stop', qty: UNITS_100, stopPrice: 10_200 })], tape.length, FEE_SCHEDULE);
    const entry = state.fills.find((f) => f.role === 'entry')!;
    // 1 bp spread (2 ticks at 10,200 rounded up) and 5 bp slippage (6 ticks).
    expect(entry).toMatchObject({ at: 3, price: 10_200 + 2 + 6, liquidity: 'taker', gap: false });
  });

  it('fill at the open when price gaps through the trigger', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_400, 10_450, 10_350, 10_400), ...flatMinutes(3, 10_400)];
    const { state } = run(tape, [place(-1, { side: 'buy', type: 'stop', qty: UNITS_100, stopPrice: 10_200 })]);
    expect(state.fills.find((f) => f.role === 'entry')).toMatchObject({ price: 10_400, gap: true });
  });

  it('are rejected when they would trigger the moment they are placed', () => {
    const { state, results } = run(flatMinutes(5, 10_000), [place(-1, { side: 'buy', type: 'stop', qty: UNITS_100, stopPrice: 9_900, id: 'bad' })], 2);
    expect(state.fills).toHaveLength(0);
    expect([...results.values()][0].rejected).toBe('would-trigger-immediately');
    expect(state.done.find((o) => o.id === 'bad')?.status).toBe('rejected');
  });
});

describe('take-profit and stop-loss', () => {
  it('cancel each other when one fills, and close the trip', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_000, 10_000, 9_400, 9_500), ...flatMinutes(3, 9_500)];
    const { state } = run(tape, [
      place(-1, { side: 'buy', type: 'market', qty: UNITS_100, id: 'e' }, { takeProfit: 10_500, stopLoss: 9_600 }),
    ]);
    const exit = state.fills.find((f) => f.role === 'stop-loss')!;
    expect(exit).toMatchObject({ at: 3, price: 9_600, side: 'sell' });
    expect(state.position.qty).toBe(0);
    expect(state.done.find((o) => o.id === 'e:tp')?.cancelReason).toBe('oco');
    expect(state.trips).toHaveLength(1);
    const trip = state.trips[0];
    expect(trip.side).toBe('long');
    expect(trip.gross).toBe(UNITS_100 * (9_600 - 10_000));
    expect(trip.net).toBe(trip.gross - trip.fees);
  });

  it('take the stop first, and flag it, when one minute touches both', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_000, 10_600, 9_400, 10_000), ...flatMinutes(3, 10_000)];
    const { state } = run(tape, [
      place(-1, { side: 'buy', type: 'market', qty: UNITS_100, id: 'e' }, { takeProfit: 10_500, stopLoss: 9_600 }),
    ]);
    const exit = state.fills.find((f) => f.at === 3)!;
    expect(exit.role).toBe('stop-loss');
    expect(exit.ambiguous).toBe(true);
    expect(state.ambiguousFills).toBe(1);
  });

  it('do not flag a minute in which both paths agree', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_000, 10_100, 9_400, 9_500), ...flatMinutes(3, 9_500)];
    const { state } = run(tape, [
      place(-1, { side: 'buy', type: 'market', qty: UNITS_100 }, { takeProfit: 10_500, stopLoss: 9_600 }),
    ]);
    expect(state.fills.every((f) => !f.ambiguous)).toBe(true);
  });

  it('wake when a resting entry fills, and a take-profit cannot fill in that minute unless both paths agree', () => {
    // A buy limit at 9,900 with a take-profit at 10,100. The minute ranges 9,850–10,200: if the low
    // came first the entry filled and then the target; if the high came first, only the entry did.
    // The poorer path is the one still holding at the 10,000 close.
    const tape = [...flatMinutes(2, 10_000), m(10_000, 10_200, 9_850, 10_000), ...flatMinutes(3, 10_000)];
    const { state } = run(tape, [
      place(-1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 9_900, id: 'e' }, { takeProfit: 10_100, stopLoss: 9_500 }),
    ], 4);
    expect(state.fills.map((f) => f.role)).toEqual(['entry']);
    expect(state.fills[0].ambiguous).toBe(true);
    expect(state.open.find((o) => o.id === 'e:tp')?.status).toBe('working');
  });

  it('let a stop-loss fill in its entry minute, which is the pessimistic reading', () => {
    const tape = [...flatMinutes(2, 10_000), m(10_000, 10_000, 9_400, 9_500), ...flatMinutes(3, 9_500)];
    const { state } = run(tape, [
      place(-1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 9_900 }, { takeProfit: 10_500, stopLoss: 9_600 }),
    ]);
    expect(state.fills.map((f) => [f.role, f.at])).toEqual([
      ['entry', 2],
      ['stop-loss', 2],
    ]);
  });

  it('are cancelled with their entry', () => {
    const sim = new Simulator({ market: testMarket(flatMinutes(10, 10_000), 10_000), starting: START, fees: FLAT_10BPS });
    sim.apply(place(-1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 9_000, id: 'e' }, { takeProfit: 9_500, stopLoss: 8_500 }));
    sim.advance(2);
    sim.apply({ kind: 'cancel', seq: nextSeq(), at: 2, orderId: 'e' });
    const state = sim.snapshot();
    expect(state.open).toHaveLength(0);
    expect(state.done.find((o) => o.id === 'e:sl')?.cancelReason).toBe('parent-canceled');
  });

  it('are rejected on the wrong side of the entry', () => {
    const { results } = run(flatMinutes(5, 10_000), [
      place(-1, { side: 'buy', type: 'market', qty: UNITS_100 }, { takeProfit: 9_500 }),
    ], 2);
    expect([...results.values()][0].rejected).toBe('bad-bracket');
  });
});

describe('scaling, flipping and reduce-only', () => {
  it('shrink a stop-loss to what is left after a partial close', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_000, 10_000, 9_500, 9_550), ...flatMinutes(2, 9_550)];
    const sim = new Simulator({ market: testMarket(tape, 10_000), starting: START, fees: FLAT_10BPS });
    sim.apply(place(-1, { side: 'buy', type: 'market', qty: UNITS_100 }, { stopLoss: 9_600 }));
    sim.advance(1);
    sim.apply({ kind: 'close-position', seq: nextSeq(), at: 1, fraction: 0.5 });
    expect(sim.snapshot().position.qty).toBe(UNITS_100 / 2);
    sim.finish();
    const state = sim.snapshot();
    const stop = state.fills.find((f) => f.role === 'stop-loss')!;
    expect(stop.qty).toBe(UNITS_100 / 2);
    expect(state.position.qty).toBe(0);
  });

  it('flip a long into a short, realising the long and cancelling its exits', () => {
    const tape = [...flatMinutes(2, 10_000), m(10_000, 10_200, 10_000, 10_200), ...flatMinutes(3, 10_200)];
    const sim = new Simulator({ market: testMarket(tape, 10_000), starting: START, fees: FLAT_10BPS });
    sim.apply(place(-1, { side: 'buy', type: 'market', qty: UNITS_100, id: 'long' }, { takeProfit: 11_000 }));
    sim.advance(3);
    sim.apply(place(3, { side: 'sell', type: 'market', qty: UNITS_100 * 1.5 }));
    const state = sim.snapshot();
    expect(state.position.qty).toBe(-UNITS_100 / 2);
    expect(state.position.basis).toBe(-(UNITS_100 / 2) * 10_200);
    expect(state.realized).toBe(UNITS_100 * 200);
    expect(state.done.find((o) => o.id === 'long:tp')?.cancelReason).toBe('position-closed');
    expect(state.trips).toHaveLength(1);
    expect(state.openTrip?.side).toBe('short');
  });

  it('reject a reduce-only order with nothing to reduce', () => {
    const { results } = run(flatMinutes(5, 10_000), [place(-1, { side: 'sell', type: 'limit', qty: UNITS_100, price: 10_500, reduceOnly: true })], 2);
    expect([...results.values()][0].rejected).toBe('reduce-only-no-position');
  });

  it('realise a short correctly', () => {
    const tape = [...flatMinutes(2, 10_000), m(10_000, 10_000, 9_000, 9_000), ...flatMinutes(3, 9_000)];
    const sim = new Simulator({ market: testMarket(tape, 10_000), starting: START, fees: NO_FEES });
    sim.apply(place(-1, { side: 'sell', type: 'market', qty: UNITS_100 }));
    sim.advance(3);
    sim.apply({ kind: 'close-position', seq: nextSeq(), at: 3, fraction: 1 });
    const state = sim.snapshot();
    expect(state.realized).toBe(UNITS_100 * 1_000);
    expect(state.cash).toBe(START + UNITS_100 * 1_000);
  });
});

describe('margin', () => {
  it('reject an order that would take exposure past 2× equity', () => {
    // 2,001 units at $100 is $200,100 against $100,000 of equity.
    const { results } = run(flatMinutes(5, 10_000), [place(-1, { side: 'buy', type: 'market', qty: 20_010_000 })], 2);
    expect([...results.values()][0].rejected).toBe('insufficient-buying-power');
  });

  it('count resting orders against buying power', () => {
    const { results } = run(flatMinutes(5, 10_000), [
      place(-1, { side: 'buy', type: 'limit', qty: 15_000_000, price: 9_500 }, { seq: 1 }),
      place(-1, { side: 'buy', type: 'limit', qty: 10_000_000, price: 9_500 }, { seq: 2 }),
    ], 2);
    expect(results.get(1)?.rejected).toBeUndefined();
    expect(results.get(2)?.rejected).toBe('insufficient-buying-power');
  });

  it('cancel a resting order that no longer fits when it fills', () => {
    // Long $190k, then a $10k bid at 95. When price falls to 95 equity is $90.5k, so the bid would
    // take exposure to $190.5k against a cap of $181k.
    const tape = [...flatMinutes(2, 10_000), m(10_000, 10_000, 9_500, 9_500), ...flatMinutes(3, 9_500)];
    const { state } = run(tape, [
      place(-1, { side: 'buy', type: 'market', qty: 19_000_000 }, { seq: 1 }),
      place(-1, { side: 'buy', type: 'limit', qty: 1_052_600, price: 9_500, id: 'late' }, { seq: 2 }),
    ], 5, NO_FEES);
    expect(state.done.find((o) => o.id === 'late')?.cancelReason).toBe('margin');
  });

  it('report how much a ticket can buy', () => {
    const sim = new Simulator({ market: testMarket(flatMinutes(5, 10_000), 10_000), starting: START, fees: NO_FEES });
    // $200,000 of exposure at $100 is 2,000 units.
    expect(sim.maxQty('buy', 10_000)).toBe(20_000_000);
  });

  it('liquidate a long that falls through maintenance, cancel its orders, and charge the fee', () => {
    // Long $200k at 2×. Liquidation is where equity is 25% of exposure: 100k + 2000(P − 100) = 0.25·2000P,
    // so P = 66.67.
    const fall = Array.from({ length: 40 }, (_, i) => {
      const price = 10_000 - i * 100;
      return m(price, price, price - 100, price - 100);
    });
    const { state } = run([...flatMinutes(2, 10_000), ...fall, ...flatMinutes(5, 6_000)], [
      place(-1, { side: 'buy', type: 'market', qty: 20_000_000 }, { seq: 1 }),
      place(-1, { side: 'sell', type: 'limit', qty: 20_000_000, price: 12_000, reduceOnly: true, id: 'tp' }, { seq: 2 }),
    ], undefined, NO_FEES);
    const liquidation = state.fills.find((f) => f.role === 'liquidation')!;
    expect(liquidation).toBeDefined();
    expect(liquidation.price).toBe(6_666);
    expect(liquidation.fee).toBe(Math.ceil((20_000_000 * 6_666 * MARGIN.liquidationFeeBps) / 10_000));
    expect(state.done.find((o) => o.id === 'tp')?.cancelReason).toBe('liquidation');
    expect(state.position.qty).toBe(0);
    expect(state.bankrupt).toBe(false);
  });

  it('liquidate at the open after a gap, and mark the account bankrupt when equity is gone', () => {
    const tape = [...flatMinutes(2, 10_000), m(16_000, 16_100, 15_900, 16_000), ...flatMinutes(3, 16_000)];
    const { state, results } = run(tape, [
      place(-1, { side: 'sell', type: 'market', qty: 20_000_000 }, { seq: 1 }),
      place(4, { side: 'buy', type: 'market', qty: 1_000_000 }, { seq: 2 }),
    ], undefined, NO_FEES);
    const liquidation = state.fills.find((f) => f.role === 'liquidation')!;
    expect(liquidation).toMatchObject({ at: 2, price: 16_000, gap: true });
    expect(state.bankrupt).toBe(true);
    expect(state.cash).toBe(0);
    expect(results.get(2)?.rejected).toBe('account-bankrupt');
  });
});

describe('limits on what an order may be', () => {
  it('reject an order under $5', () => {
    const { results } = run(flatMinutes(5, 10_000), [place(-1, { side: 'buy', type: 'market', qty: 400 })], 2);
    expect([...results.values()][0].rejected).toBe('min-notional');
  });

  it('reject an order larger than 5% of the last day of traded value', () => {
    const thin = flatMinutes(10, 10_000, 1); // one unit a minute
    const market = testMarket(thin, 10_000, { historyHours: [m(10_000, 10_000, 10_000, 10_000, 60)] });
    const { results } = simulate(market, [place(5, { side: 'buy', type: 'market', qty: UNITS_100 })], { starting: START, upTo: 8, fees: NO_FEES });
    expect([...results.values()][0].rejected).toBe('liquidity');
  });
});

describe('time', () => {
  it('cannot cancel what already filled inside the minute', () => {
    const tape = [...flatMinutes(3, 10_000), m(10_000, 10_000, 9_800, 9_900), ...flatMinutes(3, 9_900)];
    const { state, results } = run(tape, [
      place(-1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 9_850, id: 'bid' }, { seq: 1 }),
      { kind: 'cancel', seq: 2, at: 3, orderId: 'bid' },
    ]);
    expect(results.get(2)?.rejected).toBe('unknown-order');
    expect(state.fills.find((f) => f.orderId === 'bid')).toBeDefined();
  });

  it('flatten everything at the last close when the tape ends', () => {
    const tape = [...flatMinutes(5, 10_000), m(10_000, 10_300, 10_000, 10_300)];
    const { state } = run(tape, [
      place(-1, { side: 'buy', type: 'market', qty: UNITS_100 }, { seq: 1 }),
      place(-1, { side: 'buy', type: 'limit', qty: UNITS_100, price: 9_000, id: 'rest' }, { seq: 2 }),
    ]);
    expect(state.closed).toBe(true);
    expect(state.closeReason).toBe('end');
    expect(state.position.qty).toBe(0);
    expect(state.fills.at(-1)).toMatchObject({ role: 'flatten', at: 5, price: 10_300 });
    expect(state.done.find((o) => o.id === 'rest')?.cancelReason).toBe('session-end');
  });

  it('end early on request and refuse anything after', () => {
    const { state, results } = run(flatMinutes(10, 10_000), [
      place(-1, { side: 'buy', type: 'market', qty: UNITS_100 }, { seq: 1 }),
      { kind: 'end', seq: 2, at: 3 },
      place(5, { side: 'buy', type: 'market', qty: UNITS_100 }, { seq: 3 }),
    ]);
    expect(state.closeReason).toBe('user');
    expect(state.fills.at(-1)).toMatchObject({ role: 'flatten', at: 3 });
    expect(results.get(3)?.rejected).toBe('session-closed');
  });

  it('move a stop with modify, and refuse a move that would trigger it', () => {
    const sim = new Simulator({ market: testMarket(flatMinutes(10, 10_000), 10_000), starting: START, fees: NO_FEES });
    sim.apply(place(-1, { side: 'buy', type: 'market', qty: UNITS_100, id: 'e' }, { stopLoss: 9_500 }));
    sim.advance(1);
    expect(sim.apply({ kind: 'modify', seq: nextSeq(), at: 1, orderId: 'e:sl', stopPrice: 9_800 }).rejected).toBeUndefined();
    expect(sim.snapshot().open.find((o) => o.id === 'e:sl')?.stopPrice).toBe(9_800);
    expect(sim.apply({ kind: 'modify', seq: nextSeq(), at: 1, orderId: 'e:sl', stopPrice: 10_100 }).rejected).toBe('would-trigger-immediately');
  });
});

describe('the ledger', () => {
  it('keeps cash equal to starting balance plus realised minus fees, to the micro', () => {
    const tape = Array.from({ length: 200 }, (_, i) => {
      const price = 10_000 + Math.round(300 * Math.sin(i / 7));
      return m(price, price + 40, price - 40, price + 10);
    });
    const events: OrderEvent[] = [
      place(-1, { side: 'buy', type: 'market', qty: 3_333_333 }, { takeProfit: 10_250, stopLoss: 9_750, seq: 1 }),
      place(30, { side: 'sell', type: 'limit', qty: 2_000_000, price: 10_200 }, { seq: 2 }),
      place(60, { side: 'buy', type: 'stop', qty: 1_234_567, stopPrice: 10_200 }, { seq: 3 }),
      { kind: 'close-position', seq: 4, at: 120, fraction: 0.25 },
    ];
    const { state } = run(tape, events, tape.length, FEE_SCHEDULE);
    expect(state.cash).toBe(START + state.realized - state.fees);
    expect(state.fees).toBe(state.fills.reduce((sum, f) => sum + f.fee, 0));
    expect(state.realized).toBe(state.fills.reduce((sum, f) => sum + f.realized, 0));
    expect(state.trips.reduce((sum, t) => sum + t.net, 0)).toBe(state.realized - state.fees);
    expect(Number.isSafeInteger(state.cash)).toBe(true);
  });
});
