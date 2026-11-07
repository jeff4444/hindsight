import { describe, expect, it } from 'vitest';
import { demoMarket } from '@/core/trading/demo';
import { halfSpread, FEE_SCHEDULE } from '@/core/trading/costs';
import { mulberry32 } from '@/core/random';
import {
  DUEL_HEALTH,
  ROUND_STAKE,
  biggestMoves,
  checkRound,
  damage,
  dealable,
  grade,
  referencePrice,
  resolveRound,
  roundQty,
  standDuel,
  tapeExtremes,
  type RoundOrder,
} from '@/core/game';
import { flatMinutes, m, testMarket } from './trading/fixtures';

/**
 * The game's arithmetic, pinned to the numbers docs/rules.md §23 prints, and the property the grade
 * rests on: nothing a round can lock in lands outside the best and worst the tape allowed.
 */

const usd = (dollars: number) => Math.round(dollars * 1_000_000);

describe('the grade (§23.3)', () => {
  it('reproduces the worked example', () => {
    expect(grade(usd(625), usd(650), usd(350))).toBe(917);
    expect(grade(usd(400), usd(650), usd(350))).toBe(167);
  });

  it('runs from 0 at the worst to 1000 at the best', () => {
    expect(grade(usd(350), usd(650), usd(350))).toBe(0);
    expect(grade(usd(650), usd(650), usd(350))).toBe(1000);
    expect(grade(usd(500), usd(650), usd(350))).toBe(500);
  });

  it('puts everything at the middle on a tape with no range', () => {
    expect(grade(usd(500), usd(500), usd(500))).toBe(500);
  });
});

describe('damage (§23.6)', () => {
  it('matches the table at k = 2', () => {
    const at = (gap: number) => damage(0, gap * 1000);
    expect([0.1, 0.25, 0.5, 0.75, 0.9, 1].map(at)).toEqual([35, 102, 269, 545, 790, 1000]);
  });

  it('matches the k = 3 column too', () => {
    const at = (gap: number) => damage(0, gap * 1000, 3);
    expect([0.1, 0.25, 0.5, 0.75, 0.9, 1].map(at)).toEqual([18, 59, 182, 445, 727, 1000]);
  });

  it('is the same whichever seat graded higher, and nothing for equal grades', () => {
    expect(damage(917, 167)).toBe(damage(167, 917));
    expect(damage(917, 167)).toBe(545);
    expect(damage(400, 400)).toBe(0);
  });
});

describe('a duel (§23.6)', () => {
  it('takes damage off the lower grade only', () => {
    const standing = standDuel([[917, 167]]);
    expect(standing.health).toEqual([DUEL_HEALTH, 455]);
    expect(standing.resolved[0]).toMatchObject({ to: 1, damage: 545 });
    expect(standing.over).toBe(false);
    expect(standing.current).toBe(1);
  });

  it('ends at a knockout, and ignores anything played after it', () => {
    const standing = standDuel([
      [900, 150],
      [900, 150],
      [100, 900],
    ]);
    expect(standing.knockout).toBe(true);
    expect(standing.over).toBe(true);
    expect(standing.winner).toBe(0);
    expect(standing.resolved).toHaveLength(2);
    expect(standing.health[1]).toBe(0);
  });

  it('ends after ten tapes, and the healthier seat wins', () => {
    const tapes = Array.from({ length: 10 }, (_, i) => [500, i === 3 ? 400 : 500] as [number, number]);
    const standing = standDuel(tapes);
    expect(standing.over).toBe(true);
    expect(standing.knockout).toBe(false);
    expect(standing.winner).toBe(0);
  });

  it('is a draw when ten tapes leave both seats level', () => {
    const tapes = Array.from({ length: 10 }, () => [612, 612] as [number, number]);
    expect(standDuel(tapes).winner).toBe('draw');
  });

  it('waits on a tape until both seats have played it', () => {
    const standing = standDuel([
      [700, 600],
      [800, null],
      [800, null],
    ]);
    expect(standing.resolved).toHaveLength(1);
    expect(standing.current).toBe(1);
    expect(standing.over).toBe(false);
    expect(standing.winner).toBeNull();
  });

  it('is the same damage in any order, short of a knockout', () => {
    const a = standDuel([
      [700, 400],
      [600, 550],
      [300, 500],
    ]);
    const b = standDuel([
      [300, 500],
      [700, 400],
      [600, 550],
    ]);
    expect(a.health).toEqual(b.health);
  });
});

describe('sizing a round (§23.1)', () => {
  const market = demoMarket(11);

  it('never spends more than the size on a market entry', () => {
    const order: RoundOrder = { side: 'buy', type: 'market', size: ROUND_STAKE };
    const qty = roundQty(market, order);
    expect(qty * referencePrice(market, order)).toBeLessThanOrEqual(ROUND_STAKE);
    expect((qty + 1) * referencePrice(market, order)).toBeGreaterThan(ROUND_STAKE);
  });

  it('refuses more than the stake', () => {
    expect(checkRound(market, { side: 'buy', type: 'market', size: ROUND_STAKE + 1 })).toEqual({ ok: false, reason: 'size' });
  });

  it('refuses a stop that would trigger the moment it is placed', () => {
    const stop = market.refClose - 10;
    expect(checkRound(market, { side: 'buy', type: 'stop', size: ROUND_STAKE, stopPrice: stop })).toEqual({
      ok: false,
      reason: 'would-trigger-immediately',
    });
  });

  it('sits out at exactly the stake', () => {
    expect(resolveRound(market, null).end).toBe(ROUND_STAKE);
  });

  it('cannot lose more than the stake: a short is closed when the price doubles', () => {
    const tape = [...flatMinutes(5, 10_000), m(10_000, 25_000, 10_000, 25_000), ...flatMinutes(5, 25_000)];
    const doubling = testMarket(tape, 10_000);
    const outcome = resolveRound(doubling, { side: 'sell', type: 'market', size: ROUND_STAKE });
    expect(outcome.exit).toBe('liquidation');
    expect(outcome.end).toBe(0);
  });
});

describe('the best and the worst a tape allowed (§23.2)', () => {
  const seeds = [3, 7, 11, 19];

  it('measures the biggest rise and fall from earlier lows and highs to later ones', () => {
    const tape = [m(100, 101, 90, 95), m(95, 120, 95, 118), m(118, 118, 100, 101)];
    const { rise, fall } = biggestMoves({ tape, refClose: 100 });
    expect(rise).toMatchObject({ from: 0, to: 1, fromPrice: 90, toPrice: 120 });
    expect(rise.fraction).toBeCloseTo(120 / 90 - 1);
    expect(fall).toMatchObject({ from: 1, to: 2, fromPrice: 120, toPrice: 100 });
  });

  for (const seed of seeds) {
    describe(`demo market ${seed}`, () => {
      const market = demoMarket(seed);
      const { best, worst } = tapeExtremes(market);

      it('builds both as real trades that fill', () => {
        expect(best.outcome.filled).toBe(true);
        expect(worst.outcome.filled).toBe(true);
        expect(best.outcome.end).toBeGreaterThan(ROUND_STAKE);
        expect(worst.outcome.end).toBeLessThan(ROUND_STAKE);
      });

      it('grades sitting out a little above the middle', () => {
        if (!dealable(market)) return;
        const sitOut = grade(ROUND_STAKE, best.outcome.end, worst.outcome.end);
        expect(sitOut).toBeGreaterThanOrEqual(500);
        expect(sitOut).toBeLessThan(600);
      });

      it('holds every order a round can place between them', () => {
        const rng = mulberry32(seed * 7919);
        const hs = halfSpread(market.refClose, FEE_SCHEDULE);
        const near = (spread: number) => Math.max(1, Math.round(market.refClose * (1 + (rng() * 2 - 1) * spread)));
        let played = 0;
        for (let i = 0; i < 160; i++) {
          const side = rng() < 0.5 ? 'buy' : 'sell';
          const type = (['market', 'limit', 'stop'] as const)[Math.floor(rng() * 3)];
          const order: RoundOrder = { side, type, size: Math.round(ROUND_STAKE * (0.05 + rng() * 0.95)) };
          if (type === 'limit') order.price = near(0.03);
          if (type === 'stop') order.stopPrice = side === 'buy' ? market.refClose + hs + Math.round(rng() * market.refClose * 0.03) : market.refClose - hs - Math.round(rng() * market.refClose * 0.03);
          const entry = order.price ?? order.stopPrice ?? market.refClose;
          if (rng() < 0.7) order.takeProfit = side === 'buy' ? entry + Math.round(rng() * entry * 0.06) + 2 : entry - Math.round(rng() * entry * 0.06) - 2;
          if (rng() < 0.7) order.stopLoss = side === 'buy' ? entry - Math.round(rng() * entry * 0.06) - 2 : entry + Math.round(rng() * entry * 0.06) + 2;
          if (!checkRound(market, order).ok) continue;
          played += 1;
          const end = resolveRound(market, order).end;
          expect(end).toBeLessThanOrEqual(best.outcome.end);
          expect(end).toBeGreaterThanOrEqual(worst.outcome.end);
        }
        expect(played).toBeGreaterThan(60);
      });

      it('cannot be beaten by nudging the best or the worst a few ticks', () => {
        const nudges = [-3, -2, -1, 1, 2, 3];
        for (const extreme of [best, worst]) {
          const { order } = extreme;
          const keys = (['price', 'stopPrice', 'takeProfit', 'stopLoss'] as const).filter((key) => order[key] !== undefined);
          for (const key of keys) {
            for (const nudge of nudges) {
              const variant = { ...order, [key]: (order[key] as number) + nudge };
              if (!checkRound(market, variant).ok) continue;
              const end = resolveRound(market, variant).end;
              expect(end).toBeLessThanOrEqual(best.outcome.end);
              expect(end).toBeGreaterThanOrEqual(worst.outcome.end);
            }
          }
        }
      });
    });
  }
});
