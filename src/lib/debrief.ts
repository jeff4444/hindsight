import type { RoundResult, ScorePayload } from "./api-types";
import type { Tone } from "@/components/ui";

/**
 * The written half of the debrief.
 *
 * Pure, and deliberately so: these are the sentences §4.5 asks for, and they are decided by the
 * score's axes rather than by anything on screen. Lifted out of `Debrief.tsx` when the result moved
 * into a rail and that component stopped being rendered.
 */

/** Just the suffix — it is rendered immediately after the number itself. */
export function ordinalSuffix(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/**
 * The tone a percentile is spoken in — a `Tone`, not a class.
 *
 * Returning the semantic name rather than `text-long-ink` is what lets this live in `lib` at all:
 * the thresholds are product logic, the class is presentation, and the two were welded together
 * inside a component that no longer exists.
 */
export function percentileTone(percentile: number | null): Tone {
  if (percentile === null) return "neutral";
  if (percentile >= 0.75) return "long";
  if (percentile >= 0.4) return "neutral";
  return "short";
}

/** §4.5's diagnosis, in the voice its own example uses. */
export function sentences(score: ScorePayload, result: RoundResult): string[] {
  const lines: string[] = [];
  const { axes } = score;

  if (result.outcome === "pass") {
    lines.push(
      axes.restraint === null
        ? "Passing is scored as 0R against the same distribution as any trade."
        : `Passing scored better than ${Math.round(axes.restraint * 98)} of the 98 brackets available here.`,
    );
    if (score.parR !== null && score.parR < 0) {
      lines.push(
        "The median achievable trade lost money on this chart, so standing aside was a real edge, not an absence of one.",
      );
    } else {
      lines.push(
        "There was money on this chart, and passing gave all of it up.",
      );
    }
    return lines;
  }

  if (axes.direction !== null) {
    lines.push(
      axes.direction >= 0.9
        ? `Direction was right: ${Math.round(axes.direction * 100)}% of everything that worked here was on your side.`
        : axes.direction <= 0.1
          ? `Direction was wrong — only ${Math.round(axes.direction * 100)}% of the winning brackets were on your side.`
          : `${Math.round(axes.direction * 100)}% of the winning brackets were on your side.`,
    );
  }

  if (axes.stopSweptShare !== null) {
    const swept = Math.round(axes.stopSweptShare * 100);
    lines.push(
      axes.stopInsideNoise
        ? `Your stop sat inside the noise the winners had to survive, and would have been swept out of ${swept}% of the brackets at that distance.`
        : `A stop at that distance was swept in ${swept}% of the brackets that used it.`,
    );
  }

  // Capture is only meaningful for a trade that made money. A loser captured none of the move,
  // and "you captured -29% of it" is arithmetically true and semantically nonsense.
  if (axes.captureShare !== null && axes.captureShare > 0) {
    lines.push(
      `You captured ${Math.round(axes.captureShare * 100)}% of the move that was there while you held it.`,
    );
  } else if (result.windowMfeR !== null && result.windowMfeR > 0) {
    lines.push(
      `There was ${result.windowMfeR.toFixed(2)}R on the table in your direction across the window, and you took none of it.`,
    );
  }

  if (axes.efficiency !== null) {
    lines.push(
      `Against the best that was possible on this path, you took ${(axes.efficiency * 100).toFixed(1)}%.`,
    );
  }

  if (
    axes.restraint !== null &&
    score.percentile !== null &&
    axes.restraint > score.percentile
  ) {
    lines.push("Passing would have scored better than this trade.");
  }

  return lines;
}
