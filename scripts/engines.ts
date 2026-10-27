/**
 * Replay every engine over the whole corpus.
 *
 *   npm run engines
 *
 * §5.6 is blunt that conviction cannot be asserted:
 *
 * > Only one school on the roster ships calibrated conviction: Bulkowski publishes per-pattern
 * > break-even failure rates… Every other engine's conviction score would be invented. The fix is
 * > also the most defensible proprietary asset in the project: **replay every engine across the
 * > entire corpus and compute its own base rates.**
 *
 * This is that replay. Every number the council shows a player originates here, and
 * `src/core/engines/baseRates.ts` is its output committed as versioned constants — reviewable in a
 * diff rather than buried in a database.
 *
 * ## Two records per engine, because the schools do not use price targets
 *
 * No engine on this roster exits on a price. The Turtles trail out on the opposite 10-bar extreme;
 * Connors exits on a close above the 5-bar mean. §5.5 demands a static bracket anyway, because the
 * player places one and the two have to be comparable — so each engine is scored twice:
 *
 * - **bracket** — the static stop and target, resolved exactly as a player's would be.
 * - **native** — the school's own conditional exit, walked bar by bar over the reveal.
 *
 * The gap between them is the measured cost of forcing a school into a bracket. It is not available
 * anywhere else, and it only exists because the corpus stores the one-minute path.
 *
 * ## What this cannot say
 *
 * These are raw base rates. **They are not evidence that any engine has an edge** — that needs the
 * machinery in 3b (Romano–Wolf StepM, Hansen's SPA against Engine Zero, PBO) and §13.9 already
 * showed what happens without it: twelve comparisons, one hit at 95%, gone under correction. Read
 * every row beside Engine Zero's band, which is printed with them.
 *
 * Read-only.
 */

import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { PATH_BARS_PER_DISPLAY_BAR } from '../src/core/config';
import { fromPgHex, unpackPath } from '../src/core/pack';
import { NO_COSTS, resolve, type Direction } from '../src/core/resolve';
import { council, ENGINES, REGISTERED, THRESHOLD_HASH, type Verdict } from '../src/core/engines';
import { mulberry32 } from '../src/core/random';
import { walkNativeExit } from '../src/core/bots/exits';

interface Row {
  id: string;
  lead_in_bars: Bar[];
  lead_in_extra: Bar[] | null;
  atr14: number;
  entry_price: number;
  resolution_path: string;
  regime_er_bucket: string | null;
  regime_vol_bucket: string | null;
}

interface Outcome {
  r: number;
  won: boolean;
  hitTarget: boolean;
}

/** Opt in to replaying over the synthetic controls instead of the real corpus. */
const SYNTHETIC_ONLY = process.argv.includes('--synthetic');

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}

const mean = (xs: number[]) => (xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length);

/** The static bracket, resolved exactly as a player's would be. */
function resolveBracket(verdict: Verdict, entry: number, path: Bar[]): Outcome | null {
  if (!verdict.bracket || verdict.direction === null) return null;
  try {
    const result = resolve(
      { entry, stop: verdict.bracket.stop, target: verdict.bracket.target },
      path,
      PATH_BARS_PER_DISPLAY_BAR,
      NO_COSTS,
    );
    return { r: result.rMultiple, won: result.rMultiple > 0, hitTarget: result.outcome === 'target' };
  } catch {
    return null;
  }
}

/**
 * The school's own exit, walked over the reveal.
 *
 * The stop still applies — the engine's stop, whoever it belongs to — because a conditional exit
 * without one is an unbounded loss and no school on this roster claims that. What changes is the
 * *upside*: instead of a fixed target, the trade runs until the school says to leave.
 *
 * The walk itself lives in `src/core/bots/exits.ts`, shared with the bots that trade these rules,
 * and reads the corrected windows: the Turtle extreme over the bars before the one being traded,
 * the Connors average over the whole history. The figures in `baseRates.ts` `NATIVE` were measured
 * before that correction and are re-measured by running this.
 */
function resolveNative(verdict: Verdict, entry: number, history: Bar[], reveal: Bar[]): Outcome | null {
  const outcome = walkNativeExit(verdict, entry, history, reveal);
  return outcome === null ? null : { r: outcome.r, won: outcome.won, hitTarget: false };
}

function summarise(label: string, outcomes: Outcome[], charts: number): string {
  if (outcomes.length === 0) return `  ${label.padEnd(26)} — never fired`;
  const rs = outcomes.map((o) => o.r);
  return (
    `  ${label.padEnd(26)} ${String(outcomes.length).padStart(5)} ` +
    `${((outcomes.length / charts) * 100).toFixed(1).padStart(6)}% ` +
    `${(outcomes.filter((o) => o.won).length / outcomes.length * 100).toFixed(1).padStart(7)}% ` +
    `${(mean(rs) >= 0 ? '+' : '') + mean(rs).toFixed(3)}`.padStart(9) +
    `${(outcomes.filter((o) => o.hitTarget).length / outcomes.length * 100).toFixed(1).padStart(8)}%`
  );
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
      .select('id, lead_in_bars, lead_in_extra, atr14, entry_price, resolution_path, regime_er_bucket, regime_vol_bucket')
      // Real charts only. §7.2's synthetic controls live in the corpus now, and a published
      // statistic that quietly averaged real and fabricated markets would describe neither.
      .eq('synthetic', SYNTHETIC_ONLY)
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

  console.log(`Engine replay — ${REGISTERED.version}, thresholds ${THRESHOLD_HASH}`);
  console.log(`${rows.length} charts`);
  console.log('');

  /** Decoded once: the band resamples charts 400 times and re-decoding would dominate the runtime. */
  const paths = new Map<string, Bar[]>();
  const bracket = new Map<string, Outcome[]>(ENGINES.map((e) => [e.code, []]));
  const native = new Map<string, Outcome[]>(ENGINES.map((e) => [e.code, []]));
  const byRegime = new Map<string, number[]>();
  let bothSpoke = 0;
  let disagreed = 0;
  let silent = 0;

  for (const row of rows) {
    // Engines read the full stored history — 300 candles where it exists — while the player may
    // have seen 80. History before the window, never after it.
    const bars = [...(row.lead_in_extra ?? []), ...row.lead_in_bars];
    const path = unpackPath(fromPgHex(row.resolution_path));
    paths.set(row.id, path);
    const reveal: Bar[] = [];
    for (let i = 0; i + PATH_BARS_PER_DISPLAY_BAR <= path.length; i += PATH_BARS_PER_DISPLAY_BAR) {
      const chunk = path.slice(i, i + PATH_BARS_PER_DISPLAY_BAR);
      reveal.push({
        o: chunk[0].o,
        h: Math.max(...chunk.map((b) => b.h)),
        l: Math.min(...chunk.map((b) => b.l)),
        c: chunk[chunk.length - 1].c,
        v: 0,
      });
    }

    // Seeded on the chart id, so Engine Zero is reproducible across runs.
    let seed = 0;
    for (const ch of row.id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;

    const verdicts = council({ bars, entry: row.entry_price, atr: row.atr14, seed });
    const taken = verdicts.filter((v) => v.direction !== null);
    // Engine Zero always speaks, so "silent" and "disagreement" are counted over the schools only —
    // including the null would make every chart look like a live council.
    const schools = taken.filter((v) => v.engine !== 'ZERO');
    if (schools.length === 0) silent += 1;
    if (schools.length >= 2) {
      bothSpoke += 1;
      if (new Set(schools.map((v) => v.direction as Direction)).size > 1) disagreed += 1;
    }

    for (const verdict of verdicts) {
      const b = resolveBracket(verdict, row.entry_price, path);
      if (b) {
        bracket.get(verdict.engine)!.push(b);
        for (const [key, bucket] of [
          ['regime_er_bucket', row.regime_er_bucket],
          ['regime_vol_bucket', row.regime_vol_bucket],
        ] as const) {
          if (!bucket) continue;
          const id = `${verdict.engine}|${key}|${bucket}`;
          byRegime.set(id, [...(byRegime.get(id) ?? []), b.r]);
        }
      }
      const n = resolveNative(verdict, row.entry_price, bars, reveal);
      if (n) native.get(verdict.engine)!.push(n);
    }
  }

  console.log(`  ${'engine'.padEnd(26)} ${'n'.padStart(5)} ${'cover'.padStart(7)} ${'win'.padStart(7)} ${'mean R'.padStart(9)} ${'target'.padStart(8)}`);
  console.log('  — static bracket, scored exactly as a player’s would be');
  for (const engine of ENGINES) {
    console.log(summarise(engine.name, bracket.get(engine.code)!, rows.length));
  }
  console.log('');
  console.log('  — the school’s own conditional exit, walked over the reveal');
  for (const engine of ENGINES) {
    const outcomes = native.get(engine.code)!;
    if (outcomes.length === 0) {
      console.log(`  ${engine.name.padEnd(26)} — no native exit; the school has none`);
      continue;
    }
    console.log(summarise(engine.name, outcomes, rows.length));
  }

  /* ------------------------------------------------- the regime breakdown */

  // §7.3: "Never publish an aggregate engine number without the regime breakdown next to it."
  //
  // The rule is right and the corpus cannot satisfy its letter. 8 engines x 16 regime cells is 128
  // cells, and `docs/phase-4-research.md` §3.2 measured the result: **no school engine reaches 30
  // trades in any single cell** — Channel's largest is 22, Reversion's is 3, Geometry's is 0.
  // Printing 128 cells of noise would satisfy §7.3 while doing the opposite of what it is for.
  //
  // So the marginals are published instead, with their counts attached, and the cross is reported
  // as unmeasurable. That keeps the spirit — no aggregate stands unqualified — without inventing
  // resolution the sample does not have.
  console.log('');
  console.log('BY REGIME — marginals only. The 16-cell cross is not measurable at this n; see §14.10.');
  const marginal = (key: 'regime_er_bucket' | 'regime_vol_bucket', label: string) => {
    const buckets = [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort() as string[];
    console.log(`  ${label.padEnd(24)} ${buckets.map((b) => b.padStart(12)).join('')}`);
    for (const engine of ENGINES) {
      const cells = buckets.map((bucket) => {
        const rs = byRegime.get(`${engine.code}|${key}|${bucket}`) ?? [];
        return rs.length === 0
          ? '—'.padStart(12)
          : `${rs.length}: ${(mean(rs) >= 0 ? '+' : '') + mean(rs).toFixed(2)}`.padStart(12);
      });
      console.log(`  ${engine.name.padEnd(24)} ${cells.join('')}`);
    }
    console.log('');
  };
  marginal('regime_er_bucket', 'efficiency ratio');
  marginal('regime_vol_bucket', 'volatility');
  console.log('  n and mean R per bucket. Anything under ~30 trades resolves nothing — §14.7 needed');
  console.log('  198 trades to fail to resolve a 0.1R edge, and most cells here are a fraction of that.');

  console.log('');
  console.log('COUNCIL');
  console.log(`  silent (no school took a position)   ${silent}  ${((silent / rows.length) * 100).toFixed(1)}%`);
  console.log(`  two or more schools spoke            ${bothSpoke}  ${((bothSpoke / rows.length) * 100).toFixed(1)}%`);
  console.log(`  …and disagreed                       ${disagreed}  ${((disagreed / rows.length) * 100).toFixed(1)}%`);

  /* ------------------------------------------------------------- the band */

  // Engine Zero over many seeds. §5.3 wants the null on the same leaderboard, and a single run of a
  // coin flip is a point estimate of a coin flip — the distribution is the useful object.
  //
  // **The band is drawn at each engine's own sample size**, and that is not a refinement. An engine
  // firing on 88 charts has 3.4× the sampling error of a band computed over 1,000, and 22 charts
  // has 6.7×. Printing an n=88 point estimate beside an n=1000 band is how a coin flip comes to
  // look like an edge, and the first version of this script did exactly that.
  const seeds = 400;
  const zeroFor = (n: number) => {
    const means: number[] = [];
    const wins: number[] = [];
    for (let s = 0; s < seeds; s++) {
      const rng = mulberry32(((0xc01dbeef + s * 7919 + n * 104729) >>> 0));
      const rs: number[] = [];
      let won = 0;
      // Draw n charts with replacement, so the null is measured on a sample the same size as the
      // engine's — and on charts drawn from the same corpus, so composition is matched too.
      for (let k = 0; k < n; k++) {
        const row = rows[Math.floor(rng() * rows.length)];
        const long = rng() < 0.5;
        const stop = long ? row.entry_price - 2 * row.atr14 : row.entry_price + 2 * row.atr14;
        const risk = Math.abs(row.entry_price - stop);
        const target = long ? row.entry_price + 2 * risk : row.entry_price - 2 * risk;
        try {
          const result = resolve(
            { entry: row.entry_price, stop, target },
            paths.get(row.id)!,
            PATH_BARS_PER_DISPLAY_BAR,
            NO_COSTS,
          );
          rs.push(result.rMultiple);
          if (result.rMultiple > 0) won += 1;
        } catch {
          /* unplaceable bracket on this chart; skipped rather than counted as either */
        }
      }
      means.push(mean(rs));
      wins.push(won / Math.max(1, rs.length));
    }
    means.sort((a, b) => a - b);
    wins.sort((a, b) => a - b);
    const at = (xs: number[], q: number) => xs[Math.floor(q * (xs.length - 1))];
    return {
      meanLow: at(means, 0.025),
      meanHigh: at(means, 0.975),
      winLow: at(wins, 0.025),
      winHigh: at(wins, 0.975),
    };
  };

  console.log('');
  console.log(`ENGINE ZERO — ${seeds} seeds, drawn at EACH engine's own sample size.`);
  console.log('  An n=88 estimate against an n=1000 band overstates by 3.4×. Matched, so it does not.');
  console.log('');
  console.log(`  ${'engine'.padEnd(26)} ${'n'.padStart(5)}  ${'mean R'.padStart(8)}   null band          verdict`);
  for (const engine of ENGINES) {
    const outcomes = bracket.get(engine.code)!;
    if (outcomes.length === 0) continue;
    const band = zeroFor(outcomes.length);
    const value = mean(outcomes.map((o) => o.r));
    const beats = value > band.meanHigh;
    const below = value < band.meanLow;
    console.log(
      `  ${engine.name.padEnd(26)} ${String(outcomes.length).padStart(5)}  ` +
        `${(value >= 0 ? '+' : '') + value.toFixed(3)}`.padStart(8) +
        `   [${band.meanLow.toFixed(3)}, ${band.meanHigh.toFixed(3)}]` +
        `   ${beats ? 'ABOVE the null' : below ? 'BELOW the null' : 'inside the null'}`,
    );
  }
  console.log('');
  console.log('  A 2R target on a 2 ATR stop is NOT a 33.3% proposition: drift moves it, the 60-candle');
  console.log('  timeout truncates it, and §12.3.2 decides every bar that touches both. Measured, never');
  console.log('  assumed.');
  console.log('');
  console.log('These are raw base rates and they are NOT evidence of an edge. Four engines against a');
  console.log('band is still four comparisons; 3b applies Romano–Wolf StepM and Hansen’s SPA, and');
  console.log('§13.9 shows what happens without them.');
}

if (process.argv[1] && process.argv[1].endsWith('engines.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
