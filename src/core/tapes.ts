/**
 * §11.2's creator tapes — the filter vocabulary, and what a user may say with it.
 *
 * > "Any user can assemble a map from filter-generated or hand-picked charts, name it, describe it
 * > and share it by link. This is the feature that makes the product sellable and licensable: an
 * > educator, a community operator or a proprietary trading firm can hand their students a curated
 * > set that trains one specific skill."
 *
 * A creator tape is built from exactly the vocabulary the official tapes use — regime buckets,
 * volatility buckets, themes, lead-in drift, council conflict — and issued by the same function. The
 * only thing separating the two is whether `owner_id` is null.
 *
 * ## Why the vocabulary is closed
 *
 * §11.1 requires a tape to be a published filter "so the map's difficulty distribution is
 * reproducible and its statistics are valid". Every predicate below reads a **stored tag computed
 * from the lead-in**, which is what makes that true and what keeps §12.1 intact: a filter over
 * anything derived from the reveal would announce part of the answer in the tape's own definition,
 * which is exactly why The Null Set is locked.
 *
 * So the builder does not offer free-form SQL, and it does not offer hand-picking. Hand-picking is
 * §11.2's own suggestion and it is the one part not built: a set someone chose chart by chart has no
 * reproducible difficulty distribution, and every percentile computed on it is conditioned on that
 * choice in a way nobody can state.
 */

import { TIERS, type TierCode } from './tiers';

/** The regime and theme values a tape may filter on. Mirrors what the corpus actually carries. */
export const TAPE_VOCABULARY = {
  /** §11.1's Chop tape is `er` — the efficiency-ratio bucket. */
  er: ['trend', 'directional', 'chop', 'noise'] as const,
  vol: ['violent', 'active', 'subdued', 'quiet'] as const,
  themes: [
    'liquidity-sweep',
    'failed-breakout',
    'v-reversal',
    'compression-expansion',
    'range-reversion',
    'trend-continuation',
  ] as const,
} as const;

export type ErBucket = (typeof TAPE_VOCABULARY.er)[number];
export type VolBucket = (typeof TAPE_VOCABULARY.vol)[number];
export type ThemeCode = (typeof TAPE_VOCABULARY.themes)[number];

/**
 * Drift is bounded at ±20 ATR because the corpus is.
 *
 * p99 is about ±14, so a threshold past the far tail produces a tape with no charts in it.
 * `issue_round` keeps the tape's predicates in its fallback query — it only drops the "not already
 * played" clause — so an empty tape does not quietly become The Open Tape; it raises, and the player
 * is told the corpus is empty, which is true of their tape and confusing about everything else. A
 * tape that cannot be created is better than a tape that can only fail.
 */
export const DRIFT_LIMIT = 20;

/** The smallest tape worth having. Below this the same charts repeat within a single sitting. */
export const MIN_TAPE_CHARTS = 10;

export interface TapeFilter {
  er: ErBucket[];
  vol: VolBucket[];
  themes: ThemeCode[];
  /** Charts drifting at most this, in ATR. Negative selects a falling tape. */
  driftBelow: number | null;
  /** Charts drifting at least this, in ATR. */
  driftAbove: number | null;
  /** Only charts where the schools take opposite sides — 7.1% of the corpus. */
  councilSplit: boolean;
}

export const EMPTY_FILTER: TapeFilter = {
  er: [],
  vol: [],
  themes: [],
  driftBelow: null,
  driftAbove: null,
  councilSplit: false,
};

export type Visibility = 'private' | 'unlisted' | 'public';

export interface TapeDraft {
  name: string;
  blurb: string;
  visibility: Visibility;
  /** §11.2's tier lock. Null means the player chooses. */
  lockedTier: TierCode | null;
  filter: TapeFilter;
}

/* ------------------------------------------------------------------- naming */

/** Slugs that would shadow a route or an official tape. */
export const RESERVED_SLUGS = new Set(['new', 'mine', 'edit', 'cohort', 'open']);

/**
 * A slug from a name, with a short suffix.
 *
 * The suffix is not decoration. Two operators may reasonably both name a tape "Week 1", and a slug
 * collision between them would either fail the second creation or, worse, hand the second person
 * the first person's tape. It also means an unlisted tape's URL is not guessable from its name, which
 * is the whole security model of an unlisted link.
 */
export function slugify(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `${base || 'tape'}-${suffix}`;
}

/* --------------------------------------------------------------- validation */

/**
 * Everything wrong with a draft, in the order a person would fix it.
 *
 * Returns messages rather than throwing, because the builder shows them all at once — a form that
 * reveals one problem per submission is a form people abandon.
 */
export function validateDraft(draft: TapeDraft): string[] {
  const problems: string[] = [];

  const name = draft.name.trim();
  if (name.length < 3) problems.push('Give the tape a name of at least three characters.');
  if (name.length > 60) problems.push('Names are capped at 60 characters.');
  if (draft.blurb.trim().length > 600) problems.push('The description is capped at 600 characters.');

  if (draft.lockedTier !== null && !TIERS.some((t) => t.code === draft.lockedTier)) {
    problems.push('That is not a ruleset.');
  }

  const { filter } = draft;
  if (filter.er.some((v) => !TAPE_VOCABULARY.er.includes(v))) problems.push('Unknown regime.');
  if (filter.vol.some((v) => !TAPE_VOCABULARY.vol.includes(v))) problems.push('Unknown volatility band.');
  if (filter.themes.some((v) => !TAPE_VOCABULARY.themes.includes(v))) problems.push('Unknown theme.');

  for (const [label, value] of [
    ['upper', filter.driftBelow],
    ['lower', filter.driftAbove],
  ] as const) {
    if (value === null) continue;
    if (!Number.isFinite(value)) problems.push(`The ${label} drift bound is not a number.`);
    else if (Math.abs(value) > DRIFT_LIMIT) {
      problems.push(`Drift bounds run to ±${DRIFT_LIMIT} ATR; the corpus has nothing past that.`);
    }
  }

  // Both bounds set and crossing selects nothing at all, and a tape that selects nothing can only
  // ever fail at issuance — with a message about the corpus being empty, which is a true statement
  // about this tape and a misleading one about the library.
  if (filter.driftBelow !== null && filter.driftAbove !== null && filter.driftAbove > filter.driftBelow) {
    problems.push('Those drift bounds exclude every chart: the lower bound is above the upper one.');
  }

  if (!hasAnyCondition(filter)) {
    problems.push('A tape needs at least one condition, or it is just the whole library.');
  }

  return problems;
}

export function hasAnyCondition(filter: TapeFilter): boolean {
  return (
    filter.er.length > 0 ||
    filter.vol.length > 0 ||
    filter.themes.length > 0 ||
    filter.driftBelow !== null ||
    filter.driftAbove !== null ||
    filter.councilSplit
  );
}

/**
 * The filter in the words the tape cards use.
 *
 * §11.1's rule is that a tape's definition is published, not merely applied — so this is what the
 * tape page shows beneath the owner's own description, and the two are visibly different things.
 */
export function describeFilter(filter: {
  er: readonly string[];
  vol: readonly string[];
  themes: readonly string[];
  driftBelow: number | null;
  driftAbove: number | null;
  councilSplit: boolean;
}): string[] {
  const parts: string[] = [];
  if (filter.er.length) parts.push(`regime is ${list(filter.er)}`);
  if (filter.vol.length) parts.push(`volatility is ${list(filter.vol)}`);
  if (filter.themes.length) parts.push(`tagged ${list(filter.themes.map((t) => t.replace(/-/g, ' ')))}`);
  if (filter.driftBelow !== null) parts.push(`drifted ${filter.driftBelow} ATR or less across the window`);
  if (filter.driftAbove !== null) parts.push(`drifted ${filter.driftAbove} ATR or more across the window`);
  if (filter.councilSplit) parts.push('the schools take opposite sides');
  return parts;
}

function list(values: readonly string[]): string {
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
}
