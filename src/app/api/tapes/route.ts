import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { currentViewer } from '@/lib/viewer';
import { TIERS } from '@/core/tiers';
import {
  DRIFT_LIMIT,
  MAP_VOCABULARY,
  MIN_MAP_CHARTS,
  RESERVED_SLUGS,
  slugify,
  validateDraft,
  type MapDraft,
} from '@/core/maps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a map (§11.2).
 *
 * A creator map is a row in `tapes` with an owner, assembled from the same closed vocabulary the
 * official maps use and issued by the same function. See `src/core/maps.ts` for why the vocabulary
 * is closed and why hand-picking is the one part of §11.2 not built.
 *
 * ## It is created only if it can be played
 *
 * The chart count is queried *before* the insert, with the same predicates `issue_round` will apply,
 * and a map that matches fewer than `MIN_MAP_CHARTS` is refused. Without that check an
 * over-restrictive filter produces a map that exists, lists, shares — and then fails every issuance
 * with "the corpus is empty", which is true of the map and alarming about the library.
 *
 * ## Signed in, always
 *
 * §11.2's maps belong to someone: they are shared by link, they carry a cohort, and an operator has
 * to be able to come back to one. An anonymous session cannot own a thing it may lose on a cleared
 * cookie, so this refuses rather than creating something that will be orphaned.
 */

const filterSchema = z.object({
  er: z.array(z.enum(MAP_VOCABULARY.er)).max(4).default([]),
  vol: z.array(z.enum(MAP_VOCABULARY.vol)).max(4).default([]),
  themes: z.array(z.enum(MAP_VOCABULARY.themes)).max(6).default([]),
  driftBelow: z.number().min(-DRIFT_LIMIT).max(DRIFT_LIMIT).nullable().default(null),
  driftAbove: z.number().min(-DRIFT_LIMIT).max(DRIFT_LIMIT).nullable().default(null),
  councilSplit: z.boolean().default(false),
});

const createSchema = z.object({
  name: z.string().min(3).max(60),
  blurb: z.string().max(600).default(''),
  visibility: z.enum(['private', 'unlisted', 'public']).default('unlisted'),
  lockedTier: z
    .enum(TIERS.map((t) => t.code) as [string, ...string[]])
    .nullable()
    .default(null),
  filter: filterSchema,
});

export async function POST(request: Request) {
  const viewer = await currentViewer();
  if (!viewer.userId) {
    return NextResponse.json(
      { error: 'Maps belong to an account. Sign in first, so yours does not vanish with a cookie.' },
      { status: 401 },
    );
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const draft = parsed.data as MapDraft;
  const problems = validateDraft(draft);
  if (problems.length > 0) {
    return NextResponse.json({ error: problems[0], problems }, { status: 400 });
  }

  const supabase = serviceClient();

  // The same predicates `issue_round` runs, so the count and the issuer cannot disagree about what
  // is in the map.
  const charts = await countCharts(supabase, draft);
  if (charts < MIN_MAP_CHARTS) {
    return NextResponse.json(
      {
        error:
          charts === 0
            ? 'No chart in the library matches that. Loosen a condition.'
            : `Only ${charts} charts match, and a map needs at least ${MIN_MAP_CHARTS} to be worth playing.`,
        charts,
      },
      { status: 422 },
    );
  }

  // Six hex characters: enough that two maps called "Week 1" do not collide, and enough that an
  // unlisted map's URL is not guessable from its name.
  let slug = slugify(draft.name, randomBytes(3).toString('hex'));
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-map`;

  const { data, error } = await supabase
    .from('tapes')
    .insert({
      slug,
      name: draft.name.trim(),
      blurb: draft.blurb.trim(),
      owner_id: viewer.userId,
      visibility: draft.visibility,
      tier: draft.lockedTier ?? 'NTZ',
      tier_locked: draft.lockedTier !== null,
      er_buckets: draft.filter.er.length ? draft.filter.er : null,
      vol_buckets: draft.filter.vol.length ? draft.filter.vol : null,
      themes: draft.filter.themes.length ? draft.filter.themes : null,
      drift_below: draft.filter.driftBelow,
      drift_above: draft.filter.driftAbove,
      council_split: draft.filter.councilSplit,
      // Creator maps are never in the official grid on /tapes; `published` is what puts a tape
      // there, and an owner's map is listed from their own page instead.
      published: false,
      sort: 1000,
    })
    .select('slug')
    .single();

  if (error || !data) {
    console.error('map creation failed', error);
    return NextResponse.json({ error: 'Could not create the map.' }, { status: 500 });
  }

  return NextResponse.json({ slug: data.slug, charts }, { status: 201 });
}

/** How many charts a draft's filter selects, using `issue_round`'s predicates exactly. */
async function countCharts(
  supabase: ReturnType<typeof serviceClient>,
  draft: MapDraft,
): Promise<number> {
  let query = supabase.from('charts').select('id', { count: 'exact', head: true });
  if (draft.filter.er.length) query = query.in('regime_er_bucket', draft.filter.er);
  if (draft.filter.vol.length) query = query.in('regime_vol_bucket', draft.filter.vol);
  if (draft.filter.themes.length) query = query.overlaps('themes', draft.filter.themes);
  if (draft.filter.driftBelow !== null) query = query.lte('lead_in_drift_atr', draft.filter.driftBelow);
  if (draft.filter.driftAbove !== null) query = query.gte('lead_in_drift_atr', draft.filter.driftAbove);
  if (draft.filter.councilSplit) query = query.gt('council_minority', 0);
  const { count } = await query;
  return count ?? 0;
}
