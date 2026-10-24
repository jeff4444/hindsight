/**
 * Every term of art a player meets, defined once, in plain words.
 *
 * `<Term id="par">` renders the word with a dotted underline and opens this definition on tap or
 * focus — a popover rather than a `title`, because a phone has no hover. The rule the copy follows
 * everywhere else: the screen uses the plain word, and the precise one is one tap away.
 *
 * Definitions are short on purpose. The full treatment of each lives in the rulebook, and `more`
 * points at the section.
 */

export type TermId =
  | 'r'
  | 'atr'
  | 'score'
  | 'par'
  | 'hindsight'
  | 'sitOut'
  | 'captured'
  | 'peak'
  | 'dip'
  | 'rating'
  | 'division'
  | 'points'
  | 'panel'
  | 'tape'
  | 'rules'
  | 'mirrored'
  | 'calibration'
  | 'net';

export interface TermDefinition {
  label: string;
  body: string;
  /** A rulebook anchor, for the reader who wants the whole of it. */
  more?: string;
}

export const GLOSSARY: Record<TermId, TermDefinition> = {
  r: {
    label: 'R',
    body: 'Your result in units of what you risked. Stopped out is −1R. Risking 1 to make 3 and getting there is +3R. It lets every chart share one scale.',
    more: '/learn/rulebook#4-the-arithmetic',
  },
  atr: {
    label: 'ATR',
    body: 'Average true range: how far this market typically moves in one candle. Stops are measured in it, so a 1 ATR stop means the same thing on every chart.',
  },
  score: {
    label: 'Score',
    body: 'How your trade ranks against every trade you could have placed on this exact chart — 98 of them. A score of 78 beats 78 out of 100.',
    more: '/learn/rulebook#10-scoring-against-what-was-achievable',
  },
  par: {
    label: 'Par',
    body: 'The typical trade on this chart: the middle of all 98 possible outcomes. On most charts par loses money, which is why sitting out often scores well.',
  },
  hindsight: {
    label: 'Best in hindsight',
    body: 'The best result any stop and target could have had on this chart, knowing what happened next. Nobody gets it on purpose; it shows how much the chart offered.',
  },
  sitOut: {
    label: 'Sit out',
    body: 'Not trading. It scores exactly 0R and is ranked like any trade — on a chart where most trades lose, it ranks well.',
  },
  captured: {
    label: 'Captured',
    body: 'How much of the best possible result your trade took, as a share.',
  },
  peak: {
    label: 'Peak gain',
    body: 'The furthest the trade went in your favour while it was open, in R.',
  },
  dip: {
    label: 'Deepest dip',
    body: 'The furthest the trade went against you while it was open, in R.',
  },
  rating: {
    label: 'Rating',
    body: 'Your skill estimate, from every rated chart you have played. It moves less as it gets surer, and it is not shown until 30 rated charts have settled it.',
    more: '/learn/rulebook#12-rating',
  },
  division: {
    label: 'Division',
    body: 'Your rating, in words: Paper, Retail, Swing, Desk, Prop, Fund, Wizard. Desk starts at the middle of the field.',
  },
  points: {
    label: 'Ranked points',
    body: 'A ranked session scores each chart on a compressed scale, so one lucky trade cannot carry a session and one disaster cannot sink it.',
  },
  panel: {
    label: 'The Panel',
    body: 'Seven engines, each trading one published school by its own rules, plus a coin flip. They disagree on purpose. None of them is the answer.',
    more: '/learn/methods',
  },
  tape: {
    label: 'Tape',
    body: 'A playlist of charts that share one rule — a market regime, a pattern, a kind of move. Anyone can make one.',
  },
  rules: {
    label: 'Rules',
    body: 'What you get to see. Full Desk has every tool; No Tools takes them away; Naked is 80 candles and a 90-second clock; Blackout is 60 candles, no volume, 20 seconds.',
    more: '/learn/rulebook#11-the-ladder',
  },
  mirrored: {
    label: 'Mirrored',
    body: 'Flipped upside down so the shape could not be recognised. Up was down. The reveal shows the real instrument and date.',
  },
  calibration: {
    label: 'How sure',
    body: 'Optional. Say how likely you think the trade is to finish green. Over many charts this measures whether your 70% really comes true 70% of the time.',
    more: '/learn/rulebook#18-calibration',
  },
  net: {
    label: 'After costs',
    body: 'Your result after spread and slippage. Real trading charges for every entry and exit; tight stops pay it most.',
  },
};
