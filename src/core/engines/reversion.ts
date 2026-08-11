/**
 * REVERSION — Connors & Alvarez, and the one place this roster argues with itself.
 *
 * *Short Term Trading Strategies That Work* (2008). The rules are specific: price above its
 * 200-period moving average, buy when the 2-period RSI drops below 5, exit on a close above the
 * 5-period mean. Long only.
 *
 * ## Why this engine matters more than its hit rate
 *
 * **Rule 5 of the book is titled "Stops Hurt."** Connors and Alvarez tested stops from 1% to 50%
 * across fifteen years of liquid US equities and reported: *"In every single case, the use of stops
 * lowered the performance."* Risk is controlled by position sizing instead.
 *
 * Our entire product is stop placement. So this is not a school with an inconvenient gap to be
 * quietly filled — it is a school whose own published research says the thing we measure makes
 * results worse. The stop below is **ours**, it is marked `ours`, and the objection is printed on
 * screen beside it. Hiding that would waste the most interesting disagreement on the roster.
 *
 * ## Two engines from one implementation, and why that is a control rather than a tuning
 *
 * Faithful REVERSION fires on **2.2%** of this corpus — 22 charts. That is below anything
 * measurable: the detectability floor needs roughly 300 observations to resolve a large effect, and
 * 22 resolves nothing. The 200-period filter is what reduces it, and it is also Rule 3 and
 * load-bearing — dip-buying *below* the 200-MA is precisely where the system loses, so dropping it
 * does not approximate the system, it inverts it.
 *
 * So both ship. `REVERSION` is faithful and reports its coverage honestly. `REVERSION_H` —
 * **Hindsight Reversion, named as ours everywhere it appears** — differs in exactly one rule.
 *
 * That is deliberately *not* a retune. The pair is a controlled experiment on Connors' own Rule 3:
 * does the regime filter earn its place on 24/7 crypto at hourly resolution? Nobody has published
 * that, the crypto prior actually runs against Connors (liquid majors show short-horizon *momentum*
 * at these horizons), and running both is the only way to find out rather than assert.
 *
 * ## The window
 *
 * The 200-period filter needs 200 candles and the player may have seen 80. Engines read the full
 * stored lead-in — up to 300, available on 978 of 1,000 charts — which is history *before* the
 * window and never after it. `candlesUsed` reports it, and the debrief prints it, because it is an
 * asymmetry even though it is not a leak.
 */

import type { Bar } from '../bars';
import { causal } from '../causal';
import { rsi, sma } from '../indicators';
import { ENGINE_VERSION } from '../versions';
import { THRESHOLDS } from './manifest';
import { passes, type Annotation, type Engine, type EngineInput, type Verdict } from './contract';

const T = THRESHOLDS.reversion;

function read(engine: Engine, input: EngineInput, useRegimeFilter: boolean): Verdict {
  const { bars, entry, atr } = input;
  const used = bars.length;
  const i = used - 1;

  if (used < (useRegimeFilter ? T.regimePeriod + 1 : T.rsiPeriod + 2)) {
    return passes(
      engine,
      ENGINE_VERSION,
      useRegimeFilter
        ? `not enough history for the ${T.regimePeriod}-period regime filter`
        : 'not enough history for RSI(2)',
      used,
    );
  }

  const closes = bars.map((bar: Bar) => bar.c);

  // Rule 3, and it is load-bearing rather than a garnish.
  if (useRegimeFilter) {
    const regime = sma(closes, T.regimePeriod)[i];
    if (regime === null) {
      return passes(engine, ENGINE_VERSION, 'no regime average yet', used);
    }
    if (closes[i] <= regime) {
      return passes(
        engine,
        ENGINE_VERSION,
        `below the ${T.regimePeriod}-period average (${regime.toFixed(2)}) — Rule 3 forbids the trade`,
        used,
      );
    }
  }

  const oversold = rsi(closes, T.rsiPeriod)[i];
  if (oversold === null) {
    return passes(engine, ENGINE_VERSION, `RSI(${T.rsiPeriod}) is undefined here`, used);
  }
  if (oversold >= T.rsiThreshold) {
    return passes(
      engine,
      ENGINE_VERSION,
      `RSI(${T.rsiPeriod}) is ${oversold.toFixed(1)}, not below ${T.rsiThreshold} — no pullback to buy`,
      used,
    );
  }

  if (!(atr > 0)) return passes(engine, ENGINE_VERSION, 'no ATR to size a stop with', used);

  // Long only. The published system buys weakness in an uptrend and has no short side at all;
  // inventing one would be a different system wearing the name.
  const stop = entry - T.stopAtr * atr;
  const target = entry + T.targetR * (entry - stop);

  return {
    engine: engine.code,
    name: engine.name,
    version: ENGINE_VERSION,
    direction: 'long',
    bracket: { stop, target },
    exit: {
      kind: 'close-beyond-ma',
      period: T.exitMaPeriod,
      description: `exit on a close above the ${T.exitMaPeriod}-bar mean`,
    },
    // Both ours, and for different reasons: the school has no stop *by principle*, and its exit is
    // a per-bar condition rather than a price.
    provenance: { stop: 'ours', target: 'ours' },
    conviction: null,
    rules: [
      useRegimeFilter
        ? `above the ${T.regimePeriod}-period average, so Rule 3 permits a long`
        : 'regime filter disabled — this is the Hindsight variant, not Connors',
      `RSI(${T.rsiPeriod}) = ${oversold.toFixed(1)}, below ${T.rsiThreshold}`,
      `stop ${T.stopAtr} ATR — OURS. Rule 5 of the book is "Stops Hurt": every stop they tested, from 1% to 50%, lowered performance.`,
    ],
    annotations: [
      causal<Annotation>({ kind: 'band', price: entry, to: stop, label: 'our stop, not theirs' }, i, i),
    ],
    candlesUsed: used,
  };
}

export const REVERSION: Engine = {
  code: 'REVERSION',
  name: 'Reversion',
  school: 'Connors & Alvarez — Short Term Trading Strategies That Work, 2008',
  needs: T.regimePeriod + 1,
  read: (input) => read(REVERSION, input, true),
};

export const REVERSION_H: Engine = {
  code: 'REVERSION_H',
  name: 'Reversion (Hindsight)',
  // Named as ours in the school line too, so it cannot be mistaken for Connors anywhere it appears.
  school: 'Ours — Connors & Alvarez without Rule 3, as a control on the regime filter',
  needs: T.rsiPeriod + 2,
  read: (input) => read(REVERSION_H, input, THRESHOLDS.reversionHindsight.useRegimeFilter),
};
