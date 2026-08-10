import 'server-only';
import { REVEAL_BARS } from '@/core/config';
import { fromPgHex, toBase64 } from '@/core/pack';
import { affordances, type Mod, type ModCode, type Tier } from '@/core/tiers';
import type { RoundPayload } from './api-types';

/**
 * Build the issuance payload for a tier.
 *
 * The projection that matters — the candle count and the detail path — already happened in
 * `issue_round`, because §12.1 requires it server-side and a restriction the client applies is not
 * a restriction. What is left here is telling the client which affordances it may draw, and
 * converting the clock from a deadline the server holds into a duration the client can count down.
 *
 * The clock is a duration on purpose. Sending a wall-clock deadline would let a client whose clock
 * runs fast or slow decide whether its own commit was late; sending a remaining-milliseconds figure
 * means the client shows a countdown and the server alone decides whether it expired.
 */
export function roundPayload(
  row: {
    round_id: string;
    lead_in_bars: unknown;
    atr14: number;
    tick_size: number;
    entry_price: number;
    start_dow: number;
    start_hour: number;
    lead_in_detail: string | null;
    expires_at: string | null;
  },
  tier: Tier,
  mods: readonly ModCode[] = [],
): RoundPayload {
  const granted = affordances(tier, mods);

  return {
    roundId: row.round_id,
    bars: row.lead_in_bars as RoundPayload['bars'],
    atr: row.atr14,
    tickSize: row.tick_size,
    entry: row.entry_price,
    revealBarCount: REVEAL_BARS,
    startDayOfWeek: row.start_dow,
    startHourUtc: row.start_hour,
    // Gated here as well as in `issue_round`. The SQL is what actually withholds it, but a
    // restriction enforced in exactly one place is one refactor away from not being enforced —
    // and this is the only thing stopping a client rendering one-minute candles at a tier that
    // grants a single timeframe.
    detail:
      granted.detail && row.lead_in_detail ? toBase64(fromPgHex(row.lead_in_detail)) : '',

    tier: tier.code,
    mods: [...mods],
    timeframes: granted.timeframes,
    volume: granted.volume,
    priceAxis: granted.priceAxis,
    mayPass: granted.mayPass,
    // Gated on the tier for the same reason as the detail: an untimed ruleset must not carry a
    // countdown even if a deadline somehow found its way onto the row.
    clockMs:
      granted.clockSeconds !== null && row.expires_at
        ? Math.max(0, Date.parse(row.expires_at) - Date.now())
        : null,
  };
}

/** Mods a request asked for, filtered to ones that exist. Unknown codes are ignored, not an error. */
export function parseMods(raw: string | null, catalogue: readonly Mod[]): ModCode[] {
  if (!raw) return [];
  const wanted = new Set(raw.split(',').map((code) => code.trim().toUpperCase()));
  return catalogue.filter((mod) => wanted.has(mod.code)).map((mod) => mod.code);
}
