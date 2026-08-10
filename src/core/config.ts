/**
 * Chart geometry, shared by the pipeline, the API and the client.
 *
 * The window is shaped after the Naked (NTZ) tier of scope §3.2 — 80 candles, one timeframe,
 * volume, an ATR badge — because §3.2 makes NTZ the ranked standard and Phase 0 should be
 * building the shape the ladder will eventually rank. The tier machinery itself (the clock,
 * the other four rungs, the mods) is Phase 1.5 and is not here.
 */

import { HOUR_MS, MINUTE_MS } from './bars';

/** Candles the player sees before deciding. */
export const LEAD_IN_BARS = 80;

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

/** Length of the stored resolution path, in lower-timeframe bars. */
export const PATH_BARS = REVEAL_BARS * PATH_BARS_PER_DISPLAY_BAR;
