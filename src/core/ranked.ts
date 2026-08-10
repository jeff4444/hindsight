/**
 * The score map, and ranked session scoring.
 *
 * §4.3 says the daily should stay on percentiles — "spiky results are shareable results" — but that
 * a ladder must not, "because a player chasing the top of a leaderboard is correctly incentivised
 * toward maximum-variance trades. This is not a hypothetical: it is the documented failure mode of
 * forecasting tournaments." Its prescription is bridge's IMP scale: "run score differences through
 * a compression table, so a very large swing is worth only a few times a small one."
 *
 * It never says *what* is compressed, or gives a table. Both are decided here.
 *
 * ## What is compressed
 *
 * The percentile — and the honest framing, which belongs in the published rules, is that **the
 * percentile already is the compression table**. An outcome 40R above par and one 4R above par can
 * both be the 99th of 98 brackets; the unbounded swing has already been compressed by rank. That is
 * why compressing R instead would be wrong twice over: it would still reward realised profit, and
 * it would let a chart with a 40R oracle dominate one with a 6R oracle, which is the exact bug §4
 * opens by naming.
 *
 * ## The one nonlinearity, and the one that would have been a disaster
 *
 * `docs/rules.md` §10.3 publishes two corpus measurements — always passing scores a **mean 61st
 * percentile**, and the best fixed bracket (short, 4 ATR, 0.5R) scores **57.7th** — and §15's
 * guarantee that "degenerate wide-stop tight-target brackets do not top the leaderboard" was
 * verified on *those means*, which are means of the raw percentile.
 *
 * So any transform with a kink inside the range where outcomes actually live silently invalidates
 * that verification. Concretely: a natural-looking two-piece map anchored at the pass baseline
 * makes the degenerate bracket score **0.5033 against passing's 0.500** — it wins. The guarantee
 * would have been quietly voided by a curve that looked like an improvement.
 *
 * Hence: **the curve is affine over the whole range outcomes occupy, and its only nonlinearity is a
 * penalty above the 90th percentile.** A damped top decile can sink a variance-seeking strategy and
 * can never rescue one, which is §4.3's property applied exactly where it belongs — separating the
 * best bracket from the fifth-best of 98 is intrabar resolution luck (§12.3), not reading.
 */

/** §10.1: five-chart sessions. */
export const RANKED_CHARTS = 5;
/** §4.4: "In a five-chart ranked session, require at least three entries." */
export const RANKED_MIN_ENTRIES = 3;
export const RANKED_MAX_PASSES = RANKED_CHARTS - RANKED_MIN_ENTRIES;

/**
 * Where passing sits, measured across the corpus (`docs/rules.md` §10.3).
 *
 * The anchor is what makes the scale mean something: a result here is not "how much did you make"
 * but "how much better than doing nothing". Pinned to SCORE_MAP_VERSION, because moving it
 * re-scales every rating ever computed.
 */
export const PASS_ANCHOR = 0.61;

/** Above this the slope is damped. The top decile of 98 brackets is ~10 cells. */
export const COMPRESS_KNEE = 0.9;
export const COMPRESS_TAIL_DIVISOR = 3;

/** Bridge-ish integer scale. Chosen so a total over five charts lands in a legible range. */
export const IMP_SCALE = 15;
/** §4.3's "per-round damage cap" for duels. */
export const IMP_MAX = 15;

/**
 * What abandoning a chart costs.
 *
 * Strictly worse than the worst honest result, which is `imp(0) = -15` — scoring below every one of
 * the 98 brackets. If a forfeit merely *equalled* that, a player who saw a chart they disliked
 * could walk away for the same price as taking the disaster, which makes abandonment a free option
 * on every round and reintroduces the cherry-picking §4.3 exists to remove. The margin is what
 * makes playing badly cheaper than not playing.
 */
export const FORFEIT_IMP = -(IMP_SCALE + 3);

/**
 * The uncompressed reference: a straight line through (anchor, 0) hitting −1 at a percentile of 0.
 * Exported because the invariant `compress(p) <= affine(p)` is the property worth testing.
 */
export function affine(percentile: number, anchor = PASS_ANCHOR): number {
  return (percentile - anchor) / anchor;
}

/**
 * §4.3's compression curve. Affine below the knee, damped above. Range [-1, +0.53].
 *
 * `compress(anchor) === 0` — passing draws with the chart, and every rating in the product is
 * measured from that line.
 */
export function compress(percentile: number, anchor = PASS_ANCHOR): number {
  const p = Math.min(1, Math.max(0, percentile));
  if (p <= COMPRESS_KNEE) return affine(p, anchor);
  const atKnee = affine(COMPRESS_KNEE, anchor);
  const slope = 1 / anchor / COMPRESS_TAIL_DIVISOR;
  return atKnee + slope * (p - COMPRESS_KNEE);
}

/**
 * The Glicko-2 outcome for one attempt.
 *
 * Half is a draw, so passing draws. The map is deliberately *not* stretched to fill [0,1]: a linear
 * rescale multiplies the Fisher information's numerator and denominator by the same factor and buys
 * exactly nothing, while clipping at the ends would destroy information. The rating scale's
 * resolution is set by the data, not by the units.
 */
export function glickoScore(percentile: number, anchor = PASS_ANCHOR): number {
  return (compress(percentile, anchor) + 1) / 2;
}

/** The signed integer a ranked chart is worth. */
export function imp(percentile: number, anchor = PASS_ANCHOR): number {
  return Math.round(IMP_SCALE * compress(percentile, anchor));
}

export interface RankedEntry {
  /** Null only for a forfeit — an abandoned or expired chart. */
  percentile: number | null;
  passed: boolean;
  ambiguous: boolean;
  forfeited: boolean;
}

export interface RankedSession {
  imps: number[];
  total: number;
  entries: number;
  passes: number;
  forfeits: number;
  quotaMet: boolean;
}

/** §4.4's quota, enforced prospectively: the control disables rather than the session failing later. */
export function mayPass(passesUsed: number): boolean {
  return passesUsed < RANKED_MAX_PASSES;
}

/**
 * Score a whole session.
 *
 * A forfeit is a full negative, not a zero. Abandonment has to cost more than the worst honest
 * result, or discarding a bad start is free — which is the same lottery-ticket incentive §4.3
 * exists to remove, arriving through the back door.
 *
 * An unused pass is worth nothing. §4.8: "Never award a minimum gain per round. A floor on the
 * reward turns the ladder into an attendance record."
 */
export function scoreSession(entries: readonly RankedEntry[]): RankedSession {
  const imps: number[] = [];
  let passes = 0;
  let forfeits = 0;
  let traded = 0;

  for (const entry of entries) {
    if (entry.forfeited || entry.percentile === null) {
      imps.push(FORFEIT_IMP);
      forfeits += 1;
      continue;
    }
    imps.push(imp(entry.percentile));
    if (entry.passed) passes += 1;
    else traded += 1;
  }

  // A session short of its five charts is short by abandonment, and the missing ones forfeit.
  for (let i = entries.length; i < RANKED_CHARTS; i++) {
    imps.push(FORFEIT_IMP);
    forfeits += 1;
  }

  return {
    imps,
    total: imps.reduce((a, b) => a + b, 0),
    entries: traded,
    passes,
    forfeits,
    quotaMet: traded >= RANKED_MIN_ENTRIES,
  };
}

/**
 * §4.3's duel damage: "health-bar damage equal to the compressed score difference. Escalating
 * multiplier, capped per round in ranked, uncapped in casual" — because uncapped "makes round order
 * decisive rather than round quality".
 */
export function duelDamage(a: number, b: number, multiplier = 1, capped = true): number {
  const raw = Math.abs(a - b) * multiplier;
  return capped ? Math.min(IMP_MAX, raw) : raw;
}
