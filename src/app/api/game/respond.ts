import 'server-only';
import { NextResponse } from 'next/server';
import { GameServerError } from '@/lib/game/server/handler';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';

/** A handler's failure as a response: its own status for a `GameServerError`, a 500 for anything else. */
export function failure(error: unknown): NextResponse {
  if (error instanceof GameServerError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('game request failed', error);
  return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
}

/** Attach the anonymous session cookie, so what was played here is found again. */
export function withSession(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
