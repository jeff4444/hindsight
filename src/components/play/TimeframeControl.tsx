'use client';

import { Select } from '../ui/client';
import { Chip, Segmented } from '../ui';
import { DECISION_TF, TIMEFRAMES } from '@/lib/timeframe';

/**
 * The drawing resolution.
 *
 * It changes what is drawn and nothing else — not the entry, not the ATR, not the sixty candles
 * the trade has to resolve in. The hour is the decision timeframe and stays the decision timeframe
 * whatever this says, which is why any value other than 1h is coloured `restraint`: it is a
 * control sitting away from its default, not a different game.
 *
 * This replaces a raw `<select>` with a `text-[0.5rem]` unicode triangle beside it — the one
 * unstyled form control left in the product. The engine is still a native `<select>` below `lg`,
 * because on a phone that opens the system picker and nothing hand-written beats it; above `lg`
 * there is room for all six tiers as a segmented control, which removes a click from the most
 * repeated action on the screen.
 */
export function TimeframeControl({
  timeframe,
  onTimeframe,
  allowed,
  tierCode,
}: {
  timeframe: number;
  onTimeframe: (minutes: number) => void;
  /** Minutes-per-candle the ruleset permits. One entry means this is a label, not a choice. */
  allowed: number[];
  tierCode: string;
}) {
  const options = TIMEFRAMES.filter((t) => allowed.includes(t.minutes));

  // §3.2's "one timeframe". Shown rather than hidden: a player should be able to see what the
  // ruleset took away, which is the whole legibility argument behind the ladder.
  if (options.length <= 1) {
    return (
      <Chip mono title={`${tierCode} grants one timeframe`}>
        {options[0]?.label ?? '1h'}
      </Chip>
    );
  }

  /**
   * Each engine is hidden by a *wrapper*, not by a class handed to the component.
   *
   * `Segmented` sets `inline-flex` on itself, so passing it `hidden lg:inline-flex` put two
   * `display` utilities on one element — and which of them wins is decided by their order in the
   * generated stylesheet, not by their order in the class attribute. `inline-flex` won, so on a
   * phone the resolution control rendered **twice**: a segmented row of tiers and, directly beside
   * it, the native picker that was supposed to replace it.
   *
   * A wrapper cannot lose that argument, because the class it carries is the only `display` on it.
   */
  return (
    <>
      <span className="hidden lg:inline-flex">
        <Segmented
          options={options.map((t) => ({
            value: t.minutes,
            label: t.label,
            title: t.minutes === DECISION_TF ? 'The decision timeframe' : `Draw ${t.label} candles`,
          }))}
          value={timeframe}
          onChange={onTimeframe}
        />
      </span>
      <span className="contents lg:hidden">
        <Select
          label="Chart resolution"
          value={timeframe}
          options={options.map((t) => ({
            value: t.minutes,
            label: t.minutes === DECISION_TF ? `${t.label} · decision` : t.label,
          }))}
          onChange={onTimeframe}
          tone={timeframe === DECISION_TF ? 'neutral' : 'restraint'}
        />
      </span>
    </>
  );
}
