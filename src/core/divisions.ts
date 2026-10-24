/**
 * Divisions: names for bands of the overall rating.
 *
 * Display only. Nothing is scored, served or matched on a division — the Glicko rating does all of
 * that, unchanged. A division is the rating said in words, so a player can tell at a glance where
 * they stand without reading a four-digit number with a ± on it.
 *
 * The bands are cut in standard deviations of the player population rather than in round rating
 * numbers, because rules §12.2 estimates that spread at about 42 points: a ladder cut every 100
 * points would put nearly everyone in one band. Mean 1500, half-SD steps from −1.5 to +2.25.
 * These thresholds are ours and provisional; when the population exists they are re-cut from its
 * measured spread and the change is published, not tuned.
 */

import { RANK_MAX_RD, RANK_MIN_ATTEMPTS } from './rating';

export const POPULATION_MEAN = 1500;
export const POPULATION_SD = 42;

export type DivisionId = 'paper' | 'retail' | 'swing' | 'desk' | 'prop' | 'fund' | 'wizard';

export interface Division {
  id: DivisionId;
  name: string;
  /** Inclusive lower bound, in rating points. `-Infinity` for the first. */
  floor: number;
  /** One line, in the voice of the product. */
  blurb: string;
}

const z = (sd: number) => Math.round(POPULATION_MEAN + sd * POPULATION_SD);

export const DIVISIONS: readonly Division[] = [
  { id: 'paper', name: 'Paper', floor: -Infinity, blurb: 'Everyone starts here. Most of the market never leaves.' },
  { id: 'retail', name: 'Retail', floor: z(-1.5), blurb: 'Reading the chart, not yet the risk.' },
  { id: 'swing', name: 'Swing', floor: z(-0.75), blurb: 'Stops in the right places, mostly.' },
  { id: 'desk', name: 'Desk', floor: z(0), blurb: 'Above the middle of the field.' },
  { id: 'prop', name: 'Prop', floor: z(0.75), blurb: 'Consistently better than the typical trade.' },
  { id: 'fund', name: 'Fund', floor: z(1.5), blurb: 'A track record, not a streak.' },
  { id: 'wizard', name: 'Wizard', floor: z(2.25), blurb: 'The far tail. Schwager would want a word.' },
];

export function divisionFor(rating: number): Division {
  let found = DIVISIONS[0];
  for (const division of DIVISIONS) if (rating >= division.floor) found = division;
  return found;
}

/** Where a rating sits inside its division, 0–1, and the next division up (null at the top). */
export function divisionProgress(rating: number): { division: Division; next: Division | null; progress: number } {
  const division = divisionFor(rating);
  const index = DIVISIONS.indexOf(division);
  const next = DIVISIONS[index + 1] ?? null;
  if (!next) return { division, next: null, progress: 1 };
  // The first band has no floor; measure it over one band's width below the second.
  const floor = Number.isFinite(division.floor) ? division.floor : next.floor - 0.75 * POPULATION_SD;
  const progress = Math.min(Math.max((rating - floor) / (next.floor - floor), 0), 1);
  return { division, next, progress };
}

/**
 * Whether a rating is settled enough to name. The same gate rules §4.9 puts on the number itself:
 * a division is the number in words, so it waits for the same sample.
 */
export function isPlaced(attempts: number, rd: number): boolean {
  return attempts >= RANK_MIN_ATTEMPTS && rd <= RANK_MAX_RD;
}

/** How many rated rounds are left before placement, for the "18 to go" line. */
export function roundsToPlacement(attempts: number): number {
  return Math.max(0, RANK_MIN_ATTEMPTS - attempts);
}
