/**
 * Every term of art a trader meets, defined once, in plain words.
 *
 * `<Term id="buyingPower">` renders the word with a dotted underline and opens this definition on
 * tap or focus — a popover rather than a `title`, because a phone has no hover. The rule the copy
 * follows everywhere else: the screen uses the plain word, and the precise one is one tap away.
 *
 * Definitions are short on purpose. The full treatment of each lives in the rulebook's §22, and
 * `more` points at it. The numbers quoted here are the ones the simulator charges
 * (`src/core/trading/costs.ts`); a test keeps them in step.
 */

export type TermId =
  | 'equity'
  | 'cash'
  | 'buyingPower'
  | 'margin'
  | 'liquidation'
  | 'unrealized'
  | 'realized'
  | 'market'
  | 'limit'
  | 'stop'
  | 'takeProfit'
  | 'stopLoss'
  | 'oco'
  | 'reduceOnly'
  | 'maker'
  | 'taker'
  | 'spread'
  | 'slippage'
  | 'drawdown'
  | 'winRate'
  | 'profitFactor'
  | 'atr'
  | 'replay'
  | 'practice'
  | 'schools';

export interface TermDefinition {
  label: string;
  body: string;
  /** A rulebook anchor, for the reader who wants the whole of it. */
  more?: string;
}

const RULES = '/learn/rulebook#22-trading';

export const GLOSSARY: Record<TermId, TermDefinition> = {
  equity: {
    label: 'Equity',
    body: 'What the account is worth right now: cash plus the open position valued at the last price. Every account starts with $100,000.',
    more: RULES,
  },
  cash: {
    label: 'Cash',
    body: 'Money in the account, after every realized profit, loss and fee. It does not include the open position.',
  },
  buyingPower: {
    label: 'Buying power',
    body: 'How much more you can buy or sell short. Positions and resting orders together may be worth up to 2× your equity.',
    more: RULES,
  },
  margin: {
    label: 'Margin used',
    body: 'How much of your buying power is taken by the open position and resting orders. At 100% you cannot add to either.',
  },
  liquidation: {
    label: 'Liquidation',
    body: 'If equity falls below 25% of what the position is worth, the position is closed for you at the market, with a 1% fee. Equity at zero ends the account until you reset it.',
    more: RULES,
  },
  unrealized: {
    label: 'Unrealized P&L',
    body: 'Profit or loss on the open position at the last price. It becomes realized when you close.',
  },
  realized: {
    label: 'Realized P&L',
    body: 'Profit or loss locked in by closing all or part of a position, after fees.',
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
    body: 'A limit order attached to a position, waiting on the winning side to close it.',
  },
  stopLoss: {
    label: 'Stop-loss',
    body: 'A stop order attached to a position, waiting on the losing side to close it before the loss grows.',
  },
  oco: {
    label: 'One cancels the other',
    body: 'A take-profit and a stop-loss on the same position are linked: when one fills, the other is cancelled.',
  },
  reduceOnly: {
    label: 'Reduce only',
    body: 'The order may only shrink the position, never open or flip it. Attached take-profits and stop-losses are always reduce-only.',
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
  drawdown: {
    label: 'Max drawdown',
    body: 'The largest fall in equity from a peak before it recovered, as a share of that peak.',
  },
  winRate: {
    label: 'Win rate',
    body: 'The share of closed trades that made money after fees.',
  },
  profitFactor: {
    label: 'Profit factor',
    body: 'Money made on winning trades divided by money lost on losing ones. Above 1 the account made money.',
  },
  atr: {
    label: 'ATR',
    body: 'Average true range: how far this market typically moves in one candle. The schools place their stops in it.',
  },
  replay: {
    label: 'Replay',
    body: 'A real stretch of market history played back minute by minute. The server keeps the clock, so nobody can see a minute before it prints.',
    more: RULES,
  },
  practice: {
    label: 'Practice',
    body: 'A second account that may show the real dates while you trade. It never reaches a leaderboard.',
  },
  schools: {
    label: 'The schools',
    body: 'Seven trading systems, each trading its published rules on its own $100,000 account, plus a coin flip. None of them is the answer.',
    more: '/learn/methods',
  },
};
