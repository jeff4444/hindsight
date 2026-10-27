import { describe, expect, it } from 'vitest';
import { GLOSSARY } from '@/lib/glossary';
import { FEE_SCHEDULE, MARGIN, STARTING_BALANCE_USDT } from '@/core/trading/costs';
import { BOTS } from '@/core/bots/spec';

/**
 * The glossary quotes numbers in prose, because "0.10%" reads better than a template. Prose does
 * not update itself when a constant moves, so this does: change a fee or the leverage and the
 * definitions that state it fail here until they are rewritten to match.
 */
describe('the glossary says what the simulator charges', () => {
  const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

  it('fees', () => {
    expect(GLOSSARY.maker.body).toContain(pct(FEE_SCHEDULE.makerBps));
    expect(GLOSSARY.taker.body).toContain(pct(FEE_SCHEDULE.takerBps));
  });

  it('margin and liquidation', () => {
    expect(GLOSSARY.buyingPower.body).toContain(`${MARGIN.maxGrossLeverage}×`);
    expect(GLOSSARY.liquidation.body).toContain(`${MARGIN.maintenanceRatio * 100}%`);
    expect(GLOSSARY.liquidation.body).toContain(`${MARGIN.liquidationFeeBps / 100}% fee`);
  });

  it('the starting balance', () => {
    const balance = `$${STARTING_BALANCE_USDT.toLocaleString('en-US')}`;
    expect(GLOSSARY.equity.body).toContain(balance);
    expect(GLOSSARY.schools.body).toContain(balance);
  });

  it('how many schools there are', () => {
    // "Seven trading systems … plus a coin flip": every bot but the null.
    expect(BOTS.filter((bot) => bot.code !== 'ZERO')).toHaveLength(7);
    expect(GLOSSARY.schools.body).toMatch(/^Seven /);
  });
});

describe('the glossary speaks trading, not the game it replaced', () => {
  it('has no R-multiples, scores, pars or ratings', () => {
    for (const [id, term] of Object.entries(GLOSSARY)) {
      const text = `${term.label} ${term.body}`;
      expect(text, id).not.toMatch(/\b\d*(?:\.\d+)?R\b|\bpar\b|\bscore\b|\brating\b|\bdivision\b|\bsit out\b/i);
    }
  });
});
