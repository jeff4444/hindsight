import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { serviceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, ensureSession } from '@/lib/session';
import { authClient } from '@/lib/supabase/auth-server';
import { DEFAULT_TIER, MODS, affordances, isTierCode, tierByCode } from '@/core/tiers';
import { parseMods, roundPayload } from '@/lib/round-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Issue a round.
 *
 * §12.1: "serve the lead-in window server-side, accept the committed order server-side, and
 * only then stream the reveal." This is the first of those three. The selection and the round
 * insert happen inside `issue_round`, whose return type does not include the reveal bars or
 * the resolution path — so this handler could not leak them if it tried.
 */
export async function POST(request: Request) {
  const sessionId = await ensureSession();
  const userId = await currentUserId();
  // The tape is a published filter over the regime tags (§11.1), applied server-side. Nothing
  // about which charts it contains reaches the client.
  const params = new URL(request.url).searchParams;
  const tape = params.get('tape') ?? 'open';

  const supabase = serviceClient();

  /*
   * §11.2's tier lock, read before the ruleset is resolved because it decides the ruleset.
   *
   * "A tier lock, so an operator can require that their cohort plays at Naked and the results are
   * comparable." Tapes have always carried a `tier` column and nothing read it — the launcher's
   * choice won, so the column was a suggestion. A locked tape's ruleset wins instead.
   *
   * Mods are cleared too, which is ours rather than §11.2's. A mod changes affordances exactly as a
   * tier does, and an operator asking for comparable results does not mean "comparable except for
   * whichever mods each student happened to pick".
   *
   * A failed lookup is not treated as unlocked. Defaulting to open on error would make the lock
   * fail in the direction that silently invalidates the cohort's data, which is the one direction a
   * lock must never fail in.
   */
  const { data: tapeRuleset, error: tapeError } = await supabase
    .from('tapes')
    .select('tier, tier_locked')
    .eq('slug', tape)
    .maybeSingle();
  if (tapeError) {
    console.error('tape ruleset lookup failed', tapeError);
    return NextResponse.json({ error: 'Could not issue a round.' }, { status: 500 });
  }
  const lockedTo = tapeRuleset?.tier_locked ? (tapeRuleset.tier as string) : null;

  // A lock that does not resolve refuses the round. Falling back to the default here would issue a
  // *different* ruleset than the map requires and record it as if it were the required one, which is
  // the same silent invalidation the failed-lookup branch above exists to avoid.
  if (lockedTo !== null && !isTierCode(lockedTo)) {
    console.error('tape locked to an unknown ruleset', { tape, lockedTo });
    return NextResponse.json(
      { error: 'This map requires a ruleset that no longer exists. It cannot be played until its owner changes it.' },
      { status: 409 },
    );
  }

  // §3.2's ruleset. Unrated Sandbox is the default for free play; anything else is a deliberate ask.
  const requested = lockedTo ?? params.get('tier');
  const tier = tierByCode(isTierCode(requested) ? requested : DEFAULT_TIER);
  if (!tier) {
    return NextResponse.json({ error: 'No such ruleset.' }, { status: 404 });
  }
  const mods = lockedTo ? [] : parseMods(params.get('mods'), MODS);
  const granted = affordances(tier, mods);
  // Per-round nonce, §12.6. Server-side issuance means a round is a thing the server handed
  // out, not a thing a client can assert into existence.
  const nonce = randomBytes(16).toString('hex');

  const { data, error } = await supabase.rpc('issue_round', {
    p_session: sessionId,
    p_user: userId,
    p_nonce: nonce,
    p_tape: tape,
    p_tier: tier.code,
    p_candles: granted.candles,
    p_detail: granted.detail,
    p_clock_seconds: granted.clockSeconds,
  });

  if (error) {
    console.error('issue_round failed', error);
    const empty = error.message.includes('corpus is empty');
    // A private map answers exactly as a missing one does. The two differ only in whether they
    // confirm the map exists, and confirming that is the one thing private has to withhold.
    const badTape =
      error.message.includes('no such tape') ||
      error.message.includes('is locked') ||
      error.message.includes('is private');
    return NextResponse.json(
      {
        error: empty
          ? 'The corpus is empty. Run `npm run corpus`.'
          : badTape
            ? 'That tape is not open.'
            : 'Could not issue a round.',
      },
      { status: empty ? 503 : badTape ? 404 : 500 },
    );
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return NextResponse.json({ error: 'The corpus is empty.' }, { status: 503 });
  }

  /*
   * Attach the round to a Storm or Streak run, if one was named.
   *
   * Checked against the *session* rather than taken on trust: a run id is a claim until the server
   * confirms it belongs to the caller and is still alive, and a round attached to someone else's run
   * would score into their total. Verified after issuance rather than inside `issue_round`, because
   * the RPC's contract is §12.1's — what it may return — and widening it for a run is exactly the
   * kind of change `tests/api-leak.test.ts` exists to make expensive.
   */
  const runId = params.get('run');
  if (runId) {
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('id, alive, remaining_ms')
      .eq('id', runId)
      .eq('session_id', sessionId)
      .maybeSingle();

    // Logged rather than discarded. This block failed silently once already — a column dropped in a
    // migration read as "no such run", the round issued without a `run_id`, and Storm scored nothing
    // while every screen looked correct. A run that cannot be found is a normal outcome; a query
    // that cannot run is not, and the two must not be the same event.
    if (runError) console.error('run lookup failed', runError);

    // Storm's budget is decision time, so a run is out of clock only once a commit has spent the
    // last of it — there is no deadline to compare against `now`, and a run sitting at zero is
    // already `alive = false`. Streak has no clock at all, hence the null check rather than a
    // comparison.
    const spent = run?.remaining_ms !== null && run?.remaining_ms !== undefined && run.remaining_ms <= 0;
    if (run && run.alive && !spent) {
      await supabase.from('rounds').update({ run_id: runId }).eq('id', row.round_id);
    }
  }

  const payload = roundPayload(row, tier, mods);

  const response = NextResponse.json(payload);
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}

/** The signed-in user, or null. Rounds are owned by `coalesce(user_id, session_id)`. */
async function currentUserId(): Promise<string | null> {
  try {
    const auth = await authClient();
    const { data } = await auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
