import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import { requestSchema } from '@/lib/trading/schemas';
import { actOnSession, resumeSession } from '@/lib/trading/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { failure } from '../../respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One session: GET to load it whole, POST to act on it.
 *
 * Like Manage before it (§17.5), the request has no field for a minute index. How far the replay
 * has got is the server's clock, an order is stamped at the close of the last minute that clock has
 * reached, and the answer carries only the minutes the client says it does not have — never one
 * beyond the clock.
 */
async function owner(): Promise<string | null> {
  return (await currentUserId()) ?? (await readSession());
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'No such session.' }, { status: 404 });
  const who = await owner();
  if (!who) return NextResponse.json({ error: 'No such session.' }, { status: 404 });
  try {
    return NextResponse.json(await resumeSession(serviceClient(), id, who));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'No such session.' }, { status: 404 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const who = await owner();
  if (!who) return NextResponse.json({ error: 'No such session.' }, { status: 404 });
  try {
    return NextResponse.json(await actOnSession(serviceClient(), id, who, parsed.data));
  } catch (error) {
    return failure(error);
  }
}
