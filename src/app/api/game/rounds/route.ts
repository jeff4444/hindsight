import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession } from '@/lib/session';
import { dealSchema } from '@/lib/game/schemas';
import { startTraining } from '@/lib/game/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { badRequest, failure, withSession } from '../respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Deal a training round: a tape you have not played, that moves enough (§23.4). Returns the
 * history and not one minute of the tape — that comes back only from locking the round in.
 */
export async function POST(request: Request) {
  const parsed = dealSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const sessionId = await ensureSession();
  const userId = await currentUserId();
  try {
    return withSession(NextResponse.json(await startTraining(serviceClient(), { sessionId, userId })), sessionId);
  } catch (error) {
    return withSession(failure(error), sessionId);
  }
}
