import { describe, expect, it } from 'vitest';
import type { Bar } from '@/core/bars';
import type { Engine, EngineInput, Verdict } from '@/core/engines/contract';
import { ENGINE_VERSION } from '@/core/versions';
import {
  BOTS,
  BOT_SPEC_HASH,
  botSpecDigest,
  closedBeyondAverage,
  runBot,
  runSeries,
  trailingExtreme,
  walkNativeExit,
  type BotSpec,
} from '@/core/bots';
import { demoMarket } from '@/core/trading/demo';
import { marketFromChart, type Market } from '@/core/trading/market';
import { simulate } from '@/core/trading/simulator';
import { MICROS } from '@/core/trading/instrument';
import { mirrorBar } from '@/core/normalize';
import { mulberry32 } from '@/core/random';
import { bar } from './helpers';

const START = 100_000 * MICROS;

/** A stand-in engine that always goes long with a stop `stopShare` below the close. */
function alwaysLong(stopShare: number): Engine {
  const engine: Engine = {
    code: 'ZERO',
    name: 'Always long',
    school: 'test',
    needs: 1,
    read(input: EngineInput): Verdict {
      const entry = input.entry;
      return {
        engine: 'ZERO',
        name: 'Always long',
        version: ENGINE_VERSION,
        direction: 'long',
        bracket: { stop: entry * (1 - stopShare), target: entry * (1 + 4 * stopShare) },
        exit: null,
        provenance: { stop: 'ours', target: 'ours' },
        conviction: null,
        rules: ['always'],
        annotations: [],
        candlesUsed: input.bars.length,
      };
    },
  };
  return engine;
}

describe('the bot spec', () => {
  it('is pinned by a hand-written hash', () => {
    expect(botSpecDigest()).toBe(BOT_SPEC_HASH);
  });

  it('covers every school on the council', () => {
    expect(BOTS.map((bot) => bot.code)).toEqual([
      'CHANNEL',
      'REVERSION',
      'REVERSION_H',
      'SWEEP',
      'PATTERN',
      'GEOMETRY',
      'TAPE',
      'ZERO',
    ]);
  });
});

describe('a school trading a market', () => {
  const market = demoMarket(3);

  it.each(BOTS.map((bot) => [bot.code, bot] as const))('%s is deterministic and its log replays to the same account', (_code, spec) => {
    const a = runBot(spec, market, START);
    const b = runBot(spec, market, START);
    expect(b.events).toEqual(a.events);
    expect(b.state).toEqual(a.state);
    const replayed = simulate(market, a.events, { starting: START, upTo: market.tape.length }).state;
    expect(replayed).toEqual(a.state);
  });

  it.each(BOTS.map((bot) => [bot.code, bot] as const))('%s never acts on a bar that has not closed', (_code, spec) => {
    // Rewrite everything after the close of tape hour 29. Every decision stamped at or before that
    // close must come out the same.
    const cutHour = 29;
    const cutMinute = (cutHour + 1) * 60 - 1;
    const other = demoMarket(77);
    const mutated: Market = {
      ...market,
      tape: [...market.tape.slice(0, cutMinute + 1), ...other.tape.slice(cutMinute + 1).map((b) => ({ ...b }))],
      indexedTape: [...market.indexedTape.slice(0, cutHour + 1), ...other.indexedTape.slice(cutHour + 1)],
    };
    const before = runBot(spec, market, START).events.filter((e) => e.at <= cutMinute);
    const after = runBot(spec, mutated, START).events.filter((e) => e.at <= cutMinute);
    expect(after).toEqual(before);
  });

  it('sizes a trade so the stop costs one percent of equity', () => {
    const spec: BotSpec = { code: 'ZERO', engine: alwaysLong(0.02), exit: 'bracket', takeProfit: true };
    const run = runBot(spec, market, START);
    const entry = run.state.fills[0];
    const order = run.events[0];
    if (order.kind !== 'place') throw new Error('first event should be a place');
    const risk = entry.qty * Math.abs(entry.price - (order.stopLoss as number));
    expect(risk).toBeLessThanOrEqual(START * 0.01);
    expect(risk).toBeGreaterThan(START * 0.0099);
  });

  it('caps a trade at twice equity however tight the stop', () => {
    const spec: BotSpec = { code: 'ZERO', engine: alwaysLong(0.0005), exit: 'bracket', takeProfit: true };
    const entry = runBot(spec, market, START).state.fills[0];
    expect(entry.notional).toBeLessThanOrEqual(2 * START);
    expect(entry.notional).toBeGreaterThan(1.9 * START);
  });

  it('carries equity from one market to the next', () => {
    const series = runSeries(BOTS[BOTS.length - 1], [demoMarket(1), demoMarket(2), demoMarket(3)], START);
    expect(series.runs).toHaveLength(3);
    expect(series.equity[0]).toBe(series.runs[0].state.cash);
    expect(series.runs[1].state.starting).toBe(series.equity[0]);
  });
});

describe('the council sees the same chart whether or not it was stored mirrored', () => {
  function chartSource(mirrored: boolean) {
    const rng = mulberry32(11);
    let price = 2.5;
    const minutes: Bar[] = [];
    for (let i = 0; i < (300 + 60) * 60; i++) {
      const o = price;
      const c = o * Math.exp((rng() - 0.5) * 0.004);
      minutes.push(bar(o, Math.max(o, c) * 1.0005, Math.min(o, c) * 0.9995, c, 100 + rng() * 50));
      price = c;
    }
    const hours: Bar[] = [];
    for (let i = 0; i < minutes.length; i += 60) {
      const s = minutes.slice(i, i + 60);
      hours.push(bar(s[0].o, Math.max(...s.map((b) => b.h)), Math.min(...s.map((b) => b.l)), s[59].c, s.reduce((a, b) => a + b.v, 0)));
    }
    const factor = 100 / hours[220].o;
    const store = (b: Bar): Bar => {
      const scaled = { o: b.o * factor, h: b.h * factor, l: b.l * factor, c: b.c * factor, v: b.v / 1000 };
      return mirrored ? mirrorBar(scaled) : scaled;
    };
    return marketFromChart({
      chartId: 'twin',
      symbol: 'TWINUSDT',
      decisionAt: '2022-03-01T10:00:00Z',
      indexFactor: factor,
      mirrored,
      volumeBase: 1000,
      leadInBars: hours.slice(220, 300).map(store),
      leadInExtra: hours.slice(0, 220).map(store),
      revealBars: hours.slice(300).map(store),
      path: minutes.slice(300 * 60).map(store),
      detail: minutes.slice(220 * 60).map(store),
    });
  }

  it.each(BOTS.map((bot) => [bot.code, bot] as const))('%s trades a mirrored chart exactly as the unmirrored one', (_code, spec) => {
    const plain = chartSource(false);
    const mirrored = chartSource(true);
    expect(mirrored.tape).toEqual(plain.tape);
    const a = runBot(spec, plain, START);
    const b = runBot(spec, mirrored, START);
    expect(b.events).toEqual(a.events);
  });
});

describe('native exits, corrected', () => {
  const rising = (count: number, from: number) =>
    Array.from({ length: count }, (_, i) => bar(from + i, from + i + 0.5, from + i - 0.5, from + i + 0.3));

  it('measure the Turtle extreme over the bars before the one being traded', () => {
    const bars = rising(12, 100);
    expect(trailingExtreme(bars, 10, true)).toBe(Math.min(...bars.slice(-10).map((b) => b.l)));
  });

  it('let the Turtle exit actually fire, as a trailing stop', () => {
    const history = rising(30, 70);
    const reveal = [...rising(15, 100), bar(114, 114, 101, 102), ...rising(10, 102)];
    const verdict = {
      direction: 'long',
      bracket: { stop: 90, target: 200 },
      exit: { kind: 'opposite-extreme', bars: 10, description: 'opposite 10-bar extreme' },
    } as unknown as Verdict;
    const outcome = walkNativeExit(verdict, 100, history, reveal)!;
    expect(outcome.reason).toBe('stop');
    expect(outcome.exitBar).toBe(15);
    // It trailed up to the prior ten bars' low rather than waiting for the original stop at 90.
    expect(outcome.r).toBeGreaterThan(0);
  });

  it('take Connors’ average over the whole history, so it can exit on the first bar', () => {
    const history = Array.from({ length: 10 }, () => bar(100, 101, 99, 100));
    expect(closedBeyondAverage([...history, bar(100, 104, 100, 103)], 5, true)).toBe(true);
    const verdict = {
      direction: 'long',
      bracket: { stop: 95, target: 110 },
      exit: { kind: 'close-beyond-ma', period: 5, description: 'close above the 5-bar mean' },
    } as unknown as Verdict;
    const outcome = walkNativeExit(verdict, 100, history, [bar(100, 104, 100, 103), ...rising(5, 103)])!;
    expect(outcome).toMatchObject({ reason: 'exit', exitBar: 0 });
  });
});
