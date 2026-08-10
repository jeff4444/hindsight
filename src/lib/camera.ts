import type { Bar } from '@/core/bars';
import { LEAD_IN_BARS, WINDOW_BARS } from '@/core/config';
import type { LogicalRange, PriceRange } from '@/components/Chart';

/**
 * The reveal camera.
 *
 * §13.4 warns that autoscaling during a replay makes the chart jitter, and that this is the
 * single most common failure in replay interfaces. The fix it proposes — pin the scale before
 * the first bar — is correct about the cause and blunt about the cure: a frozen frame is
 * stable but inert, and it wastes most of the canvas showing empty space that the future has
 * not filled yet.
 *
 * What is actually wrong with autoscale is that it is *instantaneous*. Every appended bar
 * snaps the axis to a new range, and the eye reads the discontinuity as breakage. A camera
 * that eases toward the range it wants, at a rate slow enough to read as deliberate, is stable
 * for the same reason a pinned scale is — nothing moves abruptly — while still using the whole
 * frame the way a live chart does.
 *
 * So the range here is a *target*, and the caller smooths toward it. Nothing in this module
 * snaps.
 */

export interface View {
  from: number;
  to: number;
  min: number;
  max: number;
}

/** Lead-in candles left on screen at the moment of commit. Enough context to read the setup. */
export const FOCUS_CONTEXT = 34;

/** Breathing room to the right of the newest candle, in bars. */
const RIGHT_GAP = 3;

/** Vertical padding, as a fraction of the visible price span. */
const VERTICAL_PAD = 0.09;

/**
 * Camera responsiveness, as an exponential time constant in milliseconds.
 *
 * Small enough to keep up with the tape, large enough that a single outlier bar glides into
 * frame instead of yanking the axis. This is the number to turn if the reveal feels sluggish
 * or twitchy.
 */
export const CAMERA_TAU_MS = 145;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Frame-rate independent smoothing factor.
 *
 * A fixed per-frame fraction would make the camera move at different speeds on a 60Hz and a
 * 120Hz display. This does not.
 */
export const approach = (dtMs: number, tauMs: number) => 1 - Math.exp(-dtMs / tauMs);

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** The view a player should start on: the whole lead-in, filling the frame. */
export function placementView(): LogicalRange {
  return { from: -0.5, to: LEAD_IN_BARS - 0.5 };
}

/** The close-up the camera cuts to on commit, before any future arrives. */
export function focusView(): LogicalRange {
  return { from: LEAD_IN_BARS - FOCUS_CONTEXT, to: LEAD_IN_BARS + RIGHT_GAP };
}

/**
 * Where the camera wants to be, given how much of the future has arrived.
 *
 * The horizontal move is the whole effect. `to` tracks the newest candle, so the tape always
 * runs against the right edge the way a live chart does. `from` is held near the decision bar
 * early and released late — squared progress, so the close-up lingers while the first few
 * candles land and the pull-back accelerates once the outcome is obvious. Older candles
 * compress into the left of the frame as it widens, which is the "shrinking to the back"
 * a real chart does when you leave it running.
 *
 * By the last bar the target is the full window, so there is no separate settling move to
 * stage — the reveal simply arrives there.
 */
export function revealTarget(
  revealed: number,
  total: number,
  bars: Bar[],
  rails: number[],
): View {
  const progress = total > 0 ? Math.min(revealed / total, 1) : 1;
  const pullBack = progress * progress;

  const from = lerp(LEAD_IN_BARS - FOCUS_CONTEXT, -1, pullBack);
  const to = Math.max(
    LEAD_IN_BARS + revealed + RIGHT_GAP,
    lerp(LEAD_IN_BARS + RIGHT_GAP, WINDOW_BARS + 1, pullBack),
  );

  return { from, to, ...priceExtent(bars, from, to, rails) };
}

/** The view the chart rests on once everything has been revealed. */
export function finalView(bars: Bar[], rails: number[]): View {
  const from = -1;
  const to = WINDOW_BARS + 1;
  return { from, to, ...priceExtent(bars, from, to, rails) };
}

/**
 * Vertical extent of whatever is horizontally visible, widened to keep the rails in frame.
 *
 * The rails are included deliberately: a stop that scrolls off the bottom mid-reveal makes the
 * result unreadable at exactly the moment it matters.
 */
export function priceExtent(
  bars: Bar[],
  from: number,
  to: number,
  rails: number[],
): PriceRange {
  const first = Math.max(0, Math.floor(from));
  const last = Math.min(bars.length - 1, Math.ceil(to));

  let min = Infinity;
  let max = -Infinity;

  for (let i = first; i <= last; i++) {
    const bar = bars[i];
    if (!bar) continue;
    if (bar.l < min) min = bar.l;
    if (bar.h > max) max = bar.h;
  }

  for (const rail of rails) {
    if (!Number.isFinite(rail)) continue;
    if (rail < min) min = rail;
    if (rail > max) max = rail;
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) return { min: min - 1, max: max + 1 };

  const pad = (max - min) * VERTICAL_PAD;
  return { min: min - pad, max: max + pad };
}

/** Step a view toward its target. Mutates and returns `current`. */
export function step(current: View, target: View, dtMs: number, tauMs = CAMERA_TAU_MS): View {
  const k = approach(dtMs, tauMs);
  current.from = lerp(current.from, target.from, k);
  current.to = lerp(current.to, target.to, k);
  current.min = lerp(current.min, target.min, k);
  current.max = lerp(current.max, target.max, k);
  return current;
}

/** Close enough that another frame would not be visible. */
export function settled(current: View, target: View): boolean {
  const span = Math.max(target.to - target.from, 1);
  const height = Math.max(target.max - target.min, 1e-9);
  return (
    Math.abs(current.from - target.from) / span < 0.002 &&
    Math.abs(current.to - target.to) / span < 0.002 &&
    Math.abs(current.min - target.min) / height < 0.002 &&
    Math.abs(current.max - target.max) / height < 0.002
  );
}
