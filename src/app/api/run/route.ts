import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, ensureSession } from '@/lib/session';
import { STORM_SPEC, STREAK_SPEC } from '@/core/run';
import type { RunState } from '@/lib/api-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start a Storm or a Streak (§10.1).
 *
 * A run is a *wrapper* over ordinary rounds rather than a different kind of round: the player still
 * issues from `/api/round` and commits to `/api/round/[id]/order`, and the only difference is that
 * the round carries a `run_id` and the commit reports what the run did in response. That keeps one
 * scoring path — a second one would drift from the first, and the two modes are precisely the ones
 * that need the scoring to be identical, since they are volume generators for measurements taken
 * everywhere else.
 *
 * **Storm's clock lives on the server and nowhere else.** It is a budget of *decision* time — each
 * round charges the gap between issue and commit, so the reveal is free — and it is spent by
 * `/api/round/[id]/order`, never by the client. The mode's whole scarcity is that budget, so a
 * client that owned it would own the score: the same argument §17.5 makes for metering the Manage
 * reveal.
 */

const startSchema = z.object({
  mode: z.enum(['storm', 'streak']),
  tape: z.string().min(1).max(64).default('open'),
});

export async function POST(request: Request) {
  const parsed = startSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { mode, tape } = parsed.data;

  const sessionId = await ensureSession();
  const supabase = serviceClient();

  /*
   * The session row has to exist before a run can reference it.
   *
   * `ensureSession` mints the cookie, but the `play_sessions` row is created by `issue_round` — so a
   * player who opens Storm as the very first thing they do has a session id and no row, and the
   * foreign key rejects the run. Found by starting a Storm on a fresh cookie; the earlier Streak
   * test only passed because a Storm had already issued rounds and created the row as a side
   * effect, which is exactly the kind of order-dependence that hides a bug until a real first-time
   * player arrives.
   */
  await supabase.from('play_sessions').upsert({ id: sessionId }, { onConflict: 'id' });

  const { data, error } = await supabase
    .from('runs')
    .insert({
      session_id: sessionId,
      mode,
      tape,
      // Storm is timed and Streak is not. Null rather than a very large number, so "untimed" is a
      // fact about the row rather than a value nobody checks.
      remaining_ms: mode === 'storm' ? STORM_SPEC.durationMs : null,
      skips_left: mode === 'streak' ? STREAK_SPEC.skips : 0,
    })
    .select('id, mode, remaining_ms, score, combo, best_combo, length, best_length, skips_left, charts, alive')
    .single();

  if (error || !data) {
    console.error('run start failed', error);
    return NextResponse.json({ error: 'Could not start the run.' }, { status: 500 });
  }

  /*
   * The session cookie has to come back with the run.
   *
   * `ensureSession` mints an id but does not set the cookie — the caller does, and `/api/round`
   * always has. This route did not, so a player whose first action was starting a Storm got a run
   * bound to a session id the browser never received: every round after it carried a *different*
   * session, the run never attached, and the mode silently scored nothing while looking fine.
   *
   * It survived the first test run because Streak was tested second, by which point the rounds
   * issued during the Storm test had set the cookie as a side effect.
   */
  const state: RunState =
    mode === 'storm'
      ? {
          id: data.id,
          mode: 'storm',
          alive: data.alive,
          charts: data.charts,
          score: data.score,
          combo: data.combo,
          bestCombo: data.best_combo,
          remainingMs: data.remaining_ms,
        }
      : {
          id: data.id,
          mode: 'streak',
          alive: data.alive,
          charts: data.charts,
          length: data.length,
          bestLength: data.best_length,
          skipsLeft: data.skips_left,
        };

  const response = NextResponse.json(state);
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}
