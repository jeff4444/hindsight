/**
 * The share card.
 *
 * §10.4 lists four properties and notes that "most clones get them wrong":
 *
 *   **spoiler-free** — "encode percentile buckets, never the R-multiple or direction, so a posted
 *   card cannot leak the setup". Someone who has not played today must be able to read a friend's
 *   card without learning which way the chart went.
 *
 *   **comparable** — "everyone played the same chart, so a bare number is instantly meaningful".
 *   This is the property the daily exists to create, and it is why the day number is on the card.
 *
 *   **plain Unicode, no image, no link** — it has to survive being pasted anywhere.
 *
 *   **a bid for a reply** rather than a broadcast.
 *
 * The tier code is included because §10.4 says "the code in the card is free marketing for the
 * ladder". Today that is always NTZ — the build is Naked-shaped and the ladder arrives in Phase
 * 1.5, so there are no mods to append yet.
 */

/** §3.2's letter code for the tier this build plays at. */
/** The daily's ruleset, by name. A code like NTZ means nothing to the person a card is sent to. */
export const TIER_NAME = 'Naked';

// U+2588 FULL BLOCK rather than U+2587: the seven-eighths block sits low in the line box and
// renders unevenly across platforms, which matters for a string whose whole job is to be
// pasted somewhere else.
const FILLED = '\u2588';
const EMPTY = '\u2591';
const BAR_WIDTH = 10;

export interface ShareCardInput {
  /** Daily number, counting from the first ever daily. */
  day: number;
  /** Mean percentile across the session, 0–1. Null if nothing has been scored. */
  percentile: number | null;
  /** How many of the session's charts were traded rather than passed. */
  traded: number;
  total: number;
  /**
   * Each chart's score, in order — a percentile 0–1, `'pass'` for a sit-out, null if unscored. One
   * square each: gold for the top decile, green, white, red, and lavender for sitting out. The
   * squares are score buckets and nothing else, so they spoil nothing about any chart.
   */
  charts?: (number | 'pass' | null)[];
  /** Share of today's field this player finished ahead of, 0–1. Printed as "top N%". */
  beat?: number | null;
}

const SQUARE = { gold: '🟨', good: '🟩', fair: '⬜', poor: '🟥', pass: '🟪', none: '▫️' } as const;

export function chartSquare(value: number | 'pass' | null): string {
  if (value === 'pass') return SQUARE.pass;
  if (value === null) return SQUARE.none;
  if (value >= 0.9) return SQUARE.gold;
  if (value >= 0.6) return SQUARE.good;
  if (value >= 0.35) return SQUARE.fair;
  return SQUARE.poor;
}

/** "78th", "3rd", "1st" — the percentile as an ordinal, which is how §10.4's example writes it. */
export function ordinal(value: number): string {
  const n = Math.round(value);
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * A ten-block bar.
 *
 * This is what §10.4 means by encoding the result in buckets: the shape carries the outcome at a
 * glance while resolving to one of eleven states rather than to a number precise enough to invert.
 */
export function percentileBar(percentile: number): string {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round(percentile * BAR_WIDTH)));
  return FILLED.repeat(filled) + EMPTY.repeat(BAR_WIDTH - filled);
}

/**
 * Build the card.
 *
 * Deliberately absent: the R-multiple, the direction, the ticker, the date, the instrument's
 * price, and whether any individual chart won or lost. Everything on it is either about the
 * player's standing or about which puzzle it was.
 */
export function shareCard({ day, percentile, traded, total, charts, beat }: ShareCardInput): string {
  const top = beat !== null && beat !== undefined ? Math.max(1, Math.round((1 - beat) * 100)) : null;
  const headline =
    percentile === null
      ? `Hindsight #${day} · ${TIER_NAME}`
      : `Hindsight #${day} · ${TIER_NAME} · ${Math.round(percentile * 100)}${top !== null ? ` · top ${top}%` : ''}`;

  const lines = [headline];
  if (charts && charts.length > 0) lines.push(charts.map(chartSquare).join(''));
  else if (percentile !== null) lines.push(percentileBar(percentile));

  // In the daily, passes are unlimited but the count is printed on the card, so the format polices
  // itself socially rather than mechanically. This line is the only thing standing between the
  // daily and a sit-out-everything strategy.
  lines.push(`traded ${traded} of ${total}`);

  return lines.join('\n');
}
