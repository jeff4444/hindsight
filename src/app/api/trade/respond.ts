import 'server-only';
import { NextResponse } from 'next/server';
import { TradeError } from '@/lib/trading/server/handler';
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from '@/lib/session';

/** A handler's failure as a response: its own status for a `TradeError`, a 500 for anything else. */
export function failure(error: unknown): NextResponse {
  if (error instanceof TradeError) {
    return NextResponse.json({ error: error.message, ...error.detail }, { status: error.status });
  }
  console.error('trade request failed', error);
  return NextResponse.json({ error: 'Something went wrong on our side.' }, { status: 500 });
}

/** Attach the anonymous session cookie, so the account opened here is found again. */
export function withSession(response: NextResponse, sessionId: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, sessionId, SESSION_COOKIE_OPTIONS);
  return response;
}
