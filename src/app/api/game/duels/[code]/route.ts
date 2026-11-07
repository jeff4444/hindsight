import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession, readSession } from '@/lib/session';
import { duelActionSchema } from '@/lib/game/schemas';
import { getDuel, joinDuel, playDuel } from '@/lib/game/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { badRequest, failure, withSession } from '../../respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One duel. GET reads its standing as you are allowed to see it — an opponent's grade on a tape
 * only once you have played that tape. POST joins it, or deals your next tape in it.
 */
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const who = (await currentUserId()) ?? (await readSession()) ?? '00000000-0000-0000-0000-000000000000';
  try {
    return NextResponse.json(await getDuel(serviceClient(), code, who));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const parsed = duelActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const sessionId = await ensureSession();
  const userId = await currentUserId();
  const identity = { sessionId, userId };
  try {
    const body = parsed.data.action === 'join' ? await joinDuel(serviceClient(), identity, code) : await playDuel(serviceClient(), identity, code);
    return withSession(NextResponse.json(body), sessionId);
  } catch (error) {
    return withSession(failure(error), sessionId);
  }
}
