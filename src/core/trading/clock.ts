/**
 * The replay clock, kept by the server.
 *
 * The future is never sent to the browser before it happens (§6), so how far the replay has got
 * is decided here, from the server's own clock, and never from anything the client says — the
 * same rule Manage established (§17.5), extended to a replay that can pause, change speed and
 * step.
 *
 * The state is an **anchor**: "at server time `anchorAt`, `anchorRevealed` minutes had been
 * revealed, and since then the replay has run at `speed` tape-minutes per second". Every control
 * re-anchors at the present, so the arithmetic never accumulates drift.
 *
 * ## Leaving does not cost you the market
 *
 * A replay that ran on while its trader was away would fill their stops and liquidate their
 * position in an empty room. So the clock holds a **lease**: it only runs while the trader keeps
 * asking for it. Every request extends the lease by `LEASE_MS`; if it lapses, the clock stops at
 * the moment it lapsed and the session is paused when they return.
 */

export interface SessionClock {
  /** Tape length, in minutes. */
  total: number;
  anchorRevealed: number;
  /** Server epoch ms. */
  anchorAt: number;
  /** Tape minutes per second of real time. */
  speed: number;
  paused: boolean;
  /** Server epoch ms past which the clock does not run without a fresh request. */
  leaseUntil: number;
  /** Bumped on every change, for compare-and-swap updates. */
  version: number;
}

/** Tape minutes per real second. 15 plays a 60-hour session in four minutes. */
export const REPLAY_SPEEDS = [1, 5, 15, 60, 240] as const;
export const DEFAULT_SPEED = 15;
export const LEASE_MS = 15_000;

export function isReplaySpeed(value: number): boolean {
  return (REPLAY_SPEEDS as readonly number[]).includes(value);
}

/** A new session's clock: paused at the decision close, nothing revealed. */
export function openClock(total: number, now: number, speed: number = DEFAULT_SPEED): SessionClock {
  return {
    total,
    anchorRevealed: 0,
    anchorAt: now,
    speed,
    paused: true,
    leaseUntil: now + LEASE_MS,
    version: 0,
  };
}

/** Minutes revealed at server time `now`. Never more than `total`, never past the lease. */
export function revealedAt(clock: SessionClock, now: number): number {
  if (clock.paused) return clock.anchorRevealed;
  const until = Math.min(now, clock.leaseUntil);
  const elapsed = Math.max(0, until - clock.anchorAt);
  return Math.min(clock.total, clock.anchorRevealed + Math.floor((elapsed * clock.speed) / 1000));
}

/** Re-anchor at `now` without changing anything else. */
function reanchor(clock: SessionClock, now: number): SessionClock {
  return { ...clock, anchorRevealed: revealedAt(clock, now), anchorAt: now };
}

/**
 * A request has arrived: extend the lease. If it had lapsed, the clock stopped when it lapsed and
 * the session comes back paused. Returns the clock and whether the trader was away.
 */
export function touch(clock: SessionClock, now: number): { clock: SessionClock; away: boolean } {
  if (!clock.paused && now > clock.leaseUntil) {
    const stopped = revealedAt(clock, clock.leaseUntil);
    return {
      clock: {
        ...clock,
        anchorRevealed: stopped,
        anchorAt: now,
        paused: true,
        leaseUntil: now + LEASE_MS,
        version: clock.version + 1,
      },
      away: true,
    };
  }
  // Re-anchor before moving the lease, so time already earned under the old lease is kept and time
  // after it is not credited retroactively.
  const anchored = clock.paused ? clock : reanchor(clock, now);
  return { clock: { ...anchored, leaseUntil: now + LEASE_MS }, away: false };
}

export function play(clock: SessionClock, now: number): SessionClock {
  const anchored = reanchor(clock, now);
  if (anchored.anchorRevealed >= clock.total) return { ...anchored, paused: true, version: clock.version + 1 };
  return { ...anchored, paused: false, leaseUntil: now + LEASE_MS, version: clock.version + 1 };
}

export function pause(clock: SessionClock, now: number): SessionClock {
  return { ...reanchor(clock, now), paused: true, version: clock.version + 1 };
}

export function setSpeed(clock: SessionClock, now: number, speed: number): SessionClock {
  if (!isReplaySpeed(speed)) throw new Error(`not a replay speed: ${speed}`);
  return { ...reanchor(clock, now), speed, version: clock.version + 1 };
}

/** Pause and move forward by `minutes`, clamped to the end of the tape. */
export function step(clock: SessionClock, now: number, minutes: number): SessionClock {
  const anchored = reanchor(clock, now);
  return {
    ...anchored,
    anchorRevealed: Math.min(clock.total, anchored.anchorRevealed + Math.max(0, Math.floor(minutes))),
    paused: true,
    version: clock.version + 1,
  };
}

/** Jump to the end of the tape. */
export function toEnd(clock: SessionClock, now: number): SessionClock {
  return { ...reanchor(clock, now), anchorRevealed: clock.total, paused: true, version: clock.version + 1 };
}
