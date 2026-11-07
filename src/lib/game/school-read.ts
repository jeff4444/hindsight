/**
 * A school's read of a tape: what it is shown, what it must answer, and how an answer becomes a
 * stored round (docs/rules.md §23.7, §23.8).
 *
 * Pure, so the script that calls the model (`scripts/school.ts`) and the tests share it. The model
 * sees the chart the way §23.8 says it must: the stored bars, indexed to 100 and unmirrored, with
 * the weekday and time of day but no symbol and no date — the same history the player reads, and
 * nothing after the decision close.
 */

import { z } from 'zod';
import type { Bar } from '@/core/bars';
import type { Market } from '@/core/trading/market';
import { ROUND_STAKE_USDT } from '@/core/game';
import { intentOrder } from './round-core';
import { schoolIntent, type SchoolSpec, type StoredSchoolRead } from './schools';
import type { RoundIntent } from './types';

/** What the model must return. Prices are on the indexed scale it was shown. */
export const ReadSchema = z.object({
  thesis: z.string().describe('One sentence: what you see and what you expect.'),
  reasoning: z.string().describe('A short paragraph or two a learner can follow: the structure, the levels, why this trade or why none.'),
  levels: z
    .array(
      z.object({
        name: z.string().describe('Short and specific, e.g. "Range high" or "Last higher low".'),
        price: z.number(),
        kind: z.enum(['support', 'resistance', 'level']),
      }),
    )
    .describe('The levels your read depends on, at most six. Your prose refers to them by name, never by price.'),
  decision: z.enum(['trade', 'sit-out']),
  sitOutReason: z.string().nullable().describe('Why there is no trade, when you sit out; otherwise null.'),
  trade: z
    .object({
      side: z.enum(['buy', 'sell']),
      entry: z.enum(['market', 'limit', 'stop']),
      price: z.number().nullable().describe('The limit price or stop trigger; null for a market entry.'),
      takeProfit: z.number(),
      stopLoss: z.number(),
      size: z.number().describe(`Dollars of notional, between 5 and ${ROUND_STAKE_USDT}.`),
    })
    .nullable(),
});

export type SchoolAnswer = z.infer<typeof ReadSchema>;

export interface SchoolReadResult {
  /** The school's round, in indexed prices, as stored. */
  intent: RoundIntent;
  read: StoredSchoolRead;
  /** Why an answer was played as a sit-out, when the exchange refused its trade. */
  rejected: string | null;
}

/** The instructions, the same for every tape: cacheable, and the playbook word for word. */
export function schoolSystemPrompt(school: SchoolSpec): string {
  return [
    `You are ${school.name}, a school of trading in a game called Hindsight. Players read the same chart you do, place one trade, and are graded against the best and worst trade the next 60 hours allowed. You read first, and after the tape plays your reasoning is shown to the player as a lesson, so write for someone learning to read charts.`,
    '',
    'The game:',
    `- You get one trade on a $${ROUND_STAKE_USDT} stake, or you sit out. No leverage.`,
    '- The entry is a market order at the last close, or a resting limit or stop that can fill any time in the next 60 hours.',
    '- A take-profit and a stop-loss ride with it. Nothing can be changed once placed; a trade still open after 60 hours is closed at the last price.',
    '- Fees are 0.1% a side, and stops slip a little.',
    '',
    'The chart is shown on an index scale: prices are scaled so the series sits around 100, and the instrument and the date are withheld. Read structure and levels from the numbers as they are. Give every price in your answer on that same scale.',
    '',
    'Your playbook:',
    school.playbook,
    '',
    'Answer in the JSON schema you are given. In the thesis and the reasoning, refer to levels by their names and never write a price or any number from the index scale, not even a round one like "the 100 area": the player sees the real instrument at its real prices, so an index number would contradict the chart beside your words. Prices belong only in the levels and the trade.',
  ].join('\n');
}

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function table(bars: readonly Bar[], label: (i: number) => string): string {
  const digits = (value: number) => value.toFixed(value >= 10 ? 3 : 4);
  return bars.map((bar, i) => `${label(i)},${digits(bar.o)},${digits(bar.h)},${digits(bar.l)},${digits(bar.c)},${Math.round(bar.v)}`).join('\n');
}

/**
 * The tape as the model is shown it: the hourly history, and the last day again in 15-minute
 * candles built from the history minutes, all on the stored index and unmirrored.
 */
export function tapeBrief(market: Market): string {
  const hours = market.indexedHistory;
  const { weekday, minuteOfDay } = market.start;
  const at = (hoursBefore: number) => {
    const total = weekday * 1440 + minuteOfDay - hoursBefore * 60;
    const wrapped = ((total % 10080) + 10080) % 10080;
    const day = DAY[Math.floor(wrapped / 1440)];
    const minute = wrapped % 1440;
    return `${day} ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  };

  // The real minutes are in ticks; the school reads indexed prices, so rescale them by the ratio of
  // the indexed decision close to the real one. Unmirrored on both sides, so the ratio is the scale.
  const scale = hours[hours.length - 1].c / market.refClose;
  const minutes = market.historyMinutes.slice(-24 * 60);
  const quarters: Bar[] = [];
  for (let i = 0; i + 15 <= minutes.length; i += 15) {
    const slice = minutes.slice(i, i + 15);
    quarters.push({
      o: slice[0].o * scale,
      h: Math.max(...slice.map((b) => b.h)) * scale,
      l: Math.min(...slice.map((b) => b.l)) * scale,
      c: slice[slice.length - 1].c * scale,
      v: slice.reduce((sum, b) => sum + b.v, 0),
    });
  }

  return [
    `The decision is at the close of the last hourly candle. The next 60 hours start ${at(0)} (weekday and UTC time).`,
    '',
    `Hourly candles, oldest first (${hours.length}). Columns: opened, open, high, low, close, volume.`,
    table(hours, (i) => at(hours.length - i)),
    '',
    quarters.length > 0 ? `The last ${quarters.length / 4} hours again in 15-minute candles, oldest first.` : '',
    quarters.length > 0 ? table(quarters, (i) => at((quarters.length - i) / 4)) : '',
    '',
    `Decision close: ${hours[hours.length - 1].c.toFixed(4)}. Place your trade or sit out.`,
  ].join('\n');
}

/**
 * An answer as a stored read. A trade the exchange would refuse — a stop already through the
 * market, a target on the wrong side — is stored as a sit-out with the refusal, never repaired
 * (§23.8): a school is graded on what it said.
 */
export function answerToRead(answer: SchoolAnswer, market: Market): SchoolReadResult {
  const read: StoredSchoolRead = {
    thesis: answer.thesis,
    reasoning: answer.reasoning,
    levels: answer.levels.slice(0, 6).map((level) => ({ name: level.name, price: level.price, kind: level.kind })),
    sitOutReason: answer.decision === 'sit-out' ? (answer.sitOutReason ?? 'No trade here.') : null,
  };
  if (answer.decision === 'sit-out' || !answer.trade) {
    return { intent: { kind: 'sit-out' }, read: { ...read, sitOutReason: read.sitOutReason ?? 'No trade here.' }, rejected: null };
  }
  const trade = answer.trade;
  const intent: RoundIntent = {
    kind: 'trade',
    side: trade.side,
    type: trade.entry,
    size: Math.min(ROUND_STAKE_USDT, Math.max(5, trade.size)),
    price: trade.entry === 'market' ? undefined : (trade.price ?? undefined),
    takeProfit: trade.takeProfit,
    stopLoss: trade.stopLoss,
  };
  const checked = intentOrder(market, schoolIntent(intent, market));
  if ('error' in checked) {
    return { intent: { kind: 'sit-out' }, read: { ...read, sitOutReason: `The order was refused: ${checked.error}` }, rejected: checked.error };
  }
  return { intent, read, rejected: null };
}

/**
 * A stand-in reader for local development, so a school duel can be played without a model:
 * follow the last day's direction, stop beyond its extreme, target twice the risk. It is labelled
 * as a fixture in every read it writes, and `scripts/school.ts` refuses to store it anywhere but a
 * local database.
 */
export function fixtureAnswer(market: Market): SchoolAnswer {
  const hours = market.indexedHistory;
  const day = hours.slice(-24);
  const close = hours[hours.length - 1].c;
  const high = Math.max(...day.map((b) => b.h));
  const low = Math.min(...day.map((b) => b.l));
  const up = close > day[0].o;
  const stop = up ? low * 0.999 : high * 1.001;
  const risk = Math.abs(close - stop);
  if (!(risk > 0) || risk / close > 0.08) {
    return {
      thesis: 'No clean day to lean on.',
      reasoning: 'The last day has no usable extreme to put a stop behind, so there is no trade with a defined risk. (Fixture school: a local stand-in for the model.)',
      levels: [],
      decision: 'sit-out',
      sitOutReason: 'No defined risk.',
      trade: null,
    };
  }
  return {
    thesis: up ? 'The last day closed up; ride it with a stop under its low.' : 'The last day closed down; ride it with a stop over its high.',
    reasoning: `Fixture school, a local stand-in for the model: it follows the direction of the last 24 hours, puts its stop beyond the ${up ? 'Day low' : 'Day high'} and its target twice as far away as the risk.`,
    levels: [
      { name: 'Day high', price: high, kind: 'resistance' },
      { name: 'Day low', price: low, kind: 'support' },
    ],
    decision: 'trade',
    sitOutReason: null,
    trade: {
      side: up ? 'buy' : 'sell',
      entry: 'market',
      price: null,
      takeProfit: up ? close + 2 * risk : close - 2 * risk,
      stopLoss: stop,
      size: ROUND_STAKE_USDT,
    },
  };
}
