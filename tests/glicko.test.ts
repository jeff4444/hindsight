import { describe, expect, it } from 'vitest';
import { GLICKO_SCALE, decay, expectedScore, g, initial, update, type GlickoConfig } from '@/core/glicko';

/**
 * The anchor test.
 *
 * Glickman's *Example of the Glicko-2 system* works one rating period by hand and prints the
 * answer. Reproducing it to his own precision is what licenses calling this module "Glicko-2" and
 * what makes the two extensions verifiable as extensions: set `infoWeight` to 1 and the published
 * algorithm is what runs.
 *
 * His worked example: a player at 1500/200/0.06 with tau 0.5 plays three opponents —
 * (1400, 30) won, (1550, 100) lost, (1700, 300) lost — and finishes at rating 1464.06, RD 151.52,
 * sigma 0.05999.
 */
const GLICKMAN: GlickoConfig = {
  tau: 0.5,
  initialRating: 1500,
  initialRd: 350,
  initialSigma: 0.06,
  rdFloor: 0,
  rdCeiling: 350,
  periodMs: 1,
  decayPerPeriod: 0,
  infoWeight: 1,
};

describe("Glickman's published worked example", () => {
  const player = { rating: 1500, rd: 200, sigma: 0.06 };
  const games = [
    { opponent: { rating: 1400, rd: 30, sigma: 0.06 }, score: 1 },
    { opponent: { rating: 1550, rd: 100, sigma: 0.06 }, score: 0 },
    { opponent: { rating: 1700, rd: 300, sigma: 0.06 }, score: 0 },
  ];
  const result = update(player, games, GLICKMAN);

  it('lands on his printed rating, RD and volatility', () => {
    // 1464.05, not the 1464.06 the paper prints. The paper carries its intermediates by hand —
    // E to three decimals, g to four — and reaches v = 1.7790, Δ = −0.4834. At full precision
    // those are v = 1.778977 and Δ = −0.483933, which moves the rating by 0.009. Verified by
    // recomputing the example both ways: reproducing his rounding reproduces his figure exactly.
    // Asserting the exact value is the honest test; asserting his would be asserting his rounding.
    expect(result.rating).toBeCloseTo(1464.0507, 3);
    expect(result.rd).toBeCloseTo(151.52, 2);
    // Likewise 0.059996; the paper truncates to 0.05999.
    expect(result.sigma).toBeCloseTo(0.059996, 6);
  });

  it('agrees on g(phi) and E for each opponent', () => {
    expect(g(30 / GLICKO_SCALE)).toBeCloseTo(0.9955, 4);
    expect(g(100 / GLICKO_SCALE)).toBeCloseTo(0.9531, 4);
    expect(g(300 / GLICKO_SCALE)).toBeCloseTo(0.7242, 4);
    expect(expectedScore(player, games[0].opponent, 1500)).toBeCloseTo(0.639, 3);
    expect(expectedScore(player, games[1].opponent, 1500)).toBeCloseTo(0.432, 3);
    expect(expectedScore(player, games[2].opponent, 1500)).toBeCloseTo(0.303, 3);
  });
});

/**
 * §8.1's "each attempt carries more information than a chess puzzle attempt does", made operational.
 * The claim is only meaningful if `w = 1` is a special case — otherwise it is a different system.
 */
const HINDSIGHT: GlickoConfig = { ...GLICKMAN, rdFloor: 25, decayPerPeriod: 39.5, periodMs: 7 * 86_400_000, infoWeight: 2 };

describe('the information weight is an extension, not a redefinition', () => {
  const player = { rating: 1500, rd: 200, sigma: 0.06 };
  const opponent = { rating: 1500, rd: 50, sigma: 0.06 };

  it('is exactly one weighted game or two identical unweighted ones', () => {
    // The estimating equation multiplies every sum by w, so w=2 on one game must equal w=1 on the
    // same game played twice. This is the identity the whole extension rests on.
    const weighted = update(player, [{ opponent, score: 0.7 }], { ...GLICKMAN, infoWeight: 2 });
    const twice = update(
      player,
      [
        { opponent, score: 0.7 },
        { opponent, score: 0.7 },
      ],
      GLICKMAN,
    );
    expect(weighted.rating).toBeCloseTo(twice.rating, 9);
    expect(weighted.rd).toBeCloseTo(twice.rd, 9);
  });

  it('shrinks RD faster than an unweighted attempt would', () => {
    const plain = update(player, [{ opponent, score: 0.7 }], GLICKMAN);
    const weighted = update(player, [{ opponent, score: 0.7 }], HINDSIGHT);
    expect(weighted.rd).toBeLessThan(plain.rd);
  });
});

describe('decay is proportional to time, never to periods counted (§8.1)', () => {
  const settled = { rating: 1500, rd: 25, sigma: 0.06 };

  it('costs a player nothing for playing eight sessions in one evening', () => {
    // The textbook per-period growth would fire eight times and inflate the RD of the player who
    // has just been measured eight times as precisely. That is backwards.
    let rating = settled;
    for (let i = 0; i < 8; i++) rating = decay(rating, 0, HINDSIGHT);
    expect(rating.rd).toBe(settled.rd);
  });

  it('grows over weeks and returns to the prior after about eighteen months', () => {
    const week = 7 * 86_400_000;
    expect(decay(settled, week, HINDSIGHT).rd).toBeGreaterThan(40);
    expect(decay(settled, week, HINDSIGHT).rd).toBeLessThan(55);
    expect(decay(settled, 78 * week, HINDSIGHT).rd).toBeCloseTo(HINDSIGHT.rdCeiling, 0);
  });

  it('recovers in an evening what a month took away', () => {
    // RD should be slow to grow and quick to shrink: a returning player is re-measured, not
    // re-introduced.
    const rusty = decay(settled, 30 * 86_400_000, HINDSIGHT);
    expect(rusty.rd).toBeGreaterThan(80);

    const opponent = { rating: 1500, rd: 50, sigma: 0.06 };
    const session = Array.from({ length: 5 }, () => ({ opponent, score: 0.5 }));
    const after = update(rusty, session, HINDSIGHT);
    expect(after.rd).toBeLessThan(rusty.rd * 0.8);
  });

  it('never falls below the floor or rises above the ceiling', () => {
    const opponent = { rating: 1500, rd: 30, sigma: 0.06 };
    let rating = initial(HINDSIGHT);
    for (let i = 0; i < 200; i++) {
      rating = update(rating, [{ opponent, score: 0.5 }], HINDSIGHT);
    }
    expect(rating.rd).toBeGreaterThanOrEqual(HINDSIGHT.rdFloor);
    expect(decay(rating, 10 * 365 * 86_400_000, HINDSIGHT).rd).toBeLessThanOrEqual(HINDSIGHT.rdCeiling);
  });
});

describe('a rating period with no games', () => {
  it('is decay alone, so update leaves it untouched', () => {
    const player = { rating: 1500, rd: 200, sigma: 0.06 };
    expect(update(player, [], HINDSIGHT)).toEqual(player);
  });
});
