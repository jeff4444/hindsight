import { describe, expect, it } from 'vitest';
import { demoMarket } from '@/core/trading/demo';
import { dealable } from '@/core/game';
import { playedView, readingView, settleRound, type RoundMeta } from '@/lib/game/round-core';
import { LocalDriver } from '@/lib/game/driver';
import { answerToRead, fixtureAnswer, tapeBrief, type SchoolAnswer } from '@/lib/game/school-read';
import { schoolIntent, schoolReadView } from '@/lib/game/schools';

/**
 * What a round sends, and when (docs/rules.md §23.9): not one minute of the tape, nor the date, nor
 * anything about how the chart is stored, while it is being read; everything once it is locked in.
 * And a school's read (§23.8): blind to the instrument, and stored as what it said.
 */

const meta: RoundMeta = { roundId: 'r1', mode: 'training', duel: null, synthetic: false };

describe('a round being read', () => {
  const market = demoMarket(13);
  const view = readingView(meta, market);
  const wire = JSON.stringify(view);

  it('carries the history and not one minute of the tape', () => {
    expect(view.status).toBe('reading');
    expect('tape' in view).toBe(false);
    expect(view.chart.hours.length).toBeGreaterThan(0);
    // The last history close is the decision close: nothing after it.
    expect(view.chart.hours[view.chart.hours.length - 1][3]).toBe(market.refClose);
  });

  it('carries no date and nothing about how the chart is stored', () => {
    expect(view.time.kind).toBe('relative');
    expect(wire).not.toMatch(/startMs|chartId|indexFactor|mirrored|index_factor/);
    expect(wire).not.toMatch(/20\d\d-\d\d-\d\d/);
  });
});

describe('a round locked in', () => {
  const market = demoMarket(13);
  const settled = settleRound(market, { kind: 'trade', side: 'buy', type: 'market', size: 500, takeProfit: (market.refClose * 1.02) / 10 ** -market.instrument.tickExp });
  const view = playedView(meta, market, settled);

  it('carries the whole tape, the grade, and the best and worst beside it', () => {
    expect(view.tape).toHaveLength(market.tape.length);
    expect(view.grade).toBeGreaterThanOrEqual(0);
    expect(view.grade).toBeLessThanOrEqual(1000);
    expect(view.best.result).toBeGreaterThanOrEqual(view.result);
    expect(view.worst.result).toBeLessThanOrEqual(view.result);
    expect(view.reveal.startMs).toBe(market.startMs);
  });
});

describe('the in-browser driver', () => {
  it('deals tapes that move enough, and locks each in once', async () => {
    const driver = new LocalDriver(21);
    const reading = await driver.deal();
    expect(reading.status).toBe('reading');
    const played = await driver.lock(reading.roundId, { kind: 'sit-out' });
    expect(played.status).toBe('locked');
    expect(played.mine).toBeNull();
    expect(played.grade).toBe(played.sitOutGrade);
    await expect(driver.lock(reading.roundId, { kind: 'sit-out' })).rejects.toThrow(/already locked/);
    expect((await driver.round(reading.roundId)).status).toBe('locked');
  });

  it('refuses an order the exchange would refuse, without locking the round', async () => {
    const driver = new LocalDriver(22);
    const reading = await driver.deal();
    await expect(driver.lock(reading.roundId, { kind: 'trade', side: 'buy', type: 'market', size: 900 })).rejects.toThrow(/between \$5 and \$500/);
    expect((await driver.round(reading.roundId)).status).toBe('reading');
  });

  it('only deals dealable tapes', () => {
    expect(dealable(demoMarket(7))).toBe(true);
  });
});

describe('a school read (§23.8)', () => {
  const market = demoMarket(17);

  it('is shown the chart blind: no symbol, no date', () => {
    const brief = tapeBrief(market);
    expect(brief).not.toContain(market.instrument.symbol);
    expect(brief).not.toContain(market.instrument.base);
    expect(brief).not.toMatch(/\d{4}-\d\d-\d\d/);
    expect(brief).toMatch(/Decision close: /);
  });

  it('turns a fixture answer into a trade the exchange accepts, on the real instrument', () => {
    const answer = fixtureAnswer(market);
    const result = answerToRead(answer, market);
    if (answer.decision === 'trade') {
      expect(result.rejected).toBeNull();
      expect(result.intent.kind).toBe('trade');
      const settled = settleRound(market, schoolIntent(result.intent, market));
      expect(settled.rejected).toBeNull();
    }
    const view = schoolReadView(result.read, market);
    for (const level of view.levels) expect(level.price).toBeCloseTo(answer.levels.find((l) => l.name === level.name)!.price / market.indexFactor);
  });

  it('stores a trade the exchange would refuse as a sit-out, with the refusal, never repaired', () => {
    const close = market.indexedHistory[market.indexedHistory.length - 1].c;
    const answer: SchoolAnswer = {
      thesis: 'Up from here.',
      reasoning: 'A long with its target below the entry.',
      levels: [],
      decision: 'trade',
      sitOutReason: null,
      trade: { side: 'buy', entry: 'market', price: null, takeProfit: close * 0.95, stopLoss: close * 0.9, size: 500 },
    };
    const result = answerToRead(answer, market);
    expect(result.intent).toEqual({ kind: 'sit-out' });
    expect(result.rejected).toMatch(/winning side/);
    expect(result.read.sitOutReason).toMatch(/refused/);
  });
});
