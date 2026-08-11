"use client";

import type {
  ChartProvenance,
  RoundResult,
  ScorePayload,
} from "@/lib/api-types";
import type { Verdict } from "@/core/engines";
import { useTween } from "@/lib/useTween";
import { STOP_ATR, TARGET_R, axisPosition } from "@/lib/grid";
import { Button, Disclosure, Eyebrow, Panel, Stat, cx, toneInk } from "../ui";
import { AchievableField } from "../debrief/AchievableField";
import { PercentileLadder } from "../debrief/PercentileLadder";
import { ordinalSuffix, percentileTone, sentences } from "@/lib/debrief";
import { Council } from "./Council";
import { Provenance } from "./Provenance";

/**
 * The result, beside the chart instead of below it.
 *
 * The old debrief was a single full-width column in the scrolling console under a stage that is
 * `clamp(28rem, 60dvh, 47.5rem)` tall. On a 1440×900 laptop that left about **280px of visible
 * console** for roughly **2,550px of content** — nine screenfuls — and the percentile, which is the
 * actual score and the biggest number the design system has, began around 330px down. You could not
 * see what you had scored without scrolling, and the council sat *below the Next button*, after the
 * control the player was about to press.
 *
 * So the shape is inverted. Five things are visible without scrolling — outcome, score, standing,
 * the council's spread, and the actions — and everything that supports them is one disclosure away.
 * Nothing was deleted; the field, the ladder, the diagnosis, the excursion and the provenance are
 * all still here, and all still one click from the summary that cites them.
 *
 * ## Why it only appears once the reveal has settled
 *
 * The stage height is fixed per breakpoint and never varies by phase, because it used to: a console
 * mounting underneath shrank the chart mid-phase, and lightweight-charts had already sized its
 * internal table to the taller box — the time axis ended up laid out below the frame's own bottom
 * edge and clipped away entirely.
 *
 * This rail narrows the frame instead of shortening it, and it does so exactly once, at
 * `onSettled` — after the camera has stopped and the chart has been handed back to the player. The
 * width-gated guard in `Chart.tsx` re-applies the settled range in hours across the resize, so the
 * same bars stay on screen and simply draw thinner.
 *
 * **It must not animate its width.** A width transition would fire the chart's `ResizeObserver`
 * every frame for the length of the transition, which is a canvas re-layout per frame at the one
 * moment the resolved chart is being read. The rail appears at full width in a single frame; only
 * its contents fade.
 */
export function ResultRail({
  result,
  score,
  provenance,
  verdicts,
  entry,
  atr,
  nextLabel,
  onNext,
  onReplay,
  className,
}: {
  result: RoundResult;
  score: ScorePayload | null;
  provenance: ChartProvenance | null;
  verdicts: Verdict[];
  entry: number;
  atr: number | null;
  nextLabel: string;
  onNext: () => void;
  onReplay: () => void;
  className?: string;
}) {
  const passed = result.outcome === "pass";
  const t = useTween(560, [score?.percentile ?? null, result.rMultiple]);
  const playerR = passed ? 0 : (result.rMultiple ?? 0);
  const percentile = score?.percentile ?? null;

  const tone = passed
    ? "restraint"
    : playerR > 0
      ? "long"
      : playerR < 0
        ? "short"
        : "neutral";

  /**
   * Counted the same way the ladder ranks its rungs, and deliberately not from `percentile`.
   *
   * `percentileOf` splits ties, so `percentile × 98` is not a number of brackets — saying "you beat
   * 21" when 42 tied and none were worse is simply false, and a stop-out makes that the common case
   * because a full 1R loss is the floor of the distribution.
   */
  const standing = score
    ? score.distribution.reduce(
        (acc, r) => ({
          total: acc.total,
          worse: acc.worse + (r < playerR ? 1 : 0),
          tied: acc.tied + (r === playerR ? 1 : 0),
        }),
        { total: score.distribution.length, worse: 0, tied: 0 },
      )
    : null;

  const stopAtr =
    atr && atr > 0 && result.riskPerUnit ? result.riskPerUnit / atr : null;
  const targetR =
    result.riskPerUnit &&
    result.riskPerUnit > 0 &&
    result.target !== null &&
    result.entryFill !== null
      ? Math.abs(result.target - result.entryFill) / result.riskPerUnit
      : null;

  return (
    <div className={cx("flex flex-col gap-3 lg:min-h-0", className)}>
      {/* The scrolling part — at `lg`, where the rail has a height to scroll inside. On a phone it
          is ordinary flow and the page scrolls. */}
      <div className="animate-fade flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-0.5">
        {/*
          1 and 2 — what happened, and what it scored, on one line.

          Stacked, these two headlines cost about 90px more and pushed the council's summary
          sentence to 466px inside a 488px fold: it fitted at 900px tall and would not have at 800.
          They are also the same kind of thing — the two numbers this round produced — so a row is
          the more honest arrangement as well as the shorter one. The R is what you made; the
          percentile is what that was worth against everything that was available, which is the
          score the product actually keeps.
        */}
        <Panel pad="md">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Eyebrow tone={tone === "neutral" ? undefined : tone}>
                {outcomeLabel(result)}
              </Eyebrow>
              <p
                className={cx(
                  "numeral mt-0.5 text-3xl font-semibold",
                  toneInk(tone),
                )}
              >
                {passed || result.rMultiple === null
                  ? "0.00R"
                  : `${result.rMultiple >= 0 ? "+" : ""}${(result.rMultiple * t).toFixed(2)}R`}
              </p>
            </div>

            {score && (
              <div className="shrink-0 text-right">
                <Eyebrow>Percentile</Eyebrow>
                <div className="mt-0.5 flex items-baseline justify-end gap-0.5">
                  <span
                    className={cx(
                      "numeral text-3xl font-semibold",
                      toneInk(percentileTone(percentile)),
                    )}
                  >
                    {percentile === null
                      ? "—"
                      : Math.round(percentile * 100 * t)}
                  </span>
                  {percentile !== null && (
                    <span
                      className={cx(
                        "text-sm font-semibold",
                        toneInk(percentileTone(percentile)),
                      )}
                    >
                      {ordinalSuffix(Math.round(percentile * 100))}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {score && (
            <div className="border-line-faint mt-3.5 border-t pt-3.5">
              {standing && (
                <p className="text-ink-lo text-sm leading-relaxed">
                  {percentile === null
                    ? "Not scored — this chart predates the achievable set."
                    : standing.tied > 0
                      ? `You beat ${standing.worse} of the ${standing.total} brackets placeable here, and matched ${standing.tied}.`
                      : `You beat ${standing.worse} of the ${standing.total} brackets that were placeable here.`}
                </p>
              )}

              {/* 3 — the three numbers that put the score in context */}
              <dl className="mt-3.5 flex flex-wrap gap-x-6 gap-y-3">
                <Stat
                  size="sm"
                  label="Oracle"
                  value={`${score.oracleR.toFixed(1)}R`}
                  hint="The best any bracket could have done on this path"
                  tone="gold"
                />
                <Stat
                  size="sm"
                  label="You took"
                  value={
                    score.axes.efficiency === null
                      ? "—"
                      : `${(score.axes.efficiency * 100).toFixed(1)}%`
                  }
                  hint="Your R as a share of the oracle"
                />
                <Stat
                  size="sm"
                  label="Par"
                  value={
                    score.parR === null
                      ? "—"
                      : `${score.parR >= 0 ? "+" : ""}${score.parR.toFixed(2)}R`
                  }
                  hint="The median achievable outcome. Negative means most brackets lost here"
                  tone={
                    score.parR !== null && score.parR < 0 ? "short" : "neutral"
                  }
                />
              </dl>
            </div>
          )}
        </Panel>

        {/* 4 — the council, as a co-star rather than a footnote below the Next button */}
        {verdicts.length > 0 && (
          <Council
            verdicts={verdicts}
            entry={entry}
            playerDirection={passed ? null : (result.direction ?? null)}
          />
        )}

        {/* 5 — everything that supports the summary, one click away */}
        <Panel pad="md" className="flex flex-col gap-1">
          {score && score.distribution.length > 0 && (
            <>
              <Disclosure label="Where yours sat" aside="98 brackets">
                <PercentileLadder
                  distribution={score.distribution}
                  playerR={playerR}
                  passed={passed}
                  oracleR={score.oracleR}
                  parR={score.parR}
                  progress={1}
                />
              </Disclosure>

              <Disclosure
                label="Every bracket that was placeable"
                aside="long · short"
              >
                {/* Single column in a rail: the field is two 7×7 grids and `sm:grid-cols-2` would
                    put them side by side at 240px each, inside a 26rem column. */}
                <AchievableField
                  columns={1}
                  distribution={score.distribution}
                  direction={passed ? null : (result.direction ?? null)}
                  stopIndex={
                    stopAtr === null ? null : axisPosition(stopAtr, STOP_ATR)
                  }
                  targetIndex={
                    targetR === null ? null : axisPosition(targetR, TARGET_R)
                  }
                  progress={1}
                />
              </Disclosure>

              <Disclosure
                label="What the score is made of"
                aside="diagnosis"
                defaultOpen
              >
                <ul className="flex flex-col gap-2">
                  {sentences(score, result).map((line) => (
                    <li
                      key={line}
                      className="border-line-faint text-ink flex gap-3 border-l-2 py-0.5 pl-3 text-sm"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            </>
          )}

          {!passed &&
            result.windowMfeR !== null &&
            result.windowMaeR !== null && (
              <Disclosure label="The managed ceiling" aside="excursion">
                <p className="text-ink-lo text-sm leading-relaxed">
                  Across the whole window the move was worth{" "}
                  <span className="numeral text-gain-ink">
                    {result.windowMfeR >= 0 ? "+" : ""}
                    {result.windowMfeR.toFixed(2)}R
                  </span>{" "}
                  your way and{" "}
                  <span className="numeral text-loss-ink">
                    {result.windowMaeR.toFixed(2)}R
                  </span>{" "}
                  against you. A set-and-forget bracket cannot capture that;
                  managing the trade could have.
                </p>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                  <Stat
                    size="sm"
                    label="MFE"
                    value={
                      result.mfeR === null
                        ? "—"
                        : `${result.mfeR >= 0 ? "+" : ""}${result.mfeR.toFixed(2)}R`
                    }
                    hint="Best while you held it"
                  />
                  <Stat
                    size="sm"
                    label="MAE"
                    value={
                      result.maeR === null ? "—" : `${result.maeR.toFixed(2)}R`
                    }
                    hint="Worst while you held it"
                  />
                </dl>
              </Disclosure>
            )}

          {provenance && (
            <Disclosure label="What it actually was" aside="reveal">
              <Provenance provenance={provenance} />
            </Disclosure>
          )}
        </Panel>
      </div>

      {/* The actions, always reachable. At `lg` the flex layout pins them under the scroller; below
          it they stick to the bottom of the viewport, because in page-scroll mode "Next chart"
          would otherwise sit at the foot of a three-thousand-pixel column.

          Deliberately opaque rather than blurred: a `backdrop-filter` is the one decoration this
          app cannot have near the chart, and there is no reason for the exception here. */}
      <div className="bg-surface-0 sticky bottom-0 z-10 flex shrink-0 items-center gap-2 py-2 lg:static lg:py-0">
        <Button variant="ghost" size="md" onClick={onReplay} kbd="R">
          Replay
        </Button>
        <Button
          variant="primary"
          size="md"
          block
          glow="brand"
          onClick={onNext}
          kbd="⏎"
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}

function outcomeLabel(result: RoundResult): string {
  if (result.outcome === "pass") return "Stood aside";
  if (result.outcome === "target") return "Target hit";
  if (result.outcome === "stop") return "Stopped out";
  return "Neither — marked to market";
}
