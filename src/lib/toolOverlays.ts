import type { Bar } from '@/core/bars';
import type { Overlay } from '@/components/Chart';
import type { ToolCode } from '@/core/tiers';
import {
  bollinger,
  chandelier,
  donchian,
  ema,
  keltner,
  macd,
  psar,
  rsi,
  supertrend,
  type Series,
} from '@/core/indicators';
import { fitChannel, railsAt } from '@/core/geometry/channels';
import { levelsFrom } from '@/core/geometry/levels';
import { atGrade, persistentSwings, walkFromBars } from '@/core/geometry/swings';
import { selected } from '@/core/geometry/trendlines';
import { volumeProfile } from '@/core/geometry/volumeProfile';

/**
 * Everything a granted tool draws, as chart-space polylines.
 *
 * Pure, so it is testable without a DOM and so the Full Desk toolbox and the geometry lab cannot
 * drift apart — they call the same function.
 *
 * **This runs on the client, and that is safe by construction.** Every input is the lead-in the
 * player already holds; nothing here can reach the reveal because nothing here is given it. §12.1's
 * rule is that the *payload* must not contain the future, and computing an indicator from bars
 * already on screen adds nothing to what the client knows. The alternative — computing server-side
 * and shipping the result — would be strictly worse: more payload, more surface, and the same
 * information.
 */

export const TOOL_COLOUR = {
  ma: ['#60a5fa', '#f59e0b', '#a78bfa'],
  band: '#22d3ee',
  bandMid: '#0e7490',
  donchian: '#84cc16',
  swingHigh: '#f97316',
  swingLow: '#38bdf8',
  trendline: '#a78bfa',
  channel: '#22c55e',
  level: '#eab308',
  poc: '#ef4444',
  valueArea: '#7f1d1d',
  oscillator: '#e2e8f0',
  oscillatorSignal: '#f97316',
  stop: '#fb7185',
} as const;

/** Moving-average lengths offered. Three is what every platform ships and what a reader uses. */
export const MA_LENGTHS = [20, 50, 200] as const;

/** Turn an aligned series into a polyline, dropping the warm-up. */
function line(series: Series, colour: string, options: Partial<Overlay> = {}): Overlay | null {
  const points: { index: number; price: number }[] = [];
  for (let i = 0; i < series.length; i++) {
    const value = series[i];
    if (value !== null && Number.isFinite(value)) points.push({ index: i, price: value });
  }
  return points.length >= 2 ? { points, color: colour, ...options } : null;
}

export interface ToolContext {
  bars: Bar[];
  atr: number;
  /** The one-minute detail, when the tier ships it. Only the volume profile wants it. */
  minutes?: Bar[];
  minutesPerBar?: number;
}

/**
 * Build the overlays for a set of active tools.
 *
 * Order matters for legibility rather than correctness: bands and averages first so the eye reads
 * them as background, then the geometry, then the swings on top. A later series paints over an
 * earlier one.
 */
export function overlaysFor(active: readonly ToolCode[], context: ToolContext): Overlay[] {
  const { bars, atr } = context;
  if (bars.length === 0 || !(atr > 0)) return [];

  const has = (tool: ToolCode) => active.includes(tool);
  const closes = bars.map((bar) => bar.c);
  const out: (Overlay | null)[] = [];
  const last = bars.length - 1;

  const span = (price: number, colour: string, options: Partial<Overlay> = {}): Overlay => ({
    points: [
      { index: 0, price },
      { index: last, price },
    ],
    color: colour,
    ...options,
  });

  /* ------------------------------------------------------------- indicators */

  if (has('ma')) {
    MA_LENGTHS.forEach((length, i) => {
      out.push(line(ema(closes, length), TOOL_COLOUR.ma[i], { width: 1 }));
    });
  }

  if (has('bollinger')) {
    const band = bollinger(closes);
    out.push(line(band.upper, TOOL_COLOUR.band));
    out.push(line(band.lower, TOOL_COLOUR.band));
    out.push(line(band.mid, TOOL_COLOUR.bandMid, { dashed: true }));
  }

  if (has('keltner')) {
    const band = keltner(bars);
    out.push(line(band.upper, TOOL_COLOUR.band, { dashed: true }));
    out.push(line(band.lower, TOOL_COLOUR.band, { dashed: true }));
  }

  if (has('donchian')) {
    const band = donchian(bars);
    out.push(line(band.upper, TOOL_COLOUR.donchian));
    out.push(line(band.lower, TOOL_COLOUR.donchian));
  }

  /* ------------------------------------------------------------- the profile */

  if (has('volumeProfile')) {
    // From the one-minute bars where the tier ships them — that is what makes this a real profile
    // rather than a synthesised one. Falling back to display bars would be the fabrication §1.1
    // rejects, so where there is no minute detail there is no profile.
    const source = context.minutes && context.minutes.length > 0 ? context.minutes : null;
    const profile = source ? volumeProfile(source, atr) : null;
    if (profile) {
      out.push(span(profile.poc, TOOL_COLOUR.poc, { width: 2 }));
      out.push(span(profile.vah, TOOL_COLOUR.valueArea, { dashed: true }));
      out.push(span(profile.val, TOOL_COLOUR.valueArea, { dashed: true }));
    }
  }

  /* --------------------------------------------------------- Layer 2 geometry */

  if (has('geometry')) {
    const swings = persistentSwings(walkFromBars(bars));

    const channel = fitChannel(bars);
    if (channel) {
      for (const rail of ['upper', 'mid', 'lower'] as const) {
        out.push({
          points: [0, channel.value.bars - 1].map((index) => ({
            index,
            price: railsAt(channel.value, index)[rail],
          })),
          color: TOOL_COLOUR.channel,
          dashed: rail === 'mid',
        });
      }
    }

    for (const side of ['upper', 'lower'] as const) {
      const trend = selected(bars, side);
      if (!trend) continue;
      out.push({
        points: [
          { index: trend.value.from.index, price: trend.value.from.price },
          { index: trend.value.to.index, price: trend.value.to.price },
        ],
        color: TOOL_COLOUR.trendline,
        width: 2,
      });
    }

    for (const level of levelsFrom(swings, atr)) {
      out.push(span(level.value.price, TOOL_COLOUR.level));
    }

    // The `major` grade. On a representative 80-bar chart the three grades emit 108, 48 and 12
    // swings, and forty-eight marks on eighty candles is a fog rather than an annotation.
    for (const swing of atGrade(swings, atr, 'major')) {
      const reach = Math.max(1, Math.round(swing.value.persistence / atr));
      out.push({
        points: [
          { index: Math.max(0, swing.value.index - reach), price: swing.value.price },
          { index: Math.min(last, swing.value.index + reach), price: swing.value.price },
        ],
        color: swing.value.kind === 'high' ? TOOL_COLOUR.swingHigh : TOOL_COLOUR.swingLow,
        width: 2,
      });
    }
  }

  /* -------------------------------------------------- stop algorithms (Sandbox) */

  if (has('stopAlgos')) {
    out.push(line(chandelier(bars).lower, TOOL_COLOUR.stop));
    out.push(line(supertrend(bars).line, TOOL_COLOUR.stop, { dashed: true }));
    out.push(line(psar(bars), TOOL_COLOUR.stop, { width: 1 }));
  }

  /* ------------------------------------------------------------- oscillators */

  if (has('rsi')) {
    out.push(line(rsi(closes), TOOL_COLOUR.oscillator, { pane: 1 }));
    // The 30 and 70 rails, drawn in the same pane so the reading has a reference.
    for (const level of [30, 70]) {
      out.push({
        points: [
          { index: 0, price: level },
          { index: last, price: level },
        ],
        color: TOOL_COLOUR.oscillatorSignal,
        dashed: true,
        pane: 1,
      });
    }
  }

  if (has('macd')) {
    const result = macd(closes);
    out.push(line(result.macd, TOOL_COLOUR.oscillator, { pane: 1 }));
    out.push(line(result.signal, TOOL_COLOUR.oscillatorSignal, { pane: 1 }));
  }

  return out.filter((overlay): overlay is Overlay => overlay !== null);
}

/**
 * What a measured distance is worth, in the units the trade is scored in.
 *
 * The reason the measure tool is a §3.1 universal rather than a Full Desk tool: on a chart with no
 * ticker and no absolute price, ATR and R are the only units that survive normalisation, and a
 * player who cannot convert a distance on screen into them is guessing at the arithmetic rather
 * than at the market.
 *
 * `risk` is the distance from entry to the placed stop. Null before a stop exists, in which case
 * there is no R to quote and the readout says so rather than inventing a denominator.
 */
export function measureReadout(
  from: number,
  to: number,
  atr: number,
  risk: number | null,
): { delta: number; percent: number; atr: number; r: number | null } {
  const delta = to - from;
  return {
    delta,
    percent: from === 0 ? 0 : (delta / from) * 100,
    atr: atr > 0 ? delta / atr : 0,
    r: risk && risk > 0 ? delta / risk : null,
  };
}
