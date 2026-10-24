import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { serviceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, ensureSession } from '@/lib/session';
import { authClient } from '@/lib/supabase/auth-server';
import { RANKED_TIER, affordances, tierByCode } from '@/core/tiers';
import { RANKED_CHARTS, RANKED_MAX_PASSES, mayPass, scoreSession } from '@/core/ranked';
import { roundPayload } from '@/lib/round-payload';
import type { RankedPayload } from '@/lib/api-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issue or resume a ranked session.
 *
 * §10.1: "Five-chart sessions at Naked, minimum three entries, compressed scoring, Glicko-2 against
 * rated charts." §4.4 supplies the quota, and it is enforced *prospectively* — once both passes are
 * spent the control is disabled rather than the session failing at the end. A quota that only
 * reveals itself after the fact is a trap; one you can see is a resource.
 *
 * Requires an account. Everything else in the product is playable anonymously and always will be
 * (§10.4), but a ladder position has to belong to someone — an anonymous rating would be erased by
 * clearing a cookie, and §8.3's retirement statistic regresses on ratings that have to persist.
 */
export async function POST(request: Request) {
  const sessionId = await ensureSession();
  const userId = await currentUserId();

  if (!userId) {
    return NextResponse.json(
      { error: 'Ranked needs an account — a ladder position has to belong to someone.' },
      { status: 401 },
    );
  }

  // A reload must resume, never re-roll — so starting a fresh session is an explicit ask.
  const fresh = new URL(request.url).searchParams.get('new') === '1';
  const tier = tierByCode(RANKED_TIER)!;
  const granted = affordances(tier);
  const nonce = randomBytes(16).toString('hex');
  const supabase = serviceClient();

  const { data, error } = await supabase.rpc('issue_ranked', {
    p_session: sessionId,
    p_user: userId,
    p_nonce: nonce,
    p_tier: tier.code,
    p_candles: granted.candles,
    p_clock_seconds: granted.clockSeconds,
    p_charts: RANKED_CHARTS,
    p_new: fresh,
  });

  if (error) {
    console.error('issue_ranked failed', error);
    return NextResponse.json({ error: 'Could not start a ranked session.' }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return NextResponse.json({ error: 'Could not start a ranked session.' }, { status: 500 });
  }

  const played = (row.played as number) ?? 0;
  const passes = (row.passes as number) ?? 0;
  const complete = row.round_id === null;

  const payload: RankedPayload = {
    sessionId: row.session_id as string,
    played,
    total: RANKED_CHARTS,
    passes,
    passesLeft: Math.max(0, RANKED_MAX_PASSES - passes),
    mayPass: mayPass(passes),
    complete,
    round: complete
      ? null
      : roundPayload(
          {
            round_id: row.round_id as string,
            lead_in_bars: row.lead_in_bars,
            atr14: row.atr14 as number,
            tick_size: row.tick_size as number,
            entry_price: row.entry_price as number,
            start_dow: row.start_dow as number,
            start_hour: row.start_hour as number,
            lead_in_detail: null,
            expires_at: row.expires_at as string | null,
          },
          tier,
        ),
    result: complete ? await summarise(supabase, row.session_id as string, userId) : null,
  };

  const response = NextResponse.json(payload);
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}

/**
 * Score a finished session.
 *
 * The IMP total is a legible number for the player; it is **not** what the ladder is made of. §4.3's
 * lottery-ticket failure mode lives in the aggregation rather than the per-chart scale, so ranked
 * standing is the Glicko rating — a mean-like estimator that variance cannot buy standing from —
 * and this total is a scoreboard line beside it.
 */
async function summarise(
  supabase: ReturnType<typeof serviceClient>,
  session: string,
  userId: string,
): Promise<RankedPayload['result']> {
  const [{ data }, { data: rating }] = await Promise.all([
    supabase
      .from('rounds')
      .select('percentile, passed, ambiguous, forfeited, ranked_index, player_rating_at_attempt')
      .eq('ranked_session', session)
      .eq('superseded', false)
      .order('ranked_index'),
    supabase.from('player_ratings').select('rating, rd, attempts').eq('user_id', userId).eq('tier', 'ALL').maybeSingle(),
  ]);

  const rows = data ?? [];
  const scored = scoreSession(
    rows.map((r) => ({
      percentile: r.percentile as number | null,
      passed: Boolean(r.passed),
      ambiguous: Boolean(r.ambiguous),
      forfeited: Boolean(r.forfeited),
    })),
  );

  // The session's rating change: what the player carried into its first chart (stored on the
  // round at issuance, so it is the rating before, not a reconstruction) against where it stands
  // now. The summary used to show a points total and never the rating it was all for.
  const before = (rows[0]?.player_rating_at_attempt as number | null | undefined) ?? null;
  return {
    imps: scored.imps,
    total: scored.total,
    entries: scored.entries,
    passes: scored.passes,
    forfeits: scored.forfeits,
    quotaMet: scored.quotaMet,
    rating: {
      before,
      after: (rating?.rating as number | undefined) ?? null,
      rd: (rating?.rd as number | undefined) ?? null,
      attempts: (rating?.attempts as number | undefined) ?? 0,
    },
  };
}

async function currentUserId(): Promise<string | null> {
  try {
    const auth = await authClient();
    const { data } = await auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
