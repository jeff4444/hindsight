import type { Bar } from '@/core/bars';
import type { ModCode, TierCode, ToolCode } from '@/core/tiers';
import type { Direction, Outcome } from '@/core/resolve';
import type { Verdict } from '@/core/engines';

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

  /** §3.2's ruleset this round is played under. */
  tier: TierCode;
  /** §3.3's mods in force, layered on the tier. */
  mods: ModCode[];
  /** Timeframes the tier permits, in minutes. One entry means the picker is a label. */
  timeframes: number[];
  /** Whether the volume pane is drawn. Removed only at Blackout (§3.2). */
  volume: boolean;
  /** Whether the price axis is drawn. Removed only by the Blind Scale mod, never by a tier (§3.1). */
  priceAxis: boolean;
  /**
   * Indicators, drawings and overlays this tier grants. Empty at every rung below Full Desk.
   *
   * A description of the **ruleset**, not of the chart — the same category as `timeframes` and
   * `volume`, and it says nothing about which instrument this is or what happens next. The measure
   * tool is deliberately absent because it is universal (§3.1); a client that finds no `measure`
   * entry here should still draw one.
   */
  tools: ToolCode[];
  /** Whether a pass is available. Removed by Iron (§3.3). */
  mayPass: boolean;
  /**
   * Milliseconds left to decide, or null when the tier is untimed.
   *
   * Deliberately a duration rather than a wall-clock deadline: an absolute timestamp would let a
   * client's clock skew decide whether a commit was late, and the server is the only clock that
   * matters. The authoritative check happens again at commit.
   */
  clockMs: number | null;
}

export interface OrderRequest {
  stop?: number;
  target?: number;
  pass?: boolean;
  /**
   * §4.7's stake: the probability this trade finishes above zero, net of costs.
   *
   * Optional. A round played without one is absent from every calibration statistic rather than
   * counted as a half — putting an unexpressed opinion into a player's curve is precisely what a
   * calibration measure must not do.
   */
  confidence?: number;
}

export interface RoundResult {
  outcome: Outcome;
  direction: Direction | null;
  /**
   * The result, **net of transaction costs**, and the number everything is scored on.
   *
   * §15 names cost erosion as a project risk and Bajgrowicz & Scaillet's finding is that frictions
   * belong inside the measurement rather than beside it, so the achievable set is enumerated net
   * too (`src/core/costs.ts`) and this is comparable to it.
   */
  rMultiple: number | null;
  /**
   * The same trade with the fees switched off.
   *
   * Shown beside the net figure rather than instead of it, because the *gap* is the lesson: cost in
   * R is inversely proportional to stop distance, so a 0.5 ATR stop pays 0.27R on the median chart
   * against 0.03R at 4 ATR. Reporting only net would hide how much the stop choice cost; reporting
   * only gross is what makes tight stops look free.
   */
  grossR: number | null;
  /**
   * The Brier score of the stake, if one was made: the squared error of the stated probability.
   *
   * Proper, so honesty is optimal — there is no shading that improves it. Read it against
   * **0.2384**, which is what saying the corpus base rate of 39.2% every time scores; a single
   * round's Brier is noise, and the curve on the stats page is the number that means something.
   */
  brier: number | null;
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

/**
 * Layer 1's verdict on the trade.
 *
 * §4 exists because a bare R-multiple is mostly luck. This is the answer to the question that is
 * not luck: of everything this exact path allowed, how much did you take.
 *
 * Released only with the reveal — the whole block is derived from the future (§12.1).
 */
export interface ScorePayload {
  /** Where the result sits in the 98-cell achievable distribution, 0–1. */
  percentile: number | null;
  /** Best R any bracket could have made here (§4.2). */
  oracleR: number;
  /** The distribution's median. Negative means restraint outscored most entries (§8.1 parR). */
  parR: number | null;
  /** The 98 achievable R-multiples, for drawing the distribution. */
  distribution: number[];
  axes: {
    direction: number | null;
    stopSweptShare: number | null;
    stopInsideNoise: boolean | null;
    profitableMaeR: number | null;
    targetReached: boolean | null;
    captureShare: number | null;
    restraint: number | null;
    efficiency: number | null;
  };
}

export interface RevealPayload {
  result: RoundResult;
  /** The future. Released only now, after the order is committed. */
  revealBars: Bar[];
  /** The reveal window's one-minute detail, same encoding as RoundPayload.detail. */
  detail: string;
  /** What it actually was. Released only now, for the same reason as the bars. */
  provenance: ChartProvenance;
  /** Layer 1's score. Null only for charts enumerated before Layer 1 existed. */
  score: ScorePayload | null;
  /**
   * §5's engine council — every school's read of the same chart, passes included.
   *
   * On the reveal rather than at issuance, and that placement is the whole safety argument: an
   * engine's verdict is derived from the lead-in the player already had, but shipping it *before*
   * the decision would hand over a bracket to copy. `RevealPayload` already carries the future, so
   * `tests/api-leak.test.ts` is untouched by this.
   *
   * Never a consensus. §5.5: "The player-facing output is a spread of opinion, never a consensus
   * verdict" — so this is the full list, and on 66.9% of charts every school in it has passed.
   */
  council: Verdict[];

  /**
   * §5.12's evidence for this one round: which schools traded here, what their own brackets
   * returned, and which of them yours resembled.
   *
   * Null on a pass and on any chart where no school took a position — which is **66.9%** of them,
   * so this is usually absent and that is the roster rather than a gap. One round is never a
   * fingerprint; the profile is the accumulation, and `src/core/style.ts` refuses to describe it
   * until an engine has 30 charts behind it.
   */
  style: { available: Record<string, number>; matched: string[] } | null;

  /**
   * §10.1's Storm or Streak state, after this round moved it. Null outside a run.
   *
   * The clock and the score are the server's — `remainingMs` is what was left when the commit was
   * processed, not a duration the client may extend.
   */
  run: Record<string, unknown> | null;
}

/**
 * The player's state in a daily (§10.1).
 *
 * Either the next chart to play, or — once all five are committed — the summary and the share
 * card. Nothing here carries the future: `round` is the same lead-in-only projection free play
 * uses, and the card is spoiler-free by construction (§10.4).
 */
export interface DailyResult {
  /** Position in the session, 0-indexed. */
  index: number;
  passed: boolean;
  percentile: number | null;
}

/**
 * What completing a daily did to the streak.
 *
 * `before` and `after` are read either side of `record_daily_completion`, so the ceremony can
 * animate the increment rather than simply displaying the new total. Null for an anonymous
 * player, who has no streak to move.
 */
export interface StreakDelta {
  before: number;
  after: number;
  /** §10.3's gold state: no freeze and no repair anywhere in the current run. */
  perfect: boolean;
  freezesRemaining: number;
  longest: number;
}

export interface DailyPayload {
  day: number;
  complete: boolean;
  /** How many of the five have been committed. */
  played: number;
  total: number;
  /** How many were traded rather than passed — §4.4's social brake. */
  traded: number;
  /** Mean percentile across the session, once complete. */
  percentile: number | null;
  /**
   * Per-chart outcomes, once complete.
   *
   * Not future data: every one of these has been committed and revealed to this player already.
   * It exists so the completion screen can show the *shape* of the day — which of the five were
   * traded, which were passed, how each scored — rather than only its mean.
   */
  results: DailyResult[];
  streak: StreakDelta | null;
  card: string | null;
  round: RoundPayload | null;
}

/**
 * A ranked session in flight, or its result.
 *
 * §4.4's quota is carried as `passesLeft` and `mayPass` rather than left for the client to derive:
 * the rule is the server's, and a client that computed it could disagree with the one that will
 * actually be enforced.
 */
export interface RankedPayload {
  sessionId: string;
  played: number;
  total: number;
  passes: number;
  passesLeft: number;
  mayPass: boolean;
  complete: boolean;
  round: RoundPayload | null;
  result: {
    /** Per-chart compressed score, in session order. */
    imps: number[];
    total: number;
    entries: number;
    passes: number;
    forfeits: number;
    /** §4.4's three-entry minimum. */
    quotaMet: boolean;
  } | null;
}
