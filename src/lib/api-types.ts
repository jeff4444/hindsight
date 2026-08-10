import type { Bar } from '@/core/bars';
import type { Direction, Outcome } from '@/core/resolve';

/**
 * The issuance payload.
 *
 * Everything the player is allowed to know, and nothing else. There is no symbol, no date, no
 * timeframe label, no chart id, and above all no future bar. §12.2 requires auditing "every
 * response payload and variable name for leaks", and tests/api-leak.test.ts does exactly that
 * against this type's runtime shape.
 */
export interface RoundPayload {
  roundId: string;
  /** The lead-in candles, indexed to 100 and possibly mirrored. */
  bars: Bar[];
  /** ATR(14) in index units — the badge §3.1 says is never hidden at any tier. */
  atr: number;
  tickSize: number;
  /** Entry is fixed at the decision bar close (§4.2). The player places rails, not an entry. */
  entry: number;
  /** How many candles the reveal will run for. A constant, not information about this chart. */
  revealBarCount: number;
  /**
   * Weekday of the first visible candle, 0 = Monday. Every other bar's clock follows by index
   * arithmetic, because the display timeframe is one hour.
   */
  startDayOfWeek: number;
  /** Hour of the first visible candle, UTC. */
  startHourUtc: number;
  /**
   * One-minute OHLCV behind the lead-in candles, base64 of interleaved Float32.
   *
   * The past only. The reveal's minutes are withheld until the order is committed (§12.1) and
   * arrive on RevealPayload.
   */
  detail: string;
}

export interface OrderRequest {
  stop?: number;
  target?: number;
  pass?: boolean;
}

export interface RoundResult {
  outcome: Outcome;
  direction: Direction | null;
  /** Null for a pass, which has no risk denominator. */
  rMultiple: number | null;
  entryFill: number | null;
  exitFill: number | null;
  /** Index into `revealBars` at which the trade closed, for drawing the fill marker. */
  exitBarIndex: number | null;
  riskPerUnit: number | null;
  mfeR: number | null;
  maeR: number | null;
  /** Excursion across the whole window, whether or not the trade was still open (§4.6). */
  windowMfeR: number | null;
  windowMaeR: number | null;
  ambiguous: boolean;
  stop: number | null;
  target: number | null;
}

/**
 * What the chart actually was.
 *
 * Released only with the reveal, never at issuance — §12.2 hides identity so the chart cannot be
 * looked up *before* the decision, and §3.3 defines a Silent mod as "no ticker or date reveal
 * even after the round", which only makes sense because revealing it afterwards is the default.
 * §13.1 assumes the same.
 */
export interface ChartProvenance {
  /** e.g. "BTCUSDT". */
  symbol: string;
  venue: string;
  /** ISO instant of the decision bar — the moment the trade was placed. */
  decisionAt: string;
  /** ISO instant of the first visible candle. */
  windowStart: string;
  /** The instrument's real price at the entry, in quote currency. */
  entryPriceReal: number;
  /** The chart was vertically mirrored, so it did not look like this at the time (§3.3). */
  mirrored: boolean;
  /** False for real price action. §7.2 synthetic controls do not exist yet. */
  synthetic: boolean;
  /** How a synthetic chart was produced. Null for real ones. */
  sourceNote: string | null;
}

export interface RevealPayload {
  result: RoundResult;
  /** The future. Released only now, after the order is committed. */
  revealBars: Bar[];
  /** The reveal window's one-minute detail, same encoding as RoundPayload.detail. */
  detail: string;
  /** What it actually was. Released only now, for the same reason as the bars. */
  provenance: ChartProvenance;
}
