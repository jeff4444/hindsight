"use client";

import {
  COUNCIL_COVERAGE,
  EDGE,
  disagreement,
  type Verdict,
} from "@/core/engines";
import type { Direction } from "@/core/resolve";
import { Disclosure, Eyebrow, Panel, cx } from "../ui";
import { Tooltip } from "../ui/client";

/**
 * The council, on the reveal.
 *
 * §5.5: *"The player-facing output is a spread of opinion, never a consensus verdict."* So there is
 * no majority here, no aggregate score, and no arrow. Every engine gets a place, including every
 * engine that passed — and on **66.9%** of charts that is all of them.
 *
 * Three things this panel is built to make impossible to miss, each because the alternative would be
 * a quiet lie:
 *
 * **A pass is a verdict.** It reads as a decision with a reason attached, not as an error or a
 * missing row. §4.4 already scores restraint as a move the *player* can make; an engine passing is
 * the same move, and "no school here had a trade" is the most useful sentence a trading product can
 * say. It is drawn in `restraint`, whose own token comment says passing "gets a colour of its own
 * rather than reading as 'off'" — the previous `text-ink-dim` was exactly the "off" it warns about.
 *
 * **Whose number is whose.** Six of the eight engines ship no native price target — the Turtles
 * trail out, Connors exits on a moving-average cross, VSA exits on an opposing signal — so most
 * take-profits shown here are ours. Only Pattern's measuring rule and Geometry's AD retracement are
 * the school's. Every bracket carries the provenance of each side.
 *
 * **Nothing here beat a coin flip.** Every engine's mean R sits inside Engine Zero's band at its own
 * sample size, and the conviction line says so in words rather than leaving a percentage to imply
 * otherwise. A leaderboard without its null is a ranking of noise with the noise cropped out.
 *
 * ## Why the spread is a picture now
 *
 * The eight verdicts were eight stacked blocks of prose, and the divider meant to separate them
 * never rendered: `first:border-t-0` sat on a row that was the only child of its own wrapper list,
 * so every row matched `:first-child` and every border was suppressed. One undifferentiated column,
 * since the feature shipped.
 *
 * Fixed — but the deeper problem was that the most important thing here is a *distribution*, and a
 * distribution written out as eight paragraphs cannot be seen. The strip shows all eight at once
 * with the player's own move beside them. That is a spread of opinion rendered as a spread, which
 * is the one shape §5.5 permits: no ordering, no aggregate, no verdict — just who did what.
 *
 * The usual picture is eight restraint-coloured cells, because the usual answer is that nobody
 * traded. That is the finding, and it now arrives before the reader has to parse a sentence.
 */

/** The mark each verdict makes in the strip. */
function glyphFor(direction: Direction | null): string {
  return direction === "long" ? "↑" : direction === "short" ? "↓" : "–";
}

const CELL_TONE: Record<"long" | "short" | "pass", string> = {
  long: "bg-long-bg text-long-ink ring-long-line",
  short: "bg-short-bg text-short-ink ring-short-line",
  pass: "bg-restraint-bg text-restraint-ink ring-restraint-line",
};

function toneKey(direction: Direction | null): "long" | "short" | "pass" {
  return direction === null ? "pass" : direction;
}

/** One engine, as a cell. The name lives in the tooltip; the strip is for the shape. */
function Cell({ verdict }: { verdict: Verdict }) {
  const tone = toneKey(verdict.direction);
  const said =
    verdict.direction === null ? "stood aside" : `went ${verdict.direction}`;
  return (
    <Tooltip label={`${verdict.name} — ${said}`} placement="bottom">
      <span
        className={cx(
          "numeral grid h-7 w-7 place-items-center rounded-md text-sm font-semibold ring-1",
          CELL_TONE[tone],
        )}
      >
        <span aria-hidden>{glyphFor(verdict.direction)}</span>
        <span className="sr-only">
          {verdict.name} {said}
        </span>
      </span>
    </Tooltip>
  );
}

/**
 * The strip: every school's read, and yours, on one line.
 *
 * Engine Zero is separated rather than mixed in. It speaks on every chart by construction — it is a
 * coin flip — so counting it among "who stood aside" would mask the only number that matters here.
 * It stays visible, because *"a benchmark kept off the leaderboard is a benchmark nobody checks."*
 */
export function CouncilSpread({
  verdicts,
  playerDirection,
  className,
}: {
  verdicts: Verdict[];
  /** Null when the player passed — which is the same verdict the schools mostly reached. */
  playerDirection: Direction | null;
  className?: string;
}) {
  if (verdicts.length === 0) return null;

  const schools = verdicts.filter((verdict) => verdict.engine !== "ZERO");
  const zero = verdicts.find((verdict) => verdict.engine === "ZERO");
  const spoke = schools.filter((verdict) => verdict.direction !== null);
  const silent = schools.length - spoke.length;
  const agreed = spoke.filter(
    (verdict) => verdict.direction === playerDirection,
  ).length;
  const split = disagreement(schools);

  /**
   * The sentence under the strip, and it is written four ways on purpose.
   *
   * The interesting comparison is not "what did they say" — it is what the player did *relative* to
   * a roster that mostly does nothing. Trading where every school passed is a different fact from
   * passing where every school passed, and a single templated line would flatten the two.
   */
  const line = (() => {
    if (playerDirection === null && silent === schools.length) {
      return "You stood aside, and so did every school here.";
    }
    if (playerDirection === null) {
      return `You stood aside. ${spoke.length} of ${schools.length} took a position.`;
    }
    if (silent === schools.length) {
      return `You went ${playerDirection} where no school here had a trade.`;
    }
    return agreed > 0
      ? `You went ${playerDirection}. ${agreed} of ${schools.length} agreed; ${silent} stood aside.`
      : `You went ${playerDirection}. None of the ${spoke.length} that traded took your side.`;
  })();

  return (
    <div className={className}>
      {/* One row, never two. The `<ul>` shares a flex line with the separators, Engine Zero and the
          player's own cell, so at `gap-1.5` and 32px cells it was being squeezed to 254px and
          wrapping its seven schools onto a second line — which reads as two groups rather than one
          spread. `shrink-0` on the list and a tighter cell keep the whole distribution on one line
          inside a 26rem rail. */}
      <div className="flex items-center gap-1.5">
        <ul className="flex shrink-0 items-center gap-1">
          {schools.map((verdict) => (
            <li key={verdict.engine}>
              <Cell verdict={verdict} />
            </li>
          ))}
        </ul>

        {zero && (
          <>
            <span aria-hidden className="bg-line mx-0.5 h-6 w-px shrink-0" />
            <Cell verdict={zero} />
          </>
        )}

        <span aria-hidden className="bg-line-strong mx-1 h-6 w-px shrink-0" />

        <span
          className={cx(
            "numeral grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-sm font-semibold ring-1",
            CELL_TONE[toneKey(playerDirection)],
          )}
        >
          <span aria-hidden>{glyphFor(playerDirection)}</span>
          <span className="sr-only">
            You{" "}
            {playerDirection === null
              ? "stood aside"
              : `went ${playerDirection}`}
          </span>
        </span>
      </div>

      <p className="text-ink-lo mt-2 text-sm leading-relaxed">
        {line}
        {silent === schools.length && (
          <span className="text-ink-dim">
            {" "}
            No school takes a position on{" "}
            {(COUNCIL_COVERAGE.silent * 100).toFixed(0)}% of charts.
          </span>
        )}
        {split && (
          <span className="text-attention-ink">
            {" "}
            They disagree — which happens on{" "}
            {(COUNCIL_COVERAGE.disagreed * 100).toFixed(1)}% of charts.
          </span>
        )}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- the roster */

function Row({ verdict, entry }: { verdict: Verdict; entry: number }) {
  const passed = verdict.direction === null;
  const tone = passed
    ? "text-restraint-ink"
    : verdict.direction === "long"
      ? "text-long-ink"
      : "text-short-ink";
  // The bracket's reward-to-risk. Guarded: a stop equal to the entry is not a bracket, and dividing
  // by it would print `Infinity` in a panel whose whole argument is that its numbers are honest.
  const risk = verdict.bracket ? Math.abs(entry - verdict.bracket.stop) : 0;
  const rr =
    verdict.bracket && risk > 0
      ? Math.abs(verdict.bracket.target - entry) / risk
      : null;

  return (
    <li className="border-line-faint border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ink-max font-medium">{verdict.name}</span>
        <span className={cx("font-mono text-xs uppercase", tone)}>
          {passed ? "no setup" : verdict.direction}
        </span>
        {verdict.bracket && (
          <span className="text-ink-lo font-mono text-xs">
            stop {verdict.bracket.stop.toFixed(2)} · target{" "}
            {verdict.bracket.target.toFixed(2)}
            {rr === null ? "" : ` · ${rr.toFixed(2)}R`}
          </span>
        )}
      </div>

      <ul className="text-ink-lo mt-1.5 space-y-0.5 text-xs leading-relaxed">
        {verdict.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      {verdict.bracket && (
        <p className="text-ink-dim mt-1.5 font-mono text-mini">
          stop: {verdict.provenance.stop === "school" ? "the school’s" : "ours"}{" "}
          · target:{" "}
          {verdict.provenance.target === "school" ? "the school’s" : "ours"}
          {verdict.exit
            ? ` · natively it would ${verdict.exit.description}`
            : ""}
        </p>
      )}

      {verdict.conviction && (
        <p className="text-ink-dim mt-1 text-mini">
          {verdict.conviction.source}
        </p>
      )}

      {/*
        The asymmetry, disclosed.

        `contract.ts` says every verdict reports how many candles it used "and the debrief prints
        it"; the debrief did not. Engines read the full stored lead-in — up to 300 — while the
        player at Naked saw 80. That is history *before* the window and never after it, so it is not
        a causality leak, but it is an advantage, and an advantage that ships to the client and is
        never rendered is an advantage concealed by accident.
      */}
      <p className="text-ink-faint mt-1 font-mono text-mini">
        read {verdict.candlesUsed} candles
      </p>
    </li>
  );
}

export function Council({
  verdicts,
  entry,
  playerDirection,
  className,
}: {
  verdicts: Verdict[];
  entry: number;
  playerDirection: Direction | null;
  className?: string;
}) {
  if (verdicts.length === 0) return null;

  const schools = verdicts.filter((verdict) => verdict.engine !== "ZERO");
  const spoke = schools.filter((verdict) => verdict.direction !== null);

  return (
    <Panel pad="md" className={className}>
      <Eyebrow>The council</Eyebrow>

      <CouncilSpread
        verdicts={verdicts}
        playerDirection={playerDirection}
        className="mt-2.5"
      />

      <Disclosure
        label="How each school read it"
        aside={`${spoke.length}/${schools.length} traded`}
        className="border-line-faint mt-4 border-t pt-3"
      >
        <p className="text-ink-lo mb-2 text-xs leading-relaxed">
          Each school reads the same chart under its own published rules. This
          is a spread of opinion, not a verdict.
        </p>
        {/*
          One list, not three. `Row` returns an `<li>` and used to be wrapped in another `<li>`
          inside another `<ul>`, which made every row the first child of its own list — so
          `first:border-t-0` matched all eight and no divider ever drew.
        */}
        <ul>
          {verdicts.map((verdict) => (
            <Row key={verdict.engine} verdict={verdict} entry={entry} />
          ))}
        </ul>
      </Disclosure>

      {/*
        The null, stated rather than implied — and now the corrected version of it (§14.7).

        Each engine's mean R sits inside Engine Zero's band at its own sample size, and the full
        measurement says why: paired chart by chart against a coin flip on the *same* charts, no
        engine on this roster can be told apart from one (SPA p = 0.85). What beats Engine Zero is
        not trading, which every school here does most of the time — and which Geometry, firing on
        no chart at all, does perfectly. Without this line a 41% win rate reads as skill.

        The trial count is 10 against 8 rows on purpose: Sweep has been specified three times, and
        §14.9 counts both attempts we discarded. Saying "all 8" here would be the quiet undercount
        the whole manifest exists to prevent.

        On `text-ink-dim`, not `text-ink-faint`. `globals.css` reserves faint for "decorative and
        disabled ONLY. Never carries information." This is the most load-bearing sentence in the
        feature and it was below the contrast floor.
      */}
      <p className="text-ink-dim border-line-faint mt-4 border-t pt-3 text-xs leading-relaxed">
        Every conviction figure here is measured over{" "}
        {EDGE.charts.toLocaleString()} charts, and every one of them sits{" "}
        <strong className="text-ink-lo">inside a coin flip’s range</strong> at
        that engine’s own sample size. Corrected for all {EDGE.trials}{" "}
        specifications we have tried on this corpus — more than there are
        engines, because thresholds we replaced still count — and paired chart
        by chart against a coin flip on the same charts, no school here picks
        better than chance.{" "}
        <strong className="text-ink-lo">
          The only thing on this roster that beats a coin flip is not trading.
        </strong>{" "}
        Which is why nothing here is ranked, and why passing is scored.
      </p>
    </Panel>
  );
}
