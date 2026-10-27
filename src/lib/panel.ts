/**
 * The Panel: the engine roster, as characters.
 *
 * Every engine is a faithful implementation of one school (or, where it says so, of our reading of
 * one). On screen they were a row of unlabelled arrows with their names in hover tooltips, which a
 * phone cannot hover. A persona is the same engine with a face: a name a player can remember, a
 * colour that ties its bracket on the chart to its avatar, and one line that says how it trades.
 *
 * The persona is presentation only. The engine code, its version, its rules and its provenance are
 * untouched, and the dossier on /learn/methods still cites the school and the text. Where an engine
 * is ours rather than the school's, `ours` says so and the dossier prints it.
 *
 * Colours are hex because they are also drawn on the chart canvas (lightweight-charts cannot parse
 * oklch). Each sits around L 0.78 on the dark stage and away from the candle mint and coral and the
 * hindsight gold, so a persona's bracket never reads as the player's or the best one.
 */

import type { EngineCode } from '@/core/engines/contract';

export type PersonaGlyph =
  | 'breakout'
  | 'dip'
  | 'v'
  | 'reticle'
  | 'peaks'
  | 'zigzag'
  | 'bars'
  | 'coin';

export interface Persona {
  engine: EngineCode;
  /** "The Turtle". */
  name: string;
  /** "Turtle", for tight spaces. */
  short: string;
  /** How it trades, in one line. */
  style: string;
  /** The school and the text it implements, or a note that the rules are ours. */
  source: string;
  /** True where the engine's rules are our reading rather than a published system. */
  ours: boolean;
  colour: string;
  glyph: PersonaGlyph;
  /** The Coin is the null, not a school. It sits apart in every layout. */
  isNull?: boolean;
}

export const PANEL: readonly Persona[] = [
  {
    engine: 'CHANNEL',
    name: 'The Turtle',
    short: 'Turtle',
    style: 'Buys the breakout of a 20-bar high, sells the breakdown of a 20-bar low.',
    source: 'Donchian channels, as traded by the Turtles — Dennis & Eckhardt, rules published by Curtis Faith.',
    ours: false,
    colour: '#5cc8d8',
    glyph: 'breakout',
  },
  {
    engine: 'REVERSION',
    name: 'The Contrarian',
    short: 'Contrarian',
    style: 'Buys sharp dips, but only while the long-term trend is up.',
    source: 'Connors & Alvarez, Short Term Trading Strategies That Work — the 2-period RSI with its 200-bar trend filter.',
    ours: false,
    colour: '#a98bf5',
    glyph: 'dip',
  },
  {
    engine: 'REVERSION_H',
    name: 'The Dip Buyer',
    short: 'Dip Buyer',
    style: 'The Contrarian without the trend filter: buys any sharp dip.',
    source: 'Our variant of Connors & Alvarez, with one rule removed, to test whether that rule matters on these charts.',
    ours: true,
    colour: '#e08ad8',
    glyph: 'v',
  },
  {
    engine: 'SWEEP',
    name: 'The Hunter',
    short: 'Hunter',
    style: 'Waits for price to run the stops above a swing, then fades it.',
    source: 'Written in the ICT idiom, with every threshold ours — the school publishes no rules precise enough to implement.',
    ours: true,
    colour: '#f59a4a',
    glyph: 'reticle',
  },
  {
    engine: 'PATTERN',
    name: 'The Chartist',
    short: 'Chartist',
    style: 'Trades completed classic patterns, with targets from their measured history.',
    source: 'Bulkowski, Encyclopedia of Chart Patterns, descending from Edwards & Magee (1948).',
    ours: false,
    colour: '#6fa3ff',
    glyph: 'peaks',
  },
  {
    engine: 'GEOMETRY',
    name: 'The Harmonist',
    short: 'Harmonist',
    style: 'Fades moves that complete a Fibonacci pattern — Gartley, Bat, Butterfly, Crab.',
    source: 'Scott Carney, The Harmonic Trader and Harmonic Trading.',
    ours: false,
    colour: '#f47fa0',
    glyph: 'zigzag',
  },
  {
    engine: 'TAPE',
    name: 'The Volume Reader',
    short: 'Volume Reader',
    style: 'Reads effort against result: wide bars on thin volume, narrow bars on heavy volume.',
    source: 'Volume Spread Analysis — Tom Williams, Master the Markets. Stop and target are ours.',
    ours: false,
    colour: '#b8d860',
    glyph: 'bars',
  },
  {
    engine: 'ZERO',
    name: 'The Coin',
    short: 'Coin',
    style: 'Flips a coin for the side, with a stop 2 ATR away and a target twice as far. Always in the market.',
    source: 'The null hypothesis. If a school cannot beat this over thousands of markets, it has no measured edge.',
    ours: true,
    colour: '#c9c2b6',
    glyph: 'coin',
    isNull: true,
  },
];

const BY_ENGINE = new Map(PANEL.map((persona) => [persona.engine, persona]));

export function personaFor(engine: EngineCode | string): Persona | null {
  return BY_ENGINE.get(engine as EngineCode) ?? null;
}

/** The schools, without the Coin. */
export const SCHOOLS = PANEL.filter((persona) => !persona.isNull);
export const COIN = PANEL.find((persona) => persona.isNull)!;
