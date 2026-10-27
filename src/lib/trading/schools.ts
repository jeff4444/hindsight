import { BOTS, BOT_PARAMS, type BotSpec } from '@/core/bots/spec';
import { PANEL, type Persona } from '@/lib/panel';

/**
 * Each school as a trader, in words: how it gets in, how it gets out, how much it risks.
 *
 * The entry is the school's published rule (the engine is unchanged); the exit and the sizing are
 * the bot layer's, pinned by `BOT_SPEC_HASH`. The page prints these so the account beside them can
 * be argued with.
 */

export interface School {
  spec: BotSpec;
  persona: Persona;
  entry: string;
  exit: string;
  sizing: string;
}

const EXIT: Record<string, string> = {
  CHANNEL: 'Trails its stop to the low of the last ten hours (the high, when short) — the Turtles’ own exit. No target.',
  REVERSION: 'Sells on the first close above the 5-hour average — Connors’ own exit. Stop 2 ATR away, ours.',
  REVERSION_H: 'Sells on the first close above the 5-hour average, like the Contrarian. Stop 2 ATR away, ours.',
  SWEEP: 'Rests a stop beyond the swept wick and a target at the nearest opposing swing; whichever trades first.',
  PATTERN: 'Rests a stop beyond the flag and a target at the measured move.',
  GEOMETRY: 'Rests a stop beyond X and a target at the 0.618 retracement of the pattern.',
  TAPE: 'Holds until the tape prints a signal against it — Williams’ own exit — with a stop beyond the signal bar.',
  ZERO: 'Rests a 2 ATR stop and a 2× target, then flips a coin again. Always in the market.',
};

export const SCHOOLS: School[] = BOTS.map((spec) => {
  const persona = PANEL.find((p) => p.engine === spec.code)!;
  return {
    spec,
    persona,
    entry: persona.style,
    exit: EXIT[spec.code] ?? 'Its bracket.',
    sizing: `Sizes every trade so the stop costs ${BOT_PARAMS.riskFraction * 100}% of equity, capped at 2× leverage. One position at a time.`,
  };
});

export function schoolBySlug(slug: string): School | null {
  return SCHOOLS.find((school) => school.spec.code.toLowerCase() === slug.toLowerCase()) ?? null;
}
