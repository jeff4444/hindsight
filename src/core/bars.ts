/**
 * Bar types and timeframe aggregation.
 *
 * Pure. No I/O. Everything in src/core must stay that way — Phase 1 calls the resolver ~98
 * times per chart to enumerate the achievable set (scope §4.2), so this code sits on a hot
 * path and must be trivially testable.
 */

/** A bar with no time information. This is what ever reaches the client (scope §12.2). */
export interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** A bar carrying its open time in epoch milliseconds. Server and pipeline only. */
export interface TimedBar extends Bar {
  /** Open time, epoch ms, UTC. */
  t: number;
}

/** An aggregated bar plus the count of source bars that composed it. */
export interface AggregatedBar extends TimedBar {
  /** How many source bars fell into this bucket. Used to reject windows with data gaps. */
  n: number;
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;

/**
 * Aggregate bars up to a larger timeframe, bucketed on UTC boundaries.
 *
 * Buckets are derived from the epoch directly, so an hour bucket always starts on the hour in
 * UTC regardless of where the input happens to begin. Empty buckets are not emitted; callers
 * detect gaps by checking that consecutive open times differ by exactly `bucketMs` and that
 * every bar's `n` equals the expected source-bar count.
 *
 * Input must be sorted ascending by `t`.
 */
export function aggregate(source: TimedBar[], bucketMs: number): AggregatedBar[] {
  const out: AggregatedBar[] = [];
  let current: AggregatedBar | null = null;

  for (const bar of source) {
    const bucket = Math.floor(bar.t / bucketMs) * bucketMs;

    if (current === null || current.t !== bucket) {
      if (current !== null) out.push(current);
      current = { t: bucket, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v, n: 1 };
      continue;
    }

    current.h = Math.max(current.h, bar.h);
    current.l = Math.min(current.l, bar.l);
    current.c = bar.c;
    current.v += bar.v;
    current.n += 1;
  }

  if (current !== null) out.push(current);
  return out;
}

/**
 * True when `bars` is a contiguous run of complete buckets: no missing buckets between the
 * first and last, and every bucket composed of exactly `expectedPerBucket` source bars.
 *
 * Scope §13.3 rejects windows with data gaps. A missing minute inside the resolution path is
 * a minute in which a stop could have been hit, so a gapped window is not resolvable fairly.
 */
export function isContiguous(
  bars: AggregatedBar[],
  bucketMs: number,
  expectedPerBucket: number,
): boolean {
  if (bars.length === 0) return false;

  for (let i = 0; i < bars.length; i++) {
    if (bars[i].n !== expectedPerBucket) return false;
    if (i > 0 && bars[i].t - bars[i - 1].t !== bucketMs) return false;
  }

  return true;
}

/** Strip time and aggregation metadata, leaving only what may be sent to a client. */
export function toBar(bar: Bar): Bar {
  return { o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v };
}

/**
 * Group a contiguous, aligned bar series into buckets of `group` bars.
 *
 * This is how the client derives 5-minute and 15-minute candles from the stored 1-minute
 * detail. It is index-based rather than timestamp-based because the detail path is guaranteed
 * contiguous and hour-aligned by the pipeline — every window is rejected otherwise (§13.3) —
 * so bucket boundaries fall exactly where the clock says they should, with no timestamp
 * arithmetic to get wrong.
 *
 * A trailing partial bucket is emitted as a partial bar, which is correct: during the reveal
 * the newest candle is still forming.
 */
export function aggregateByCount(bars: Bar[], group: number, phase = 0): Bar[] {
  if (group <= 1) return bars.slice();

  const out: Bar[] = [];
  let start = 0;
  // `phase` is where bars[0] sits inside its own bucket, so the first bucket is short by that
  // much. Without it a 4-hour candle would run from whatever hour the window opened on rather
  // than from the clock boundary, and a daily candle would not be a day in any useful sense.
  let take = group - (((phase % group) + group) % group);

  while (start < bars.length) {
    const end = Math.min(start + take, bars.length);

    let high = bars[start].h;
    let low = bars[start].l;
    let volume = 0;
    for (let i = start; i < end; i++) {
      if (bars[i].h > high) high = bars[i].h;
      if (bars[i].l < low) low = bars[i].l;
      volume += bars[i].v;
    }

    out.push({ o: bars[start].o, h: high, l: low, c: bars[end - 1].c, v: volume });
    start = end;
    take = group;
  }

  return out;
}
