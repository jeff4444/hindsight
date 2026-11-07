"use client";

import {
  EXCLUDED_TOOLS,
  TOOLS,
  grantingTier,
  type ToolCode,
} from "@/core/tiers";
import {
  TOOL_COLOUR,
  clampPeriod,
  type StudySettings,
} from "@/lib/toolOverlays";
import { overlayInk } from "@/lib/palette";
import {
  Alert,
  Button,
  Chip,
  Disclosure,
  Divider,
  Eyebrow,
  Toggle,
  cx,
} from "../ui";
import { Dialog, useThemeSnapshot } from "../ui/client";
import { Icon } from "../ui/icons";

/**
 * The studies.
 *
 * Everything that draws *onto* the chart and stays there: the indicators, the two overlays, and
 * Sandbox's stop algorithms. They are switches — any number on at once — which is a different thing
 * from the instruments' pick-one, and the toolbar this replaces rendered both as the same chip.
 *
 * Nine of them in a row of text labels was also simply too many things to put on the one screen a
 * player looks at for sixty seconds under a clock. Behind a button with a count, the chart keeps
 * its width and the studies get room to explain themselves.
 *
 * ## Why the formulas are printed here
 *
 * §11.4 spends a table on this: TA-Lib and TradingView disagree on weekly BTCUSDT ATR(7) by 12% —
 * 998.11 against 891.05 — for a formula published in a book in 1978. Its conclusion is that "a
 * player who reads an RSI of 71 and places a stop on it is entitled to know which RSI". The
 * codebase honoured that in `src/core/indicators.ts` and the interface did not mention it anywhere.
 * Each study now carries the choice it makes, in the panel where you switch it on.
 *
 * ## And why the excluded tools are printed here
 *
 * `EXCLUDED_TOOLS` is the best argument in the codebase — repainting indicators "plot values
 * backward in time, creating false historical impressions"; Renko and Heikin Ashi "destroy time and
 * invent prices" — and until now nothing rendered it. A player who wants ZigZag deserves the
 * reason, and the reason is the product's whole thesis. Absence explained is a feature; absence
 * unexplained is an oversight.
 */

/** The published choice each study makes, where two respectable implementations differ. */
const FORMULA: Partial<Record<ToolCode, string>> = {
  ma: "Exponential, seeded on the SMA of the first n values — nothing emitted before.",
  bollinger:
    "Population standard deviation, divisor n. The sample divisor is ~12% wider.",
  keltner:
    "EMA of close, banded by Wilder-smoothed ATR — the same ATR the badge uses.",
  donchian:
    'The current bar counts, so "price is at the top of its range" is true when it is.',
  rsi: "Wilder's smoothing, α = 1/n. A flat series returns nothing rather than an invented 50.",
  macd: "The signal EMA is seeded on the first nine defined MACD values, not on zeros.",
  volumeProfile:
    "Built from the stored one-minute bars, so it is a real profile or none at all.",
  geometry:
    "Layer 2, computed causally: graded swings, hull trendlines, the channel, the levels.",
  stopAlgos:
    "Chandelier, Supertrend and Parabolic SAR — causal, and shown only where nothing is at stake.",
};

/** Which settings key a study reads, for the ones that take a period. */
const PERIOD: Partial<Record<ToolCode, keyof StudySettings>> = {
  bollinger: "bollinger",
  keltner: "keltner",
  donchian: "donchian",
  rsi: "rsi",
};

/** The swatch a study draws in, so the row and the chart are obviously the same thing. */
const SWATCH: Partial<Record<ToolCode, string>> = {
  ma: TOOL_COLOUR.ma[0],
  bollinger: TOOL_COLOUR.band,
  keltner: TOOL_COLOUR.band,
  donchian: TOOL_COLOUR.donchian,
  volumeProfile: TOOL_COLOUR.poc,
  geometry: TOOL_COLOUR.channel,
  rsi: TOOL_COLOUR.oscillator,
  macd: TOOL_COLOUR.oscillator,
  stopAlgos: TOOL_COLOUR.stop,
};

const GROUPS: { kind: "indicator" | "overlay"; title: string; note: string }[] =
  [
    {
      kind: "indicator",
      title: "Indicators",
      note: "Drawn from the candles already on screen.",
    },
    {
      kind: "overlay",
      title: "Overlays",
      note: "Structure the chart already contains, made visible.",
    },
  ];

/** A period input. Small, mono, and clamped on the way out rather than validated on the way in. */
function Period({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={2}
        max={400}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clampPeriod(Number(event.target.value)))}
        className={cx(
          "bg-surface-1 border-line text-ink focus:border-focus h-7 w-14 rounded-md border",
          "px-1.5 text-center font-mono text-xs transition-colors outline-none",
          "disabled:opacity-45",
        )}
      />
    </label>
  );
}

export function StudiesPanel({
  open,
  onClose,
  granted,
  active,
  onToggle,
  settings,
  onSettings,
  onResetSettings,
}: {
  open: boolean;
  onClose: () => void;
  granted: readonly ToolCode[];
  active: readonly ToolCode[];
  onToggle: (tool: ToolCode) => void;
  settings: StudySettings;
  onSettings: (next: Partial<StudySettings>) => void;
  onResetSettings: () => void;
}) {
  const { theme } = useThemeSnapshot();
  const studies = TOOLS.filter(
    (t) => t.kind === "indicator" || t.kind === "overlay",
  );
  const anyGranted = studies.some((t) => granted.includes(t.code));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Studies"
      description="Anything drawn onto the chart. Switch on as many as you like."
      placement="bottom"
      size="lg"
    >
      {!anyGranted && (
        <Alert
          tone="info"
          icon="lock"
          title="This ruleset has no studies"
          className="mb-5"
        >
          Every one of them is listed below with the rung that grants it. Naked
          and Blackout are meant to be read without them — that is the whole
          point of those rungs.
        </Alert>
      )}

      {GROUPS.map((group) => {
        const rows = studies.filter((t) => t.kind === group.kind);
        if (rows.length === 0) return null;
        return (
          <section key={group.kind} className="mb-6 last:mb-0">
            <Eyebrow>{group.title}</Eyebrow>
            <p className="text-ink-dim mt-1 mb-2 text-xs">{group.note}</p>

            <div className="flex flex-col gap-0.5">
              {rows.map((study) => {
                const locked = !granted.includes(study.code);
                const rung = locked ? grantingTier(study.code) : null;
                const on = active.includes(study.code);
                const periodKey = PERIOD[study.code];
                const sandboxOnly = study.code === "stopAlgos";

                return (
                  <div key={study.code} className="flex items-center gap-2">
                    <Toggle
                      on={on && !locked}
                      disabled={locked}
                      onChange={() => onToggle(study.code)}
                      swatch={SWATCH[study.code] && overlayInk(SWATCH[study.code]!, theme)}
                      label={
                        <>
                          {study.name}
                          {/* Only where it is actually available — when it is locked the rung
                              badge below already says Sandbox, and saying it twice reads as a
                              template rather than a sentence. */}
                          {sandboxOnly && !locked && (
                            <Chip tone="restraint" size="sm">
                              Unrated
                            </Chip>
                          )}
                          {locked && rung && (
                            <span className="text-ink-dim inline-flex items-center gap-1 text-xs font-normal">
                              <Icon name="lock" size={11} />
                              {rung.name}
                            </span>
                          )}
                        </>
                      }
                      hint={
                        <>
                          {study.effect}
                          {FORMULA[study.code] && (
                            <span className="text-ink-dim mt-0.5 block">
                              {FORMULA[study.code]}
                            </span>
                          )}
                        </>
                      }
                    />

                    {/* The lengths §11.4 promised and the toolbox never offered. */}
                    {!locked && study.code === "ma" && (
                      <span className="flex shrink-0 items-center gap-1">
                        {settings.ma.map((length, i) => (
                          <Period
                            key={i}
                            label={`Moving average ${i + 1} length`}
                            value={length}
                            onChange={(next) => {
                              const ma = [
                                ...settings.ma,
                              ] as StudySettings["ma"];
                              ma[i] = next;
                              onSettings({ ma });
                            }}
                          />
                        ))}
                      </span>
                    )}
                    {!locked && periodKey && (
                      <Period
                        label={`${study.name} period`}
                        value={settings[periodKey] as number}
                        onChange={(next) =>
                          onSettings({
                            [periodKey]: next,
                          } as Partial<StudySettings>)
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <Divider className="my-5" />

      {/* §11.4's exclusions, which have been data in `tiers.ts` and read by nothing. */}
      <Disclosure label="Not here, and why">
        <ul className="mt-3 flex flex-col gap-3">
          {EXCLUDED_TOOLS.map((excluded) => (
            <li key={excluded.name}>
              <p className="text-ink-lo text-sm font-medium">{excluded.name}</p>
              <p className="text-ink-dim mt-0.5 text-xs leading-relaxed">
                {excluded.reason}
              </p>
            </li>
          ))}
        </ul>
      </Disclosure>

      <div className="mt-5 flex justify-end">
        <Button variant="ghost" size="sm" onClick={onResetSettings}>
          Reset lengths
        </Button>
      </div>
    </Dialog>
  );
}
