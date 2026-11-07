/**
 * The schools' reads (docs/rules.md §23.7, §23.8), made offline, once per tape.
 *
 *   npm run school -- --school price-action --split held-out --limit 200   # read with the model, store
 *   npm run school -- --school price-action --limit 5 --dry-run            # read and print, store nothing
 *   npm run school -- --school price-action --fixture                      # the stand-in reader; local database only
 *   npm run school -- --school price-action --report                       # the §23.8 bar, on the held-out tapes
 *
 * Reading calls the Claude API (credentials from the environment: ANTHROPIC_API_KEY or an
 * `ant auth login` profile) and costs money: roughly one request per tape. A tape already read at
 * the school's current version is skipped, so a run can be stopped and resumed. A stored read is
 * final; changing the playbook, the prompt or the model means a new `version` in
 * `src/lib/game/schools.ts`.
 *
 * The corpus is split **by symbol**, a fifth held out, because two windows of one instrument are
 * not independent draws (§14.7). The playbook is written and tuned against `--split development`;
 * the record that decides whether a school ships is `--report`, over `--split held-out` only.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Bar } from '../src/core/bars';
import { fromPgHex, unpackDetail, unpackPath } from '../src/core/pack';
import { marketFromChart, type Market } from '../src/core/trading/market';
import { hashString, mulberry32 } from '../src/core/random';
import { biggestMove, MIN_MOVE } from '../src/core/game';
import { settleRound } from '../src/lib/game/round-core';
import { schoolByCode, schoolIntent, type SchoolSpec } from '../src/lib/game/schools';
import { ReadSchema, answerToRead, fixtureAnswer, schoolSystemPrompt, tapeBrief, type SchoolAnswer } from '../src/lib/game/school-read';

const MODEL = 'claude-opus-5-5';
const CONCURRENCY = 3;

interface Args {
  school: string;
  split: 'held-out' | 'development' | 'all';
  limit: number;
  dryRun: boolean;
  fixture: boolean;
  report: boolean;
}

function parseArgs(argv: string[]): Args {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const split = value('--split') ?? 'all';
  if (!['held-out', 'development', 'all'].includes(split)) throw new Error(`--split is held-out, development or all, not ${split}`);
  return {
    school: value('--school') ?? 'price-action',
    split: split as Args['split'],
    limit: Number.parseInt(value('--limit') ?? '', 10) || Infinity,
    dryRun: argv.includes('--dry-run'),
    fixture: argv.includes('--fixture'),
    report: argv.includes('--report'),
  };
}

/** A fifth of the symbols, fixed forever by the symbol's name. */
export function heldOut(symbol: string): boolean {
  return hashString(symbol) % 5 === 0;
}

function supabaseClient(): { supabase: SupabaseClient; local: boolean } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return { supabase: createClient(url, key, { auth: { persistSession: false } }), local: /localhost|127\.0\.0\.1/.test(url) };
}

interface ChartRow {
  id: string;
  symbol: string;
  decision_at: string;
  index_factor: number;
  mirrored: boolean;
  volume_base: number;
  lead_in_bars: Bar[];
  lead_in_extra: Bar[] | null;
  reveal_bars: Bar[];
  resolution_path: string;
  detail_path: string | null;
  big_move: number | null;
}

function marketFromRow(row: ChartRow): Market {
  return marketFromChart({
    chartId: row.id,
    symbol: row.symbol,
    decisionAt: row.decision_at,
    indexFactor: row.index_factor,
    mirrored: row.mirrored,
    volumeBase: row.volume_base,
    leadInBars: row.lead_in_bars,
    leadInExtra: row.lead_in_extra,
    revealBars: row.reveal_bars,
    path: unpackPath(fromPgHex(row.resolution_path)),
    detail: row.detail_path ? unpackDetail(fromPgHex(row.detail_path)) : null,
  });
}

/* ------------------------------------------------------------------ reading */

let anthropic: Anthropic | null = null;

/** One read from the model. Null when it refused, or its answer did not parse. */
async function readWithModel(school: SchoolSpec, market: Market): Promise<{ answer: SchoolAnswer; model: string } | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      anthropic ??= new Anthropic();
      const response = await anthropic.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        // A safety decline re-runs on the recommended fallback model, server-side.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: zodOutputFormat(ReadSchema) },
        // The same for every tape, so it is cached across the run.
        system: [{ type: 'text', text: schoolSystemPrompt(school), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: tapeBrief(market) }],
      });
      if (response.stop_reason === 'refusal') {
        console.warn(`  refused (${response.stop_details?.category ?? 'no category'})`);
        return null;
      }
      if (!response.parsed_output) {
        console.warn(`  no parsable answer (stop: ${response.stop_reason})`);
        return null;
      }
      return { answer: response.parsed_output, model: response.model };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
        const wait = 2 ** attempt * 5000;
        console.warn(`  ${error.status}, retrying in ${wait / 1000}s`);
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      if (error instanceof Anthropic.APIError) {
        console.warn(`  API error ${error.status}: ${error.message}`);
        return null;
      }
      throw error;
    }
  }
  return null;
}

async function read(args: Args, school: SchoolSpec): Promise<void> {
  const { supabase, local } = supabaseClient();
  if (args.fixture && !local) throw new Error('the fixture reader only ever writes to a local database');

  const { data: done, error: doneError } = await supabase
    .from('school_reads')
    .select('chart_id')
    .eq('school_code', school.code)
    .eq('school_version', school.version);
  if (doneError) throw new Error(doneError.message);
  const already = new Set(((done ?? []) as { chart_id: string }[]).map((row) => row.chart_id));

  const columns =
    'id, symbol, decision_at, index_factor, mirrored, volume_base, lead_in_bars, lead_in_extra, reveal_bars, resolution_path, detail_path, big_move';
  const queue: ChartRow[] = [];
  for (let from = 0; ; from += 50) {
    const { data, error } = await supabase.from('charts').select(columns).eq('synthetic', false).order('id').range(from, from + 49);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ChartRow[]) {
      if (already.has(row.id)) continue;
      if (args.split !== 'all' && heldOut(row.symbol) !== (args.split === 'held-out')) continue;
      if (row.big_move !== null && row.big_move < MIN_MOVE) continue;
      queue.push(row);
    }
    if (!data || data.length < 50) break;
  }

  const todo = queue.slice(0, args.limit);
  console.log(`${school.name} (${school.version}): ${already.size} read, ${todo.length} to read (${args.split})${args.fixture ? ' with the fixture reader' : ` with ${MODEL}`}${args.dryRun ? ', dry run' : ''}`);

  let next = 0;
  let stored = 0;
  const worker = async () => {
    while (next < todo.length) {
      const row = todo[next++];
      const market = marketFromRow(row);
      const move = biggestMove(market);
      if (row.big_move === null && !args.dryRun) await supabase.from('charts').update({ big_move: move }).eq('id', row.id);
      if (move < MIN_MOVE) continue;

      const result = args.fixture ? { answer: fixtureAnswer(market), model: 'fixture' } : await readWithModel(school, market);
      if (!result) continue;
      const { intent, read: stored_read, rejected } = answerToRead(result.answer, market);
      const settled = settleRound(market, schoolIntent(intent, market));
      const line = `${row.symbol.padEnd(12)} ${intent.kind === 'trade' ? `${intent.side} ${intent.type}`.padEnd(12) : 'sits out'.padEnd(12)} grade ${String(settled.grade).padStart(4)}  sitting out ${settled.sitOutGrade}${rejected ? `  (refused: ${rejected})` : ''}`;
      console.log(line);
      if (args.dryRun) {
        console.log(`  ${stored_read.thesis}`);
        continue;
      }
      const { error } = await supabase.from('school_reads').upsert({
        school_code: school.code,
        school_version: school.version,
        chart_id: row.id,
        intent,
        read: stored_read,
        grade: settled.grade,
        sit_out_grade: settled.sitOutGrade,
        model: result.model,
      });
      if (error) throw new Error(error.message);
      stored += 1;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (!args.dryRun) console.log(`stored ${stored} reads`);
}

/* ------------------------------------------------------------------ report */

/**
 * §23.8's third bar, on the held-out tapes: on the tapes the school traded, its grade against what
 * sitting out graded on the same tapes, paired per tape, bootstrapped by symbol, one-sided. The
 * number of versions of this school stored is printed beside it, because §14.7's deflation counts
 * every version tried, kept or not.
 */
async function report(school: SchoolSpec): Promise<void> {
  const { supabase } = supabaseClient();
  const { data, error } = await supabase
    .from('school_reads')
    .select('school_version, intent, grade, sit_out_grade, charts(symbol)')
    .eq('school_code', school.code);
  if (error) throw new Error(error.message);
  type Row = { school_version: string; intent: { kind: string }; grade: number; sit_out_grade: number; charts: { symbol: string } | { symbol: string }[] | null };
  const rows = (data ?? []) as Row[];
  const versions = new Set(rows.map((row) => row.school_version));
  const symbolOf = (row: Row) => (Array.isArray(row.charts) ? row.charts[0]?.symbol : row.charts?.symbol) ?? '';
  const mine = rows.filter((row) => row.school_version === school.version && heldOut(symbolOf(row)));
  const traded = mine.filter((row) => row.intent.kind === 'trade');

  console.log(`${school.name} (${school.version}) on held-out tapes. Versions of this school stored: ${versions.size}.`);
  console.log(`  read ${mine.length}, traded ${traded.length} (${mine.length ? ((traded.length / mine.length) * 100).toFixed(0) : 0}% — the bar is 50%)`);
  if (traded.length === 0) return;

  const bySymbol = new Map<string, number[]>();
  for (const row of traded) {
    const list = bySymbol.get(symbolOf(row)) ?? [];
    list.push(row.grade - row.sit_out_grade);
    bySymbol.set(symbolOf(row), list);
  }
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const diffs = traded.map((row) => row.grade - row.sit_out_grade);
  const clusters = [...bySymbol.values()];
  const rng = mulberry32(2323);
  const resamples: number[] = [];
  for (let b = 0; b < 4000; b++) {
    const drawn: number[] = [];
    for (let i = 0; i < clusters.length; i++) drawn.push(...clusters[Math.floor(rng() * clusters.length)]);
    resamples.push(mean(drawn));
  }
  resamples.sort((a, b) => a - b);
  const p = resamples.filter((value) => value <= 0).length / resamples.length;
  console.log(`  mean grade ${mean(traded.map((r) => r.grade)).toFixed(0)}, sitting out on the same tapes ${mean(traded.map((r) => r.sit_out_grade)).toFixed(0)}`);
  console.log(`  difference ${mean(diffs).toFixed(1)} grade points, 95% interval [${resamples[100].toFixed(1)}, ${resamples[3899].toFixed(1)}] over ${clusters.length} symbols, one-sided p ${p.toFixed(3)}`);
  console.log(
    p < 0.05 && traded.length / mine.length >= 0.5
      ? '  Clears the bar before deflation. Count the versions above against §14.7 before calling it a result.'
      : '  Does not clear the bar.',
  );
}

const args = parseArgs(process.argv.slice(2));
const school = schoolByCode(args.school);
if (!school) throw new Error(`no school ${args.school}`);
(args.report ? report(school) : read(args, school)).catch((error) => {
  console.error(error);
  process.exit(1);
});
