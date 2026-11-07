import 'server-only';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Market } from '@/core/trading/market';
import { DUEL_HEALTH, DUEL_TAPES, MIN_MOVE, biggestMove, standDuel, type DuelStanding, type DuelTape, type Seat } from '@/core/game';
import { GAME_VERSION } from '@/core/versions';
import { loadMarket } from '@/lib/trading/server/charts';
import { intentOrder, playedView, readingView, settleRound, tradeLine, type RoundMeta, type SettledRound } from '../round-core';
import { schoolByCode, schoolIntent, schoolReadView, type StoredSchoolRead } from '../schools';
import type {
  DuelTapeView,
  DuelView,
  OpponentLabel,
  OpponentRound,
  RoundDuelContext,
  RoundIntent,
  RoundPlayed,
  RoundReading,
  RoundView,
} from '../types';

/**
 * The game's server: dealing, locking in, and duels — the storage around `round-core.ts`.
 *
 * Every rule a round is played by lives in `round-core.ts` and `src/core/game/`, which is why the
 * demo can play the same rounds without any of this. What this file adds is what only a server can
 * keep: which tapes a player has already seen, a tape held back until its round is locked in, and
 * an opponent's trade held back until yours is.
 */

export class GameServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface Identity {
  /** The anonymous play-session cookie. Always present. */
  sessionId: string;
  userId: string | null;
}

const ownerOf = (identity: Identity) => identity.userId ?? identity.sessionId;

/* ------------------------------------------------------------------ dealing */

/**
 * Whether a chart may be dealt (§23.4), measuring it the first time it is asked about. Measuring
 * means decoding the tape, which the market cache then keeps for the round about to be dealt on it.
 */
async function dealable(supabase: SupabaseClient, chartId: string, bigMove: number | null): Promise<boolean> {
  if (bigMove !== null) return bigMove >= MIN_MOVE;
  const { market } = await loadMarket(supabase, chartId);
  const move = biggestMove(market);
  await supabase.from('charts').update({ big_move: move }).eq('id', chartId);
  return move >= MIN_MOVE;
}

/** `count` tapes none of `owners` has played, that move enough — against a school, ones it traded. */
async function dealCharts(
  supabase: SupabaseClient,
  owners: string[],
  count: number,
  school: { code: string; version: string } | null = null,
): Promise<string[]> {
  const picked: string[] = [];
  for (let attempt = 0; attempt < 5 && picked.length < count; attempt++) {
    const { data, error } = await supabase.rpc('game_candidate_charts', {
      p_owners: owners,
      p_min_move: MIN_MOVE,
      p_limit: count * 3,
      p_school_code: school?.code ?? null,
      p_school_version: school?.version ?? null,
    });
    if (error) throw new Error(`game_candidate_charts: ${error.message}`);
    const rows = (data ?? []) as { chart_id: string; big_move: number | null }[];
    if (rows.length === 0) break;
    for (const row of rows) {
      if (picked.includes(row.chart_id)) continue;
      if (await dealable(supabase, row.chart_id, row.big_move)) picked.push(row.chart_id);
      if (picked.length === count) break;
    }
  }
  if (picked.length < count) {
    throw new GameServerError(
      school ? 'This school has no tapes left that you have not played.' : 'There are no tapes left that you have not played.',
      409,
    );
  }
  return picked;
}

/* ------------------------------------------------------------------ rounds */

interface RoundRow {
  id: string;
  owner: string;
  chart_id: string;
  mode: 'training' | 'duel';
  duel_id: string | null;
  seat: Seat | null;
  tape_index: number | null;
  status: 'reading' | 'locked';
  intent: RoundIntent | null;
  grade: number | null;
}

const ROUND_COLUMNS = 'id, owner, chart_id, mode, duel_id, seat, tape_index, status, intent, grade';

async function requireRound(supabase: SupabaseClient, roundId: string, owner: string): Promise<RoundRow> {
  const { data } = await supabase.from('game_rounds').select(ROUND_COLUMNS).eq('id', roundId).maybeSingle();
  const row = data as RoundRow | null;
  // A stranger's round does not exist, as far as they are told.
  if (!row || row.owner !== owner) throw new GameServerError('No such round.', 404);
  return row;
}

async function insertRound(
  supabase: SupabaseClient,
  identity: Identity,
  fields: { chart_id: string; mode: 'training' | 'duel'; duel_id?: string; seat?: Seat; tape_index?: number },
): Promise<string> {
  const { data, error } = await supabase
    .from('game_rounds')
    .insert({ session_id: identity.sessionId, user_id: identity.userId, game_version: GAME_VERSION, ...fields })
    .select('id')
    .single();
  if (error || !data) throw new Error(`game_rounds insert: ${error?.message ?? 'nothing returned'}`);
  return (data as { id: string }).id;
}

export async function startTraining(supabase: SupabaseClient, identity: Identity): Promise<RoundReading> {
  const [chartId] = await dealCharts(supabase, [ownerOf(identity)], 1);
  const roundId = await insertRound(supabase, identity, { chart_id: chartId, mode: 'training' });
  const { market } = await loadMarket(supabase, chartId);
  return readingView({ roundId, mode: 'training', duel: null, synthetic: false }, market);
}

export async function getRound(supabase: SupabaseClient, roundId: string, owner: string): Promise<RoundView> {
  const row = await requireRound(supabase, roundId, owner);
  return roundView(supabase, row);
}

async function roundView(supabase: SupabaseClient, row: RoundRow, settled?: SettledRound): Promise<RoundView> {
  const { market } = await loadMarket(supabase, row.chart_id);
  const duel = row.duel_id ? await loadDuelById(supabase, row.duel_id) : null;
  const meta: RoundMeta = {
    roundId: row.id,
    mode: row.mode,
    duel: duel && row.seat !== null && row.tape_index !== null ? await duelContext(supabase, duel, row.seat, row.tape_index) : null,
    synthetic: false,
  };
  if (row.status === 'reading' || row.intent === null) return readingView(meta, market);
  const mine = settled ?? settleRound(market, row.intent);
  const opponent = duel && row.seat !== null && row.tape_index !== null ? await opponentRound(supabase, duel, row.seat, row.tape_index, market, mine) : null;
  return playedView(meta, market, mine, opponent);
}

export async function lockRound(supabase: SupabaseClient, roundId: string, owner: string, intent: RoundIntent): Promise<RoundPlayed> {
  const row = await requireRound(supabase, roundId, owner);
  if (row.status === 'locked') throw new GameServerError('This round is already locked in.', 409);
  const { market } = await loadMarket(supabase, row.chart_id);
  const parsed = intentOrder(market, intent);
  if ('error' in parsed) throw new GameServerError(parsed.error, 400);
  const settled = settleRound(market, intent);

  // Locked once: the status guard makes a second lock-in, from a second tab, a no-op.
  const { data, error } = await supabase
    .from('game_rounds')
    .update({
      status: 'locked',
      intent,
      grade: settled.grade,
      result_micros: settled.outcome.end,
      best_micros: settled.extremes.best.outcome.end,
      worst_micros: settled.extremes.worst.outcome.end,
      locked_at: new Date().toISOString(),
    })
    .eq('id', roundId)
    .eq('status', 'reading')
    .select('id');
  if (error) throw new Error(`game_rounds lock: ${error.message}`);
  if (!data || data.length === 0) throw new GameServerError('This round is already locked in.', 409);

  const locked: RoundRow = { ...row, status: 'locked', intent, grade: settled.grade };
  if (row.duel_id) {
    const duel = await loadDuelById(supabase, row.duel_id);
    if (duel) await settleDuel(supabase, duel);
  }
  return (await roundView(supabase, locked, settled)) as RoundPlayed;
}

/* ------------------------------------------------------------------ duels */

interface DuelRow {
  id: string;
  code: string;
  kind: 'player' | 'school';
  school_code: string | null;
  school_version: string | null;
  chart_ids: string[] | null;
  status: 'waiting' | 'active' | 'over';
  created_at: string;
}

interface SeatRow {
  seat: Seat;
  session_id: string;
  user_id: string | null;
  owner: string;
}

interface LoadedDuel {
  duel: DuelRow;
  seats: SeatRow[];
}

const DUEL_COLUMNS = 'id, code, kind, school_code, school_version, chart_ids, status, created_at';
const CODE = /^[a-z0-9]{8}$/;

function newCode(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function seatsOf(supabase: SupabaseClient, duelId: string): Promise<SeatRow[]> {
  const { data } = await supabase.from('game_duel_seats').select('seat, session_id, user_id, owner').eq('duel_id', duelId);
  return ((data ?? []) as SeatRow[]).sort((a, b) => a.seat - b.seat);
}

async function loadDuelById(supabase: SupabaseClient, duelId: string): Promise<LoadedDuel | null> {
  const { data } = await supabase.from('game_duels').select(DUEL_COLUMNS).eq('id', duelId).maybeSingle();
  if (!data) return null;
  return { duel: data as DuelRow, seats: await seatsOf(supabase, duelId) };
}

async function loadDuel(supabase: SupabaseClient, code: string): Promise<LoadedDuel> {
  if (!CODE.test(code)) throw new GameServerError('No such duel.', 404);
  const { data } = await supabase.from('game_duels').select(DUEL_COLUMNS).eq('code', code).maybeSingle();
  if (!data) throw new GameServerError('No such duel.', 404);
  const duel = data as DuelRow;
  return { duel, seats: await seatsOf(supabase, duel.id) };
}

/** What the screen calls the other seat. */
async function seatLabel(supabase: SupabaseClient, loaded: LoadedDuel, seat: Seat): Promise<OpponentLabel | null> {
  if (loaded.duel.kind === 'school' && seat === 1) {
    const school = schoolByCode(loaded.duel.school_code ?? '');
    return { kind: 'school', name: school?.name ?? 'A school', code: loaded.duel.school_code ?? undefined };
  }
  const row = loaded.seats.find((s) => s.seat === seat);
  if (!row) return null;
  if (!row.user_id) return { kind: 'player', name: 'A guest' };
  const { data } = await supabase.from('profiles').select('handle, handle_display').eq('user_id', row.user_id).maybeSingle();
  const profile = data as { handle: string; handle_display: string | null } | null;
  return { kind: 'player', name: profile ? (profile.handle_display ?? profile.handle) : 'A player' };
}

async function duelContext(supabase: SupabaseClient, loaded: LoadedDuel, seat: Seat, index: number): Promise<RoundDuelContext> {
  const other = (1 - seat) as Seat;
  return {
    code: loaded.duel.code,
    index,
    tapes: DUEL_TAPES,
    opponent: (await seatLabel(supabase, loaded, other)) ?? { kind: 'player', name: 'Your opponent' },
  };
}

interface SchoolReadRow {
  chart_id: string;
  intent: RoundIntent;
  read: StoredSchoolRead;
  grade: number | null;
}

async function schoolReads(supabase: SupabaseClient, duel: DuelRow): Promise<Map<string, SchoolReadRow>> {
  if (duel.kind !== 'school' || !duel.chart_ids) return new Map();
  const { data } = await supabase
    .from('school_reads')
    .select('chart_id, intent, read, grade')
    .eq('school_code', duel.school_code)
    .eq('school_version', duel.school_version)
    .in('chart_id', duel.chart_ids);
  return new Map(((data ?? []) as SchoolReadRow[]).map((row) => [row.chart_id, row]));
}

/** Each tape's two grades, null where a seat has not played it. A school has played them all. */
async function duelGrades(supabase: SupabaseClient, duel: DuelRow): Promise<{ tapes: DuelTape[]; rounds: Map<string, string> }> {
  const tapes: DuelTape[] = Array.from({ length: DUEL_TAPES }, () => [null, null] as DuelTape);
  const rounds = new Map<string, string>();
  const { data } = await supabase.from('game_rounds').select('id, seat, tape_index, status, grade').eq('duel_id', duel.id);
  for (const row of (data ?? []) as { id: string; seat: Seat; tape_index: number; status: string; grade: number | null }[]) {
    rounds.set(`${row.seat}:${row.tape_index}`, row.id);
    if (row.status === 'locked' && row.grade !== null && row.tape_index < DUEL_TAPES) tapes[row.tape_index][row.seat] = row.grade;
  }
  if (duel.kind === 'school' && duel.chart_ids) {
    const reads = await schoolReads(supabase, duel);
    for (let i = 0; i < Math.min(DUEL_TAPES, duel.chart_ids.length); i++) {
      const read = reads.get(duel.chart_ids[i]);
      if (!read) continue;
      let grade = read.grade;
      if (grade === null) {
        const { market } = await loadMarket(supabase, duel.chart_ids[i]);
        grade = settleRound(market, schoolIntent(read.intent, market)).grade;
      }
      tapes[i][1] = grade;
    }
  }
  return { tapes, rounds };
}

/** Write the end of a duel once its standing says it is over. Idempotent. */
async function settleDuel(supabase: SupabaseClient, loaded: LoadedDuel, known?: DuelTape[]): Promise<DuelStanding> {
  const tapes = known ?? (await duelGrades(supabase, loaded.duel)).tapes;
  const standing = standDuel(tapes);
  if (standing.over && loaded.duel.status !== 'over') {
    await supabase
      .from('game_duels')
      .update({
        status: 'over',
        winner: standing.winner === 'draw' ? null : standing.winner,
        knockout: standing.knockout,
        ended_at: new Date().toISOString(),
      })
      .eq('id', loaded.duel.id)
      .neq('status', 'over');
  }
  return standing;
}

/** The other seat's round on this tape, for a review — only ever once yours is locked in. */
async function opponentRound(
  supabase: SupabaseClient,
  loaded: LoadedDuel,
  seat: Seat,
  index: number,
  market: Market,
  mine: SettledRound,
): Promise<OpponentRound> {
  const other = (1 - seat) as Seat;
  const label = (await seatLabel(supabase, loaded, other)) ?? { kind: 'player' as const, name: 'Your opponent' };
  const pending: OpponentRound = { label, played: false, trade: null, grade: null, result: null, read: null };

  if (loaded.duel.kind === 'school' && other === 1) {
    const reads = await schoolReads(supabase, loaded.duel);
    const read = reads.get(market.chartId);
    if (!read) return pending;
    const theirs = settleRound(market, schoolIntent(read.intent, market), mine.extremes);
    return {
      label,
      played: true,
      trade: theirs.order ? tradeLine(market, theirs.order, theirs.outcome) : null,
      grade: theirs.grade,
      result: theirs.outcome.end / 1_000_000,
      read: schoolReadView(read.read, market),
    };
  }

  const { data } = await supabase
    .from('game_rounds')
    .select('status, intent')
    .eq('duel_id', loaded.duel.id)
    .eq('seat', other)
    .eq('tape_index', index)
    .maybeSingle();
  const row = data as { status: string; intent: RoundIntent | null } | null;
  if (!row || row.status !== 'locked' || !row.intent) return pending;
  const theirs = settleRound(market, row.intent, mine.extremes);
  return {
    label,
    played: true,
    trade: theirs.order ? tradeLine(market, theirs.order, theirs.outcome) : null,
    grade: theirs.grade,
    result: theirs.outcome.end / 1_000_000,
    read: null,
  };
}

async function viewDuel(supabase: SupabaseClient, loaded: LoadedDuel, owner: string): Promise<DuelView> {
  const { duel, seats } = loaded;
  const mySeat = seats.find((s) => s.owner === owner)?.seat ?? null;
  const seated = mySeat !== null;
  const me = (mySeat ?? 0) as Seat;
  const them = (1 - me) as Seat;
  const { tapes, rounds } = await duelGrades(supabase, duel);
  const standing = await settleDuel(supabase, loaded, tapes);

  const symbols = new Map<string, string>();
  if (duel.chart_ids && seated) {
    const played = duel.chart_ids.filter((_, i) => tapes[i]?.[me] !== null && tapes[i]?.[me] !== undefined);
    if (played.length > 0) {
      const { data } = await supabase.from('charts').select('id, symbol').in('id', played);
      for (const row of (data ?? []) as { id: string; symbol: string }[]) symbols.set(row.id, row.symbol);
    }
  }

  const views: DuelTapeView[] = Array.from({ length: DUEL_TAPES }, (_, index) => {
    const resolved = standing.resolved.find((r) => r.index === index) ?? null;
    const mine = seated ? tapes[index][me] : null;
    // Theirs only once yours is in: nobody sees an opponent's round before playing it (§23.6).
    const theirs = seated && mine !== null ? tapes[index][them] : null;
    const symbol = duel.chart_ids && seated && mine !== null ? symbols.get(duel.chart_ids[index]) : undefined;
    return {
      index,
      mine,
      theirs,
      damage: resolved ? resolved.damage : null,
      to: resolved && resolved.to !== null ? (resolved.to === me ? 'me' : 'them') : null,
      roundId: seated ? (rounds.get(`${me}:${index}`) ?? null) : null,
      display: symbol ? symbol.replace(/USDT$/, '/USDT') : null,
    };
  });

  const next = !seated || duel.status === 'waiting' || standing.over ? null : (views.find((t) => t.mine === null)?.index ?? null);
  const current = standing.current;
  const waitingOnThem = seated && !standing.over && current !== null && tapes[current][me] !== null && tapes[current][them] === null;
  const winner = standing.winner === null ? null : standing.winner === 'draw' ? 'draw' : standing.winner === me ? 'me' : 'them';

  return {
    code: duel.code,
    kind: duel.kind,
    status: standing.over ? 'over' : duel.status,
    health: { me: standing.health[me], them: standing.health[them] },
    maxHealth: DUEL_HEALTH,
    me: { name: (await seatLabel(supabase, loaded, me))?.name ?? 'You' },
    opponent: await seatLabel(supabase, loaded, them),
    tapes: views,
    tapeLimit: DUEL_TAPES,
    next,
    waitingOnThem,
    winner,
    knockout: standing.knockout,
    seated,
    createdAt: duel.created_at,
  };
}

export async function getDuel(supabase: SupabaseClient, code: string, owner: string): Promise<DuelView> {
  return viewDuel(supabase, await loadDuel(supabase, code), owner);
}

export async function createDuel(
  supabase: SupabaseClient,
  identity: Identity,
  request: { kind: 'player' } | { kind: 'school'; school: string },
): Promise<DuelView> {
  const owner = ownerOf(identity);
  const school = request.kind === 'school' ? schoolByCode(request.school) : null;
  if (request.kind === 'school' && !school) throw new GameServerError('There is no such school.', 404);
  const chartIds = school ? await dealCharts(supabase, [owner], DUEL_TAPES, { code: school.code, version: school.version }) : null;

  const code = newCode();
  const { data, error } = await supabase
    .from('game_duels')
    .insert({
      code,
      kind: request.kind,
      school_code: school?.code ?? null,
      school_version: school?.version ?? null,
      chart_ids: chartIds,
      status: school ? 'active' : 'waiting',
      started_at: school ? new Date().toISOString() : null,
      game_version: GAME_VERSION,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`game_duels insert: ${error?.message ?? 'nothing returned'}`);
  const duelId = (data as { id: string }).id;
  const seat = await supabase.from('game_duel_seats').insert({ duel_id: duelId, seat: 0, session_id: identity.sessionId, user_id: identity.userId });
  if (seat.error) throw new Error(`game_duel_seats insert: ${seat.error.message}`);
  return getDuel(supabase, code, owner);
}

export async function joinDuel(supabase: SupabaseClient, identity: Identity, code: string): Promise<DuelView> {
  const owner = ownerOf(identity);
  const loaded = await loadDuel(supabase, code);
  if (loaded.seats.some((s) => s.owner === owner)) return viewDuel(supabase, loaded, owner);
  if (loaded.duel.kind === 'school') throw new GameServerError('This duel is against a school, and its seat is taken.', 409);
  if (loaded.seats.length >= 2 || loaded.duel.status !== 'waiting') throw new GameServerError('Someone has already taken this duel.', 409);

  const challenger = loaded.seats.find((s) => s.seat === 0);
  if (!challenger) throw new GameServerError('This duel has nobody in it.', 409);
  const chartIds = await dealCharts(supabase, [challenger.owner, owner], DUEL_TAPES);

  // The seat's primary key is what decides a race for it.
  const seat = await supabase.from('game_duel_seats').insert({ duel_id: loaded.duel.id, seat: 1, session_id: identity.sessionId, user_id: identity.userId });
  if (seat.error) throw new GameServerError('Someone has already taken this duel.', 409);
  await supabase
    .from('game_duels')
    .update({ chart_ids: chartIds, status: 'active', started_at: new Date().toISOString() })
    .eq('id', loaded.duel.id)
    .eq('status', 'waiting');
  return getDuel(supabase, code, owner);
}

/** The round for the next tape you have to play, dealt now if it has not been. */
export async function playDuel(supabase: SupabaseClient, identity: Identity, code: string): Promise<{ roundId: string }> {
  const owner = ownerOf(identity);
  const loaded = await loadDuel(supabase, code);
  const mine = loaded.seats.find((s) => s.owner === owner);
  if (!mine) throw new GameServerError('You are not in this duel.', 403);
  if (loaded.duel.status === 'waiting' || !loaded.duel.chart_ids) throw new GameServerError('Nobody has taken the other seat yet.', 409);
  const standing = await settleDuel(supabase, loaded);
  if (standing.over) throw new GameServerError('This duel is over.', 409);

  const { data } = await supabase.from('game_rounds').select('id, tape_index, status').eq('duel_id', loaded.duel.id).eq('seat', mine.seat);
  const rows = (data ?? []) as { id: string; tape_index: number; status: string }[];
  for (let index = 0; index < DUEL_TAPES; index++) {
    const row = rows.find((r) => r.tape_index === index);
    if (row?.status === 'locked') continue;
    if (row) return { roundId: row.id };
    const roundId = await insertRound(supabase, identity, {
      chart_id: loaded.duel.chart_ids[index],
      mode: 'duel',
      duel_id: loaded.duel.id,
      seat: mine.seat,
      tape_index: index,
    }).catch(async (error: unknown) => {
      // A second tab dealt it first: use theirs.
      const again = await supabase.from('game_rounds').select('id').eq('duel_id', loaded.duel.id).eq('seat', mine.seat).eq('tape_index', index).maybeSingle();
      if (again.data) return (again.data as { id: string }).id;
      throw error;
    });
    return { roundId };
  }
  throw new GameServerError('You have played every tape in this duel.', 409);
}
