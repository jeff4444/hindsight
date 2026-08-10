'use client';

import { DISPLAY_TIER, TIERS } from '@/lib/resolution';
import { Chip, cx } from '../ui';

/**
 * What the player is allowed to know about the instrument before they trade it.
 *
 * Every item here is risk arithmetic or session structure. §3.1 draws the line: identity, hindsight
 * and crutches are restricted at every tier, but "a normalised price axis, a volatility badge, tick
 * size, and session boundaries where they exist" are preserved at every tier including the hardest
 * — because a player who does not know the instrument's typical range cannot place a stop that is
 * neither noise-adjacent nor absurd, and hiding it "randomises the result and compresses the gap
 * between expert and novice, which is the textbook definition of artificial difficulty".
 */
export function ChartMetaBar({
  atr,
  tickSize,
  clockLabel,
  weekend,
  tier,
  onTier,
}: {
  atr: number;
  tickSize: number;
  clockLabel: string;
  weekend: boolean;
  tier: number;
  onTier: (minutes: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* §3.1: volatility scale is never hidden, at any tier. */}
      <Chip tone="info" mono>
        1 ATR = {atr.toFixed(2)} units
      </Chip>

      {/*
       * Weekday and hour of the decision bar. Session and weekend structure is readable
       * information; the date it belongs to is not released (§12.2, src/lib/clock.ts).
       */}
      <Chip
        tone={weekend ? 'attention' : 'neutral'}
        mono
        title={weekend ? 'Weekend — thinner books' : 'Weekday'}
      >
        {clockLabel} UTC
      </Chip>

      <label className="relative flex items-center">
        <span className="sr-only">Chart resolution</span>
        <select
          value={tier}
          onChange={(event) => onTier(Number(event.target.value))}
          title={
            'Chart resolution. The hour is the decision timeframe: it fixes the entry, ' +
            'the ATR and how long the trade runs. Fills resolve on the 1-minute path ' +
            'whichever timeframe you pick.'
          }
          className={cx(
            'text-mini cursor-pointer appearance-none rounded py-1 pr-6 pl-2 font-mono ring-1 transition-colors',
            tier === DISPLAY_TIER
              ? 'bg-fill-2 text-ink ring-line hover:bg-fill-3'
              : 'bg-restraint-bg text-restraint-ink ring-restraint-line hover:brightness-115',
          )}
        >
          {TIERS.map((option) => (
            <option key={option.minutes} value={option.minutes} className="bg-surface-2">
              {option.label}
              {option.minutes === DISPLAY_TIER ? '  ·  decision' : ''}
            </option>
          ))}
        </select>
        <span className="text-ink-dim pointer-events-none absolute right-1.5 text-[0.5rem]">▼</span>
      </label>

      <Chip mono className="hidden sm:inline-flex">
        tick {tickSize}
      </Chip>
    </div>
  );
}
