import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, ensureSession } from '@/lib/session';
import { currentViewer } from '@/lib/viewer';
import { DUEL_SPEC, RACE_SPEC } from '@/core/duel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Take a seat in a duel or a race (§10.1).
 *
 * ## Joining a duel is what creates its charts
 *
 * A duel is opened empty. The sequence is drawn here, from charts **neither** player has played, and
 * that is the whole reason the draw waits: both players must see the same charts, and a chart either
 * of them has already played is one they have already been shown the answer to.
 *
 * If the map cannot supply enough charts unseen by both, the join fails and says so. It does not
 * quietly shorten the duel, and it does not fall back to charts one player has seen — a duel decided
 * by which player recognised chart four is not a duel.
 *
 * ## Joining a race can only flag
 *
 * A race's sequence was fixed before this runner existed, so it may contain charts they have played.
 * That is recorded as `clean = false` and shown in the standings. Flagged rather than refused: the
 * run is real and the player is entitled to it; what they are not entitled to is silent comparison
 * with people who had not seen the charts.
 */

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const sessionId = await ensureSession();
  const viewer = await currentViewer();
  const owner = viewer.userId ?? sessionId;
  const supabase = serviceClient();

  await supabase.from('play_sessions').upsert({ id: sessionId }, { onConflict: 'id' });

  const { data: match, error } = await supabase
    .from('matches')
    .select('id, mode, tape, length, status, chart_ids, created_by')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('match lookup failed', error);
    return NextResponse.json({ error: 'Could not reach it.' }, { status: 500 });
  }
  if (!match) return NextResponse.json({ error: 'No such match.' }, { status: 404 });

  const { data: seats } = await supabase
    .from('match_players')
    .select('owner, seat')
    .eq('match_id', id);
  const taken = seats ?? [];

  // Already in it: this is a resume, not a join. Returning the state rather than an error is what
  // makes a share link work when the person following it has already used it once.
  const existing = taken.find((s) => s.owner === owner);
  if (existing) {
    return withCookie(
      NextResponse.json({ matchId: id, mode: match.mode, seat: existing.seat, resumed: true }),
      sessionId,
    );
  }

  if (match.mode === 'duel' && taken.length >= 2) {
    return NextResponse.json({ error: 'That duel already has two players.' }, { status: 409 });
  }
  if (match.mode === 'race' && taken.length >= RACE_SPEC.maxPlayers) {
    return NextResponse.json({ error: 'That race is full.' }, { status: 409 });
  }

  let clean = true;

  if (match.mode === 'duel') {
    // The draw, against both players' histories at once.
    const owners = [...taken.map((s) => s.owner), owner];
    const { data: drawn, error: drawError } = await supabase.rpc('draw_sequence', {
      p_tape: match.tape,
      p_length: match.length,
      p_owners: owners,
    });
    if (drawError) {
      console.error('draw_sequence failed', drawError);
      return NextResponse.json({ error: 'Could not start the duel.' }, { status: 500 });
    }
    if (!drawn) {
      return NextResponse.json(
        {
          error: `Between you, you have played too much of that map for a fair ${match.length}-chart duel. Try a bigger map or a shorter one.`,
        },
        { status: 422 },
      );
    }
    const { error: armError } = await supabase
      .from('matches')
      .update({ chart_ids: drawn, status: 'live' })
      .eq('id', id)
      // Only from `open`. Two people following the same link at once would otherwise both draw, and
      // the second draw would replace a sequence the first had already started playing.
      .eq('status', 'open');
    if (armError) {
      console.error('could not arm the duel', armError);
      return NextResponse.json({ error: 'Could not start the duel.' }, { status: 500 });
    }
  } else {
    // A race's sequence already exists, so all this can do is tell the truth about it.
    const { count } = await supabase
      .from('rounds')
      .select('id', { count: 'exact', head: true })
      .eq('owner', owner)
      .in('chart_id', (match.chart_ids as string[]) ?? []);
    clean = (count ?? 0) === 0;
  }

  const { error: seatError } = await supabase.from('match_players').insert({
    match_id: id,
    owner,
    user_id: viewer.userId,
    seat: taken.length,
    health: match.mode === 'duel' ? DUEL_SPEC.health : null,
    clean,
  });
  if (seatError) {
    console.error('could not take a seat', seatError);
    return NextResponse.json({ error: 'Could not join.' }, { status: 500 });
  }

  return withCookie(
    NextResponse.json({ matchId: id, mode: match.mode, seat: taken.length, clean, resumed: false }),
    sessionId,
  );
}

function withCookie(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}
