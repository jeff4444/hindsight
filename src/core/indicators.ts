/**
 * Indicators, with every formula written out.
 *
 * The reason this file spells out arithmetic that any library would provide:
 *
 * > Even RSI has no canonical implementation. TA-Lib and TradingView disagree on weekly BTCUSDT
 * > ATR(7) by 12% (998.11 vs 891.05). If a formula from a 1978 book produces that in 2026,
 * > "canonical order block" was never coming.
 *
 * A player at Full Desk who reads an RSI of 71 and places a stop on it is entitled to know which
 * RSI. So each function below states its seeding, its smoothing and its divisor, and
 * `docs/rules.md` prints them. Where two respectable implementations differ, the difference is
 * named and one is chosen in the open — that is the same bargain the themes struck in §13.7.
 *
 * **Everything here is causal by interface.** Each function takes the bars visible so far and
 * returns one array aligned to them, where entry *i* uses only bars 0…*i*. Nulls fill the warm-up
 * rather than the series starting late, so an index into the output is always an index into the
 * input — the off-by-one that silently shifts an indicator one bar into the future is the whole
 * reason for that choice.
 *
 * **Tier gating happens elsewhere.** `src/core/tiers.ts` decides who may see these; this file only
 * computes them. Nothing here is available below Full Desk, and the stop-placement algorithms at
 * the bottom are Sandbox-only for the reason recorded there.
 */

import type { Bar } from './bars';
import { trueRange } from './atr';

/** A value per bar, `null` through the warm-up. Always the same length as the input. */
export type Series = (number | null)[];

/* ------------------------------------------------------------------ averages */

/**
 * Simple moving average. The unambiguous one.
 */
export function sma(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period < 1) return out;

  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded on the simple average of the first `period` values.
 *
 * **The choice, named.** There are two common seedings. TA-Lib seeds on the SMA of the first
 * `period` values and emits nothing before that; many charting packages seed on the *first value*
 * and emit from bar zero. The second converges to the same curve but is visibly wrong early —
 * with a 200-period EMA the first hundred bars are essentially the first close, and on an 80-bar
 * lead-in that is the whole chart.
 *
 * So: SMA seed, nulls through the warm-up. `α = 2 / (period + 1)`.
 */
export function ema(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;

  const alpha = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let previous = seed / period;
  out[period - 1] = previous;

  for (let i = period; i < values.length; i++) {
    previous = values[i] * alpha + previous * (1 - alpha);
    out[i] = previous;
  }
  return out;
}

/**
 * Wilder's smoothing — the recursion behind RSI, ATR and ADX.
 *
 * `next = (previous · (period − 1) + value) / period`, which is an EMA with `α = 1/period` rather
 * than `2/(period+1)`. Conflating the two is the single most common source of two implementations
 * disagreeing about "the same" indicator, and it is most of the TA-Lib/TradingView ATR gap.
 */
export function wilder(values: readonly number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;

  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let previous = seed / period;
  out[period - 1] = previous;

  for (let i = period; i < values.length; i++) {
    previous = (previous * (period - 1) + values[i]) / period;
    out[i] = previous;
  }
  return out;
}

/* -------------------------------------------------------------------- bands */

export interface Bands {
  upper: Series;
  mid: Series;
  lower: Series;
}

/** Standard deviation of a window, population divisor. See `bollinger` for why. */
function populationSd(values: readonly number[], from: number, to: number, mean: number): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += (values[i] - mean) ** 2;
  return Math.sqrt(sum / (to - from));
}

/**
 * Bollinger Bands: an SMA with standard-deviation bands.
 *
 * **The choice, named.** Bollinger's own definition and TradingView both use the **population**
 * standard deviation — divisor *n*. A great many libraries use the sample divisor *n − 1*, which at
 * the default 20 periods makes the bands about 2.6% wider. Neither is wrong as statistics; they are
 * different indicators wearing one name. Population, because that is what Bollinger specified.
 */
export function bollinger(
  values: readonly number[],
  period = 20,
  multiple = 2,
): Bands {
  const mid = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const mean = mid[i];
    if (mean === null) continue;
    const sd = populationSd(values, i - period + 1, i + 1, mean);
    upper[i] = mean + multiple * sd;
    lower[i] = mean - multiple * sd;
  }

  return { upper, mid, lower };
}

/**
 * Keltner Channels: an EMA with ATR bands.
 *
 * **The choice, named.** Chester Keltner's original used a 10-day SMA of typical price with bands
 * from the *daily range*; Linda Raschke's revision — which is what every platform now ships and
 * what TradingView defaults to — uses an EMA of close with bands from **ATR under Wilder's
 * smoothing**. The modern one, because it is what a player will recognise, and Wilder's smoothing
 * because it is the same ATR the badge and every stop distance in this product already use.
 */
export function keltner(bars: readonly Bar[], period = 20, atrPeriod = 10, multiple = 2): Bands {
  const closes = bars.map((bar) => bar.c);
  const mid = ema(closes, period);

  const ranges = bars.map((bar, i) => trueRange(bar, i === 0 ? null : bars[i - 1].c));
  // The first true range has no previous close, so it is not comparable — dropped for the same
  // reason `atr()` drops it, and the offset put back afterwards.
  const smoothed = wilder(ranges.slice(1), atrPeriod);

  const upper: Series = new Array(bars.length).fill(null);
  const lower: Series = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    const centre = mid[i];
    const range = i > 0 ? smoothed[i - 1] : null;
    if (centre === null || range === null) continue;
    upper[i] = centre + multiple * range;
    lower[i] = centre - multiple * range;
  }

  return { upper, mid, lower };
}

/**
 * Donchian Channels: the highest high and lowest low of the last `period` bars.
 *
 * The most stop-relevant channel there is — it *is* an N-bar extreme, which is what a structural
 * stop is — and the only one in this file with nothing to disambiguate. The one question it does
 * raise is whether the current bar counts; it does, which is TradingView's behaviour and the one
 * that makes "price is at the top of its range" true when price is at the top of its range.
 */
export function donchian(bars: readonly Bar[], period = 20): Bands {
  const upper: Series = new Array(bars.length).fill(null);
  const mid: Series = new Array(bars.length).fill(null);
  const lower: Series = new Array(bars.length).fill(null);

  for (let i = period - 1; i < bars.length; i++) {
    let high = -Infinity;
    let low = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].h > high) high = bars[j].h;
      if (bars[j].l < low) low = bars[j].l;
    }
    upper[i] = high;
    lower[i] = low;
    mid[i] = (high + low) / 2;
  }

  return { upper, mid, lower };
}

/* --------------------------------------------------------------- oscillators */

/**
 * Wilder's Relative Strength Index.
 *
 * `RSI = 100 − 100 / (1 + RS)`, where RS is the Wilder-smoothed average gain over the
 * Wilder-smoothed average loss. Losses are carried as positive magnitudes.
 *
 * **Two things that are commonly got wrong**, and both change the number visibly:
 *
 * 1. The smoothing is **Wilder's**, not an EMA of the same period. An EMA(14) of gains gives a
 *    materially different RSI, and libraries do ship it.
 * 2. When average loss is zero the RSI is **100** by definition, not a division by zero. A flat
 *    series has neither, and returns null rather than 50 — a made-up midpoint would be a number
 *    the data does not support.
 */
export function rsi(values: readonly number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period + 1) return out;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    gains.push(Math.max(0, change));
    losses.push(Math.max(0, -change));
  }

  const avgGain = wilder(gains, period);
  const avgLoss = wilder(losses, period);

  for (let i = 0; i < gains.length; i++) {
    const gain = avgGain[i];
    const loss = avgLoss[i];
    if (gain === null || loss === null) continue;
    // `gains` is offset by one from `values`, because the first bar has no change.
    out[i + 1] = loss === 0 ? (gain === 0 ? null : 100) : 100 - 100 / (1 + gain / loss);
  }

  return out;
}

export interface Macd {
  macd: Series;
  signal: Series;
  histogram: Series;
}

/**
 * Moving-average convergence divergence.
 *
 * `MACD = EMA(fast) − EMA(slow)`, `signal = EMA(MACD, 9)`, `histogram = MACD − signal`.
 *
 * **The choice, named.** The signal line is an EMA *of the MACD line*, which does not exist until
 * the slow EMA does. Some implementations start the signal's own warm-up from bar zero, treating
 * the leading nulls as zeros, which drags the first several signal values toward zero and produces
 * histogram crossings that are artefacts of the warm-up. Here the signal EMA is seeded on the first
 * `signalPeriod` *defined* MACD values and is null before that.
 */
export function macd(
  values: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): Macd {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);

  const line: Series = values.map((_, i) =>
    fast[i] === null || slow[i] === null ? null : (fast[i] as number) - (slow[i] as number),
  );

  const firstDefined = line.findIndex((value) => value !== null);
  const signal: Series = new Array(values.length).fill(null);
  const histogram: Series = new Array(values.length).fill(null);

  if (firstDefined >= 0) {
    const defined = line.slice(firstDefined) as number[];
    const smoothed = ema(defined, signalPeriod);
    for (let i = 0; i < smoothed.length; i++) {
      const value = smoothed[i];
      if (value === null) continue;
      signal[firstDefined + i] = value;
      histogram[firstDefined + i] = defined[i] - value;
    }
  }

  return { macd: line, signal, histogram };
}

/* ------------------------------------------------- stop-placement algorithms */

/**
 * The three below are **Sandbox only**, and `src/core/tiers.ts` enforces it with a test.
 *
 * > Chandelier Exit, Volatility Stop, Chande Kroll Stop, Supertrend, Parabolic SAR are all easy to
 * > build and all causal. They are also **literally stop-placement algorithms**. For a game about
 * > placing stops, exposing them hands the player the answer.
 *
 * Sandbox is unrated and §3.2 calls it "the learning surface, not a tier", so seeing what a
 * Chandelier would have suggested is a legitimate thing to learn from when nothing is at stake.
 * They appear on no rated rung.
 */

/**
 * Chandelier Exit: an ATR-scaled trailing stop hung from the highest high of the period.
 *
 * `long = highest(high, period) − multiple · ATR(period)`.
 */
export function chandelier(bars: readonly Bar[], period = 22, multiple = 3): Bands {
  const ranges = bars.map((bar, i) => trueRange(bar, i === 0 ? null : bars[i - 1].c));
  const smoothed = wilder(ranges.slice(1), period);
  const extremes = donchian(bars, period);

  const upper: Series = new Array(bars.length).fill(null);
  const lower: Series = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    const range = i > 0 ? smoothed[i - 1] : null;
    if (range === null || extremes.upper[i] === null || extremes.lower[i] === null) continue;
    lower[i] = (extremes.upper[i] as number) - multiple * range;
    upper[i] = (extremes.lower[i] as number) + multiple * range;
  }
  return { upper, mid: extremes.mid, lower };
}

/**
 * Supertrend: an ATR band that ratchets and flips on a close through it.
 *
 * The band only ever moves in the favourable direction while the trend holds, which is the ratchet
 * that makes it a trailing stop rather than a channel.
 */
export function supertrend(bars: readonly Bar[], period = 10, multiple = 3): {
  line: Series;
  direction: (1 | -1 | null)[];
} {
  const ranges = bars.map((bar, i) => trueRange(bar, i === 0 ? null : bars[i - 1].c));
  const smoothed = wilder(ranges.slice(1), period);

  const line: Series = new Array(bars.length).fill(null);
  const direction: (1 | -1 | null)[] = new Array(bars.length).fill(null);

  let upper = Infinity;
  let lower = -Infinity;
  let trend: 1 | -1 = 1;

  for (let i = 1; i < bars.length; i++) {
    const range = smoothed[i - 1];
    if (range === null) continue;
    const mid = (bars[i].h + bars[i].l) / 2;
    const rawUpper = mid + multiple * range;
    const rawLower = mid - multiple * range;

    // The ratchet: a band tightens freely and loosens only when price closed through the old one.
    upper = rawUpper < upper || bars[i - 1].c > upper ? rawUpper : upper;
    lower = rawLower > lower || bars[i - 1].c < lower ? rawLower : lower;

    if (trend === 1 && bars[i].c < lower) trend = -1;
    else if (trend === -1 && bars[i].c > upper) trend = 1;

    direction[i] = trend;
    line[i] = trend === 1 ? lower : upper;
  }

  return { line, direction };
}

/**
 * Wilder's Parabolic SAR.
 *
 * The acceleration factor steps by `step` each time the extreme point advances, capped at `max`.
 * Wilder's own rule that the SAR may not enter the previous two bars' range is applied, because
 * without it the indicator produces stops inside bars that had already traded through them.
 */
export function psar(bars: readonly Bar[], step = 0.02, max = 0.2): Series {
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length < 2) return out;

  let rising = bars[1].c >= bars[0].c;
  let sar = rising ? bars[0].l : bars[0].h;
  let extreme = rising ? bars[0].h : bars[0].l;
  let acceleration = step;

  for (let i = 1; i < bars.length; i++) {
    sar = sar + acceleration * (extreme - sar);

    // Wilder: the SAR may not sit inside the previous two bars' range.
    const priorLow = Math.min(bars[i - 1].l, bars[Math.max(0, i - 2)].l);
    const priorHigh = Math.max(bars[i - 1].h, bars[Math.max(0, i - 2)].h);
    if (rising) sar = Math.min(sar, priorLow);
    else sar = Math.max(sar, priorHigh);

    const flipped = rising ? bars[i].l < sar : bars[i].h > sar;
    if (flipped) {
      rising = !rising;
      sar = extreme;
      extreme = rising ? bars[i].h : bars[i].l;
      acceleration = step;
    } else if ((rising && bars[i].h > extreme) || (!rising && bars[i].l < extreme)) {
      extreme = rising ? bars[i].h : bars[i].l;
      acceleration = Math.min(max, acceleration + step);
    }

    out[i] = sar;
  }

  return out;
}
