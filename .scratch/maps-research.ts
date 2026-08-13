/**
 * What can the three missing official maps (§11.1) actually be defined as?
 *
 * Crash, Euphoria and Council Split are the three of §11.1's seven that no tape covers. This
 * measures the distributions that would have to carry them, before any threshold is chosen.
 * Read-only.
 */
import { createClient } from '@supabase/supabase-js';
import type { Bar } from '../src/core/bars';
import { council } from '../src/core/engines';
import type { Direction } from '../src/core/resolve';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

interface Row {
  id: string;
  lead_in_bars: Bar[];
  lead_in_extra: Bar[] | null;
  atr14: number;
  entry_price: number;
  regime_er_bucket: string | null;
  regime_vol_bucket: string | null;
  efficiency_ratio: number | null;
  themes: string[] | null;
  mirrored: boolean;
}

async function run() {
const rows: Row[] = [];
for (let from = 0; ; from += 200) {
  const { data, error } = await supabase
    .from('charts')
    .select('id, lead_in_bars, lead_in_extra, atr14, entry_price, regime_er_bucket, regime_vol_bucket, efficiency_ratio, themes, mirrored')
    .eq('synthetic', false)
    .order('id')
    .range(from, from + 199);
  if (error) throw new Error(error.message);
  if (!data?.length) break;
  rows.push(...(data as Row[]));
  if (data.length < 200) break;
}
console.log(`${rows.length} real charts\n`);

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
};
const pct = (n: number) => `${((n / rows.length) * 100).toFixed(1)}%`;

/* ---------------------------------------------------- direction, in ATR */
// The player sees the *stored* bars, which are already mirrored (§12.2) — so a drift measured here
// is the drift they see, not the instrument's.
const drifts: number[] = [];
const runUps: number[] = [];
const drawdowns: number[] = [];
const splitCounts: number[] = [];
let spoke2 = 0, disagreed = 0, unanimous = 0;
const perChart = new Map<string, { drift: number; split: number; speakers: number }>();

for (const row of rows) {
  const bars = [...(row.lead_in_extra ?? []), ...row.lead_in_bars];
  const visible = row.lead_in_bars; // what the player actually sees at the smallest tier
  const first = visible[0].c;
  const last = visible[visible.length - 1].c;
  const drift = (last - first) / row.atr14;
  drifts.push(drift);

  let peak = visible[0].c, maxUp = 0, maxDown = 0;
  let trough = visible[0].c;
  for (const b of visible) {
    peak = Math.max(peak, b.h);
    trough = Math.min(trough, b.l);
    maxDown = Math.min(maxDown, (b.l - peak) / row.atr14);
    maxUp = Math.max(maxUp, (b.h - trough) / row.atr14);
  }
  runUps.push(maxUp);
  drawdowns.push(maxDown);

  let seed = 0;
  for (const ch of row.id) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const verdicts = council({ bars, entry: row.entry_price, atr: row.atr14, seed });
  const schools = verdicts.filter((v) => v.direction !== null && v.engine !== 'ZERO');
  const longs = schools.filter((v) => (v.direction as Direction) === 'long').length;
  const shorts = schools.length - longs;
  // A split score: how evenly the speaking schools are divided. 0 = unanimous or silent.
  const split = schools.length >= 2 ? Math.min(longs, shorts) : 0;
  splitCounts.push(split);
  if (schools.length >= 2) {
    spoke2 += 1;
    if (longs > 0 && shorts > 0) disagreed += 1; else unanimous += 1;
  }
  perChart.set(row.id, { drift, split, speakers: schools.length });
}

console.log('LEAD-IN DRIFT (close-to-close, in ATR, as displayed)');
for (const p of [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]) {
  console.log(`  p${String(p * 100).padStart(3)}  ${q(drifts, p).toFixed(2)}`);
}
for (const t of [-6, -5, -4, -3, 3, 4, 5, 6]) {
  const n = drifts.filter((d) => (t < 0 ? d <= t : d >= t)).length;
  console.log(`  drift ${t < 0 ? '<=' : '>='} ${String(t).padStart(2)} ATR   ${String(n).padStart(4)}  ${pct(n)}`);
}

console.log('\nCOUNCIL SPLIT (schools only, Engine Zero excluded)');
console.log(`  two or more spoke      ${String(spoke2).padStart(4)}  ${pct(spoke2)}`);
console.log(`    ...and disagreed     ${String(disagreed).padStart(4)}  ${pct(disagreed)}   (${((disagreed / Math.max(1, spoke2)) * 100).toFixed(1)}% of those)`);
console.log(`    ...and agreed        ${String(unanimous).padStart(4)}  ${pct(unanimous)}`);
for (const s of [1, 2, 3]) {
  const n = splitCounts.filter((c) => c >= s).length;
  console.log(`  minority side >= ${s}     ${String(n).padStart(4)}  ${pct(n)}`);
}

console.log('\nHOW MANY SCHOOLS SPEAK AT ALL');
const speakers = [...perChart.values()].map((v) => v.speakers);
for (let k = 0; k <= 6; k++) {
  const n = speakers.filter((s) => s === k).length;
  if (n) console.log(`  ${k} engines  ${String(n).padStart(4)}  ${pct(n)}`);
}

console.log('\nCROSS-CHECK: do the drift extremes already have a tape?');
for (const [label, test] of [
  ['drift <= -4 ATR', (r: Row, d: number) => d <= -4],
  ['drift >= +4 ATR', (r: Row, d: number) => d >= 4],
] as const) {
  const sel = rows.filter((r) => test(r, perChart.get(r.id)!.drift));
  const vol = new Map<string, number>();
  const er = new Map<string, number>();
  for (const r of sel) {
    vol.set(r.regime_vol_bucket ?? 'null', (vol.get(r.regime_vol_bucket ?? 'null') ?? 0) + 1);
    er.set(r.regime_er_bucket ?? 'null', (er.get(r.regime_er_bucket ?? 'null') ?? 0) + 1);
  }
  console.log(`  ${label}: n=${sel.length}  vol=${JSON.stringify(Object.fromEntries(vol))}  er=${JSON.stringify(Object.fromEntries(er))}`);
}
}
run();
