import type { Bar } from '@/core/bars';
import { packDetail, packPath, toPgHex } from '@/core/pack';
import { mulberry32 } from '@/core/random';
import { mirrorBar } from '@/core/normalize';

/**
 * A plausible stored chart, row for row as the corpus keeps one, for seeding a local database
 * (`seedLocal.ts`). What the trading handler's in-memory stand-in for the service client was built
 * around, and all that is left of it now the handler is gone.
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
