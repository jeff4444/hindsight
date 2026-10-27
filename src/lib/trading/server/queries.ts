import 'server-only';
import { serviceClient } from '@/lib/supabase/server';
import { isAccent, type Accent } from '@/lib/avatar';
import { MICROS } from '@/core/trading/instrument';
import { STARTING_BALANCE_USDT } from '@/core/trading/costs';
import { BOT_VERSION } from '@/core/versions';

/**
 * Everything the pages read about accounts, sessions and the field.
 *
 * Every reader here returns `null` (or an empty list) rather than throwing when its function or
 * table is missing — before migrations 0030–0032 are applied, or if the database is briefly away.
 * A board that is not there yet is an empty state, never an error page; the same rule
 * `src/lib/leaderboards.ts` set for the game's boards.
 */

export const MIN_BOARD_SESSIONS = 10;

const usd = (micros: unknown) => Number(micros) / MICROS;

export interface AccountSummary {
  id: string;
  purpose: 'main' | 'practice';
  equity: number;
  starting: number;
  returnPct: number;
  realized: number;
  fees: number;
  sessions: number;
  roundTrips: number;
  wins: number;
  winRate: number | null;
  maxDrawdown: number;
  profitFactor: number | null;
  bankrupt: boolean;
  createdAt: string;
}

function summary(raw: Record<string, unknown>): AccountSummary {
  const starting = usd(raw.starting_micros);
  const equity = usd(raw.cash_micros);
  const roundTrips = Number(raw.round_trips);
  const loss = Number(raw.gross_loss_micros);
  return {
    id: raw.id as string,
    purpose: raw.purpose as 'main' | 'practice',
    equity,
    starting,
    returnPct: starting > 0 ? equity / starting - 1 : 0,
    realized: usd(raw.realized_micros),
    fees: usd(raw.fees_micros),
    sessions: Number(raw.sessions),
    roundTrips,
    wins: Number(raw.wins),
    winRate: roundTrips > 0 ? Number(raw.wins) / roundTrips : null,
    maxDrawdown: Number(raw.max_drawdown),
    profitFactor: loss > 0 ? Number(raw.gross_profit_micros) / loss : null,
    bankrupt: Boolean(raw.bankrupt),
    createdAt: raw.created_at as string,
  };
}

/** A fresh account as it would be: shown before the first session creates the real one. */
export function untouchedAccount(purpose: 'main' | 'practice'): AccountSummary {
  return {
    id: '',
    purpose,
    equity: STARTING_BALANCE_USDT,
    starting: STARTING_BALANCE_USDT,
    returnPct: 0,
    realized: 0,
    fees: 0,
    sessions: 0,
    roundTrips: 0,
    wins: 0,
    winRate: null,
    maxDrawdown: 0,
    profitFactor: null,
    bankrupt: false,
    createdAt: new Date().toISOString(),
  };
}

export async function getAccount(owner: string | null, purpose: 'main' | 'practice'): Promise<AccountSummary | null> {
  if (!owner) return null;
  try {
    const { data, error } = await serviceClient()
      .from('trade_accounts')
      .select('*')
      .eq('owner', owner)
      .eq('purpose', purpose)
      .eq('kind', 'player')
      .eq('status', 'active')
      .maybeSingle();
    if (error || !data) return null;
    return summary(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** The session open on any of this owner's accounts, if there is one. */
export async function getOpenSession(owner: string | null): Promise<{ id: string; symbol: string; purpose: string } | null> {
  if (!owner) return null;
  try {
    const { data, error } = await serviceClient()
      .from('trade_sessions')
      .select('id, symbol, trade_accounts!inner(owner, purpose)')
      .eq('trade_accounts.owner', owner)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const row = data[0] as unknown as { id: string; symbol: string; trade_accounts: { purpose: string } };
    return { id: row.id, symbol: row.symbol, purpose: row.trade_accounts.purpose };
  } catch {
    return null;
  }
}

export interface SessionRow {
  id: string;
  symbol: string;
  source: string;
  scenario: string | null;
  dailyDay: number | null;
  ranked: boolean;
  status: 'open' | 'closed';
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  starting: number;
  ending: number | null;
  returnPct: number | null;
  roundTrips: number | null;
  wins: number | null;
  fees: number | null;
  maxDrawdown: number | null;
}

export async function getSessions(accountId: string, limit = 50): Promise<SessionRow[]> {
  if (!accountId) return [];
  try {
    const { data, error } = await serviceClient().rpc('trade_account_sessions', { p_account: accountId, p_limit: limit });
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map((raw) => ({
      id: raw.session_id as string,
      symbol: raw.symbol as string,
      source: raw.source as string,
      scenario: (raw.scenario as string | null) ?? null,
      dailyDay: (raw.daily_day as number | null) ?? null,
      ranked: Boolean(raw.ranked),
      status: raw.status as 'open' | 'closed',
      closeReason: (raw.close_reason as string | null) ?? null,
      openedAt: raw.opened_at as string,
      closedAt: (raw.closed_at as string | null) ?? null,
      starting: usd(raw.starting_micros),
      ending: raw.ending_micros === null ? null : usd(raw.ending_micros),
      returnPct: (raw.return_pct as number | null) ?? null,
      roundTrips: (raw.round_trips as number | null) ?? null,
      wins: (raw.wins as number | null) ?? null,
      fees: raw.fees_micros === null ? null : usd(raw.fees_micros),
      maxDrawdown: (raw.max_drawdown as number | null) ?? null,
    }));
  } catch {
    return [];
  }
}

/** Equity after each closed session, oldest first, starting from the opening balance. */
export async function getEquityCurve(accountId: string, starting: number): Promise<number[]> {
  if (!accountId) return [starting];
  try {
    const { data, error } = await serviceClient().rpc('trade_account_curve', { p_account: accountId, p_limit: 5000 });
    if (error) return [starting];
    return [starting, ...((data ?? []) as { equity_micros: number }[]).map((row) => usd(row.equity_micros))];
  } catch {
    return [starting];
  }
}

export interface BoardEntry {
  kind: 'player' | 'bot';
  accountId: string;
  handle: string | null;
  displayName: string | null;
  avatarSeed: number | null;
  avatarAccent: Accent;
  botCode: string | null;
  equity: number;
  returnPct: number;
  sessions: number;
  roundTrips: number;
  winRate: number | null;
  maxDrawdown: number;
  profitFactor: number | null;
}

export type BoardOrder = 'return' | 'win_rate' | 'drawdown' | 'sessions' | 'profit_factor';

export async function getLeaderboard(order: BoardOrder = 'return', limit = 50): Promise<BoardEntry[] | null> {
  try {
    const { data, error } = await serviceClient().rpc('trade_leaderboard', {
      p_order: order,
      p_min_sessions: MIN_BOARD_SESSIONS,
      p_bot_version: BOT_VERSION,
      p_limit: limit,
    });
    if (error) return null;
    return ((data ?? []) as Record<string, unknown>[]).map((raw) => ({
      kind: raw.kind as 'player' | 'bot',
      accountId: raw.account_id as string,
      handle: (raw.handle as string | null) ?? null,
      displayName: (raw.display_name as string | null) ?? null,
      avatarSeed: (raw.avatar_seed as number | null) ?? null,
      avatarAccent: isAccent(raw.avatar_accent) ? raw.avatar_accent : 'slate',
      botCode: (raw.bot_code as string | null) ?? null,
      equity: usd(raw.equity_micros),
      returnPct: Number(raw.return_pct),
      sessions: Number(raw.sessions),
      roundTrips: Number(raw.round_trips),
      winRate: raw.win_rate === null ? null : Number(raw.win_rate),
      maxDrawdown: Number(raw.max_drawdown),
      profitFactor: raw.profit_factor === null ? null : Number(raw.profit_factor),
    }));
  } catch {
    return null;
  }
}

export interface DailyEntry {
  kind: 'player' | 'bot';
  handle: string | null;
  displayName: string | null;
  avatarSeed: number | null;
  avatarAccent: Accent;
  botCode: string | null;
  returnPct: number;
  pnl: number;
  roundTrips: number;
}

export async function getDailyBoard(day: number, limit = 50): Promise<DailyEntry[] | null> {
  try {
    const { data, error } = await serviceClient().rpc('trade_daily_board', { p_day: day, p_bot_version: BOT_VERSION, p_limit: limit });
    if (error) return null;
    return ((data ?? []) as Record<string, unknown>[]).map((raw) => ({
      kind: raw.kind as 'player' | 'bot',
      handle: (raw.handle as string | null) ?? null,
      displayName: (raw.display_name as string | null) ?? null,
      avatarSeed: (raw.avatar_seed as number | null) ?? null,
      avatarAccent: isAccent(raw.avatar_accent) ? raw.avatar_accent : 'slate',
      botCode: (raw.bot_code as string | null) ?? null,
      returnPct: Number(raw.return_pct),
      pnl: usd(raw.pnl_micros),
      roundTrips: Number(raw.round_trips ?? 0),
    }));
  } catch {
    return null;
  }
}

export interface DailyStanding {
  returnPct: number;
  rank: number;
  field: number;
}

export async function getDailyStanding(day: number, owner: string | null): Promise<DailyStanding | null> {
  if (!owner) return null;
  try {
    const { data, error } = await serviceClient().rpc('trade_daily_standing', { p_day: day, p_owner: owner });
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const row = data[0] as { return_pct: number; rank: number; field: number };
    return { returnPct: row.return_pct, rank: row.rank, field: row.field };
  } catch {
    return null;
  }
}

/** Has this owner already traded today's market? */
export async function hasPlayedDaily(owner: string | null, day: number): Promise<boolean> {
  if (!owner) return false;
  try {
    const { data, error } = await serviceClient()
      .from('trade_sessions')
      .select('id, trade_accounts!inner(owner)')
      .eq('trade_accounts.owner', owner)
      .eq('daily_day', day)
      .limit(1);
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

export interface MarketListing {
  symbol: string;
  windows: number;
  delisted: boolean;
}

export async function getMarkets(query: string | null = null): Promise<MarketListing[] | null> {
  try {
    const { data, error } = await serviceClient().rpc('trade_markets', { p_query: query });
    if (error) return null;
    return ((data ?? []) as Record<string, unknown>[]).map((raw) => ({
      symbol: raw.symbol as string,
      windows: Number(raw.windows),
      delisted: Boolean(raw.delisted),
    }));
  } catch {
    return null;
  }
}

export interface BotAccount extends AccountSummary {
  code: string;
  curve: number[];
}

/** Every school's account at the current bot version, with its equity curve. */
export async function getBotAccounts(): Promise<BotAccount[] | null> {
  try {
    const { data, error } = await serviceClient()
      .from('trade_accounts')
      .select('*')
      .eq('kind', 'bot')
      .eq('bot_version', BOT_VERSION);
    if (error) return null;
    const rows = (data ?? []) as Record<string, unknown>[];
    return Promise.all(
      rows.map(async (raw) => {
        const base = summary(raw);
        return { ...base, code: raw.bot_code as string, curve: await getEquityCurve(base.id, base.starting) };
      }),
    );
  } catch {
    return null;
  }
}
