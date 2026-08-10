/**
 * Chart resolutions the player can choose between.
 *
 * The hour is the *decision* timeframe: it fixes the history the player reads, the entry, the
 * ATR and how long the trade runs. Nothing here changes any of that. What it changes is what is
 * drawn, which matters because the corpus already stores a one-minute path for the whole window
 * (§12.3 needs it to resolve trades without intrabar ambiguity) and drawing only hour candles
 * throws that away.
 *
 * The resolution is picked explicitly rather than derived from the zoom. Deriving it means the
 * candles change shape while the player is still moving the wheel, which is disorienting even
 * when the choice is right, and there is no reading of "correct" that survives someone wanting
 * a dense 1-minute view of six days. Every charting tool a trader has used works this way.
 */

export interface Tier {
  /** Minutes per candle. */
  minutes: number;
  label: string;
}

/**
 * Coarsest last, the way a timeframe menu is normally ordered.
 *
 * 4h and 1d do not divide an hour, so they are aligned against the clock rather than against
 * the window: a daily candle runs midnight to midnight, not from whatever hour the window
 * happens to open on. That makes the first candle of those tiers partial, which is correct and
 * is what a real chart shows.
 */
export const TIERS: Tier[] = [
  { minutes: 1, label: '1m' },
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 240, label: '4h' },
  { minutes: 1440, label: '1d' },
];

/**
 * The decision timeframe, and the default.
 *
 * The hour is not the resolution a trade is *filled* at — that is one minute, walked bar by bar
 * (§12.3). What the hour fixes is the decision: the 80 candles of history the player reads, the
 * entry at the close of the last of them, the ATR(14) that sets the risk unit and the badge,
 * and the 60 candles the trade has to resolve in. Phase 1's achievable set is enumerated in
 * those same units.
 *
 * Changing the selected timeframe changes none of that. It changes what is drawn.
 */
export const DISPLAY_TIER = 60;

export const TIER_MINUTES = TIERS.map((tier) => tier.minutes);

export function tierLabel(minutes: number): string {
  return TIERS.find((tier) => tier.minutes === minutes)?.label ?? `${minutes}m`;
}

/**
 * How a tier is built.
 *
 * Below an hour the source is the stored one-minute detail. At an hour and above it is the
 * display candles themselves, which are full precision and authoritative — re-deriving them
 * from the Float32 detail would introduce a hair of drift at the timeframe the entry and the
 * ATR are taken from, for no gain.
 */
export interface TierPlan {
  /** Minutes per source bar: 1 for the detail path, 60 for the display candles. */
  unitMinutes: number;
  /** Source bars per rendered candle. */
  group: number;
}

export function tierPlan(tierMinutes: number): TierPlan {
  const unitMinutes = tierMinutes < DISPLAY_TIER ? 1 : DISPLAY_TIER;
  return { unitMinutes, group: tierMinutes / unitMinutes };
}

/**
 * Where the window's first bar sits inside its own candle, in source-bar units.
 *
 * Zero for every tier that divides an hour, because a window always opens on the hour. Non-zero
 * for 4h and 1d, where the window opens partway through a candle that began before it.
 */
export function tierPhase(tierMinutes: number, originSeconds: number): number {
  const { unitMinutes, group } = tierPlan(tierMinutes);
  const units = Math.round(originSeconds / 60 / unitMinutes);
  return ((units % group) + group) % group;
}
