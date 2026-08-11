/**
 * The leaderboard, with everything that is allowed to turn a base rate into a claim.
 *
 *   npm run leaderboard
 *
 * §5.6 promises a leaderboard and §7.3 promises published engine track records. `npm run engines`
 * already produces the raw base rates; this script is what stands between those numbers and the
 * sentence *"this engine works"*.
 *
 * Four procedures, each answering a question the others do not:
 *
 * | | asks |
 * | --- | --- |
 * | **Romano–Wolf StepM** | which engines beat Engine Zero, correcting for all four being tested |
 * | **Hansen's SPA** | does the *best* engine beat Engine Zero — one test, asked once |
 * | **CSCV / PBO** | does the crown hold out of sample, or is the ordering noise |
 * | **rank distribution** | is there an ordering here at all |
 *
 * ## The unit of observation
 *
 * Each engine gets one number per chart: its R where it traded, **zero where it passed**. That is a
 * portfolio, and it answers "which of these would you rather have been running". It is deliberately
 * not the mean over an engine's own trades, which flatters anything that trades rarely — and this
 * roster contains an engine that fires 22 times in 1,000.
 *
 * ## Why symbols, not charts
 *
 * The corpus draws up to eight windows per instrument, and two windows of the same instrument are
 * not independent. Every bootstrap here resamples **whole symbols**, which is the only reason the
 * intervals are honest. Charts are also ordered by symbol before PBO's blocks are cut, so no symbol
 * straddles the train/test boundary.
 *
 * Read-only.
 */

import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { PATH_BARS_PER_DISPLAY_BAR } from '../src/core/config';
import { fromPgHex, unpackPath } from '../src/core/pack';
import { NO_COSTS, resolve } from '../src/core/resolve';
import { council, ENGINES, REGISTERED, THRESHOLD_HASH, type Verdict } from '../src/core/engines';
import {
  expectedMaxSharpe,
  hansenSPA,
  probabilityOfBacktestOverfitting,
  rankDistribution,
  romanoWolfStepM,
  type EngineSeries,
} from '../src/core/engines/significance';

interface Row {
  id: string;
  symbol: string;
  lead_in_bars: Bar[];
  lead_in_extra: Bar[] | null;
  atr14: number;
  entry_price: number;
  resolution_path: string;
}

const RESAMPLES = 4000;

/** Opt in to replaying over the synthetic controls instead of the real corpus. */
const SYNTHETIC_ONLY = process.argv.includes('--synthetic');

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1));
}

/** The static bracket, resolved exactly as a player's would be. Zero if the engine passed. */
function bracketR(verdict: Verdict, entry: number, path: Bar[]): number {
  if (!verdict.bracket || verdict.direction === null) return 0;
  try {
    return resolve(
      { entry, stop: verdict.bracket.stop, target: verdict.bracket.target },
      path,
      PATH_BARS_PER_DISPLAY_BAR,
      NO_COSTS,
    ).rMultiple;
  } catch {
    // An unplaceable bracket is a trade that could not be taken, which is a flat outcome, not a
    // missing one. Dropping the chart would shorten one engine's vector and break the pairing.
    return 0;
  }
}

async function run() {
  const supabase = supabaseClient();

  const rows: Row[] = [];
  for (let from = 0; ; from += 200) {
    // Real charts only. §7.2's synthetic controls are in the corpus now, and a published track
    // record that quietly averaged real and fabricated markets together would be describing
    // neither. `--synthetic` runs the same replay over the controls instead.
    const { data, error } = await supabase
      .from('charts')
      .select('id, symbol, lead_in_bars, lead_in_extra, atr14, entry_price, resolution_path')
      // Real charts only. §7.2's synthetic controls live in the corpus now, and a published
      // statistic that quietly averaged real and fabricated markets would describe neither.
      .eq('synthetic', SYNTHETIC_ONLY)
      .order('symbol')
      .order('id')
      .range(from, from + 199);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
    if (data.length < 200) break;
  }

  if (rows.length === 0) {
    console.log('No charts in the corpus. Run `npm run corpus` first.');
    return;
  }

  const symbols = [...new Set(rows.map((row) => row.symbol))];
  const clusterOf = new Map(symbols.map((symbol, i) => [symbol, i]));
  const clusters = rows.map((row) => clusterOf.get(row.symbol)!);

  console.log(`Leaderboard — ${REGISTERED.version}, thresholds ${THRESHOLD_HASH}`);
  console.log(`${rows.length} charts over ${symbols.length} symbols; family of ${REGISTERED.engines.length} pre-registered engines`);
  console.log('');

  /* ------------------------------------------------- the per-chart portfolios */

  const returns = new Map<string, number[]>(ENGINES.map((engine) => [engine.code, []]));
  const traded = new Map<string, boolean[]>(ENGINES.map((engine) => [engine.code, []]));

  for (const row of rows) {
    const bars = [...(row.lead_in_extra ?? []), ...row.lead_in_bars];
    const path = unpackPath(fromPgHex(row.resolution_path));

    let seed = 0;
    for (const ch of row.id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;

    for (const verdict of council({ bars, entry: row.entry_price, atr: row.atr14, seed })) {
      returns.get(verdict.engine)!.push(bracketR(verdict, row.entry_price, path));
      traded.get(verdict.engine)!.push(verdict.direction !== null);
    }
  }

  const series: EngineSeries[] = ENGINES.map((engine) => ({
    name: engine.name,
    returns: returns.get(engine.code)!,
  }));
  const codeOf = new Map(ENGINES.map((engine, k) => [series[k].name, engine.code]));
  const zero = series[ENGINES.findIndex((engine) => engine.code === 'ZERO')];
  const schools = series.filter((s) => s !== zero);

  /**
   * The control that decides how every number below is read.
   *
   * Engine Zero **loses money** — a 2R target on a 2 ATR stop inside a 60-candle window is a
   * negative-expectancy bet, and it is measured at −0.091R per chart. So *anything that trades less
   * than it beats it*, skill or no skill. An engine scored zero on the charts it passes is being
   * paid for staying out.
   *
   * That is a real property of the portfolio and worth publishing, but it is not evidence about the
   * trades an engine takes. So the roster is measured against a strategy that never trades at all,
   * on the same footing and in the same test. If the schools cannot be separated from this, then
   * every gap below is abstention, not skill.
   */
  const ABSTAIN: EngineSeries = { name: 'Never trade', returns: rows.map(() => 0) };

  console.log(`  ${'engine'.padEnd(26)} ${'fired'.padStart(6)} ${'per-chart R'.padStart(12)} ${'sd'.padStart(8)} ${'Sharpe'.padStart(8)}`);
  for (const engine of [...series, ABSTAIN]) {
    const m = mean(engine.returns);
    const s = sd(engine.returns);
    const code = codeOf.get(engine.name);
    const fired = code ? traded.get(code)!.filter(Boolean).length : 0;
    console.log(
      `  ${engine.name.padEnd(26)} ${String(fired).padStart(6)} ` +
        `${(m >= 0 ? '+' : '') + m.toFixed(4)}`.padStart(12) +
        ` ${s.toFixed(4).padStart(8)} ${(s > 0 ? (m / s).toFixed(4) : '—').padStart(8)}`,
    );
  }
  console.log('  Per-chart R counts a pass as zero. An engine that trades 22 times in 1,000 is being');
  console.log('  measured on the same 1,000 charts as one that trades on every bar, which is the point.');

  /* ------------------------------------------- question one: the portfolio */

  console.log('');
  console.log('QUESTION ONE — which of these would you rather have been running?');
  console.log(`  Romano–Wolf StepM against Engine Zero. ${RESAMPLES} cluster resamples by symbol, α = 0.05, one-sided.`);
  console.log('  "Never trade" is in the same test, as a control rather than as a candidate.');
  const portfolio = romanoWolfStepM([...schools, ABSTAIN], zero, clusters, {
    resamples: RESAMPLES,
    seed: 0x5715e9,
  });
  for (const result of portfolio) {
    console.log(
      `  ${result.name.padEnd(26)} Δ ${(result.meanDifference >= 0 ? '+' : '') + result.meanDifference.toFixed(4)}` +
        `   t ${result.statistic.toFixed(3).padStart(7)}   ` +
        (result.rejected ? `beats Engine Zero (step ${result.step})` : 'not distinguishable from Engine Zero'),
    );
  }

  /* ---------------------------------------------- question two: the skill */

  /**
   * The paired test that holds coverage fixed.
   *
   * On every chart an engine traded, it is compared to **Engine Zero's own outcome on that same
   * chart** — same entry, same window, a coin flip against a rule. Charts it passed contribute zero
   * to both sides and so cancel exactly. What is left is the only thing that can be called an edge:
   * *given that it chose to trade here, was it better than guessing?*
   */
  const skill: EngineSeries[] = schools.map((engine) => {
    const took = traded.get(codeOf.get(engine.name)!)!;
    return {
      name: engine.name,
      returns: engine.returns.map((r, i) => (took[i] ? r - zero.returns[i] : 0)),
    };
  });
  const nothing: EngineSeries = { name: '—', returns: rows.map(() => 0) };

  console.log('');
  console.log('QUESTION TWO — on the charts it chose, did it beat a coin flip on those same charts?');
  console.log('  Paired per chart, so coverage cancels and only trade selection is left.');
  const edge = romanoWolfStepM(skill, nothing, clusters, { resamples: RESAMPLES, seed: 0x5715e9 });
  for (const result of edge) {
    const took = traded.get(codeOf.get(result.name)!)!.filter(Boolean).length;
    console.log(
      `  ${result.name.padEnd(26)} Δ ${(result.meanDifference >= 0 ? '+' : '') + result.meanDifference.toFixed(4)}` +
        `   t ${result.statistic.toFixed(3).padStart(7)}   ` +
        `over ${String(took).padStart(4)} trades   ` +
        (result.rejected ? 'BEATS THE COIN FLIP' : 'no edge over a coin flip'),
    );
  }

  /* ----------------------------------------------------------------- SPA */

  const spa = hansenSPA(skill, nothing, clusters, { resamples: RESAMPLES, seed: 0x5a5a });
  console.log('');
  console.log('HANSEN SPA — is the BEST engine better than a coin flip on its own charts? One test, asked once.');
  console.log(`  best: ${spa.best}   statistic ${spa.statistic.toFixed(3)}   p = ${spa.pValue.toFixed(4)}`);
  console.log(
    `  ${spa.pValue < 0.05 ? 'The roster contains superior predictive ability.' : 'No evidence of superior predictive ability anywhere on the roster.'}`,
  );

  /* ----------------------------------------------------------------- PBO */

  const pbo = probabilityOfBacktestOverfitting([...series, ABSTAIN]);
  console.log('');
  console.log('PBO by combinatorially symmetric cross-validation — does the crown hold?');
  console.log(`  ${pbo.splits} balanced splits of 16 blocks, exhaustive`);
  console.log(`  PBO = ${pbo.pbo.toFixed(3)}   median out-of-sample rank of the in-sample winner: ${pbo.medianRank} of ${series.length + 1}`);
  console.log('  0.5 is a coin flip: the in-sample winner lands below median half the time, i.e. the');
  console.log('  ordering carries no information at all.');

  /* ------------------------------------------------------------- the ranks */

  const ranked = [...series, ABSTAIN];
  const ranks = rankDistribution(ranked, clusters, { resamples: RESAMPLES, seed: 0x4a4a });
  console.log('');
  console.log(`RANK DISTRIBUTION — ${RESAMPLES} cluster resamples. Share of resamples in each place.`);
  console.log(`  ${'engine'.padEnd(26)} ${ranked.map((_, i) => `#${i + 1}`.padStart(7)).join('')}`);
  ranks.forEach((row, k) => {
    console.log(`  ${ranked[k].name.padEnd(26)} ${row.map((p) => `${(p * 100).toFixed(1)}%`.padStart(7)).join('')}`);
  });
  console.log('  An engine with no place above ~50% has no rank, and printing one for it would be the');
  console.log('  single most misleading thing on the page.');

  /* --------------------------------------------------- the deflation floor */

  const sharpes = series.map((engine) => {
    const s = sd(engine.returns);
    return s > 0 ? mean(engine.returns) / s : 0;
  });
  // Specifications tried, not engines shipped — see REGISTERED.trials. Using the roster size here
  // would price the search as if no threshold had ever been reconsidered.
  const trials = REGISTERED.trials;
  const floor = sd(sharpes) * expectedMaxSharpe(trials);

  console.log('');
  console.log(`DEFLATION — ${trials} pre-registered trials over ${REGISTERED.engines.length} engines`);
  console.log(`  Best of ${trials} SKILL-FREE engines is expected to reach a Sharpe of ${floor.toFixed(4)}`);
  console.log(`  (E[max] = ${expectedMaxSharpe(trials).toFixed(4)} cross-engine sd of ${sd(sharpes).toFixed(4)}).`);
  console.log(`  Observed best: ${Math.max(...sharpes).toFixed(4)} — ${Math.max(...sharpes) > floor ? 'above' : 'below'} the floor.`);
  console.log('  The floor is only honest because the family was frozen before the corpus was touched:');
  console.log(`  thresholds ${THRESHOLD_HASH}, ${trials} engines, and a test that fails if either moves.`);
}

if (process.argv[1] && process.argv[1].endsWith('leaderboard.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
