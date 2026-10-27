import { describe, expect, it } from 'vitest';
import {
  LEASE_MS,
  openClock,
  pause,
  play,
  revealedAt,
  setSpeed,
  step,
  toEnd,
  touch,
} from '@/core/trading/clock';

const T0 = 1_000_000;

describe('the replay clock', () => {
  it('opens paused with nothing revealed', () => {
    const clock = openClock(3600, T0);
    expect(clock.paused).toBe(true);
    expect(revealedAt(clock, T0 + 60_000)).toBe(0);
  });

  it('runs at its speed in tape minutes per second while playing', () => {
    const clock = play(openClock(3600, T0, 15), T0);
    expect(revealedAt(clock, T0 + 2_000)).toBe(30);
  });

  it('never runs past the end of the tape', () => {
    const clock = play(openClock(100, T0, 240), T0);
    expect(revealedAt(clock, T0 + 10_000)).toBe(100);
  });

  it('keeps what it had when paused, and resumes from there', () => {
    let clock = play(openClock(3600, T0, 15), T0);
    clock = pause(clock, T0 + 4_000);
    expect(revealedAt(clock, T0 + 60_000)).toBe(60);
    clock = play(clock, T0 + 60_000);
    expect(revealedAt(clock, T0 + 62_000)).toBe(90);
  });

  it('changes speed without losing or gaining minutes', () => {
    let clock = play(openClock(3600, T0, 15), T0);
    clock = setSpeed(clock, T0 + 2_000, 60);
    expect(revealedAt(clock, T0 + 2_000)).toBe(30);
    expect(revealedAt(clock, T0 + 3_000)).toBe(90);
    expect(() => setSpeed(clock, T0, 7)).toThrow();
  });

  it('steps forward while paused, clamped to the tape', () => {
    let clock = step(openClock(120, T0), T0, 60);
    expect(clock.paused).toBe(true);
    expect(revealedAt(clock, T0)).toBe(60);
    clock = step(clock, T0, 500);
    expect(revealedAt(clock, T0)).toBe(120);
  });

  it('stops at the lease when nobody is asking, and comes back paused', () => {
    const clock = play(openClock(3600, T0, 1), T0);
    // One minute a second, lease of 15 s: the clock stops at 15 minutes however long they were away.
    expect(revealedAt(clock, T0 + 600_000)).toBe(LEASE_MS / 1000);
    const back = touch(clock, T0 + 600_000);
    expect(back.away).toBe(true);
    expect(back.clock.paused).toBe(true);
    expect(revealedAt(back.clock, T0 + 700_000)).toBe(15);
  });

  it('extends the lease on every request while playing', () => {
    let clock = play(openClock(3600, T0, 1), T0);
    for (let t = 10_000; t <= 60_000; t += 10_000) clock = touch(clock, T0 + t).clock;
    expect(revealedAt(clock, T0 + 60_000)).toBe(60);
  });

  it('bumps its version on every control, for compare-and-swap', () => {
    const start = openClock(3600, T0);
    const versions = [play(start, T0), pause(start, T0), step(start, T0, 1), setSpeed(start, T0, 60), toEnd(start, T0)].map((c) => c.version);
    expect(versions.every((v) => v === start.version + 1)).toBe(true);
  });
});
