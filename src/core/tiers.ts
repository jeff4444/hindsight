/**
 * The ruleset ladder.
 *
 * §3's whole legitimacy claim is an information ordering: "the tiers are strictly nested — each is
 * a subset of the affordances of the one above, nothing is added back — which is why the ladder
 * reads as legitimate rather than arbitrary. There is an unambiguous information ordering, so
 * 'harder' is a fact rather than an opinion."
 *
 * That is a testable property, not a slogan, and `tests/tiers.test.ts` tests it. If a future rung
 * ever grants something the rung above it does not, the suite fails and the ladder stops being a
 * ladder.
 *
 * §3.1 draws the line the rungs are cut along:
 *
 *   Restrict **identity** (ticker, date, absolute price), **hindsight** (anything reaching the
 *   future) and **crutches** (indicators, higher-timeframe context, news, unlimited deliberation).
 *   Never restrict **risk arithmetic** — "a player who does not know the instrument's typical range
 *   cannot place a stop that is neither noise-adjacent nor absurd. Hiding it does not test skill;
 *   it randomises the result and compresses the gap between expert and novice, which is the
 *   textbook definition of artificial difficulty."
 *
 * So the price axis, the ATR badge and the tick size are present at every rung including the
 * hardest, and the test asserts that too.
 *
 * §3.6 asks for this written down at the level of "no indicators, where the price axis is retained
 * but tick labels are removed, where the ATR badge remains, and where the session-boundary shading
 * is considered chart furniture rather than a tool" — because "the first tournament dispute will be
 * about an edge case and there will be no time to decide then". Hence a table of data rather than
 * a set of conditionals scattered through the UI.
 *
 * ## Full Desk ships, and News Blind is deleted rather than deferred
 *
 * Phase 1.5 deferred both to Phase 7 on the grounds that "FD is defined by exactly one affordance
 * the other rungs lack — pre-trade news headlines — and NN is defined as everything in Full Desk
 * except the headlines. Until §9's news panel exists they are the same ruleset, and shipping two
 * rungs that are one rung is precisely the arbitrary ladder §3 opens by warning against."
 *
 * News is now out of the plan indefinitely. That argument does not survive it: with no headlines to
 * withhold, Full Desk *is* News Blind, so there is one rung and not two, and the deferral was
 * keeping the ladder's whole top end unbuilt to preserve a distinction that no longer exists.
 *
 * **Full Desk is what survives**, because everything §3.2 gives it apart from the headlines —
 * 300 candles, three timeframes, indicators, drawing and measuring tools, volume, unlimited time —
 * is exactly what the tools rung was for. News Blind is not deferred; it is deleted, and the reason
 * is written here so nobody re-adds it looking for a missing rung.
 *
 * ## What Full Desk does *not* get
 *
 * §3.2's row ends with "post-entry trade management", and that is not a tool. Managing a trade
 * after entry — moving a stop, scaling out — changes the **scoring contract**: §4.2 enumerates the
 * achievable set over a *static* bracket, and a trade that can be adjusted mid-flight is no longer
 * described by it. That is a Layer 1 change, not a chart affordance, and §10.1 already has a
 * **Manage** mode for it. Full Desk ships with the tools and without the management.
 */

/** §3.2's letter codes. The convention that made NMPZ a word people say out loud. */
export type TierCode = 'SBX' | 'FD' | 'NT' | 'NTZ' | 'NTVZ';

/* ------------------------------------------------------------------- tools */

/**
 * Everything a rung can grant beyond the bare chart.
 *
 * A closed union rather than free strings, because §3.6 wants the edge cases decided before the
 * first dispute rather than during it, and "is a parallel channel a drawing tool or an indicator"
 * is exactly the argument that costs a tournament.
 */
export type ToolCode =
  | 'trendline'
  | 'level'
  | 'channel'
  | 'fib'
  | 'magnet'
  | 'logScale'
  | 'ma'
  | 'bollinger'
  | 'keltner'
  | 'donchian'
  | 'rsi'
  | 'macd'
  | 'volumeProfile'
  | 'geometry'
  | 'stopAlgos';

export interface Tool {
  code: ToolCode;
  name: string;
  kind: 'drawing' | 'indicator' | 'overlay' | 'chart';
  /** One line, shown in the tier table and in the toolbar. */
  effect: string;
}

export const TOOLS: Tool[] = [
  { code: 'trendline', name: 'Trendline', kind: 'drawing', effect: 'Draw a line or ray between two points.' },
  { code: 'level', name: 'Level', kind: 'drawing', effect: 'Draw a horizontal price level.' },
  { code: 'channel', name: 'Channel', kind: 'drawing', effect: 'Draw a parallel channel from three points.' },
  { code: 'fib', name: 'Fibonacci', kind: 'drawing', effect: 'Retracement levels between two points.' },
  { code: 'magnet', name: 'Magnet', kind: 'chart', effect: 'Snap a drawing to the nearest wick.' },
  { code: 'logScale', name: 'Log scale', kind: 'chart', effect: 'Switch the price axis between linear and logarithmic.' },
  { code: 'ma', name: 'Moving averages', kind: 'indicator', effect: 'Simple and exponential, three configurable lengths.' },
  { code: 'bollinger', name: 'Bollinger Bands', kind: 'indicator', effect: 'A moving average with standard-deviation bands.' },
  { code: 'keltner', name: 'Keltner Channels', kind: 'indicator', effect: 'A moving average with ATR bands.' },
  { code: 'donchian', name: 'Donchian Channels', kind: 'indicator', effect: 'The N-bar high and low. The most stop-relevant channel there is.' },
  { code: 'rsi', name: 'RSI', kind: 'indicator', effect: 'Wilder’s relative strength index, in a lower pane.' },
  { code: 'macd', name: 'MACD', kind: 'indicator', effect: 'Moving-average convergence divergence, in a lower pane.' },
  { code: 'volumeProfile', name: 'Volume profile', kind: 'overlay', effect: 'Volume at price from the stored one-minute bars, with POC and value area.' },
  {
    code: 'geometry',
    name: 'Auto-annotations',
    kind: 'overlay',
    effect: 'What Layer 2 computes: graded swings, hull trendlines, the channel and the levels.',
  },
  {
    code: 'stopAlgos',
    name: 'Stop algorithms',
    kind: 'indicator',
    effect: 'Chandelier Exit, Supertrend and Parabolic SAR. Sandbox only — see the note in this file.',
  },
];

/**
 * Tools that must not exist in the codebase, and why. Data rather than prose, so a future addition
 * has to delete a line that argues against it.
 *
 * §6's causality seam is the whole product, and the first group would defeat it quietly:
 *
 * > ZigZag cannot know a pivot is a pivot until price has moved away, so the historical chart shows
 * > perfect turning points that were unknowable in real time. TradingView's own repainting guide
 * > categorises these as scripts that "plot values backward in time, creating false historical
 * > impressions".
 */
export const EXCLUDED_TOOLS: { name: string; reason: string }[] = [
  {
    name: 'ZigZag, Auto Fib, Auto Trendlines, Auto Pitchfork, auto key levels',
    reason:
      'They repaint. A pivot is not knowable until price has moved away from it, so the historical ' +
      'chart shows turning points nobody could have drawn. Excluded from the codebase, not merely ' +
      'from the toolbar.',
  },
  {
    name: 'Renko, Kagi, Point & Figure, Line Break, Heikin Ashi',
    reason:
      'They destroy time and invent prices. The player would place levels in one coordinate system ' +
      'and be scored against real OHLC in another. TradingView hit this and moderated such ' +
      'strategies off the platform rather than reconcile it.',
  },
  {
    name: 'Gann fans and squares, Elliott tools, Fibonacci circles, spirals, arcs and fans',
    reason:
      'Scale- and aspect-ratio-dependent: the signal changes when the window is resized. ' +
      'Disqualifying regardless of any view on their merit.',
  },
  {
    name: 'Pivot Points, session VWAP, seasonality',
    reason:
      'They need a session boundary, and §12.2 removes the calendar by design. Anchored VWAP from a ' +
      'swing works and is the more useful variant anyway.',
  },
  {
    name: 'Andrews’ Pitchfork',
    reason:
      'StockCharts’ own definition says "there are no hard rules for point placement… chartists ' +
      'must use judgment". It is not a function of the data.',
  },
];

export interface Tier {
  code: TierCode;
  name: string;
  /** Display candles of history before the decision bar. */
  candles: number;
  /** Minutes per candle the player may switch between. */
  timeframes: number[];
  volume: boolean;
  /** Deliberation limit in seconds, or null for unlimited. */
  clockSeconds: number | null;
  /**
   * Whether the one-minute detail path is shipped to the client.
   *
   * This is the only *enforceable* timeframe restriction. A client holding the base64 detail can
   * render one-minute candles whatever the picker offers, so withholding it is the restriction and
   * the picker is only the affordance.
   */
  detail: boolean;
  /**
   * Indicators, drawings and overlays this rung grants. §3.1's "crutches" axis, made a list.
   *
   * The measure tool is deliberately **not** here — see `UNIVERSAL_AFFORDANCES`.
   */
  tools: ToolCode[];
  rated: boolean;
  /** §3.4's XP multiplier. Never a rating multiplier — see the note below. */
  xp: number;
  /** One line, shown wherever the tier is chosen. */
  blurb: string;
}

/**
 * Preserved at every rung, by §3.1. Kept as a named constant rather than a column so that adding a
 * rung cannot accidentally take one away — there is no field to set to false.
 *
 * **The measure tool belongs here and not in `tools`.** §3.1's line is that identity, hindsight and
 * crutches are restricted and *risk arithmetic never is*: "a player who does not know the
 * instrument's typical range cannot place a stop that is neither noise-adjacent nor absurd. Hiding
 * it does not test skill; it randomises the result." A ruler that reads out in ATR and R is the
 * same category as the ATR badge — it converts a distance on screen into the unit the trade is
 * scored in, and on a chart with no ticker and no absolute price it is the only instrument that
 * does. Withholding it at Blackout would not make Blackout harder in any way that measures reading;
 * it would make the arithmetic guesswork.
 */
export const UNIVERSAL_AFFORDANCES = ['priceAxis', 'atrBadge', 'tickSize', 'measure'] as const;

/** Every tool that is not a stop-placement algorithm. Sandbox and Full Desk both get these. */
const DESK_TOOLS: ToolCode[] = [
  'trendline',
  'level',
  'channel',
  'fib',
  'magnet',
  'logScale',
  'ma',
  'bollinger',
  'keltner',
  'donchian',
  'rsi',
  'macd',
  'volumeProfile',
  'geometry',
];

/**
 * Ordered from most permissive to most restrictive. The nesting test walks adjacent pairs, so the
 * order is load-bearing rather than cosmetic.
 */
export const TIERS: Tier[] = [
  {
    code: 'SBX',
    name: 'Sandbox',
    candles: 300,
    timeframes: [1, 15, 30, 60, 240, 1440],
    volume: true,
    clockSeconds: null,
    detail: true,
    /**
     * Sandbox is the only rung that gets the stop-placement algorithms, and it is the one place
     * they are defensible.
     *
     * Chandelier Exit, Supertrend and Parabolic SAR are causal, cheap and easy to build — and they
     * are *literally stop-placement algorithms*. In a game whose entire skill is placing a stop,
     * showing one is showing the answer key. The research's verdict was "the lowest tier or
     * nowhere"; the lowest tier is unrated, explicitly "the learning surface, not a tier", and
     * seeing what a Chandelier would have suggested is a legitimate thing to learn from when
     * nothing is at stake. They appear on no rated rung.
     */
    tools: [...DESK_TOOLS, 'stopAlgos'],
    // §3.2: "Unrated. This is the learning surface, not a tier." §3.4 puts Sandbox at 0.00×.
    rated: false,
    xp: 0,
    blurb: 'Everything, unrated. Every timeframe down to the minute, every tool, no clock, nothing at stake.',
  },
  {
    code: 'FD',
    name: 'Full Desk',
    candles: 300,
    timeframes: [60, 240, 1440],
    volume: true,
    clockSeconds: null,
    detail: false,
    tools: DESK_TOOLS,
    rated: true,
    // The most permissive rated rung, so it pays the least. §3.4's ladder starts here.
    xp: 0.85,
    blurb: '300 candles, three timeframes, the full toolbox, unlimited time. The desk you actually trade from.',
  },
  {
    code: 'NT',
    name: 'No Tools',
    candles: 300,
    // "Three timeframes" (§3.2). Upward context only — the hour is the decision timeframe and the
    // two above it are the structure a desk would have open. Sub-hour is what §3.2 calls the
    // fingerprinting surface, and it is Sandbox-only.
    timeframes: [60, 240, 1440],
    volume: true,
    clockSeconds: null,
    detail: false,
    tools: [],
    rated: true,
    xp: 1.0,
    blurb: '300 candles, three timeframes, volume, unlimited time. No indicators, no drawing tools.',
  },
  {
    code: 'NTZ',
    name: 'Naked',
    candles: 80,
    timeframes: [60],
    volume: true,
    clockSeconds: 90,
    detail: false,
    tools: [],
    rated: true,
    // §3.4: "1.00× at Full Desk rising to roughly 1.15× at Naked… calibrated against osu!, whose
    // hardest information-removal mod is worth twelve per cent after fifteen years of leaderboard
    // evidence."
    xp: 1.15,
    blurb: '80 candles, one timeframe, volume, a 90-second clock. Set and forget. The ranked standard.',
  },
  {
    code: 'NTVZ',
    name: 'Blackout',
    candles: 60,
    timeframes: [60],
    volume: false,
    clockSeconds: 20,
    detail: false,
    tools: [],
    rated: true,
    xp: 1.3,
    blurb: '60 candles, no volume, 20 seconds. One look. A prestige format, not the standard.',
  },
];

export const DEFAULT_TIER: TierCode = 'NTZ';
/** §10.1: "Five-chart sessions at Naked." */
export const RANKED_TIER: TierCode = 'NTZ';

export function tierByCode(code: string): Tier | null {
  return TIERS.find((tier) => tier.code === code) ?? null;
}

export function isTierCode(value: unknown): value is TierCode {
  return typeof value === 'string' && TIERS.some((tier) => tier.code === value);
}

/* --------------------------------------------------------------------------- mods */

/**
 * §3.3's second axis — "layerable and not nested, modelled on osu!'s mod system. Following that
 * precedent, the cosmetic recognition matters more than the number: a result earned under a mod
 * should be permanently marked as such."
 *
 * **Mirror is deliberately absent.** §3.3's table lists it at 1.05×, but the pull-quote directly
 * beneath says it "should be permanent in ranked, not optional… Randomise it per chart so nobody
 * can calibrate to it", §12.2 lists vertical mirroring among the baseline identity defences rather
 * than among the mods, and the corpus has baked it into stored prices since Phase 0. Three
 * statements to one, and the three agree with the code. A permanently-on randomised condition
 * nobody chooses cannot carry a multiplier or a badge, so the table row is dead and this is where
 * that is recorded.
 *
 * **Fog is deferred.** "The lead-in candles play forward once in real time with no scrubbing back"
 * needs a replay surface for the *lead-in*, which does not exist — the reveal loop only plays the
 * future.
 */
export type ModCode = 'BLIND' | 'SILENT' | 'IRON' | 'ASSIST' | 'WIDE';

export interface Mod {
  code: ModCode;
  name: string;
  effect: string;
  /** §3.4 forbids ranked multipliers on principle, so this is XP only, exactly like the tier's. */
  xp: number;
  /** A reduction mod makes the round easier and pays less. */
  reduction: boolean;
}

export const MODS: Mod[] = [
  {
    code: 'BLIND',
    name: 'Blind Scale',
    effect: 'The price axis is removed. The ATR badge is retained, so risk arithmetic still works.',
    xp: 1.08,
    reduction: false,
  },
  {
    code: 'SILENT',
    name: 'Silent',
    effect: 'No ticker or date reveal, even after the round. Kills the look-it-up loop.',
    xp: 1.03,
    reduction: false,
  },
  {
    code: 'IRON',
    name: 'Iron',
    effect: 'One entry. No pass.',
    xp: 1.05,
    reduction: false,
  },
  {
    code: 'WIDE',
    name: 'Wide',
    effect: '250 candles of history instead of 80.',
    xp: 0.85,
    reduction: true,
  },
  {
    code: 'ASSIST',
    name: 'Assist',
    effect: 'Suggested stop and target rails are shown.',
    xp: 0.5,
    reduction: true,
  },
];

export function modByCode(code: string): Mod | null {
  return MODS.find((mod) => mod.code === code) ?? null;
}

/**
 * Blind Scale removes the price axis, which §3.1 lists among the things never restricted — so it is
 * only admissible as an opt-in mod, never as a rung. This is the one place the two axes disagree,
 * and §3.3 resolves it by keeping the ATR badge: risk arithmetic survives, the reading aid does not.
 */
export function affordances(tier: Tier, mods: readonly ModCode[] = []) {
  const has = (code: ModCode) => mods.includes(code);
  return {
    candles: has('WIDE') ? Math.max(tier.candles, 250) : tier.candles,
    timeframes: tier.timeframes,
    volume: tier.volume,
    clockSeconds: tier.clockSeconds,
    detail: tier.detail,
    priceAxis: !has('BLIND'),
    atrBadge: true,
    tickSize: true,
    // Risk arithmetic, not a crutch. There is deliberately no rung or mod that removes it — see
    // UNIVERSAL_AFFORDANCES for the argument, and `tests/tiers.test.ts` holds every rung to it.
    measure: true,
    // The crutches axis. Sandbox and Full Desk grant these; every rated rung below Full Desk grants
    // none, which is what "No Tools" has meant since §3.2 named it.
    tools: tier.tools,
    mayPass: !has('IRON'),
    revealIdentity: !has('SILENT'),
    assistRails: has('ASSIST'),
  };
}

/** Whether a tier grants a given tool. */
export function grantsTool(tier: Tier, tool: ToolCode): boolean {
  return tier.tools.includes(tool);
}

/**
 * §3.4's XP multiplier for a whole round, composed multiplicatively.
 *
 * Capped because tier × mods × the §8.5 difficulty setting compose, and three multipliers that each
 * look conservative stack into one that is not. The cap is the only thing making "conservative"
 * true of the product rather than of each factor.
 */
export const XP_CAP = 2.0;

export function xpMultiplier(tier: Tier, mods: readonly ModCode[] = []): number {
  const product = mods.reduce((acc, code) => acc * (modByCode(code)?.xp ?? 1), tier.xp);
  return Math.min(XP_CAP, Number(product.toFixed(4)));
}

/**
 * §10.4: "Include the tier code and mods, because the code in the card is free marketing for the
 * ladder" — `HINDSIGHT #412 · NTZ+Mirror · 78th`. Mods are ordered as declared in MODS so the same
 * loadout always renders the same string.
 */
export function loadoutCode(tier: TierCode, mods: readonly ModCode[] = []): string {
  const ordered = MODS.filter((mod) => mods.includes(mod.code)).map((mod) => titleCase(mod.code));
  return [tier, ...ordered].join('+');
}

function titleCase(code: string): string {
  return code.charAt(0) + code.slice(1).toLowerCase();
}
