import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bar } from '@/core/bars';
import { packDetail, packPath, toPgHex } from '@/core/pack';
import { mulberry32 } from '@/core/random';
import { mirrorBar } from '@/core/normalize';

/**
 * An in-memory stand-in for the service client, covering exactly the queries and functions the
 * trading handler makes. The SQL itself is exercised by `supabase/tests/trading_smoke.sql` against
 * a real Postgres; this is for the TypeScript around it — what the handler sends, what it answers,
 * and what it must never answer with.
 */

export interface FakeChart {
  id: string;
  row: Record<string, unknown>;
  /** The un-normalised minute closes of the tape, for assertions. */
  tapeCloses: number[];
}

/** A plausible stored chart: indexed to 100, not mirrored, with a full path and detail. */
export function fakeChart(
  id: string,
  symbol = 'BTCUSDT',
  seed = 1,
  decisionAt = '2021-05-18T07:00:00Z',
  startPrice = 40_000,
  mirrored = false,
): FakeChart {
  const rng = mulberry32(seed);
  let price = startPrice;
  const minutes: Bar[] = [];
  for (let i = 0; i < (300 + 60) * 60; i++) {
    const o = price;
    const c = o * Math.exp((rng() - 0.5) * 0.002);
    minutes.push({ o, h: Math.max(o, c) * 1.0003, l: Math.min(o, c) * 0.9997, c, v: 1 + rng() * 5 });
    price = c;
  }
  const hours: Bar[] = [];
  for (let i = 0; i < minutes.length; i += 60) {
    const s = minutes.slice(i, i + 60);
    hours.push({ o: s[0].o, h: Math.max(...s.map((b) => b.h)), l: Math.min(...s.map((b) => b.l)), c: s[59].c, v: s.reduce((a, b) => a + b.v, 0) });
  }
  const factor = 100 / hours[220].o;
  const base = 10;
  const scaled = (b: Bar): Bar => ({ o: b.o * factor, h: b.h * factor, l: b.l * factor, c: b.c * factor, v: b.v / base });
  // Stored the way the pipeline stores a mirrored chart: indexed, then reflected about 100.
  const norm = (b: Bar): Bar => (mirrored ? mirrorBar(scaled(b)) : scaled(b));
  const tape = minutes.slice(300 * 60);
  return {
    id,
    tapeCloses: tape.map((b) => b.c),
    row: {
      id,
      symbol,
      decision_at: decisionAt,
      index_factor: factor,
      mirrored,
      volume_base: base,
      lead_in_bars: hours.slice(220, 300).map(norm),
      lead_in_extra: hours.slice(0, 220).map(norm),
      reveal_bars: hours.slice(300).map(norm),
      resolution_path: toPgHex(packPath(tape.map(norm))),
      detail_path: toPgHex(packDetail(minutes.slice(220 * 60).map(norm))),
      synthetic: false,
    },
  };
}

interface Account {
  id: string;
  owner: string;
  purpose: 'main' | 'practice';
  cash: number;
}

interface Session {
  id: string;
  account_id: string;
  chart_id: string;
  source: string;
  scenario: string | null;
  daily_day: number | null;
  ranked: boolean;
  dates_visible: boolean;
  total_minutes: number;
  starting_micros: number;
  anchor_revealed: number;
  anchor_at: string;
  speed: number;
  paused: boolean;
  lease_until: string;
  clock_version: number;
  high_water: number;
  event_count: number;
  status: 'open' | 'closed';
  close_reason: string | null;
}

export interface FakeState {
  accounts: Account[];
  sessions: Session[];
  events: { session_id: string; seq: number; at_index: number; client_key: string | null; event: Record<string, unknown> }[];
  finalized: { session: string; summary: Record<string, unknown> }[];
  /** Every RPC call, for assertions about what the handler sent. */
  calls: { name: string; args: Record<string, unknown> }[];
}

let ids = 0;
const uuid = () => {
  ids += 1;
  return `00000000-0000-4000-8000-${ids.toString(16).padStart(12, '0')}`;
};

export function fakeSupabase(charts: FakeChart[], now: () => number): { client: SupabaseClient; state: FakeState } {
  const state: FakeState = { accounts: [], sessions: [], events: [], finalized: [], calls: [] };

  const rpc = async (name: string, args: Record<string, unknown>) => {
    state.calls.push({ name, args });
    switch (name) {
      case 'trade_open_session': {
        const owner = (args.p_user as string | null) ?? (args.p_session as string);
        let account = state.accounts.find((a) => a.owner === owner && a.purpose === args.p_purpose);
        if (!account) {
          account = { id: uuid(), owner, purpose: args.p_purpose as 'main' | 'practice', cash: Number(args.p_starting_micros) };
          state.accounts.push(account);
        }
        const open = state.sessions.find((s) => s.account_id === account!.id && s.status === 'open');
        if (open) return { data: [{ session_id: open.id, account_id: account.id, chart_id: open.chart_id, existing: true }], error: null };
        const chart =
          args.p_source === 'pair' ? charts.find((c) => c.row.symbol === args.p_symbol) : charts[0];
        if (!chart) return { data: null, error: { message: 'no market matches' } };
        const dates = args.p_purpose === 'practice' && Boolean(args.p_show_dates);
        const session: Session = {
          id: uuid(),
          account_id: account.id,
          chart_id: chart.id,
          source: args.p_source as string,
          scenario: null,
          daily_day: args.p_source === 'daily' ? (args.p_day as number) : null,
          ranked: args.p_purpose === 'main' && !dates,
          dates_visible: dates,
          total_minutes: 3600,
          starting_micros: account.cash,
          anchor_revealed: 0,
          anchor_at: new Date(now()).toISOString(),
          speed: args.p_speed as number,
          paused: true,
          lease_until: new Date(now() + 15_000).toISOString(),
          clock_version: 0,
          high_water: -1,
          event_count: 0,
          status: 'open',
          close_reason: null,
        };
        state.sessions.push(session);
        return { data: [{ session_id: session.id, account_id: account.id, chart_id: chart.id, existing: false }], error: null };
      }
      case 'trade_set_clock': {
        const s = state.sessions.find((x) => x.id === args.p_session);
        if (!s || s.clock_version !== args.p_expected_version || s.status !== 'open') return { data: false, error: null };
        Object.assign(s, {
          anchor_revealed: args.p_anchor_revealed,
          anchor_at: args.p_anchor_at,
          speed: args.p_speed,
          paused: args.p_paused,
          lease_until: args.p_lease_until,
          clock_version: args.p_version,
        });
        return { data: true, error: null };
      }
      case 'trade_append_event': {
        const s = state.sessions.find((x) => x.id === args.p_session)!;
        const account = state.accounts.find((a) => a.id === s.account_id)!;
        if (account.owner !== args.p_owner) return { data: null, error: { message: 'not your session' } };
        const existing = args.p_client_key ? state.events.find((e) => e.session_id === s.id && e.client_key === args.p_client_key) : undefined;
        if (existing) return { data: [{ seq: existing.seq, at_index: existing.at_index, duplicate: true }], error: null };
        const at = Math.max(args.p_at as number, s.high_water);
        s.event_count += 1;
        s.high_water = at;
        state.events.push({ session_id: s.id, seq: s.event_count, at_index: at, client_key: (args.p_client_key as string | null) ?? null, event: args.p_event as Record<string, unknown> });
        return { data: [{ seq: s.event_count, at_index: at, duplicate: false }], error: null };
      }
      case 'trade_finalize_session': {
        const s = state.sessions.find((x) => x.id === args.p_session)!;
        if (s.status === 'closed') return { data: false, error: null };
        s.status = 'closed';
        s.paused = true;
        s.close_reason = ((args.p_summary as Record<string, unknown>).close_reason as string) ?? 'end';
        const account = state.accounts.find((a) => a.id === s.account_id)!;
        account.cash = Number((args.p_summary as Record<string, unknown>).ending_micros);
        state.finalized.push({ session: s.id, summary: args.p_summary as Record<string, unknown> });
        return { data: true, error: null };
      }
      default:
        return { data: null, error: { message: `function ${name} does not exist` } };
    }
  };

  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      async maybeSingle() {
        const rows = resolve();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = resolve();
        return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } };
      },
      then(resolveFn: (value: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: resolve(), error: null }).then(resolveFn);
      },
    };
    const matches = (row: Record<string, unknown>) => filters.every(([column, value]) => row[column] === value);
    const resolve = (): Record<string, unknown>[] => {
      if (table === 'charts') return charts.map((c) => c.row).filter(matches);
      if (table === 'trade_sessions') {
        return state.sessions
          .map((s) => {
            const account = state.accounts.find((a) => a.id === s.account_id)!;
            return { ...s, trade_accounts: { owner: account.owner, purpose: account.purpose } } as unknown as Record<string, unknown>;
          })
          .filter(matches);
      }
      if (table === 'trade_order_events') {
        return state.events
          .filter((e) => matches(e as unknown as Record<string, unknown>))
          .sort((a, b) => a.seq - b.seq) as unknown as Record<string, unknown>[];
      }
      return [];
    };
    return builder;
  };

  return { client: { rpc, from } as unknown as SupabaseClient, state };
}
