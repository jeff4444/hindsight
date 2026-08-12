import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MANAGE_MS_PER_BAR, REVEAL_BARS } from '@/core/config';

/**
 * §6 for the one mode that could break it.
 *
 * Naked satisfies "future data never reaches the client before the order is committed" by
 * construction: the reveal bars ship **at commit**, after the only decision there is. **Manage does
 * not.** The player keeps deciding while the candles arrive, so shipping the window when the
 * position opens would hand over the whole future with every remaining decision still ahead of them
 * — and no client-side discipline fixes that, because whatever the interface draws, the bytes are in
 * the tab.
 *
 * The route therefore meters the reveal against its own clock. These tests are the audit of that:
 * they drive the handler with a chart whose reveal is trivially identifiable and assert that
 * unrevealed bars are **absent from the response**, not merely unused by it.
 */

const WINDOW = Array.from({ length: REVEAL_BARS }, (_, i) => ({
  o: 100 + i,
  h: 101 + i,
  l: 99 + i,
  c: 100.5 + i,
  v: 1,
}));

/** A minute path long enough to resolve against, flat so the stop is never hit by accident. */
const PATH_HEX = '\\x';

let round: Record<string, unknown>;

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'session-1' }), set: () => undefined }),
}));
vi.mock('@/lib/session', () => ({ readSession: async () => 'session-1' }));

vi.mock('@/lib/supabase/server', () => ({
  serviceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === 'rounds' ? round : null, error: null }),
          single: async () => ({
            data: {
              entry_price: 100,
              atr14: 2,
              resolution_path: PATH_HEX,
              reveal_bars: WINDOW,
              manage_r: null,
              manage_par_r: -0.4,
              manage_oracle_r: 4.5,
            },
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

async function post(body: unknown) {
  const { POST } = await import('@/app/api/round/[id]/manage/route');
  const response = await POST(
    new Request('http://localhost/api/round/r1/manage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'r1' }) },
  );
  return { status: response.status, text: await response.text() };
}

describe('a Manage tick never carries a candle that has not printed', () => {
  beforeEach(() => {
    round = {
      id: 'r1',
      chart_id: 'c1',
      session_id: 'session-1',
      committed_at: null,
      manage_stop: 98,
      manage_opened_at: null,
      manage_events: [],
    };
  });

  it('returns no bars at all at the instant of opening', () => {
    // The most basic form of the rule, and the one a naive implementation breaks first: "open"
    // is a natural place to hand over the window, and it is the worst possible moment to do it.
    return post({ op: 'open', stop: 98 }).then(({ status, text }) => {
      expect(status).toBe(200);
      const parsed = JSON.parse(text);
      expect(parsed.bars).toEqual([]);
      expect(parsed.revealed).toBe(0);
      // Not merely absent from `bars` — absent from the payload.
      expect(text).not.toContain('"c":101.5');
      expect(text).not.toContain(`"c":${100.5 + REVEAL_BARS - 1}`);
    });
  });

  it('returns only the bars that have elapsed, and no more', async () => {
    // Three bars of wall clock have passed, so three bars exist as far as the client is concerned.
    round.manage_opened_at = new Date(Date.now() - 3 * MANAGE_MS_PER_BAR - 10).toISOString();

    const { status, text } = await post({ op: 'tick' });
    expect(status).toBe(200);
    const parsed = JSON.parse(text);
    expect(parsed.revealed).toBe(3);
    expect(parsed.bars).toHaveLength(3);
    expect(parsed.done).toBe(false);

    // The fourth bar and the last bar must be nowhere in the bytes.
    expect(text).not.toContain('"o":103');
    expect(text).not.toContain(`"o":${100 + REVEAL_BARS - 1}`);
  });

  it('will not accept an action before the first candle prints', async () => {
    round.manage_opened_at = new Date().toISOString();
    const { status } = await post({ op: 'exit' });
    expect(status).toBe(409);
  });

  it('stamps an action with the server’s index, not one the client supplies', async () => {
    // The client cannot send an index at all — the schema has no field for it. That is the point:
    // there is nothing to forge, because the only clock in the system is the server's.
    round.manage_opened_at = new Date(Date.now() - 5 * MANAGE_MS_PER_BAR - 10).toISOString();
    const { status, text } = await post({ op: 'partial', atPathIndex: 9_999 });
    expect(status).toBe(200);
    const parsed = JSON.parse(text);
    expect(parsed.events).toHaveLength(1);
    // Five display bars elapsed, sixty minute bars each: the last minute the player could have seen.
    expect(parsed.events[0].atPathIndex).toBe(5 * 60 - 1);
  });

  it('refuses to act on a position that is already closed', async () => {
    round.manage_opened_at = new Date(Date.now() - 5 * MANAGE_MS_PER_BAR).toISOString();
    round.manage_events = [{ atPathIndex: 60, action: { kind: 'exit' } }];
    const { status } = await post({ op: 'stop', price: 99 });
    expect(status).toBe(409);
  });

  it('refuses a second open on the same round', async () => {
    round.manage_opened_at = new Date().toISOString();
    const { status } = await post({ op: 'open', stop: 98 });
    expect(status).toBe(409);
  });

  it('refuses any action on a round with no open position', async () => {
    const { status } = await post({ op: 'tick' });
    expect(status).toBe(409);
  });

  it('belongs to one session, like every other round', async () => {
    round.session_id = 'someone-else';
    const { status } = await post({ op: 'tick' });
    expect(status).toBe(404);
  });
});
