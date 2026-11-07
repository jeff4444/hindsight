/**
 * The game's wire types: what the browser sends and what it is sent (docs/rules.md §23).
 *
 * Prices on the wire are real prices in the quote currency and money is USDT, as in the trading
 * terminal's views; bars are `WireBar`s in ticks, scaled by the instrument's tick on arrival.
 */

import type { InstrumentView, SessionTime, WireBar } from '@/lib/trading/types';
import type { RoundExit } from '@/core/game/round';

export type { RoundExit };

export type RoundMode = 'training' | 'duel';

/** What a player locks in. `price` is a limit's price or a stop's trigger. */
export type RoundIntent =
  | { kind: 'sit-out' }
  | {
      kind: 'trade';
      side: 'buy' | 'sell';
      type: 'market' | 'limit' | 'stop';
      /** USDT of notional, at most the stake. */
      size: number;
      price?: number;
      takeProfit?: number;
      stopLoss?: number;
    };

export interface RoundChart {
  hours: WireBar[];
  minutes: WireBar[];
  /** The decision close, ticks. */
  refClose: number;
}

/** Who a duel round is against, as the screen names them. */
export interface OpponentLabel {
  kind: 'player' | 'school';
  name: string;
  /** A school's code, for linking to its page. */
  code?: string;
}

export interface RoundDuelContext {
  code: string;
  /** Zero-based tape number within the duel. */
  index: number;
  tapes: number;
  opponent: OpponentLabel;
}

interface RoundBase {
  roundId: string;
  mode: RoundMode;
  instrument: InstrumentView;
  chart: RoundChart;
  time: SessionTime;
  /** USDT. */
  stake: number;
  duel: RoundDuelContext | null;
  /** True on the demo's synthetic markets, which are never a real chart. */
  synthetic: boolean;
}

export interface RoundReading extends RoundBase {
  status: 'reading';
}

/** A trade as the review draws it. Prices real, money USDT. */
export interface TradeLine {
  direction: 'long' | 'short';
  entryType: 'market' | 'limit' | 'stop';
  /** What was asked for: the entry's own price (null for a market order), the bracket, the size. */
  order: { price: number | null; takeProfit: number | null; stopLoss: number | null; size: number };
  /** Where it filled. Null when the entry never filled. */
  entry: { at: number; price: number } | null;
  exit: { at: number; price: number; reason: RoundExit } | null;
  /** The round's value at the end of the tape. */
  result: number;
  pnl: number;
  fees: number;
}

/** What a school saw, for the review (§23.7). */
export interface SchoolReadView {
  thesis: string;
  reasoning: string;
  /** Prices are real. */
  levels: { name: string; price: number; kind: 'support' | 'resistance' | 'level' }[];
  sitOutReason: string | null;
}

export interface OpponentRound {
  label: OpponentLabel;
  /** False while the opponent has not played this tape. */
  played: boolean;
  trade: TradeLine | null;
  grade: number | null;
  /** Their result, USDT. */
  result: number | null;
  read: SchoolReadView | null;
}

export interface RoundPlayed extends RoundBase {
  status: 'locked';
  /** The whole tape. Only ever sent once the round is locked in. */
  tape: WireBar[];
  intent: RoundIntent;
  /** Null when the round sat out. */
  mine: TradeLine | null;
  /** USDT. */
  result: number;
  grade: number;
  best: TradeLine;
  worst: TradeLine;
  /** What sitting out would have graded on this tape. */
  sitOutGrade: number;
  /** Why an order was played as a sit-out instead, if it was. */
  rejected: string | null;
  /** The instrument's real calendar, released with the result. */
  reveal: { startMs: number };
  opponent: OpponentRound | null;
}

export type RoundView = RoundReading | RoundPlayed;

/* ------------------------------------------------------------------ duels */

export interface DuelTapeView {
  index: number;
  /** Your grade and theirs, once each is played. Theirs only once yours is. */
  mine: number | null;
  theirs: number | null;
  /** Damage this tape dealt, once both have played it. */
  damage: number | null;
  /** Who took it: you, them, or nobody. */
  to: 'me' | 'them' | null;
  /** The round you played or are playing on it. */
  roundId: string | null;
  /** The instrument, once you have played it. */
  display: string | null;
}

export interface DuelView {
  code: string;
  kind: 'player' | 'school';
  status: 'waiting' | 'active' | 'over';
  /** Your seat's health and theirs. */
  health: { me: number; them: number };
  maxHealth: number;
  me: { name: string };
  opponent: OpponentLabel | null;
  tapes: DuelTapeView[];
  tapeLimit: number;
  /** The tape you play next, or null when you are waiting or it is over. */
  next: number | null;
  /** Whether you are waiting on the other seat to play a tape you have played. */
  waitingOnThem: boolean;
  winner: 'me' | 'them' | 'draw' | null;
  knockout: boolean;
  /** Whether the viewer sits in this duel, or is looking at an invitation. */
  seated: boolean;
  createdAt: string;
}

export interface SchoolView {
  code: string;
  name: string;
  playbook: string;
  version: string;
  /** Tapes it has read, and how many it traded. */
  reads: number;
  trades: number;
  /** Its mean grade on the tapes it traded, and what sitting out graded on the same tapes. */
  meanGrade: number | null;
  sitOutMean: number | null;
}
