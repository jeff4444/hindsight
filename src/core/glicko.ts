/**
 * Glicko-2, with two documented extensions.
 *
 * §8.1: "Treat every chart-and-tier pair as a Glicko-2 entity, exactly as the major chess platforms
 * treat a puzzle: each attempt is a rated game between the player and the chart. Because the
 * outcome is a percentile in the unit interval rather than a binary solve, each attempt carries
 * more information than a chess puzzle attempt does." And on the fields: "Standard Glicko-2. Rating
 * deviation grows during inactivity, which is exactly right for an audience that plays irregularly."
 *
 * The algorithm is Glickman's (2013, *Example of the Glicko-2 system*), unmodified. `tests/
 * glicko.test.ts` reproduces his published worked example to his own printed precision, which is
 * what makes the two additions below verifiable as *extensions* rather than as a different system
 * wearing the name.
 *
 * ## Extension 1 — fractional scores with an information weight
 *
 * Glicko-2 already accepts `s ∈ [0,1]`; chess uses {0, ½, 1} only by convention. What the scope
 * document claims beyond that is that a percentile "carries more information", and that claim is
 * quantifiable: the outcome distribution here has variance around 0.043 against a Bernoulli
 * reference near 0.244 at the same mean.
 *
 * Under a quasi-likelihood with `Var(s) = c·E(1−E)`, the score and information both scale by `1/c`,
 * so the estimating equation is *identical to standard Glicko-2* with every sum multiplied by
 * `w = 1/c`. Which is to say, in one sentence:
 *
 *   **One attempt counts as `w` rated games with the same score.**
 *
 * `w = 1` reproduces the published algorithm exactly, which is the property the test pins.
 *
 * ## Extension 2 — decay proportional to elapsed time, not to periods counted
 *
 * The textbook `φ* = √(φ² + σ²)` fires once per rating period. Applied per session that punishes a
 * player for playing *more*: eight sessions in one evening would inflate their RD eight times over,
 * when they have in fact been measured eight times as precisely. So RD growth is scaled by real
 * elapsed time over the nominal period, following Glicko-1's `√(RD² + c²t)` treatment of
 * inactivity. Forty charts in one sitting cost zero decay; a month away costs a month's worth.
 *
 * Pure and I/O-free, like everything in src/core.
 */

/** 400/ln(10). Glickman's conversion between the public scale and the internal one. */
export const GLICKO_SCALE = 173.7178;

export interface Glicko {
  rating: number;
  rd: number;
  sigma: number;
}

export interface GlickoConfig {
  /** Volatility constraint. Glickman: "reasonable choices are between 0.3 and 1.2". */
  tau: number;
  initialRating: number;
  initialRd: number;
  initialSigma: number;
  rdFloor: number;
  rdCeiling: number;
  /** Real-time length of one nominal rating period, in ms. Decay is proportional to elapsed/this. */
  periodMs: number;
  /** Glicko-1's `c`, in rating points per √period. Zero disables time decay entirely. */
  decayPerPeriod: number;
  /** Effective rated games per observation. 1 reproduces classical Glicko-2 exactly. */
  infoWeight: number;
  epsilon?: number;
  maxIterations?: number;
}

export interface GlickoGame {
  opponent: Glicko;
  /** Outcome in [0, 1]. */
  score: number;
  /** Per-game override of `config.infoWeight`. */
  weight?: number;
}

export const toMu = (rating: number, initial: number): number => (rating - initial) / GLICKO_SCALE;
export const toPhi = (rd: number): number => rd / GLICKO_SCALE;
export const fromMu = (mu: number, initial: number): number => mu * GLICKO_SCALE + initial;
export const fromPhi = (phi: number): number => phi * GLICKO_SCALE;

/** Glickman's g(φ): how much an opponent's own uncertainty discounts the information they carry. */
export function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** Expected score of `player` against `opponent`, on the internal scale. */
export function expectedScore(player: Glicko, opponent: Glicko, initialRating: number): number {
  const mu = toMu(player.rating, initialRating);
  const muJ = toMu(opponent.rating, initialRating);
  return 1 / (1 + Math.exp(-g(toPhi(opponent.rd)) * (mu - muJ)));
}

/**
 * Grow RD for time spent not playing.
 *
 * Call before `update`. Kept separate because a rating period with zero games is *only* decay, and
 * conflating the two is what makes the naive per-session implementation wrong.
 */
export function decay(rating: Glicko, elapsedMs: number, config: GlickoConfig): Glicko {
  if (elapsedMs <= 0 || config.decayPerPeriod <= 0) return rating;
  const periods = elapsedMs / config.periodMs;
  const cPhi = config.decayPerPeriod / GLICKO_SCALE;
  const phi = toPhi(rating.rd);
  const grown = Math.sqrt(phi * phi + (rating.sigma * rating.sigma + cPhi * cPhi) * periods);
  return { ...rating, rd: clampRd(fromPhi(grown), config) };
}

function clampRd(rd: number, config: GlickoConfig): number {
  return Math.min(config.rdCeiling, Math.max(config.rdFloor, rd));
}

/**
 * One rating period.
 *
 * Zero games returns the input untouched — inactivity belongs to `decay`, which knows how long the
 * gap actually was. Glickman's step 6 (the "did not compete" case) is that function, not this one.
 */
export function update(
  player: Glicko,
  games: readonly GlickoGame[],
  config: GlickoConfig,
): Glicko {
  if (games.length === 0) return player;

  const epsilon = config.epsilon ?? 1e-6;
  const maxIterations = config.maxIterations ?? 100;
  const mu = toMu(player.rating, config.initialRating);
  const phi = toPhi(player.rd);

  // Step 3 and 4, with each game weighted. w = 1 is the published algorithm.
  let vInverse = 0;
  let delta = 0;
  for (const game of games) {
    const weight = game.weight ?? config.infoWeight;
    const phiJ = toPhi(game.opponent.rd);
    const muJ = toMu(game.opponent.rating, config.initialRating);
    const gJ = g(phiJ);
    const e = 1 / (1 + Math.exp(-gJ * (mu - muJ)));
    vInverse += weight * gJ * gJ * e * (1 - e);
    delta += weight * gJ * (game.score - e);
  }

  const v = 1 / vInverse;
  const deltaTotal = v * delta;

  // Step 5: the volatility solver, Illinois-algorithm regula falsi, exactly as published.
  const a = Math.log(player.sigma * player.sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const numerator = ex * (deltaTotal * deltaTotal - phi * phi - v - ex);
    const denominator = 2 * Math.pow(phi * phi + v + ex, 2);
    return numerator / denominator - (x - a) / (config.tau * config.tau);
  };

  let A = a;
  let B: number;
  if (deltaTotal * deltaTotal > phi * phi + v) {
    B = Math.log(deltaTotal * deltaTotal - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * config.tau) < 0 && k < maxIterations) k += 1;
    B = a - k * config.tau;
  }

  let fA = f(A);
  let fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > epsilon && iterations < maxIterations) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
    iterations += 1;
  }

  const sigma = Math.exp(A / 2);

  // Steps 6-8.
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * delta;

  return {
    rating: fromMu(muPrime, config.initialRating),
    rd: clampRd(fromPhi(phiPrime), config),
    sigma,
  };
}

/** A 95% interval, for §4.9's display gate and §8.2's pending gate. */
export function ratingInterval(rating: Glicko, z = 1.96): { low: number; high: number } {
  return { low: rating.rating - z * rating.rd, high: rating.rating + z * rating.rd };
}

export function initial(config: GlickoConfig): Glicko {
  return { rating: config.initialRating, rd: config.initialRd, sigma: config.initialSigma };
}
