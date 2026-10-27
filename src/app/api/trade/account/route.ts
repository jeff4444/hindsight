import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serviceClient } from '@/lib/supabase/server';
import { ensureSession } from '@/lib/session';
import { resetAccount } from '@/lib/trading/server/handler';
import { currentUserId } from '@/lib/trading/server/identity';
import { failure, withSession } from '../respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ op: z.literal('reset'), purpose: z.enum(['main', 'practice']) });

/**
 * Reset an account to the starting balance. The old account is archived rather than edited, so its
 * record stands as it was; the new one starts from $100,000 with no history.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const sessionCookie = await ensureSession();
  try {
    const accountId = await resetAccount(serviceClient(), { sessionCookie, userId: await currentUserId() }, parsed.data.purpose);
    return withSession(NextResponse.json({ accountId }), sessionCookie);
  } catch (error) {
    return failure(error);
  }
}
