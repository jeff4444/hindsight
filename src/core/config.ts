/**
 * Chart geometry, shared by the pipeline, the API and the client.
 *
 * The window is shaped after the Naked (NTZ) tier of scope §3.2 — 80 candles, one timeframe,
 * volume, an ATR badge — because §3.2 makes NTZ the ranked standard and Phase 0 should be
 * building the shape the ladder will eventually rank. The tier machinery itself (the clock,
 * the other four rungs, the mods) is Phase 1.5 and is not here.
 */

import { HOUR_MS, MINUTE_MS } from './bars';

/** Candles the player sees before deciding, at the Naked tier the corpus is shaped for. */
export const LEAD_IN_BARS = 80;

/**
 * Extra candles stored before those, for the tiers that grant more history.
 *
 * §3.2 gives No Tools 300 candles and the Wide mod 250. Stored separately rather than folded into
 * `lead_in_bars` so that everything derived from the lead-in — the entry, the ATR, the 98-cell
 * grid, every stored percentile — is untouched by their existence.
 */
export const EXTRA_LEAD_IN_BARS = 220;
export const EXTENDED_LEAD_IN_BARS = LEAD_IN_BARS + EXTRA_LEAD_IN_BARS;

/**
 * The window ATR(14) is measured over, at every tier.
 *
 * Pinned, and it has to be. If ATR followed whatever the player can see, the same chart would carry
 * a different ATR at No Tools and at Naked; the 98 stop distances are multiples of it, so the two
 * tiers' achievable grids would differ and their percentiles would not be comparable. That breaks
 * §3.5's "run both tiers on the same charts with the same player pool" and §8.1's chart-and-tier
 * rating in one move. The badge means the same thing everywhere or the ladder is not a ladder.
 */
export const ATR_WINDOW_BARS = LEAD_IN_BARS;

/** Candles revealed after the order is committed. */
export const REVEAL_BARS = 60;

export const WINDOW_BARS = LEAD_IN_BARS + REVEAL_BARS;

export const DISPLAY_TF = '1h';
export const RESOLUTION_TF = '1m';

export const DISPLAY_TF_MS = HOUR_MS;
export const RESOLUTION_TF_MS = MINUTE_MS;

/**
 * Lower-timeframe bars per display bar. Scope §12.3 asks for roughly a twenty-to-one ratio;
 * 1-minute bars under 1-hour display bars gives sixty, which is better and costs nothing
 * because Binance publishes 1-minute klines for free.
 */
export const PATH_BARS_PER_DISPLAY_BAR = DISPLAY_TF_MS / RESOLUTION_TF_MS;

/**
 * How fast a Manage reveal advances, in milliseconds per display bar.
 *
 * §10.1 says "candles advance in real time", which cannot mean literal hours. One second a candle
 * puts a 60-bar window at a minute, which is long enough to make trailing a decision with a cost and
 * short enough that the mode stays a rep generator.
 *
 * It is a *server* constant. The reveal is metered against `rounds.manage_opened_at` and the client
 * is never sent an unrevealed bar — in Manage the player is still deciding while the candles arrive,
 * so shipping the window up front would put the whole future in the tab (§6).
 */
export const MANAGE_MS_PER_BAR = 1_000;

/** Length of the stored resolution path, in lower-timeframe bars. */
export const PATH_BARS = REVEAL_BARS * PATH_BARS_PER_DISPLAY_BAR;
