/**
 * Every term of art a player meets, defined once, in plain words.
 *
 * `<Term id="grade">` renders the word with a dotted underline and opens this definition on tap or
 * focus — a popover rather than a `title`, because a phone has no hover. The rule the copy follows
 * everywhere else: the screen uses the plain word, and the precise one is one tap away.
 *
 * Definitions are short on purpose. The full treatment of each lives in the rulebook's §23, and
 * `more` points at it. The numbers quoted here are the ones the game is played by
 * (`src/core/game/rules.ts`, `src/core/trading/costs.ts`); a test keeps them in step.
 */

export type TermId =
  | 'tape'
  | 'stake'
  | 'lockIn'
  | 'sitOut'
  | 'grade'
  | 'best'
  | 'worst'
  | 'duel'
  | 'damage'
  | 'schools'
  | 'market'
  | 'limit'
  | 'stop'
  | 'takeProfit'
  | 'stopLoss'
  | 'oco'
  | 'maker'
  | 'taker'
  | 'spread'
  | 'slippage'
  | 'atr';

export interface TermDefinition {
  label: string;
  body: string;
  /** A rulebook anchor, for the reader who wants the whole of it. */
  more?: string;
}


export const GLOSSARY: Record<TermId, TermDefinition> = {
  tape: {
    label: 'Tape',
    body: 'The next 60 hours of a real market, one candle a minute, after the moment you decide. You never see a minute of it before you lock in, and you are only dealt tapes that moved at least 3%.',
    more: '/learn/rulebook#231-a-round',
  },
  stake: {
    label: 'Stake',
    body: 'The $500 every round starts with. Nothing carries from one round to the next, there is no leverage, and a round can never lose more than its stake.',
    more: '/learn/rulebook#231-a-round',
  },
  lockIn: {
    label: 'Lock in',
    body: 'Commit your trade — or your decision to sit out. After it nothing can be changed: no moving the stop, no closing early. Then the tape plays.',
    more: '/learn/rulebook#231-a-round',
  },
  sitOut: {
    label: 'Sit out',
    body: 'Lock in no trade at all. It is graded like any other move, a little above 500 because it pays no fees — the bar a trade has to clear.',
    more: '/learn/rulebook#233-the-grade',
  },
  grade: {
    label: 'Grade',
    body: 'Where your result falls between the worst and the best trade the tape allowed, from 0 to 1000. A quiet tape and a wild one both run the full range.',
    more: '/learn/rulebook#233-the-grade',
  },
  best: {
    label: 'Best in hindsight',
    body: 'The best single trade the tape allowed: buying the bottom of its biggest rise and selling the top, or shorting the top of its biggest fall. A real order, filled and charged like yours.',
    more: '/learn/rulebook#232-the-best-and-worst-the-tape-allowed',
  },
  worst: {
    label: 'Worst in hindsight',
    body: 'The same moves taken the wrong way round, stopped out at the far end. It is what 0 on the grade means.',
    more: '/learn/rulebook#232-the-best-and-worst-the-tape-allowed',
  },
  duel: {
    label: 'Duel',
    body: 'Two players on the same 10 tapes, each starting at 1000 points, played in their own time. It ends at a knockout, or after the last tape with whoever has more points.',
    more: '/learn/rulebook#236-duels',
  },
  damage: {
    label: 'Damage',
    body: 'What the lower grade on a tape loses in a duel. It grows faster than the gap: a gap of 250 costs 102 points, a gap of 750 costs 545.',
    more: '/learn/rulebook#236-duels',
  },
  schools: {
    label: 'The schools',
    body: 'Opponents that read every tape once, before you, under a published playbook, then play their trade live beside yours and show their working when the tape ends.',
    more: '/learn/rulebook#237-against-a-school',
  },
  market: {
    label: 'Market order',
    body: 'Buy or sell now, at the best price on offer. It crosses the spread and pays the taker fee.',
  },
  limit: {
    label: 'Limit order',
    body: 'Buy at this price or lower, or sell at this price or higher. It rests until the market trades through it, and pays the maker fee.',
  },
  stop: {
    label: 'Stop order',
    body: 'Becomes a market order once the price touches it: a buy stop above the market, a sell stop below. It fills with slippage and pays the taker fee.',
  },
  takeProfit: {
    label: 'Take-profit',
    body: 'A limit order that rides with your entry, waiting on the winning side to close the trade.',
  },
  stopLoss: {
    label: 'Stop-loss',
    body: 'A stop order that rides with your entry, waiting on the losing side to close the trade before the loss grows.',
  },
  oco: {
    label: 'One cancels the other',
    body: 'Your take-profit and stop-loss are linked: when one fills, the other is cancelled.',
  },
  maker: {
    label: 'Maker',
    body: 'An order that rested and was filled by someone else — a limit order. Charged 0.10% here, as on Binance spot.',
  },
  taker: {
    label: 'Taker',
    body: 'An order that filled straight away against what was resting — market and stop orders. Charged 0.10% here, as on Binance spot.',
  },
  spread: {
    label: 'Spread',
    body: 'The gap between the price you can buy at and the price you can sell at. A market order pays half of it each way.',
  },
  slippage: {
    label: 'Slippage',
    body: 'The difference between a stop price and the price it actually fills at, because a triggered stop is a market order in a moving market.',
  },
  atr: {
    label: 'ATR',
    body: 'Average true range: how far this market typically moves in one candle. The measuring tool reads distances in it.',
  },
};
