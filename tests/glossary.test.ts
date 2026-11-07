import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '@/lib/glossary';
import { FEE_SCHEDULE } from '@/core/trading/costs';
import { DUEL_HEALTH, DUEL_TAPES, MIN_MOVE, ROUND_STAKE_USDT, damage } from '@/core/game';

/**
 * The glossary quotes numbers in prose, because "$500" reads better than a template. Prose does
 * not update itself when a constant moves, so this does: change the stake, a fee or the damage
 * curve and the definitions that state it fail here until they are rewritten to match.
 */
describe('the glossary says what the game is played by', () => {
  const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

  it('fees', () => {
    expect(GLOSSARY.maker.body).toContain(pct(FEE_SCHEDULE.makerBps));
    expect(GLOSSARY.taker.body).toContain(pct(FEE_SCHEDULE.takerBps));
  });

  it('the stake and the minimum move', () => {
    expect(GLOSSARY.stake.body).toContain(`$${ROUND_STAKE_USDT}`);
    expect(GLOSSARY.tape.body).toContain(`${MIN_MOVE * 100}%`);
  });

  it('a duel and its damage', () => {
    expect(GLOSSARY.duel.body).toContain(`${DUEL_TAPES} tapes`);
    expect(GLOSSARY.duel.body).toContain(`${DUEL_HEALTH} points`);
    expect(GLOSSARY.damage.body).toContain(`a gap of 250 costs ${damage(0, 250)}`);
    expect(GLOSSARY.damage.body).toContain(`a gap of 750 costs ${damage(0, 750)}`);
  });
});

describe('the glossary speaks the game, not the platforms it replaced', () => {
  it('has no accounts, balances, margin or rankings', () => {
    for (const [id, term] of Object.entries(GLOSSARY)) {
      const text = `${term.label} ${term.body}`;
      expect(text, id).not.toMatch(/\bequity\b|buying power|\bmargin\b|portfolio|leaderboard|\$100,000|practice account|\b\d*(?:\.\d+)?R\b|\bpar\b|\brating\b|\bdivision\b/i);
    }
  });
});
