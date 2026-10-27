import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The pairs on offer and how many replay windows each has. No dates or eras: those are for after. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.trim().toUpperCase() || null;
  const { data, error } = await serviceClient().rpc('trade_markets', { p_query: query });
  if (error) return NextResponse.json({ error: 'The markets could not be listed.' }, { status: 500 });
  return NextResponse.json(data ?? []);
}
