/**
 * Where a round lives.
 *
 * The round screen talks to a `GameDriver` and does not know which one. `RemoteDriver` is the real
 * thing: the server deals the tape, holds it until the round is locked in, and stores the result.
 * `LocalDriver` deals synthetic markets in the browser and settles them with the very same
 * `round-core.ts` — it is what `/demo` uses, and the only way to play a round without a database.
 */

import { demoMarket } from '@/core/trading/demo';
import type { Market } from '@/core/trading/market';
import { dealable } from '@/core/game';
import { intentOrder, playedView, readingView, settleRound, type RoundMeta } from './round-core';
import type { DuelView, RoundIntent, RoundPlayed, RoundReading, RoundView } from './types';

export interface GameDriver {
  /** Deal a training round. */
  deal(): Promise<RoundReading>;
  round(roundId: string): Promise<RoundView>;
  lock(roundId: string, intent: RoundIntent): Promise<RoundPlayed>;
}

export class GameError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || body === null) {
    throw new GameError(body?.error ?? `The request failed (${response.status}).`, response.status);
  }
  return body;
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const RemoteDriver: GameDriver = {
  async deal() {
    return json<RoundReading>(await post('/api/game/rounds', { mode: 'training' }));
  },
  async round(roundId) {
    return json<RoundView>(await fetch(`/api/game/rounds/${encodeURIComponent(roundId)}`, { cache: 'no-store' }));
  },
  async lock(roundId, intent) {
    return json<RoundPlayed>(await post(`/api/game/rounds/${encodeURIComponent(roundId)}`, { intent }));
  },
};

/** Duels only exist on the server. */
export const DuelClient = {
  async create(request: { kind: 'player' } | { kind: 'school'; school: string }): Promise<DuelView> {
    return json<DuelView>(await post('/api/game/duels', request));
  },
  async get(code: string): Promise<DuelView> {
    return json<DuelView>(await fetch(`/api/game/duels/${encodeURIComponent(code)}`, { cache: 'no-store' }));
  },
  async join(code: string): Promise<DuelView> {
    return json<DuelView>(await post(`/api/game/duels/${encodeURIComponent(code)}`, { action: 'join' }));
  },
  /** The round for the tape you play next, dealt if it is not yet. */
  async play(code: string): Promise<{ roundId: string }> {
    return json<{ roundId: string }>(await post(`/api/game/duels/${encodeURIComponent(code)}`, { action: 'play' }));
  },
};

/* ------------------------------------------------------------------ local */

interface LocalRound {
  meta: RoundMeta;
  market: Market;
  intent: RoundIntent | null;
}

/** Training rounds on synthetic markets, in memory, until the page is reloaded. */
export class LocalDriver implements GameDriver {
  private rounds = new Map<string, LocalRound>();
  private next: number;

  constructor(seed: number = 7) {
    this.next = seed;
  }

  async deal(): Promise<RoundReading> {
    let market = demoMarket(this.next++);
    for (let tries = 0; tries < 50 && !dealable(market); tries++) market = demoMarket(this.next++);
    const meta: RoundMeta = { roundId: `demo-${this.next - 1}`, mode: 'training', duel: null, synthetic: true };
    this.rounds.set(meta.roundId, { meta, market, intent: null });
    return readingView(meta, market);
  }

  async round(roundId: string): Promise<RoundView> {
    const round = this.get(roundId);
    return round.intent === null
      ? readingView(round.meta, round.market)
      : playedView(round.meta, round.market, settleRound(round.market, round.intent));
  }

  async lock(roundId: string, intent: RoundIntent): Promise<RoundPlayed> {
    const round = this.get(roundId);
    if (round.intent !== null) throw new GameError('This round is already locked in.', 409);
    const parsed = intentOrder(round.market, intent);
    if ('error' in parsed) throw new GameError(parsed.error, 400);
    round.intent = intent;
    return playedView(round.meta, round.market, settleRound(round.market, intent));
  }

  private get(roundId: string): LocalRound {
    const round = this.rounds.get(roundId);
    if (!round) throw new GameError('No such round.', 404);
    return round;
  }
}
