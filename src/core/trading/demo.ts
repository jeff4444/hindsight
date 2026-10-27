/**
 * A synthetic market, for the places a real one cannot go.
 *
 * The landing page, the offline bot run and `/lab/terminal` all need a market without a database.
 * This builds one from a seeded minute-level walk with clustered volatility, drifting regimes and
 * volume that rises with the size of the move — enough to look and trade like a market at a
 * glance, and labelled as synthetic wherever it is shown. It is never a corpus chart and nothing
 * played on it is stored.
 *
 * Deterministic in its seed, because it renders on the server and again in the browser.
 */

import type { Bar } from '../bars';
import { mulberry32 } from '../random';
import { median } from '../normalize';
import { deriveInstrument, toTickBar } from './instrument';
import type { Market } from './market';

const HISTORY_HOURS = 300;
const MINUTE_HISTORY_HOURS = 80;
const TAPE_HOURS = 60;

/** Monday 4 January 2021, 00:00 UTC, plus whole hours from the seed. Fiction, but a fixed one. */
const EPOCH = Date.UTC(2021, 0, 4);

function walk(seed: number, minutes: number, start: number): Bar[] {
  const rng = mulberry32(seed);
  const gauss = () => {
    const u = Math.max(1e-12, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const bars: Bar[] = [];
  let price = start;
  let vol = 0.0009;
  let drift = 0;
  for (let i = 0; i < minutes; i++) {
    if (i % 240 === 0) drift = (rng() - 0.5) * 0.00012;
    const hourOfDay = Math.floor(i / 60) % 24;
    // Busier in the European and US afternoons, quieter in the small hours.
    const session = 0.7 + 0.6 * Math.exp(-((hourOfDay - 15) ** 2) / 18);
    const shock = gauss();
    vol = Math.min(0.004, Math.max(0.0003, 0.97 * vol + 0.03 * 0.0009 * Math.abs(shock) * 1.6));
    const r = drift + vol * session * shock;
    const o = price;
    const c = o * Math.exp(r);
    const wick = vol * session * 0.6;
    const h = Math.max(o, c) * (1 + Math.abs(gauss()) * wick);
    const l = Math.min(o, c) * (1 - Math.abs(gauss()) * wick);
    const v = (40 + 900 * Math.abs(r) / 0.001) * session * (0.6 + rng() * 0.8);
    bars.push({ o, h, l, c, v });
    price = c;
  }
  return bars;
}

function hourly(minutes: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i + 60 <= minutes.length; i += 60) {
    const slice = minutes.slice(i, i + 60);
    out.push({
      o: slice[0].o,
      h: Math.max(...slice.map((b) => b.h)),
      l: Math.min(...slice.map((b) => b.l)),
      c: slice[slice.length - 1].c,
      v: slice.reduce((sum, b) => sum + b.v, 0),
    });
  }
  return out;
}

export function demoMarket(seed = 7): Market {
  const rng = mulberry32(seed ^ 0x5eed);
  const startPrice = 40 + rng() * 160;
  const minutes = walk(seed, (HISTORY_HOURS + TAPE_HOURS) * 60, startPrice);
  const hours = hourly(minutes);

  const historyReal = hours.slice(0, HISTORY_HOURS);
  const tapeReal = minutes.slice(HISTORY_HOURS * 60);
  const minuteHistoryReal = minutes.slice((HISTORY_HOURS - MINUTE_HISTORY_HOURS) * 60, HISTORY_HOURS * 60);

  const decision = historyReal[historyReal.length - 1];
  const instrument = deriveInstrument('DEMOUSDT', decision.c);
  const tick = (bar: Bar) => toTickBar(bar, instrument);

  // The council's view: indexed to 100 at the first of the 80 visible hours, volume rebased.
  const visible = historyReal.slice(-80);
  const factor = 100 / visible[0].o;
  const volumeBase = median(visible.map((b) => b.v));
  const indexed = (bar: Bar): Bar => ({
    o: bar.o * factor,
    h: bar.h * factor,
    l: bar.l * factor,
    c: bar.c * factor,
    v: volumeBase > 0 ? bar.v / volumeBase : 0,
  });

  const hourOffset = Math.floor(rng() * 24 * 7);
  const startMs = EPOCH + (hourOffset + HISTORY_HOURS) * 3_600_000;
  const start = new Date(startMs);

  return {
    chartId: `demo-${seed}`,
    instrument: { ...instrument, display: 'DEMO/USDT', venue: 'Synthetic' },
    historyHours: historyReal.map(tick),
    historyMinutes: minuteHistoryReal.map(tick),
    tape: tapeReal.map(tick),
    tapeHasVolume: true,
    refClose: tick(decision).c,
    start: {
      weekday: (start.getUTCDay() + 6) % 7,
      minuteOfDay: start.getUTCHours() * 60 + start.getUTCMinutes(),
    },
    startMs,
    indexedHistory: historyReal.map(indexed),
    indexedTape: hours.slice(HISTORY_HOURS).map(indexed),
    indexFactor: factor,
  };
}
