import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, ensureSession } from '@/lib/session';
import { currentViewer } from '@/lib/viewer';
import { DUEL_SPEC } from '@/core/duel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Open a duel or a race (§10.1).
 *
 * Both are a **fixed ordered chart sequence** several players work through independently — see
 * `src/core/duel.ts` for why that one primitive carries both modes.
 *
 * ## A duel starts with no charts, and that is the fairness rule
 *
 * Every other mode picks charts the player has not seen; `issue_round` carries a `not exists` clause
 * for it. A duel cannot, because both players must get the *same* charts — and a chart one of them
 * has already played is one they have already been shown the answer to.
 *
 * So a duel is created empty and its sequence is drawn when the second player joins, from charts
 * **neither** has played. That is also why a duel is a challenge sent by link rather than a lobby:
 * the opponent has to be known before the charts can be chosen.
 *
 * A race cannot wait — its later runners are unknown when the first one starts — so its sequence is
 * drawn at creation and a runner who has already seen one of those charts is flagged rather than
 * ranked silently beside people who had not.
 */

const schema = z.object({
  mode: z.enum(['duel', 'race']),
  tape: z.string().min(1).max(64).default('open'),
  length: z.number().int().min(1).max(20).default(7),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { mode, tape, length } = parsed.data;

  const sessionId = await ensureSession();
  const viewer = await currentViewer();
  const owner = viewer.userId ?? sessionId;
  const supabase = serviceClient();

  // `matches.created_by` is an owner, and rounds are owned by `coalesce(user_id, session_id)` — so
  // the session row has to exist before anything references it. Same order-dependence that hid a bug
  // in `/api/run`: `issue_round` normally creates it, and nothing here has called that yet.
  await supabase.from('play_sessions').upsert({ id: sessionId }, { onConflict: 'id' });

  // A race has no second player to wait for, so its sequence is drawn now, against the creator's own
  // history alone.
  let chartIds: string[] | null = null;
  if (mode === 'race') {
    const { data, error } = await supabase.rpc('draw_sequence', {
      p_tape: tape,
      p_length: length,
      p_owners: [owner],
    });
    if (error) {
      console.error('draw_sequence failed', error);
      const badTape = error.message.includes('no such tape') || error.message.includes('is locked');
      return NextResponse.json(
        { error: badTape ? 'That tape is not open.' : 'Could not open the race.' },
        { status: badTape ? 404 : 500 },
      );
    }
    if (!data) {
      return NextResponse.json(
        {
          error: `That tape cannot supply ${length} charts you have not already played. Pick a bigger tape or a shorter race.`,
        },
        { status: 422 },
      );
    }
    chartIds = data as string[];
  }

  const { data: match, error } = await supabase
    .from('matches')
    .insert({
      mode,
      tape,
      length,
      chart_ids: chartIds,
      status: chartIds ? 'live' : 'open',
      created_by: owner,
    })
    .select('id, mode, tape, length, status')
    .single();

  if (error || !match) {
    console.error('match creation failed', error);
    return NextResponse.json({ error: 'Could not open it.' }, { status: 500 });
  }

  const { error: seatError } = await supabase.from('match_players').insert({
    match_id: match.id,
    owner,
    user_id: viewer.userId,
    seat: 0,
    // A duel's bar is full from the start; a race has no bar.
    health: mode === 'duel' ? DUEL_SPEC.health : null,
  });
  if (seatError) {
    console.error('could not seat the creator', seatError);
    return NextResponse.json({ error: 'Could not open it.' }, { status: 500 });
  }

  const response = NextResponse.json(
    { matchId: match.id, mode: match.mode, tape: match.tape, length: match.length, status: match.status },
    { status: 201 },
  );
  // The cookie has to come back with the match, for the same reason it does with a run: the seat is
  // bound to this session, and a browser that never received the cookie would arrive at the next
  // request as somebody else.
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}
