import 'server-only';
import { serviceClient } from '@/lib/supabase/server';
import { MICROS } from '@/core/trading/instrument';
import { GAME_SCHOOLS } from '../schools';
import type { DuelView, SchoolView } from '../types';
import { getDuel } from './handler';

/**
 * Read-only views over stored rounds, duels and reads, for the pages that list them. Nothing here
 * settles a round: lists read the stored copy of each grade (0034's header says why that is safe).
 */

export interface RoundListing {
  id: string;
  mode: 'training' | 'duel';
  status: 'reading' | 'locked';
  grade: number | null;
  /** USDT. */
  result: number | null;
  /** The pair, once the round is locked in; null while it is still being read. */
  display: string | null;
  duelCode: string | null;
  createdAt: string;
}

export interface PlayerRecord {
  rounds: number;
  meanGrade: number | null;
  recent: RoundListing[];
}

const display = (symbol: string) => symbol.replace(/USDT$/, '/USDT');

export async function getRecord(owner: string, limit = 12): Promise<PlayerRecord> {
  const supabase = serviceClient();
  const [{ data: recent }, { data: graded }] = await Promise.all([
    supabase
      .from('game_rounds')
      .select('id, mode, status, grade, result_micros, created_at, duel_id, charts(symbol), game_duels(code)')
      .eq('owner', owner)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('game_rounds').select('grade').eq('owner', owner).eq('status', 'locked'),
  ]);
  const grades = ((graded ?? []) as { grade: number }[]).map((row) => row.grade);
  type Row = {
    id: string;
    mode: 'training' | 'duel';
    status: 'reading' | 'locked';
    grade: number | null;
    result_micros: number | null;
    created_at: string;
    charts: { symbol: string } | { symbol: string }[] | null;
    game_duels: { code: string } | { code: string }[] | null;
  };
  const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? (value[0] ?? null) : value);
  return {
    rounds: grades.length,
    meanGrade: grades.length > 0 ? Math.round(grades.reduce((sum, g) => sum + g, 0) / grades.length) : null,
    recent: ((recent ?? []) as Row[]).map((row) => {
      const symbol = one(row.charts)?.symbol ?? null;
      return {
        id: row.id,
        mode: row.mode,
        status: row.status,
        grade: row.grade,
        result: row.result_micros !== null ? row.result_micros / MICROS : null,
        // A round being read does not name its pair here: the list is no place to learn it.
        display: row.status === 'locked' && symbol ? display(symbol) : null,
        duelCode: one(row.game_duels)?.code ?? null,
        createdAt: row.created_at,
      };
    }),
  };
}

/** For the rail's chip: a round left half-read, if there is one, and the record so far. */
export async function getChipState(owner: string): Promise<{ openRoundId: string | null; rounds: number; meanGrade: number | null }> {
  const supabase = serviceClient();
  const [{ data: open }, { data: graded }] = await Promise.all([
    supabase.from('game_rounds').select('id').eq('owner', owner).eq('status', 'reading').order('created_at', { ascending: false }).limit(1),
    supabase.from('game_rounds').select('grade').eq('owner', owner).eq('status', 'locked'),
  ]);
  const grades = ((graded ?? []) as { grade: number }[]).map((row) => row.grade);
  return {
    openRoundId: ((open ?? []) as { id: string }[])[0]?.id ?? null,
    rounds: grades.length,
    meanGrade: grades.length > 0 ? Math.round(grades.reduce((sum, g) => sum + g, 0) / grades.length) : null,
  };
}

export async function getDuels(owner: string, limit = 8): Promise<DuelView[]> {
  const supabase = serviceClient();
  const { data } = await supabase
    .from('game_duel_seats')
    .select('joined_at, game_duels(code, created_at)')
    .eq('owner', owner)
    .order('joined_at', { ascending: false })
    .limit(limit);
  type Row = { game_duels: { code: string } | { code: string }[] | null };
  const codes = ((data ?? []) as Row[])
    .map((row) => (Array.isArray(row.game_duels) ? row.game_duels[0]?.code : row.game_duels?.code))
    .filter((code): code is string => Boolean(code));
  return Promise.all(codes.map((code) => getDuel(supabase, code, owner)));
}

/**
 * Each school, with its record as §23.8 asks for it: on the tapes it traded, its mean grade beside
 * what sitting out graded on the same tapes. A school with no reads yet says so.
 */
export async function getSchools(): Promise<SchoolView[]> {
  const supabase = serviceClient();
  return Promise.all(
    GAME_SCHOOLS.map(async (school) => {
      const { data } = await supabase
        .from('school_reads')
        .select('intent, grade, sit_out_grade')
        .eq('school_code', school.code)
        .eq('school_version', school.version);
      const rows = (data ?? []) as { intent: { kind: string }; grade: number | null; sit_out_grade: number | null }[];
      const traded = rows.filter((row) => row.intent.kind === 'trade' && row.grade !== null && row.sit_out_grade !== null);
      const mean = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);
      return {
        code: school.code,
        name: school.name,
        playbook: school.blurb,
        version: school.version,
        reads: rows.length,
        trades: traded.length,
        meanGrade: mean(traded.map((row) => row.grade as number)),
        sitOutMean: mean(traded.map((row) => row.sit_out_grade as number)),
      };
    }),
  );
}

/** A player's record in public: aggregates only, never which tapes (a list of tapes is a list of hints). */
export async function getPublicRecord(userId: string): Promise<{ rounds: number; meanGrade: number | null; won: number; lost: number; drawn: number }> {
  const supabase = serviceClient();
  const [{ data: graded }, { data: seats }] = await Promise.all([
    supabase.from('game_rounds').select('grade').eq('user_id', userId).eq('status', 'locked'),
    supabase.from('game_duel_seats').select('seat, game_duels(status, winner)').eq('user_id', userId),
  ]);
  const grades = ((graded ?? []) as { grade: number }[]).map((row) => row.grade);
  let won = 0;
  let lost = 0;
  let drawn = 0;
  type Seat = { seat: number; game_duels: { status: string; winner: number | null } | { status: string; winner: number | null }[] | null };
  for (const row of (seats ?? []) as Seat[]) {
    const duel = Array.isArray(row.game_duels) ? row.game_duels[0] : row.game_duels;
    if (!duel || duel.status !== 'over') continue;
    if (duel.winner === null) drawn += 1;
    else if (duel.winner === row.seat) won += 1;
    else lost += 1;
  }
  return {
    rounds: grades.length,
    meanGrade: grades.length > 0 ? Math.round(grades.reduce((sum, g) => sum + g, 0) / grades.length) : null,
    won,
    lost,
    drawn,
  };
}
