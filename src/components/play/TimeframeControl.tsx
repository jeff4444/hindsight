'use client';

import { Select } from '../ui/client';
import { Segmented } from '../ui';
import { DISPLAY_TIER, TIERS } from '@/lib/resolution';

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
  tier,
  onTier,
}: {
  tier: number;
  onTier: (minutes: number) => void;
}) {
  const options = TIERS.map((t) => ({
    value: t.minutes,
    label: t.minutes === DISPLAY_TIER ? `${t.label} · decision` : t.label,
  }));

  return (
    <>
      <Segmented
        className="hidden lg:inline-flex"
        options={TIERS.map((t) => ({
          value: t.minutes,
          label: t.label,
          title: t.minutes === DISPLAY_TIER ? 'The decision timeframe' : `Draw ${t.label} candles`,
        }))}
        value={tier}
        onChange={onTier}
      />
      <Select
        className="lg:hidden"
        label="Chart resolution"
        value={tier}
        options={options}
        onChange={onTier}
        tone={tier === DISPLAY_TIER ? 'neutral' : 'restraint'}
      />
    </>
  );
}
