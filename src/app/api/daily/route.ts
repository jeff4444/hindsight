import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { serviceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, ensureSession } from '@/lib/session';
import { authClient } from '@/lib/supabase/auth-server';
import { REVEAL_BARS } from '@/core/config';
import { fromPgHex, toBase64 } from '@/core/pack';
import { DAILY_CHARTS, dailyNumber, isDailyOpen } from '@/lib/daily';
import { shareCard } from '@/lib/share';
import { getStreak } from '@/lib/viewer';
import type { DailyPayload, RoundPayload } from '@/lib/api-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issue or resume the player's daily.
 *
 * §10.1: five charts, identical for every player, one attempt, resetting at midnight UTC with a
 * 48-hour completion window. The five are derived from the day number inside `issue_daily`, so
 * there is no assignment table to drift out of step with what a player was actually served.
 *
 * The issuance projection is the same one `issue_round` uses — lead-in candles and nothing else.
 * The achievable set is future data (§12.1) and is released with the reveal, exactly like the
 * reveal bars.
 */
export async function POST(request: Request) {
  const sessionId = await ensureSession();
  const userId = await currentUserId();
  const now = Date.now();

  // `Number(null)` is 0 and `Number.isInteger(0)` is true, so an absent parameter must be
  // checked for explicitly — otherwise every request without ?day silently asks for daily #0.
  const requested = new URL(request.url).searchParams.get('day');
  const parsed = requested === null ? Number.NaN : Number(requested);
  const day = Number.isInteger(parsed) ? parsed : dailyNumber(now);

  if (!isDailyOpen(day, now)) {
    return NextResponse.json(
      { error: 'That daily has closed. §10.1 keeps each one open for 48 hours.' },
      { status: 410 },
    );
  }

  const supabase = serviceClient();

  // What this session has already finished today.
  const { data: played, error: playedError } = await supabase
    .from('rounds')
    .select('daily_index, passed, r_multiple, percentile')
    .eq('owner', userId ?? sessionId)
    .eq('daily_day', day)
    .eq('superseded', false)
    .not('committed_at', 'is', null)
    .order('daily_index');

  if (playedError) {
    console.error('daily history failed', playedError);
    return NextResponse.json({ error: 'Could not load your daily.' }, { status: 500 });
  }

  const results = (played ?? []).map((row) => ({
    index: row.daily_index as number,
    passed: row.passed as boolean,
    percentile: row.percentile as number | null,
  }));

  // Complete: hand back the summary and the card rather than a sixth chart.
  if (results.length >= DAILY_CHARTS) {
    // The durable record streaks read. Written here rather than in the order route so it also
    // heals a session whose fifth chart committed before they had an account.
    if (userId) await supabase.rpc('record_daily_completion', { p_user: userId, p_day: day });

    // Read once, after the write. `getStreak` is not a pure read — it spends freezes lazily and
    // opens or expires repairs as a side effect — so calling it either side of the write to get a
    // true "before" would run that decision path twice in one request. Completing today either
    // extends the run by one or starts a new one at one, so the length before today counted is
    // always exactly one less. That is what the count-up animates, and it cannot be wrong by more.
    const after = userId ? await getStreak({ sessionId, userId, email: null, profile: null }) : null;

    const scored = results.map((r) => r.percentile).filter((p): p is number => p !== null);
    const mean = scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    const traded = results.filter((r) => !r.passed).length;

    const payload: DailyPayload = {
      day,
      complete: true,
      played: results.length,
      total: DAILY_CHARTS,
      traded,
      percentile: mean,
      results,
      streak: after
        ? {
            before: Math.max(0, after.length - 1),
            after: after.length,
            perfect: after.perfect,
            freezesRemaining: after.freezesRemaining,
            longest: after.longest,
          }
        : null,
      card: shareCard({ day, percentile: mean, traded, total: DAILY_CHARTS }),
      round: null,
    };
    return withSession(payload, sessionId);
  }

  const nonce = randomBytes(16).toString('hex');
  const { data, error } = await supabase.rpc('issue_daily', {
    p_session: sessionId,
    p_user: userId,
    p_day: day,
    p_nonce: nonce,
  });

  if (error) {
    console.error('issue_daily failed', error);
    return NextResponse.json({ error: 'Could not issue the daily.' }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return NextResponse.json({ error: 'No chart available for this daily.' }, { status: 503 });
  }

  const round: RoundPayload = {
    roundId: row.round_id,
    bars: row.lead_in_bars,
    atr: row.atr14,
    tickSize: row.tick_size,
    entry: row.entry_price,
    revealBarCount: REVEAL_BARS,
    startDayOfWeek: row.start_dow,
    startHourUtc: row.start_hour,
    detail: row.lead_in_detail ? toBase64(fromPgHex(row.lead_in_detail)) : '',
  };

  const payload: DailyPayload = {
    day,
    complete: false,
    played: results.length,
    total: DAILY_CHARTS,
    traded: results.filter((r) => !r.passed).length,
    percentile: null,
    results,
    streak: null,
    card: null,
    round,
  };
  return withSession(payload, sessionId);
}

function withSession(payload: DailyPayload, sessionId: string) {
  const response = NextResponse.json(payload);
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
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
