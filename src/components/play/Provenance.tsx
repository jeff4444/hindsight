"use client";

import type { ChartProvenance } from "@/lib/api-types";
import { Chip, Eyebrow } from "../ui";
import { Tooltip } from "../ui/client";

/**
 * What the chart actually was.
 *
 * Released only with the reveal, never at issuance — §12.2 hides identity so a chart cannot be
 * looked up *before* the decision. It is the punchline of the debrief and it arrives last, on its
 * own beat, because "this was BTCUSDT on a Friday in April 2021" lands differently when it is not
 * competing with a percentile for the same moment.
 *
 * Extracted from `ResultConsole` when the result moved into a rail. That component rendered
 * nothing anybody could reach any more, and keeping four hundred lines of it alive as a home for
 * this one export is how dead code survives a refactor.
 */
export function Provenance({ provenance }: { provenance: ChartProvenance }) {
  return (
    <div className="border-line-faint mt-8 border-t pt-5">
      <Eyebrow>This was</Eyebrow>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="numeral text-ink-max text-lg font-semibold">
          {provenance.symbol}
        </span>
        <span className="numeral text-ink-lo text-sm">{provenance.venue}</span>
        <span className="numeral text-ink-lo text-sm">
          {formatMoment(provenance.decisionAt)}
        </span>
        <span className="numeral text-ink-dim text-sm">
          entry {formatPrice(provenance.entryPriceReal)}
        </span>

        {provenance.synthetic ? (
          <Chip tone="restraint" className="eyebrow">
            Synthetic
          </Chip>
        ) : (
          <Chip tone="long" className="eyebrow">
            Real price action
          </Chip>
        )}

        {provenance.mirrored && (
          <Tooltip label="The chart you read was flipped vertically, so it will not match the real one until you invert it.">
            <Chip tone="info" className="eyebrow">
              Mirrored
            </Chip>
          </Tooltip>
        )}
      </div>

      {provenance.synthetic ? (
        <p className="text-ink-lo mt-2.5 max-w-prose text-sm leading-relaxed">
          Not a real market.{" "}
          {provenance.sourceNote ?? "Generated as a control."} Your score on
          charts like this one is how the product measures whether chart reading
          is a skill at all.
        </p>
      ) : (
        <p className="text-ink-dim mt-2.5 max-w-prose text-sm leading-relaxed">
          Every candle above is real trading, exactly as it happened
          {provenance.mirrored
            ? " — flipped vertically so the shape could not be recognised"
            : ""}
          . Look it up.
        </p>
      )}
    </div>
  );
}

/** "Fri 16 Apr 2021, 08:00 UTC" — the real calendar moment, released only after the commit. */
function formatMoment(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}

/**
 * Prices in this corpus span nine orders of magnitude — a coin at 0.0000034 and BTC at 100,000
 * cannot share a format, so the number of decimals follows the size.
 */
function formatPrice(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
