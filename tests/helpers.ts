import type { Bar, TimedBar } from '@/core/bars';

/** Build a bar from shorthand, defaulting volume so fixtures stay readable. */
export function bar(o: number, h: number, l: number, c: number, v = 1): Bar {
  return { o, h, l, c, v };
}

/** A one-minute path of `count` bars, each produced by `fn`. */
export function path(count: number, fn: (i: number) => Bar): Bar[] {
  return Array.from({ length: count }, (_, i) => fn(i));
}

/** A flat path that never moves. Useful as filler around an interesting bar. */
export function flat(count: number, price: number): Bar[] {
  return path(count, () => bar(price, price, price, price));
}

/** Minute bars starting at `start` epoch ms, one per minute. */
export function timed(start: number, bars: Bar[], stepMs = 60_000): TimedBar[] {
  return bars.map((b, i) => ({ ...b, t: start + i * stepMs }));
}
