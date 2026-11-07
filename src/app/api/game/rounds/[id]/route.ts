import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import { lockSchema } from '@/lib/game/schemas';
import { getRound, lockRound } from '@/lib/game/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { badRequest, failure } from '../../respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = () => NextResponse.json({ error: 'No such round.' }, { status: 404 });

async function owner(): Promise<string | null> {
  return (await currentUserId()) ?? (await readSession());
}

/** One round: GET to load it, POST to lock it in. A round being read carries no tape at all. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return missing();
  const who = await owner();
  if (!who) return missing();
  try {
    return NextResponse.json(await getRound(serviceClient(), id, who));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return missing();
  const parsed = lockSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues[0].message);
  const who = await owner();
  if (!who) return missing();
  try {
    return NextResponse.json(await lockRound(serviceClient(), id, who, parsed.data.intent));
  } catch (error) {
    return failure(error);
  }
}
