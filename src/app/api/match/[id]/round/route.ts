import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, ensureSession } from '@/lib/session';
import { currentViewer } from '@/lib/viewer';
import { DEFAULT_TIER, affordances, isTierCode, tierByCode } from '@/core/tiers';
import { roundPayload } from '@/lib/round-payload';
import { DUEL_SPEC } from '@/core/duel';
import type { MatchPayload } from '@/lib/api-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The next chart in a match's sequence (§10.1).
 *
 * Separate from `/api/round` because the two answer different questions. That one *chooses* a chart
 * and must never be handed one — a caller that could name a chart could name the same chart twice and
 * farm its reveal. This one is handed a chart by position in a sequence the server drew and the
 * client never sees; §12.1's payload carries no chart id and `tests/api-leak.test.ts` keeps it that
 * way.
 *
 * **The position is the server's, not the client's.** It is the count of rounds this player already
 * has in this match, so a client cannot skip a chart it dislikes or replay one it has seen — and
 * `issue_match_round` refuses a duplicate position anyway, because a rule this load-bearing should
 * fail in the database as well as in the handler.
 *
 * Mods are not offered. A match is a comparison between two people's readings of the same charts, and
 * §3.3's mods change what is on screen — so a duel where one player took Blackout is not a duel, it
 * is two different exercises with one scoreboard.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const sessionId = await ensureSession();
  const viewer = await currentViewer();
  const owner = viewer.userId ?? sessionId;
  const supabase = serviceClient();

  const { data: match } = await supabase
    .from('matches')
    .select('id, mode, tier, length, status, chart_ids')
    .eq('id', id)
    .maybeSingle();
  if (!match) return NextResponse.json({ error: 'No such match.' }, { status: 404 });
  if (!match.chart_ids) {
    return NextResponse.json(
      { error: 'This duel has not started — it is waiting for an opponent.' },
      { status: 409 },
    );
  }
  // A finished match issues nothing. Found by playing one: the loser's bar hit zero, the match was
  // marked done, and the next request happily handed them chart seven of seven — a round that could
  // never be scored against anything, on a duel that was already decided.
  if (match.status === 'done') {
    return NextResponse.json({ error: 'This match is over.', complete: true }, { status: 409 });
  }

  const { data: seats } = await supabase
    .from('match_players')
    .select('owner, seat, started_at, health, score, charts, clean')
    .eq('match_id', id);
  const seat = (seats ?? []).find((s) => s.owner === owner) ?? null;
  if (!seat) return NextResponse.json({ error: 'You are not in this match.' }, { status: 403 });
  const opponent = (seats ?? []).find((s) => s.owner !== owner) ?? null;

  // The player's own position in the sequence: how many of it they have already been issued. Counted
  // rather than trusted, and `issue_match_round` refuses a repeat regardless.
  const { count } = await supabase
    .from('rounds')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', id)
    .eq('owner', owner);
  const index = count ?? 0;

  if (index >= (match.chart_ids as string[]).length) {
    return NextResponse.json({ error: 'You have finished the sequence.', complete: true }, { status: 409 });
  }

  const tier = tierByCode(isTierCode(match.tier) ? match.tier : DEFAULT_TIER);
  if (!tier) return NextResponse.json({ error: 'No such ruleset.' }, { status: 404 });
  const granted = affordances(tier, []);

  const { data, error } = await supabase.rpc('issue_match_round', {
    p_session: sessionId,
    p_user: viewer.userId,
    p_nonce: randomBytes(16).toString('hex'),
    p_match: id,
    p_index: index,
    p_tier: tier.code,
    p_candles: granted.candles,
    p_detail: granted.detail,
    p_clock_seconds: granted.clockSeconds,
  });

  if (error) {
    console.error('issue_match_round failed', error);
    const known =
      error.message.includes('already played that position') ||
      error.message.includes('past the end') ||
      error.message.includes('not a player');
    return NextResponse.json(
      { error: known ? 'That chart is not yours to play.' : 'Could not issue the round.' },
      { status: known ? 409 : 500 },
    );
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return NextResponse.json({ error: 'Could not issue the round.' }, { status: 500 });

  // The clock starts on the first chart, not at the join. A race is ninety seconds of *playing*, and
  // a player who opened the link and made a cup of tea has not started racing.
  if (!seat.started_at) {
    await supabase
      .from('match_players')
      .update({ started_at: new Date().toISOString() })
      .eq('match_id', id)
      .eq('owner', owner);
  }

  /*
   * The match state ships with the *first* chart, not only with the first commit.
   *
   * Without it a player opening a duel sees the ordinary tape header and no health bars until they
   * have committed something — so the one screen where the mode's whole tension lives is the one
   * screen that does not show it. Found by playing one.
   */
  const total = (match.chart_ids as string[]).length;
  const state: MatchPayload =
    match.mode === 'race'
      ? {
          mode: 'race',
          index,
          length: total,
          charts: (seat.charts as number) ?? 0,
          score: (seat.score as number) ?? 0,
          complete: false,
          clean: seat.clean !== false,
          elapsedMs: seat.started_at ? Date.now() - Date.parse(seat.started_at as string) : 0,
        }
      : {
          mode: 'duel',
          index,
          length: total,
          charts: (seat.charts as number) ?? 0,
          health: (seat.health as number) ?? DUEL_SPEC.health,
          opponentHealth: (opponent?.health as number | undefined) ?? null,
          // Nothing has been exchanged on *this* chart yet, which is exactly what pending means.
          pending: true,
          complete: false,
          winner: null,
        };

  const payload = roundPayload(row, tier, []);
  const response = NextResponse.json({
    ...payload,
    matchIndex: index,
    matchLength: total,
    match: state,
  });
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}
