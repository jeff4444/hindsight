/**
 * GEOMETRY — Carney's harmonic patterns, made mechanical by supplying what he did not.
 *
 * XABCD: five points, four legs, and a table of Fibonacci ratios each leg must hit. Gartley, Bat,
 * Butterfly and Crab differ only in that table. Given the points and the ratios it is pure
 * arithmetic — which makes this the most mechanical school on the roster and the one whose
 * determinism gap is easiest to close.
 *
 * ## The gap: he publishes ratios and no tolerances
 *
 * 0.618 is a real number and no swing ever lands on it. Every implementation therefore invents a
 * tolerance, and none of them agree — a typical scanner exposes an "error percent" defaulting to 8
 * on a 0–20 range, so ±5% turns 0.618 into 0.587–0.649 and a different vendor's default finds a
 * different set of patterns in the same data. **Two faithful implementers reading the same book
 * produce different charts.** Determinism is 3/5 as written and 5/5 once the number is published, so
 * `THRESHOLDS.geometry.tolerance` publishes it: ±5%, relative, applied to every ratio.
 *
 * ## The contradiction on the originator's own site
 *
 * Carney's Crab page states **B = 0.886 XA**, against the near-universal secondary statement of
 * **0.382–0.618**. 0.886 is normally the defining ratio of the *Deep* Crab.
 *
 * We take the secondary consensus, and the reason is internal rather than a vote: at B = 0.886 the
 * Crab and the Deep Crab become the same pattern, and the Deep Crab has no definition left. The
 * disagreement is disclosed here and in §14 rather than silently resolved, so a reader who prefers
 * the originator's page knows exactly which line to change.
 *
 * ## What this engine is for
 *
 * No peer-reviewed support was located. The strongest empirical claim in its favour also reports
 * occurrence low enough to erode profitability, and skeptical reviews put Gartley's success at
 * 36–60% — a range wide enough to contain "no effect". XABCD also needs five swing points, roughly
 * 16 bars a leg in 80 candles, so it abstains often even where it is well-defined.
 *
 * It is on the roster **to be measured**, which is the only defensible reason to ship a school whose
 * evidence looks like this. §14.7 reports what it did.
 */

import { causal, type Causal } from '../causal';
import { persistentSwings, walkFromBars, atGrade, type Swing } from '../geometry/swings';
import { ENGINE_VERSION } from '../versions';
import { THRESHOLDS } from './manifest';
import { passes, type Annotation, type Engine, type EngineInput, type Verdict } from './contract';

const T = THRESHOLDS.geometry;

interface Shape {
  name: string;
  /** B as a retracement of XA. */
  bMin: number;
  bMax: number;
  /** D as a retracement or extension of XA. */
  d: number;
  /** C as an extension of AB. */
  bcMin: number;
  bcMax: number;
}

/** Carney's table, with our tolerance applied at the point of use rather than baked in here. */
const SHAPES: Shape[] = [
  { name: 'Gartley', bMin: T.gartley.b, bMax: T.gartley.b, d: T.gartley.d, bcMin: T.gartley.bcMin, bcMax: T.gartley.bcMax },
  { name: 'Bat', bMin: T.bat.bMin, bMax: T.bat.bMax, d: T.bat.d, bcMin: T.bat.bcMin, bcMax: T.bat.bcMax },
  { name: 'Butterfly', bMin: T.butterfly.b, bMax: T.butterfly.b, d: T.butterfly.d, bcMin: T.butterfly.bcMin, bcMax: T.butterfly.bcMax },
  { name: 'Crab', bMin: T.crab.bMin, bMax: T.crab.bMax, d: T.crab.d, bcMin: T.crab.bcMin, bcMax: T.crab.bcMax },
];

/** Within the published tolerance of a nominal ratio, or inside a published band. */
function near(actual: number, min: number, max: number): boolean {
  return actual >= min * (1 - T.tolerance) && actual <= max * (1 + T.tolerance);
}

export const GEOMETRY: Engine = {
  code: 'GEOMETRY',
  name: 'Geometry',
  school: 'Carney, *Harmonic Trading*; tolerance and the Crab B-ratio are ours, and disclosed',
  needs: 60,

  read(input: EngineInput): Verdict {
    const { bars, entry, atr } = input;
    const used = bars.length;
    if (used < GEOMETRY.needs || !(atr > 0)) {
      return passes(GEOMETRY, ENGINE_VERSION, 'not enough history for five pivots', used);
    }

    const i = used - 1;
    // Confirmed pivots only, and confirmed *before* the decision bar. A pattern completing on a
    // pivot nobody could have seen yet is the pre-confirmation bug in its most expensive form.
    const pivots: Causal<Swing>[] = atGrade(persistentSwings(walkFromBars(bars)), atr, T.pivotGrade)
      .filter((swing) => swing.knownAt < i)
      .sort((a, b) => a.value.index - b.value.index);

    if (pivots.length < 4) {
      return passes(GEOMETRY, ENGINE_VERSION, 'fewer than four confirmed pivots in view', used);
    }

    // X A B C alternate; D is the decision bar itself, which is what makes this tradeable at all —
    // the player is being asked about *this* bar, so the pattern has to complete on it.
    const recent = pivots.slice(-4);
    const [X, A, B, C] = recent.map((p) => p.value);

    const alternating =
      X.kind !== A.kind && A.kind !== B.kind && B.kind !== C.kind;
    if (!alternating) {
      return passes(GEOMETRY, ENGINE_VERSION, 'the last four pivots do not alternate — no XABC to complete', used);
    }

    // The CD leg may not span more bars than the whole XABC did. Scale-free and constant-free, so it
    // is a shape constraint rather than another number nobody can check — and it is what stops an
    // ancient C being paired with today's bar and called a pattern.
    if (i - C.index > C.index - X.index) {
      return passes(GEOMETRY, ENGINE_VERSION, 'the last pivot is too old for D to complete here', used);
    }

    const xa = A.price - X.price;
    const ab = B.price - A.price;
    const bc = C.price - B.price;
    if (!(Math.abs(xa) > 0) || !(Math.abs(ab) > 0) || !(Math.abs(bc) > 0)) {
      return passes(GEOMETRY, ENGINE_VERSION, 'a degenerate leg — no pattern', used);
    }
    if (Math.sign(ab) === Math.sign(xa) || Math.sign(bc) === Math.sign(ab)) {
      return passes(GEOMETRY, ENGINE_VERSION, 'the legs do not alternate direction', used);
    }

    // A bullish pattern completes at a low, so C is a high and the trade is long. Direction falls out
    // of the geometry rather than being chosen.
    const long = C.kind === 'high';

    /**
     * D is a swing point, so its price is the bar's **extreme** — not its close.
     *
     * Reading D as the close was the first version's mistake and it cost the engine every signal it
     * might have had: Carney's completion is a Potential Reversal *Zone* tested by the wick, and a
     * close is where the bar happened to finish after testing it. The trade is still entered at the
     * close, per §4.2. `dWithinBars` is used here for what its own manifest entry says it means —
     * how near the decision bar D may sit — rather than in an unrelated expression, which is what
     * the first version did with it.
     */
    const bRatio = Math.abs(ab) / Math.abs(xa);
    const bcRatio = Math.abs(bc) / Math.abs(ab);

    let found: { shape: Shape; price: number; ratio: number } | null = null;
    for (let j = Math.max(C.index + 1, i - T.dWithinBars); j <= i && !found; j++) {
      const price = long ? bars[j].l : bars[j].h;
      // D has to be beyond C in the direction the leg is travelling, or there is no CD leg.
      if (long ? price >= C.price : price <= C.price) continue;

      const dRatio = Math.abs(price - X.price) / Math.abs(xa);
      const shape = SHAPES.find(
        (candidate) =>
          near(bRatio, candidate.bMin, candidate.bMax) &&
          near(bcRatio, candidate.bcMin, candidate.bcMax) &&
          near(dRatio, candidate.d, candidate.d),
      );
      if (shape) found = { shape, price, ratio: dRatio };
    }

    if (!found) {
      return passes(
        GEOMETRY,
        ENGINE_VERSION,
        `no harmonic within ±${(T.tolerance * 100).toFixed(0)}%: B ${bRatio.toFixed(3)} of XA, BC ${bcRatio.toFixed(3)} of AB`,
        used,
      );
    }

    const match = found.shape;
    const stop = long ? X.price - T.stopBufferAtr * atr : X.price + T.stopBufferAtr * atr;
    const risk = Math.abs(entry - stop);
    if (!(risk > 0)) {
      return passes(GEOMETRY, ENGINE_VERSION, 'D sits on X — no room for a stop', used);
    }

    // Carney's first profit objective is a retracement of the completed AD leg. Theirs.
    const ad = entry - A.price;
    const target = entry - T.targetRetrace * ad;

    // A target on the wrong side of entry means the geometry completed somewhere the school's own
    // objective does not point. Passing beats reporting a bracket that faces backwards.
    if (long ? target <= entry : target >= entry) {
      return passes(GEOMETRY, ENGINE_VERSION, `a ${match.name} completed, but its AD retracement points the wrong way`, used);
    }

    return {
      engine: 'GEOMETRY',
      name: GEOMETRY.name,
      version: ENGINE_VERSION,
      direction: long ? 'long' : 'short',
      bracket: { stop, target },
      exit: null,
      provenance: { stop: 'school', target: 'school' },
      conviction: null,
      rules: [
        `a ${long ? 'bullish' : 'bearish'} ${match.name} completed on this bar`,
        `B is ${bRatio.toFixed(3)} of XA, BC is ${bcRatio.toFixed(3)} of AB, D is ${found.ratio.toFixed(3)} of XA — all within our published ±${(T.tolerance * 100).toFixed(0)}%`,
        `stop beyond X at ${X.price.toFixed(2)}; target is Carney's ${T.targetRetrace} retracement of AD`,
        ...(match.name === 'Crab'
          ? ['Crab B taken as 0.382–0.618, not the 0.886 on Carney’s own page — that is the Deep Crab']
          : []),
      ],
      annotations: recent.map((pivot, k) =>
        causal<Annotation>(
          { kind: 'level', price: pivot.value.price, label: 'XABC'[k] },
          pivot.value.index,
          pivot.knownAt,
        ),
      ),
      candlesUsed: used,
    };
  },
};
