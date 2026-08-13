/**
 * Does council disagreement predict difficulty? §11.1 names "Council Split" the hardest map in the
 * game, and §5's exit condition asks the same question. Neither has been measured. Read-only.
 */
import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { council } from '../src/core/engines';
import type { Direction } from '../src/core/resolve';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

interface Row {
  id: string; lead_in_bars: Bar[]; lead_in_extra: Bar[] | null;
  atr14: number; entry_price: number;
  par_r: number | null; oracle_r: number | null; pass_percentile: number | null;
}

async function run() {
  const rows: Row[] = [];
  for (let from = 0; ; from += 200) {
    const { data, error } = await supabase.from('charts')
      .select('id, lead_in_bars, lead_in_extra, atr14, entry_price, par_r, oracle_r, pass_percentile')
      .eq('synthetic', false).order('id').range(from, from + 199);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as Row[]));
    if (data.length < 200) break;
  }

  const split: Row[] = [], agreed: Row[] = [], silent: Row[] = [], one: Row[] = [];
  for (const row of rows) {
    const bars = [...(row.lead_in_extra ?? []), ...row.lead_in_bars];
    let seed = 0;
    for (const ch of row.id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
    const schools = council({ bars, entry: row.entry_price, atr: row.atr14, seed })
      .filter((v) => v.direction !== null && v.engine !== 'ZERO');
    const longs = schools.filter((v) => (v.direction as Direction) === 'long').length;
    if (schools.length === 0) silent.push(row);
    else if (schools.length === 1) one.push(row);
    else if (longs > 0 && longs < schools.length) split.push(row);
    else agreed.push(row);
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
  // Welch's t: the groups are wildly different sizes and there is no reason to assume equal variance.
  const welch = (a: number[], b: number[]) => {
    const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
    return (mean(a) - mean(b)) / Math.sqrt(va + vb);
  };

  const col = (rs: Row[], f: (r: Row) => number | null) => rs.map(f).filter((x): x is number => x !== null);

  const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  console.log('group          n    med par_r   med oracle_r   med pass%ile   mean par_r');
  for (const [name, rs] of [['split', split], ['agreed', agreed], ['one school', one], ['silent', silent], ['ALL', rows]] as const) {
    console.log(
      `${name.padEnd(12)} ${String(rs.length).padStart(4)}  ` +
      `${med(col(rs, (r) => r.par_r)).toFixed(3).padStart(9)}     ` +
      `${med(col(rs, (r) => r.oracle_r)).toFixed(2).padStart(8)}       ` +
      `${med(col(rs, (r) => r.pass_percentile)).toFixed(3).padStart(8)}` +
      `${mean(col(rs, (r) => r.par_r)).toFixed(3).padStart(12)}`,
    );
  }

  const rest = rows.filter((r) => !split.includes(r));
  console.log('\nsplit vs everything else, Welch t:');
  for (const [label, f] of [['par_r', (r: Row) => r.par_r], ['oracle_r', (r: Row) => r.oracle_r], ['pass_percentile', (r: Row) => r.pass_percentile]] as const) {
    console.log(`  ${label.padEnd(16)} t = ${welch(col(split, f), col(rest, f)).toFixed(3)}`);
  }
}
run();
