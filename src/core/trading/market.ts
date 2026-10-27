/**
 * A replay market: one corpus chart, turned back into the real instrument it was.
 *
 * The chart's 60-hour reveal becomes the **tape**: 3,600 one-minute bars the replay streams and
 * the simulator fills against. Everything before it is **history**: up to 300 hourly bars and,
 * for the last 80 hours, the minutes underneath them.
 *
 * Fills walk `resolution_path`, the array every stored bracket result was resolved against, so a
 * session and a bracket on the same chart agree to the minute. Volume is not in that array, so
 * the tape takes its volume from the reveal half of `detail_path`, which holds the same minutes
 * with volume attached.
 *
 * The schools read the same market but not in real units: their thresholds are tick-space
 * geometry around an index of 100 (`src/core/geometry/space.ts`), so they get the stored indexed
 * bars, un-mirrored. A mirrored chart read as stored would turn a long-only school into a short
 * seller on half the corpus.
 */

import type { Bar } from '../bars';
import { mirrorBar } from '../normalize';
import { PATH_BARS_PER_DISPLAY_BAR } from '../config';
import {
  deriveInstrument,
  toRealBar,
  toTickBar,
  type Instrument,
} from './instrument';

/** The chart columns a market is built from. Prices are as stored: indexed, maybe mirrored. */
export interface MarketSource {
  chartId: string;
  symbol: string;
  /** Open time of the decision bar, the last lead-in hour. */
  decisionAt: string | number;
  indexFactor: number;
  mirrored: boolean;
  volumeBase: number;
  leadInBars: Bar[];
  leadInExtra: Bar[] | null;
  revealBars: Bar[];
  /** The resolution path, prices only. */
  path: Bar[];
  /** The detail path — lead-in minutes then reveal minutes, with volume — when stored. */
  detail: Bar[] | null;
}

export interface Market {
  chartId: string;
  instrument: Instrument;
  /** Hourly history ending at the decision bar, in ticks, volume in base units. */
  historyHours: Bar[];
  /** One-minute history under the last `historyMinutes.length / 60` history hours. */
  historyMinutes: Bar[];
  /** The replay, one bar per minute, in ticks. */
  tape: Bar[];
  /** False when no minute volume was stored for the tape. */
  tapeHasVolume: boolean;
  /** Close of the decision bar, in ticks — the price before the first tape minute. */
  refClose: number;
  /** Weekday (0 = Monday) and minute of the UTC day at which tape minute 0 opens. */
  start: { weekday: number; minuteOfDay: number };
  /** Real epoch ms of tape minute 0's open. Server-side only until the session closes. */
  startMs: number;
  /** For the schools: hourly history, indexed and un-mirrored, volume rebased. */
  indexedHistory: Bar[];
  /** For the schools: the 60 tape hours, indexed and un-mirrored. */
  indexedTape: Bar[];
  indexFactor: number;
}

const HOUR_MS = 3_600_000;

export function marketFromChart(source: MarketSource): Market {
  const { indexFactor, mirrored, volumeBase } = source;
  const hoursRaw = [...(source.leadInExtra ?? []), ...source.leadInBars];
  const real = (bar: Bar) => toRealBar(bar, indexFactor, mirrored, volumeBase);

  const decisionClose = real(source.leadInBars[source.leadInBars.length - 1]).c;
  const instrument = deriveInstrument(source.symbol, decisionClose);
  const tick = (bar: Bar) => toTickBar(real(bar), instrument);

  const leadInMinutes = source.leadInBars.length * PATH_BARS_PER_DISPLAY_BAR;
  const detail = source.detail;
  const detailHasTape = detail !== null && detail.length >= leadInMinutes + source.path.length;

  const tape = source.path.map((bar, i) => {
    const volume = detailHasTape ? detail[leadInMinutes + i].v : 0;
    return tick({ ...bar, v: volume });
  });

  const decisionMs =
    typeof source.decisionAt === 'number' ? source.decisionAt : Date.parse(source.decisionAt);
  const startMs = decisionMs + HOUR_MS;
  const start = new Date(startMs);

  return {
    chartId: source.chartId,
    instrument,
    historyHours: hoursRaw.map(tick),
    historyMinutes: detail !== null ? detail.slice(0, leadInMinutes).map(tick) : [],
    tape,
    tapeHasVolume: detailHasTape,
    refClose: tick(source.leadInBars[source.leadInBars.length - 1]).c,
    start: {
      // getUTCDay is Sunday-first; the product's clock is Monday-first (src/lib/clock.ts).
      weekday: (start.getUTCDay() + 6) % 7,
      minuteOfDay: start.getUTCHours() * 60 + start.getUTCMinutes(),
    },
    startMs,
    indexedHistory: hoursRaw.map((bar) => (mirrored ? mirrorBar(bar) : bar)),
    indexedTape: source.revealBars.map((bar) => (mirrored ? mirrorBar(bar) : bar)),
    indexFactor,
  };
}

/** Total tape length in minutes. */
export function tapeMinutes(market: Pick<Market, 'tape'>): number {
  return market.tape.length;
}

/** The trade price at the close of minute `at`, or the decision close before the tape starts. */
export function closeAt(market: Pick<Market, 'tape' | 'refClose'>, at: number): number {
  return at < 0 ? market.refClose : market.tape[Math.min(at, market.tape.length - 1)].c;
}
