import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession } from '@/lib/session';
import { duelCreateSchema } from '@/lib/game/schemas';
import { createDuel } from '@/lib/game/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { badRequest, failure, withSession } from '../respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Start a duel (§23.6). Against a player it waits for someone to open the link; against a school
 * its ten tapes are dealt at once, from tapes the school traded that you have not played (§23.7).
 */
export async function POST(request: Request) {
  const parsed = duelCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const sessionId = await ensureSession();
  const userId = await currentUserId();
  try {
    return withSession(NextResponse.json(await createDuel(serviceClient(), { sessionId, userId }, parsed.data)), sessionId);
  } catch (error) {
    return withSession(failure(error), sessionId);
  }
}
