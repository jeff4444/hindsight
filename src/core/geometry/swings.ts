/**
 * Swing points, by 0-dimensional persistence.
 *
 * §6 picks this over the alternatives and gives the reason:
 *
 * > ZigZag repaints its last leg, which is disqualifying for a product whose premise is "what could
 * > you have known at bar t." Fixed-window fractals are causal but not scale-invariant. Directional
 * > change is causal and scale-invariant — but **persistence is strictly better**: a swing high has
 * > persistence *p* iff price must retrace *p* before exceeding it, which is what a trader means,
 * > and it comes with a theorem — *a peak of persistence p is destroyed only by a perturbation of
 * > sup-norm ≥ p/2*.
 *
 * That theorem is the whole reason this module exists in this form. It converts §6's quarter-tick
 * stability requirement from a hope into a proof: with ε = a quarter tick, no swing of persistence
 * above 2ε can be destroyed by the perturbation the stability suite applies.
 *
 * Three properties follow from the definition and each closes a named failure:
 *
 * **The output is graded, not boolean.** Kumabe & Yoshida (2023) prove that a deterministic
 * algorithm with boolean output admits no Lipschitz-continuous form at all — bounded sensitivity
 * provably requires randomisation, and randomisation is off the table for shared game state. Every
 * swing carries its persistence, and §6's three nested thresholds are three *cuts* on this one
 * computation rather than three detectors.
 *
 * **Nothing is emitted before it is settled.** A peak's persistence is `min(leftDrop, rightDrop)`.
 * `rightDrop` only grows with time, so the value is final the moment either the right side has
 * retraced as far as the left side had (the left side is binding, and can never be beaten) or price
 * exceeds the peak (the right side is frozen). Until one of those happens the peak is *open*, its
 * persistence could still rise, and drawing it would be exactly the repainting last leg that
 * disqualifies ZigZag. Open peaks are dropped, not guessed at.
 *
 * **`knownAt` is the settling bar, never the peak's own bar.** §15 names pre-confirmation stamping
 * as one of the two look-ahead bugs shipped in public packages. The lag here is real and often
 * large, and `src/core/causal.ts` exists to carry it.
 *
 * One property to state rather than test: persistence is **not** invariant under extending history
 * leftwards. Adding older bars can change a peak's `leftDrop`. That is correct — more history
 * genuinely reveals more structure — and it is why any geometry that becomes a stored chart
 * property is pinned to the base lead-in window. See `docs/rules.md`.
 */

import type { Bar } from '../bars';
import { causal, type Causal } from '../causal';
import { EPSILON, snap } from './space';

/* ------------------------------------------------------------------ the walk */

/**
 * One price observation, tagged with the display bar it belongs to.
 *
 * Persistence is defined on a scalar function of one variable, so OHLC has to be flattened into a
 * walk before it can be run. `index` stays in display-bar space because that is the only index the
 * renderer and the causality gate understand.
 */
export interface Sample {
  index: number;
  price: number;
}

/**
 * Did this bar trade down to its low before up to its high?
 *
 * Standard OHLC cannot say, and this is the only invented rule in the module. What it can and
 * cannot affect is worth being precise about: it cannot change any swing's *price*, because the
 * extremes are the same two numbers either way; it can change a swing's *index*, by at most one
 * bar. §6's own stability correction says index is the quantity that is provably unstable and price
 * is the one that is not, so the convention moves only a number already declared approximate.
 *
 * **The rule has to be antisymmetric under reflection**, or the invertive metamorphic relation
 * fails — and that relation is the strongest test Layer 2 has. Reflecting a chart swaps its highs
 * and lows, so the order the walk emits them in must swap too. The obvious `c >= o` does not: a
 * doji reflects to a doji and the predicate answers `true` both times, which silently desynchronises
 * the two walks. So the rule is a cascade of quantities that each negate under reflection:
 *
 * 1. **Close against open.** An up bar traded down first. `c − o` negates under reflection.
 * 2. **Close against the middle of the range.** A close nearer the high implies the low came first.
 *    `(h − c) − (c − l)` negates too, and it resolves every doji that is not a perfectly balanced
 *    one.
 * 3. **A perfectly balanced bar is its own mirror**, so no rule can distinguish the two orders —
 *    the ambiguity is in the bar, not in the code. `true` is returned, and `tests/geometry`
 *    asserts this is the single case where reflection duality is not exact rather than pretending
 *    otherwise.
 */
function lowCameFirst(bar: Bar): boolean {
  if (bar.c !== bar.o) return bar.c > bar.o;
  const above = bar.h - bar.c;
  const below = bar.c - bar.l;
  if (above !== below) return above < below;
  return true;
}

/**
 * Build the walk from display bars alone.
 *
 * Prefer `walkFromPath` where the minute path is available, which pushes the convention above down
 * to a resolution where it cannot move a reported index at all.
 */
export function walkFromBars(bars: readonly Bar[]): Sample[] {
  const walk: Sample[] = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const lowFirst = lowCameFirst(bar);
    walk.push({ index: i, price: lowFirst ? bar.l : bar.h });
    walk.push({ index: i, price: lowFirst ? bar.h : bar.l });
  }
  return walk;
}

/**
 * Build the walk from the stored one-minute path, reporting at display-bar resolution.
 *
 * This is the preferred input and the reason the corpus stores 4,800 lead-in minute bars. The
 * resolver already refuses to invent an intrabar ordering — §12.3.2 flags a fill it cannot order
 * rather than guessing — and the same discipline applies here: use the finer data we have rather
 * than a convention over the coarser data we also have.
 *
 * `lowCameFirst` still applies *within* a minute, where it can move a swing's index by at most one
 * minute — 1/60th of a display bar, which rounds away entirely.
 */
export function walkFromPath(path: readonly Bar[], barsPerDisplayBar: number): Sample[] {
  const walk: Sample[] = [];
  for (let i = 0; i < path.length; i++) {
    const bar = path[i];
    const index = Math.floor(i / barsPerDisplayBar);
    const lowFirst = lowCameFirst(bar);
    walk.push({ index, price: lowFirst ? bar.l : bar.h });
    walk.push({ index, price: lowFirst ? bar.h : bar.l });
  }
  return walk;
}

/* ---------------------------------------------------------------- the output */

export type SwingKind = 'high' | 'low';

export interface Swing {
  kind: SwingKind;
  /** Display-bar index of the extremum itself. Mirrors `Causal.existsAt`. */
  index: number;
  /** The extreme price, snapped to the tick grid. */
  price: number;
  /**
   * How far price had to retrace before exceeding this extreme, in price units.
   *
   * Always final: a swing is not emitted until this number can no longer change.
   */
  persistence: number;
}

/* -------------------------------------------------------------- the detector */

interface OpenPeak {
  index: number;
  value: number;
  leftDrop: number;
  /** Lowest signed value seen from this peak up to now. */
  minSince: number;
  emitted: boolean;
}

/**
 * One sweep, over a signed series, always looking for maxima.
 *
 * Highs and lows go through this same function with `sign` flipped rather than through two mirrored
 * bodies. That is deliberate and structural: the classic defect in this family of detectors is a
 * copy-paste asymmetry between the high-side and low-side paths, and the invertive metamorphic test
 * in `tests/geometry/metamorphic.test.ts` exists to catch it. With one body there is nothing to be
 * asymmetric.
 *
 * Cost is O(n · d) where d is the number of simultaneously open peaks — bounded by the length of
 * the longest strictly descending run of local maxima, which on price data is small. A new higher
 * high clears the stack.
 */
function sweep(walk: readonly Sample[], sign: 1 | -1): Causal<Swing>[] {
  const kind: SwingKind = sign === 1 ? 'high' : 'low';
  const out: Causal<Swing>[] = [];
  const open: OpenPeak[] = [];

  let globalMin = Infinity;
  const signed = (k: number) => sign * walk[k].price;

  const emit = (peak: OpenPeak, persistence: number, knownAt: number) => {
    peak.emitted = true;
    out.push(
      causal<Swing>(
        {
          kind,
          index: walk[peak.index].index,
          price: snap(sign * peak.value),
          persistence,
        },
        walk[peak.index].index,
        knownAt,
      ),
    );
  };

  for (let k = 0; k < walk.length; k++) {
    const value = signed(k);

    // A. A local maximum at k-1 is confirmed the moment k comes in below it. Detected before the
    //    running minima absorb k, so `leftDrop` measures the drop *into* the peak and not past it.
    if (k >= 2 && signed(k - 2) < signed(k - 1) && value < signed(k - 1)) {
      const peakValue = signed(k - 1);
      // The last sample above this peak bounds the left side; with none, the series start does.
      const floor = open.length > 0 ? open[open.length - 1].minSince : globalMin;
      open.push({
        index: k - 1,
        value: peakValue,
        leftDrop: peakValue - floor,
        minSince: peakValue,
        emitted: false,
      });
    }

    // B. Absorb this sample into every open peak's running minimum.
    for (const peak of open) if (value < peak.minSince) peak.minSince = value;
    if (value < globalMin) globalMin = value;

    // C. Exceeded. The right side is frozen at whatever it reached, so the persistence is final.
    //    Strictly greater: an equal high does not exceed, and equal highs are a real formation
    //    rather than a tie to be broken.
    while (open.length > 0 && open[open.length - 1].value < value) {
      const peak = open.pop() as OpenPeak;
      if (!peak.emitted) {
        emit(peak, Math.min(peak.leftDrop, peak.value - peak.minSince), walk[k].index);
      }
    }

    // D. Left side binding. Once the right has retraced as far as the left had, `min` is pinned to
    //    the left drop and no future bar can move it — so the swing is final here, typically long
    //    before price exceeds it. This is what makes the confirmation lag short enough to be useful
    //    without being a guess.
    for (const peak of open) {
      if (!peak.emitted && peak.value - peak.minSince >= peak.leftDrop) {
        emit(peak, peak.leftDrop, walk[k].index);
      }
    }
  }

  // Anything still open never settled inside this window. Emitting it would be ZigZag's repainting
  // last leg — the exact failure §6 rules out — so it is dropped.
  return out;
}

/**
 * Collapse runs of identical prices, keeping the first.
 *
 * The turn test compares three consecutive samples strictly, so a plateau — a doji whose high and
 * low coincide, or a bar opening exactly where the last one closed — would hide the extremum
 * between its two equal halves and lose the swing entirely. Collapsing first makes every remaining
 * turn strict. Keeping the *first* sample of a plateau is the tie rule, stated here because an
 * unstated one is how two implementations of the same idea end up disagreeing.
 */
function compressPlateaus(walk: readonly Sample[]): Sample[] {
  const out: Sample[] = [];
  for (const sample of walk) {
    if (out.length === 0 || out[out.length - 1].price !== sample.price) out.push(sample);
  }
  return out;
}

/**
 * Every settled swing in the walk, graded by persistence.
 *
 * Both directions in one list, ordered by when they became knowable and then by bar, so the output
 * is a deterministic sequence rather than a set. Ordering matters: an unordered container iterated
 * for output is a classic determinism offender, and the tests assert byte-equality.
 */
export function persistentSwings(rawWalk: readonly Sample[]): Causal<Swing>[] {
  const walk = compressPlateaus(rawWalk);
  const swings = [...sweep(walk, 1), ...sweep(walk, -1)];
  swings.sort(
    (a, b) =>
      a.knownAt - b.knownAt ||
      a.existsAt - b.existsAt ||
      a.value.price - b.value.price ||
      a.value.kind.localeCompare(b.value.kind),
  );
  return swings;
}

/* ------------------------------------------------------------------- grading */

/**
 * §6's three nested thresholds, as cuts on the one computation.
 *
 * Sized from the only genuinely empirical result in the directional-change literature. Glattfelder,
 * Dupuis & Olsen (2011) report an average overshoot exponent of 1.04 — the overshoot beyond a
 * threshold is on average the threshold again — so a swing leg of roughly *k*·ATR corresponds to a
 * threshold of *k*·ATR/2. These are legs of about one, two and four ATR.
 *
 * The event-count power law from the same paper is deliberately *not* used to justify anything:
 * its exponent is 2.02 ± 0.098 against a Brownian first-passage prediction of exactly 2, so it is a
 * diffusion identity rather than a market regularity. It makes the calibration analytic. It is not
 * evidence.
 */
export const SWING_GRADES = [
  { name: 'minor', atrMultiple: 0.5 },
  { name: 'intermediate', atrMultiple: 1.0 },
  { name: 'major', atrMultiple: 2.0 },
] as const;

export type SwingGrade = (typeof SWING_GRADES)[number]['name'];

/** Width of the hysteresis band, as a fraction of the threshold it straddles. */
export const HYSTERESIS_FRACTION = 0.1;

/**
 * Swings at or above a grade, with hysteresis.
 *
 * §6 requires `τ_high − τ_low ≥ 4ε`, so that only features inside a 4ε band can ever flip and the
 * emitted set is provably invariant once established. `previous` is the set emitted last time: a
 * swing already in it survives down to `τ_low`, and one outside it must clear `τ_high` to enter.
 * Called with no previous set, the threshold is `τ_high` — the conservative end, which is the right
 * default for a first render.
 */
export function atGrade(
  swings: readonly Causal<Swing>[],
  atr: number,
  grade: SwingGrade,
  previous?: readonly Causal<Swing>[],
): Causal<Swing>[] {
  const multiple = SWING_GRADES.find((g) => g.name === grade)?.atrMultiple;
  if (multiple === undefined) throw new Error(`unknown swing grade: ${grade}`);

  const threshold = multiple * atr;
  const band = Math.max(HYSTERESIS_FRACTION * threshold, 4 * EPSILON);
  const high = threshold + band / 2;
  const low = threshold - band / 2;

  const held = new Set(previous?.map(keyOf) ?? []);
  return swings.filter((swing) =>
    held.has(keyOf(swing)) ? swing.value.persistence >= low : swing.value.persistence >= high,
  );
}

/** Identity of a swing for hysteresis purposes: where it is and which way it points. */
function keyOf(swing: Causal<Swing>): string {
  return `${swing.value.kind}|${swing.value.index}|${swing.value.price.toFixed(4)}`;
}
