import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession } from '@/lib/session';
import { openSchema } from '@/lib/trading/schemas';
import { openSession } from '@/lib/trading/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { failure, withSession } from '../respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Open a market: a random one, a pair, today's daily, or a scenario.
 *
 * Returns the instrument, the history before the tape, and the session — paused, with nothing of
 * the tape revealed. A 409 with `openSessionId` means a session is already open on this account;
 * the terminal goes there instead (§22.8: one open session per account).
 */
export async function POST(request: Request) {
  const parsed = openSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const sessionCookie = await ensureSession();
  const userId = await currentUserId();
  try {
    const open = await openSession(serviceClient(), { sessionCookie, userId }, parsed.data, randomUUID());
    return withSession(NextResponse.json(open), sessionCookie);
  } catch (error) {
    return withSession(failure(error), sessionCookie);
  }
}
