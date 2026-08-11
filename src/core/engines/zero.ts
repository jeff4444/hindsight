/**
 * Engine Zero — the null, on the same leaderboard as everything else.
 *
 * §5.3: *"Random direction, 2 ATR stop, fixed 2R target, applied to every chart in the corpus. The
 * null hypothesis, published on the same leaderboard as everything else."* §14 asks for it **from
 * day one**, and that instruction is the single most valuable line in §5.
 *
 * ## Why a random benchmark is a real control and not a gimmick
 *
 * Biondo et al. (PLoS ONE, 2013) used random strategies as an explicit benchmark and found them
 * competitive with standard technical rules. That is the citation. Van Tharp's widely repeated
 * coin-flip claim is *not* — undisclosed markets, undisclosed parameters, poorly replicated — and it
 * is cited here as motivation only, never as evidence.
 *
 * The reason it earns its place is arithmetic rather than rhetorical. §13.9 established that the
 * best of twelve comparisons cleared 95% and then vanished under correction; for six engines the
 * expected maximum Sharpe under the null is **1.30·√V**, so the best of six *pure noise* engines
 * beats zero by 1.3 cross-engine standard deviations. A leaderboard without that band printed on it
 * is not a leaderboard, it is a ranking of noise with the noise removed from view.
 *
 * ## Its win rate is measured, never assumed
 *
 * A 2R target with a 2 ATR stop is *not* a 33.3% proposition. Drift moves it, the timeout at 60
 * candles truncates it, and §12.3.2's stop-first convention decides every bar where both levels are
 * touched inside one minute. `scripts/engines.ts` runs this over many seeds and publishes the
 * distribution; nothing anywhere multiplies 1/3 by anything.
 *
 * ## It never abstains, and that is the point
 *
 * Every other engine on the roster passes most of the time — the council is silent on 39.7% of
 * charts. Engine Zero speaks on all of them, which makes it the only engine with a full-corpus
 * record and therefore the only stable reference the others can be measured against.
 */

import { mulberry32 } from '../random';
import { ENGINE_VERSION } from '../versions';
import { THRESHOLDS } from './manifest';
import { passes, type Engine, type EngineInput, type Verdict } from './contract';

const T = THRESHOLDS.zero;

export const ZERO: Engine = {
  code: 'ZERO',
  name: 'Engine Zero',
  school: 'The null — random direction, published beside the rest',
  needs: 1,

  read(input: EngineInput): Verdict {
    const { entry, atr, seed } = input;
    if (!(atr > 0)) return passes(ZERO, ENGINE_VERSION, 'no ATR to size a stop with', input.bars.length);

    // Seeded on the chart, so the null is reproducible: the same chart yields the same coin flip
    // for ever, and a track record computed today can be re-derived tomorrow.
    const long = mulberry32(seed >>> 0)() < 0.5;
    const stop = long ? entry - T.stopAtr * atr : entry + T.stopAtr * atr;
    const risk = Math.abs(entry - stop);
    const target = long ? entry + T.targetR * risk : entry - T.targetR * risk;

    return {
      engine: 'ZERO',
      name: ZERO.name,
      version: ENGINE_VERSION,
      direction: long ? 'long' : 'short',
      bracket: { stop, target },
      exit: null,
      provenance: { stop: 'ours', target: 'ours' },
      conviction: null,
      rules: [
        'a coin flip, seeded on the chart so it is reproducible',
        `stop ${T.stopAtr} ATR, target ${T.targetR}R — fixed, and chosen before any chart was seen`,
      ],
      annotations: [],
      candlesUsed: input.bars.length,
    };
  },
};
