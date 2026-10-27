import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';
import { readSession } from '@/lib/session';
import { reviewSession } from '@/lib/trading/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { failure } from '../../../respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The review of a closed session. Refused while it is open: the review is the whole tape. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const who = (await currentUserId()) ?? (await readSession());
  if (!who) return NextResponse.json({ error: 'No such session.' }, { status: 404 });
  try {
    return NextResponse.json(await reviewSession(serviceClient(), id, who));
  } catch (error) {
    return failure(error);
  }
}
