/**
 * SWEEP — a stop run above a prior extreme, rejected inside the same bar.
 *
 * §5.2 called this LIQUIDITY and credited it to ICT. It does not ship under that name, and the
 * reason is not squeamishness about the source — it is that **the source has no spec**.
 *
 * The stop is nearly specifiable: "beyond the sweep wick" is a rule. The target is fatal. Defining
 * "the next liquidity pool" deterministically requires a swing-pivot definition, an equal-level
 * clustering tolerance, a minimum touch count, a side convention, a tie-break among qualifying
 * pools, and a precedence rule between internal and external liquidity — **six rules, none of them
 * published anywhere authoritative**. Worse, the doctrine defines the draw on liquidity as a
 * *working hypothesis*: pick "the most obvious" pool and revise as structure changes. A rule
 * containing "most obvious" is not a rule, it is a discretionary loop, and the discretion is
 * precisely what the school considers the skill.
 *
 * So this engine is **ours**, top to bottom, written in that idiom and claiming nothing more. The
 * pseudocode is published in §14 and every threshold is in the manifest. It is the same bargain
 * §13.7 struck for the themes: the choice is not between the right definition and ours, it is
 * between an undisclosed definition and a published one.
 *
 * ## The rule §5.2 specified that is not in here
 *
 * §5.2 gave this engine a "minimum 1:2" reward filter. That is **not an ICT rule** — it is our
 * invention, and it is a bad one, because it silently overrides the pool choice whenever the nearest
 * pool sits closer than 2R. An engine that moves its target away from the level it claims to be
 * trading toward, in order to hit a reward ratio, is not doing what it says on screen.
 *
 * The nearest opposing pool is the target at whatever R it implies, including a poor one. **Where
 * there is no opposing pool in view, the engine passes** rather than inventing a price. That is the
 * abstention this school genuinely has, as distinct from the one §5.2 assumed.
 */

import { causal, type Causal } from '../causal';
import { persistentSwings, walkFromBars, atGrade, type Swing } from '../geometry/swings';
import { ENGINE_VERSION } from '../versions';
import { THRESHOLDS } from './manifest';
import { passes, type Annotation, type Engine, type EngineInput, type Verdict } from './contract';

const T = THRESHOLDS.sweep;

/**
 * The pools a trader could have drawn *before* this bar printed.
 *
 * `knownAt < decisionBar` rather than `<= `: a swing is only a level once it has been confirmed, and
 * a pool confirmed by the very bar that sweeps it was never on the chart to be swept. Filtering on
 * `existsAt` instead would be the pre-confirmation bug §8 names — the swing exists at its extreme,
 * but nobody could have drawn it there.
 */
function poolsBefore(bars: EngineInput['bars'], atr: number, decisionBar: number): Causal<Swing>[] {
  const swings = atGrade(persistentSwings(walkFromBars(bars)), atr, T.poolGrade);
  return swings.filter(
    (swing) =>
      swing.knownAt < decisionBar && swing.value.index >= decisionBar - T.lookbackBars,
  );
}

export const SWEEP: Engine = {
  code: 'SWEEP',
  name: 'Sweep',
  school: 'Ours — in the ICT idiom, with our own published rules; ICT publishes no spec',
  needs: 30,

  read(input: EngineInput): Verdict {
    const { bars, entry, atr } = input;
    const used = bars.length;
    if (used < SWEEP.needs || !(atr > 0)) {
      return passes(SWEEP, ENGINE_VERSION, 'not enough history to place a pool', used);
    }

    const i = used - 1;
    const bar = bars[i];
    const pools = poolsBefore(bars, atr, i);
    if (pools.length === 0) {
      return passes(SWEEP, ENGINE_VERSION, 'no confirmed pool within the lookback', used);
    }

    const penetration = T.minPenetrationAtr * atr;
    const rejection = T.minRejectionAtr * atr;

    // A sweep is a stop run *and* a rejection: the bar has to reach beyond the pool and then fail to
    // hold there. Reaching alone is a breakout, which is a different engine's trade entirely.
    const sweptHigh = pools
      .filter(
        (pool) =>
          pool.value.kind === 'high' &&
          bar.h >= pool.value.price + penetration &&
          bar.c <= pool.value.price - rejection,
      )
      .sort((a, b) => b.value.index - a.value.index)[0];

    const sweptLow = pools
      .filter(
        (pool) =>
          pool.value.kind === 'low' &&
          bar.l <= pool.value.price - penetration &&
          bar.c >= pool.value.price + rejection,
      )
      .sort((a, b) => b.value.index - a.value.index)[0];

    // Both sides swept in one bar is an outside bar that resolved nowhere. The idiom has no reading
    // for it, so neither do we.
    if (sweptHigh && sweptLow) {
      return passes(SWEEP, ENGINE_VERSION, 'both sides swept in one bar — no direction to read', used);
    }
    const swept = sweptHigh ?? sweptLow;
    if (!swept) {
      return passes(SWEEP, ENGINE_VERSION, 'no pool was swept and rejected on this bar', used);
    }

    const long = swept.value.kind === 'low';

    // The target is the nearest opposing pool, and nothing adjusts it. If the nearest one is close,
    // the trade is a poor one and says so — that is information, not a number to be corrected.
    const opposing = pools
      .filter((pool) =>
        long ? pool.value.kind === 'high' && pool.value.price > entry : pool.value.kind === 'low' && pool.value.price < entry,
      )
      .sort((a, b) => Math.abs(a.value.price - entry) - Math.abs(b.value.price - entry))[0];

    if (!opposing) {
      return passes(
        SWEEP,
        ENGINE_VERSION,
        `swept the ${long ? 'low' : 'high'} at ${swept.value.price.toFixed(2)}, but no opposing pool is in view to aim at`,
        used,
      );
    }

    const stop = long ? bar.l - T.stopBufferAtr * atr : bar.h + T.stopBufferAtr * atr;
    const target = opposing.value.price;
    const risk = Math.abs(entry - stop);
    if (!(risk > 0)) {
      return passes(SWEEP, ENGINE_VERSION, 'the sweep wick leaves no room for a stop', used);
    }

    return {
      engine: 'SWEEP',
      name: SWEEP.name,
      version: ENGINE_VERSION,
      direction: long ? 'long' : 'short',
      bracket: { stop, target },
      // ICT's exit *is* the draw on liquidity, which is the target above. There is no separate
      // conditional exit to resolve, so none is claimed.
      exit: null,
      provenance: { stop: 'ours', target: 'ours' },
      conviction: null,
      rules: [
        `swept the ${swept.value.kind === 'low' ? 'low' : 'high'} at ${swept.value.price.toFixed(2)} and closed back inside`,
        `stop beyond the sweep wick by ${T.stopBufferAtr} ATR`,
        `target is the nearest opposing pool at ${target.toFixed(2)} — ${(Math.abs(target - entry) / risk).toFixed(2)}R, whatever that comes to`,
      ],
      annotations: [
        causal<Annotation>(
          { kind: 'level', price: swept.value.price, label: 'swept pool' },
          swept.value.index,
          i,
        ),
        causal<Annotation>({ kind: 'level', price: target, label: 'opposing pool' }, opposing.value.index, i),
      ],
      candlesUsed: used,
    };
  },
};
