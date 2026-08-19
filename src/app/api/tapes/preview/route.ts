import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { DRIFT_LIMIT, MAP_VOCABULARY, type MapFilter } from '@/core/maps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * How many charts a filter selects, before anyone commits to it.
 *
 * The builder is a form whose one consequential output is invisible: a person picking conditions has
 * no way to know whether they have described a third of the library or four charts. §11.1's whole
 * argument for filters over hand-picking is that the resulting difficulty distribution is
 * reproducible — but a map of four charts has a distribution nobody should quote, and finding that
 * out only at creation means starting the form again.
 *
 * The same predicates as `/api/tapes` and `issue_round`. Three copies of one filter is two too many,
 * and the reason they are not shared is that one is SQL inside a plpgsql function; keeping them
 * literally side by side in the two TypeScript callers is the cheapest way to keep them honest.
 *
 * Read-only, and safe to be: a chart count over lead-in tags reveals nothing about any reveal.
 */

const schema = z.object({
  er: z.array(z.enum(MAP_VOCABULARY.er)).max(4).default([]),
  vol: z.array(z.enum(MAP_VOCABULARY.vol)).max(4).default([]),
  themes: z.array(z.enum(MAP_VOCABULARY.themes)).max(6).default([]),
  driftBelow: z.number().min(-DRIFT_LIMIT).max(DRIFT_LIMIT).nullable().default(null),
  driftAbove: z.number().min(-DRIFT_LIMIT).max(DRIFT_LIMIT).nullable().default(null),
  councilSplit: z.boolean().default(false),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const filter = parsed.data as MapFilter;

  const supabase = serviceClient();
  let query = supabase.from('charts').select('id', { count: 'exact', head: true });
  if (filter.er.length) query = query.in('regime_er_bucket', filter.er);
  if (filter.vol.length) query = query.in('regime_vol_bucket', filter.vol);
  if (filter.themes.length) query = query.overlaps('themes', filter.themes);
  if (filter.driftBelow !== null) query = query.lte('lead_in_drift_atr', filter.driftBelow);
  if (filter.driftAbove !== null) query = query.gte('lead_in_drift_atr', filter.driftAbove);
  if (filter.councilSplit) query = query.gt('council_minority', 0);

  const { count, error } = await query;
  if (error) {
    console.error('map preview failed', error);
    return NextResponse.json({ error: 'Could not count that.' }, { status: 500 });
  }

  return NextResponse.json({ charts: count ?? 0 });
}
