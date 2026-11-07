/**
 * The schools a player can duel (docs/rules.md §23.7, §23.8).
 *
 * A school is a playbook read by a model, once per tape, offline: `scripts/school.ts` makes the
 * reads and stores them, and nothing here calls a model. What a school saw is stored in **indexed**
 * prices — the chart as the corpus keeps it, scaled to 100, unmirrored, with no symbol and no date
 * (§23.8) — so this module converts a stored read into the real instrument's prices before anyone
 * is shown it.
 *
 * A school's `version` names its playbook, prompt and model together. Changing any of them is a new
 * version with new reads; old reads are kept, never rewritten.
 */

import type { Market } from '@/core/trading/market';
import type { RoundIntent, SchoolReadView } from './types';

export interface SchoolSpec {
  code: string;
  name: string;
  version: string;
  /** One line, for lists. */
  blurb: string;
  /** The playbook the model is given, word for word. */
  playbook: string;
}

export const GAME_SCHOOLS: SchoolSpec[] = [
  {
    code: 'price-action',
    name: 'Price Action',
    version: 'price-action-1',
    blurb: 'Trend structure, support and resistance, breakouts and retests. No indicators.',
    playbook: [
      'You trade price action. You read market structure from the candles alone: the sequence of swing highs and swing lows, where price has turned before, and where it is now relative to those turns.',
      '',
      'Your setups:',
      '1. Trend continuation. In an uptrend (higher highs and higher lows) buy a pullback that holds above the last higher low, or a retest of a broken resistance from above. In a downtrend, the mirror image.',
      '2. Breakout. When price compresses beneath a level it has tested several times, a decisive close through that level can be bought (or sold, below support), with the stop back inside the range.',
      '3. Failed break. When price pokes through a well-tested level and closes back inside, trade back toward the other side of the range.',
      '',
      'Your rules:',
      '- Every trade has a stop at the level that proves you wrong: beyond the swing or the level the setup depends on, never an arbitrary distance.',
      '- Every trade has a target at the next level that price is likely to react to.',
      '- You want at least 1.5 units of reward for each unit of risk. If the nearest sensible target does not give you that, you do not take the trade.',
      '- If the chart is a mess — no clear structure, price in the middle of a range, levels everywhere — you sit out and say why. Sitting out is a position.',
    ].join('\n'),
  },
];

export function schoolByCode(code: string): SchoolSpec | null {
  return GAME_SCHOOLS.find((school) => school.code === code) ?? null;
}

/** A level a school drew, as stored: an indexed price. */
export interface StoredLevel {
  name: string;
  price: number;
  kind: 'support' | 'resistance' | 'level';
}

/** A school's read, as stored beside its intent. */
export interface StoredSchoolRead {
  thesis: string;
  reasoning: string;
  levels: StoredLevel[];
  sitOutReason: string | null;
}

/**
 * An indexed price as the real instrument's price. The school read the stored bars unmirrored
 * (`Market.indexedHistory`), so the only transform left to undo is the scale.
 */
export function realPrice(indexed: number, market: Pick<Market, 'indexFactor'>): number {
  return indexed / market.indexFactor;
}

/** A school's stored intent, in the real instrument's prices. */
export function schoolIntent(intent: RoundIntent, market: Pick<Market, 'indexFactor'>): RoundIntent {
  if (intent.kind === 'sit-out') return intent;
  const real = (price: number | undefined) => (price === undefined ? undefined : realPrice(price, market));
  return {
    ...intent,
    price: real(intent.price),
    takeProfit: real(intent.takeProfit),
    stopLoss: real(intent.stopLoss),
  };
}

export function schoolReadView(read: StoredSchoolRead, market: Pick<Market, 'indexFactor'>): SchoolReadView {
  return {
    thesis: read.thesis,
    reasoning: read.reasoning,
    levels: read.levels.map((level) => ({ ...level, price: realPrice(level.price, market) })),
    sitOutReason: read.sitOutReason,
  };
}
