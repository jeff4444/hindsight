import { describe, expect, it } from 'vitest';
import {
  PLAYER_CONFIG,
  RANK_MIN_ATTEMPTS,
  derivedTierOffset,
  newChartRating,
  newPlayerRating,
  rankIsShowable,
  rateAttempt,
  targetBand,
  PENDING_MIN_PLAYS,
  exitsPending,
  type AttemptInput,
} from '@/core/rating';
import { PASS_ANCHOR } from '@/core/ranked';

const settled = (over: Partial<ReturnType<typeof newChartRating>> = {}) => ({
  ...newChartRating(),
  rd: 60,
  plays: 200,
  pending: false,
  ...over,
});

const input = (over: Partial<AttemptInput> = {}): AttemptInput => ({
  tierRating: { ...newPlayerRating(), rd: 80, attempts: 40 },
  overall: { ...newPlayerRating(), rd: 80, attempts: 40 },
  chart: settled(),
  percentile: 0.8,
  sinceLastMs: 0,
  ambiguous: false,
  ...over,
});

describe('the rating is a measuring instrument, so it does not drift (§4.8 over §8.5)', () => {
  it('moves symmetrically about the anchor', () => {
    // §8.5 asks for larger gains and smaller losses; §4.8 forbids exactly that mechanism, citing a
    // chess platform's inflation post-mortem. §8.3 and §3.5 both regress on rating, so a drifting
    // rating corrupts the two tests the ladder is validated by. Symmetry wins.
    const above = rateAttempt(input({ percentile: 0.9 }));
    const below = rateAttempt(input({ percentile: PASS_ANCHOR - (0.9 - PASS_ANCHOR) }));
    const gain = above.overall.rating - 1500;
    const loss = 1500 - below.overall.rating;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeCloseTo(loss, 6);
  });

  it('draws when the player passes, because the map is anchored there', () => {
    const result = rateAttempt(input({ percentile: PASS_ANCHOR }));
    expect(result.score).toBeCloseTo(0.5, 12);
  });

  it('does not inflate over a long run of average results', () => {
    // The clearest statement of the property: a player who performs exactly at the anchor forever
    // must not climb.
    let state = input();
    for (let i = 0; i < 300; i++) {
      const result = rateAttempt({ ...state, percentile: PASS_ANCHOR });
      state = { ...state, tierRating: result.tierRating, overall: result.overall };
    }
    expect(state.overall.rating).toBeCloseTo(1500, 6);
  });
});

describe('pending charts (§8.2)', () => {
  const pending = settled({ pending: true, plays: 3, rd: 200 });

  it('cannot cost the player rating — or pay them', () => {
    // The literal "can only gain, never cost" is a one-sided random walk worth ~+2.3 points per
    // pending chart that never converges. A hundred of them is 234 points of pure inflation.
    const bad = rateAttempt(input({ chart: pending, percentile: 0.05 }));
    const good = rateAttempt(input({ chart: pending, percentile: 0.95 }));
    expect(bad.rated).toBe(false);
    expect(good.rated).toBe(false);
    expect(bad.overall).toEqual(input().overall);
    expect(good.overall).toEqual(input().overall);
  });

  it('still rates the chart, which is the entire point of the pending state', () => {
    const result = rateAttempt(input({ chart: pending, percentile: 0.95 }));
    expect(result.chart.plays).toBe(pending.plays + 1);
    // The player scored well, so the chart is revealed as easier than assumed.
    expect(result.chart.rating).toBeLessThan(pending.rating);
    expect(result.chart.rd).toBeLessThan(pending.rd);
  });

  it('exits on the play count, not on the deviation alone', () => {
    // §8.1: "a chart with high deviation and twelve plays is not trustworthy". RD alone reaches the
    // threshold after roughly eleven attempts, so the count is the binding clause.
    expect(exitsPending(settled({ pending: true, plays: 12, rd: 70 }), 60)).toBe(false);
    expect(exitsPending(settled({ pending: true, plays: 60, rd: 70 }), 60)).toBe(true);
    // …and a chart calibrated entirely against unrated newcomers is not calibrated.
    expect(exitsPending(settled({ pending: true, plays: 60, rd: 70 }), 250)).toBe(false);
  });
});

describe('a chart can actually leave pending, and then the player moves', () => {
  it('graduates after enough plays and starts rating the player', () => {
    // The regression this guards is that the whole ladder can be inert while every individual
    // piece passes its own test. A pending chart is unrated for the player by design (§8.2) — so
    // if nothing ever evaluates the exit condition, every chart stays pending, every attempt stays
    // unrated, and the rating sits at 1500 for ever while looking perfectly healthy.
    let chart = newChartRating();
    const player = { ...newPlayerRating(), rd: 80, attempts: 40 };
    const meanOpponentRd = 80;

    expect(chart.pending).toBe(true);
    expect(rateAttempt(input({ chart })).rated).toBe(false);

    // Play it until §8.2's gate opens.
    let graduatedAfter = -1;
    for (let i = 0; i < PENDING_MIN_PLAYS + 20; i++) {
      const result = rateAttempt(input({ chart, tierRating: player, overall: player }));
      chart = { ...result.chart, pending: !exitsPending(result.chart, meanOpponentRd) };
      if (!chart.pending && graduatedAfter < 0) graduatedAfter = i + 1;
    }

    expect(chart.pending).toBe(false);
    // The play count is the binding clause, not the deviation — §8.1: "a chart with high deviation
    // and twelve plays is not trustworthy".
    expect(graduatedAfter).toBeGreaterThanOrEqual(PENDING_MIN_PLAYS);

    const rated = rateAttempt(input({ chart, percentile: 0.9 }));
    expect(rated.rated).toBe(true);
    expect(rated.overall.rating).toBeGreaterThan(1500);
  });

  it('will not graduate a chart only unrated newcomers have played', () => {
    const chart = { ...newChartRating(), plays: 200, rd: 40 };
    expect(exitsPending(chart, 60)).toBe(true);
    expect(exitsPending(chart, 300)).toBe(false);
  });
});

describe('what is never rated', () => {
  it('excludes an ambiguous fill (§12.3.2)', () => {
    // Both levels touched inside one minute: unfairness, not inaccuracy. Neither side is rated.
    const result = rateAttempt(input({ ambiguous: true }));
    expect(result.rated).toBe(false);
    expect(result.chart).toEqual(input().chart);
    expect(result.overall).toEqual(input().overall);
  });

  it('excludes a retired chart (§8.3)', () => {
    expect(rateAttempt(input({ chart: settled({ retired: true }) })).rated).toBe(false);
  });
});

describe('overall is estimated directly, not pooled from the tiers (§3.4)', () => {
  it('sees every game, so it converges faster than any single tier', () => {
    let tierA = { ...newPlayerRating(), rd: 200 };
    let tierB = { ...newPlayerRating(), rd: 200 };
    let overall = { ...newPlayerRating(), rd: 200 };

    for (let i = 0; i < 20; i++) {
      const onA = i % 2 === 0;
      const result = rateAttempt(
        input({ tierRating: onA ? tierA : tierB, overall, percentile: 0.7 }),
      );
      if (onA) tierA = result.tierRating;
      else tierB = result.tierRating;
      overall = result.overall;
    }

    // §15: "one overall rating fed by all tiers" — in a small population overall must be the
    // best-measured number, because it is what drives placement.
    expect(overall.rd).toBeLessThan(tierA.rd);
    expect(overall.rd).toBeLessThan(tierB.rd);
    expect(overall.attempts).toBe(tierA.attempts + tierB.attempts);
  });
});

describe('display gates (§4.9)', () => {
  it('shows no rank until the sample supports one', () => {
    expect(rankIsShowable({ ...newPlayerRating(), attempts: RANK_MIN_ATTEMPTS - 1, rd: 60 })).toBe(false);
    // Enough attempts but still uncertain is also not enough.
    expect(rankIsShowable({ ...newPlayerRating(), attempts: 100, rd: 200 })).toBe(false);
    expect(rankIsShowable({ ...newPlayerRating(), attempts: 100, rd: 60 })).toBe(true);
  });
});

describe('§8.5 serves different charts rather than different rating maths', () => {
  it('offsets the band without touching the update', () => {
    const player = { ...newPlayerRating(), rating: 1600 };
    expect(targetBand(player, 'standard').low).toBeLessThan(targetBand(player, 'hard').low);
    expect(targetBand(player, 'extra').low).toBeGreaterThan(targetBand(player, 'hard').low);
  });
});

describe('§3.4 asks for a derived tier multiplier rather than an asserted one', () => {
  it('reads it straight off the chart table', () => {
    // "A measured number cannot be argued with; a chosen one always will be." The same chart at a
    // harder tier is a different entity and rates higher, so the gap is the multiplier.
    const offsets = derivedTierOffset(
      { SBX: [], FD: [1420, 1440], NT: [1450, 1470], NTZ: [1500, 1520], NTVZ: [1580, 1600] },
      'NTZ',
    );
    expect(offsets.NTZ).toBeCloseTo(0, 12);
    expect(offsets.NT).toBeCloseTo(-50, 12);
    expect(offsets.NTVZ).toBeCloseTo(80, 12);
  });
});

describe('the RD floor is not the chess one, and that is deliberate', () => {
  it('is low enough that the rating carries more signal than noise', () => {
    // The estimated population spread here is ~42 points because the environment is noisy. A floor
    // of 50 would give reliability 42²/(42²+50²) = 0.41 — worse than a coin flip's worth of signal.
    const populationSd = 42;
    const reliability = populationSd ** 2 / (populationSd ** 2 + PLAYER_CONFIG.rdFloor ** 2);
    expect(reliability).toBeGreaterThan(0.7);
  });
});
