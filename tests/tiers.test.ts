import { describe, expect, it } from 'vitest';
import {
  EXCLUDED_TOOLS,
  MODS,
  TIERS,
  TOOLS,
  UNIVERSAL_AFFORDANCES,
  affordances,
  loadoutCode,
  tierByCode,
  xpMultiplier,
  XP_CAP,
} from '@/core/tiers';

/**
 * §3's legitimacy claim is a property, so it is tested like one.
 *
 * > The tiers are strictly nested — each is a subset of the affordances of the one above, nothing
 * > is added back — which is why the ladder reads as legitimate rather than arbitrary. There is an
 * > unambiguous information ordering, so "harder" is a fact rather than an opinion.
 *
 * If a future rung grants something the rung above it does not, this file fails and the ladder has
 * stopped being a ladder. That is the whole point of writing it down.
 */
describe('the ladder is strictly nested (§3)', () => {
  const pairs = TIERS.slice(0, -1).map((above, i) => [above, TIERS[i + 1]] as const);

  it.each(pairs.map(([a, b]) => [a.code, b.code] as const))(
    '%s grants everything %s does, and never less',
    (aboveCode, belowCode) => {
      const above = tierByCode(aboveCode)!;
      const below = tierByCode(belowCode)!;

      expect(below.candles).toBeLessThanOrEqual(above.candles);
      expect(below.timeframes.length).toBeLessThanOrEqual(above.timeframes.length);
      // Every timeframe the lower rung offers must also be offered by the higher one — a subset,
      // not merely a smaller count.
      for (const tf of below.timeframes) expect(above.timeframes).toContain(tf);

      if (below.volume) expect(above.volume).toBe(true);
      if (below.detail) expect(above.detail).toBe(true);

      // A clock is a restriction, so an unlimited rung may not sit below a timed one.
      if (above.clockSeconds !== null) expect(below.clockSeconds).not.toBeNull();
      if (below.clockSeconds !== null && above.clockSeconds !== null) {
        expect(below.clockSeconds).toBeLessThanOrEqual(above.clockSeconds);
      }
    },
  );

  it('pays more the more it takes away', () => {
    const rated = TIERS.filter((tier) => tier.rated);
    for (let i = 1; i < rated.length; i++) {
      expect(rated[i].xp).toBeGreaterThan(rated[i - 1].xp);
    }
  });
});

describe('risk arithmetic survives every rung (§3.1)', () => {
  // "Hiding it does not test skill; it randomises the result and compresses the gap between expert
  // and novice, which is the textbook definition of artificial difficulty."
  it.each(TIERS.map((tier) => tier.code))('%s keeps the axis, the badge and the tick', (code) => {
    const granted = affordances(tierByCode(code)!);
    for (const affordance of UNIVERSAL_AFFORDANCES) {
      expect(granted[affordance]).toBe(true);
    }
  });

  it('only an opt-in mod may remove the price axis, and it keeps the ATR badge', () => {
    // §3.3's Blind Scale is the single exception, and it is a choice rather than a rung — which is
    // what makes it admissible at all.
    const blind = affordances(tierByCode('NTZ')!, ['BLIND']);
    expect(blind.priceAxis).toBe(false);
    expect(blind.atrBadge).toBe(true);
  });
});

describe('the rungs that shipped', () => {
  it('is Sandbox, Full Desk, NT, NTZ and NTVZ — News Blind is deleted, not deferred', () => {
    // Phase 1.5 deferred FD and NN together, because FD was defined entirely by pre-trade news
    // headlines and NN as "Full Desk except the headlines" — one ruleset wearing two names.
    //
    // News is out of the plan. With no headlines to withhold, Full Desk *is* News Blind, so there
    // is one rung rather than two and it ships. NN is gone rather than pending, and this assertion
    // is where someone hunting for a missing rung will land.
    expect(TIERS.map((tier) => tier.code)).toEqual(['SBX', 'FD', 'NT', 'NTZ', 'NTVZ']);
    expect(TIERS.map((tier) => tier.code)).not.toContain('NN');
  });

  it('rates everything except the sandbox (§3.2)', () => {
    expect(tierByCode('SBX')!.rated).toBe(false);
    expect(tierByCode('SBX')!.xp).toBe(0);
    for (const code of ['FD', 'NT', 'NTZ', 'NTVZ'] as const) {
      expect(tierByCode(code)!.rated).toBe(true);
    }
  });

  it('gives the toolbox to Sandbox and Full Desk, and to nothing that calls itself No Tools', () => {
    expect(tierByCode('FD')!.tools.length).toBeGreaterThan(10);
    expect(tierByCode('SBX')!.tools.length).toBeGreaterThanOrEqual(tierByCode('FD')!.tools.length);
    for (const code of ['NT', 'NTZ', 'NTVZ'] as const) {
      expect(tierByCode(code)!.tools).toEqual([]);
    }
  });

  it('keeps the stop-placement algorithms off every rated rung', () => {
    // Chandelier, Supertrend and Parabolic SAR are literally stop-placement algorithms, and the
    // skill this product measures is placing a stop. Showing one on a rated rung is showing the
    // answer key. Sandbox is unrated and explicitly "the learning surface, not a tier".
    expect(tierByCode('SBX')!.tools).toContain('stopAlgos');
    for (const tier of TIERS.filter((t) => t.rated)) {
      expect(tier.tools, `${tier.code} must not grant stop algorithms`).not.toContain('stopAlgos');
    }
  });

  it('ships the one-minute detail to the sandbox and nowhere else', () => {
    // The only enforceable timeframe restriction: a client holding the detail can draw 1m whatever
    // the picker offers.
    expect(TIERS.filter((tier) => tier.detail).map((tier) => tier.code)).toEqual(['SBX']);
  });

  it('makes Naked the ranked standard shape §3.2 describes', () => {
    const ntz = tierByCode('NTZ')!;
    expect(ntz.candles).toBe(80);
    expect(ntz.timeframes).toEqual([60]);
    expect(ntz.volume).toBe(true);
    expect(ntz.clockSeconds).toBe(90);
  });
});

describe('mods', () => {
  it('does not include Mirror', () => {
    // §3.3's table says 1.05x; its own pull-quote says "permanent in ranked, not optional";
    // §12.2 lists it as a baseline identity defence; and the corpus has baked it into stored
    // prices since Phase 0. The table row lost three to one.
    expect(MODS.map((mod) => mod.code)).not.toContain('MIRROR');
  });

  it('widens history rather than narrowing it', () => {
    const wide = affordances(tierByCode('NTZ')!, ['WIDE']);
    expect(wide.candles).toBe(250);
    // A reduction mod pays less, per §3.3.
    expect(xpMultiplier(tierByCode('NTZ')!, ['WIDE'])).toBeLessThan(tierByCode('NTZ')!.xp);
  });

  it('takes the pass away under Iron and hands rails over under Assist', () => {
    expect(affordances(tierByCode('NTZ')!, ['IRON']).mayPass).toBe(false);
    expect(affordances(tierByCode('NTZ')!, ['ASSIST']).assistRails).toBe(true);
    expect(affordances(tierByCode('NTZ')!, ['SILENT']).revealIdentity).toBe(false);
  });

  it('caps the composed multiplier so three conservative factors cannot stack into one that is not', () => {
    const stacked = xpMultiplier(tierByCode('NTVZ')!, ['BLIND', 'SILENT', 'IRON']);
    expect(stacked).toBeLessThanOrEqual(XP_CAP);
  });
});

describe('the share-card loadout (§10.4)', () => {
  it('reads the way the document writes it', () => {
    expect(loadoutCode('NTZ')).toBe('NTZ');
    expect(loadoutCode('NTZ', ['IRON'])).toBe('NTZ+Iron');
  });

  it('orders mods canonically, so one loadout is always one string', () => {
    expect(loadoutCode('NTZ', ['IRON', 'BLIND'])).toBe(loadoutCode('NTZ', ['BLIND', 'IRON']));
  });

  it('cannot collide with the leak assertions the card is already held to', () => {
    // tests/share.test.ts forbids a four-digit year and the words long/short anywhere on the card.
    for (const mod of MODS) {
      expect(mod.code).not.toMatch(/20\d\d/);
      expect(mod.name.toLowerCase()).not.toMatch(/long|short/);
    }
  });
});

/**
 * `TOOLS` and `EXCLUDED_TOOLS` used to be data nothing rendered. The studies panel now prints both
 * — the effect line under every switch, and the excluded list under "Not here, and why" — which
 * turns them from internal notes into product copy, and they were not written as product copy.
 *
 * Two things leaked on the first render: a `§12.2` citation in the reason a session VWAP is absent,
 * and "see the note in this file" under the stop algorithms, addressed to a reader who has the
 * source open. Both read as a draft that escaped.
 */
describe('the tool copy is written for a player', () => {
  const strings = [
    ...TOOLS.map((t) => ({ where: `TOOLS.${t.code}.effect`, text: t.effect })),
    ...TOOLS.map((t) => ({ where: `TOOLS.${t.code}.name`, text: t.name })),
    ...EXCLUDED_TOOLS.map((t) => ({ where: `EXCLUDED_TOOLS.${t.name}.reason`, text: t.reason })),
  ];

  it('cites no section numbers', () => {
    expect(strings.filter((s) => /§/.test(s.text)).map((s) => s.where)).toEqual([]);
  });

  it('never addresses the reader as someone reading the source', () => {
    const offenders = strings.filter((s) =>
      /\bthis file\b|\bsee above\b|\bsee below\b|\bTODO\b|\bFIXME\b/i.test(s.text),
    );
    expect(offenders.map((s) => s.where)).toEqual([]);
  });

  it('ends every explanation as a sentence', () => {
    // The effect line sits directly under a label in the panel; a fragment without a stop reads as
    // a truncation rather than a choice.
    const offenders = strings
      .filter((s) => s.where.endsWith('.effect') || s.where.endsWith('.reason'))
      .filter((s) => !/[.!?]$/.test(s.text.trim()));
    expect(offenders.map((s) => s.where)).toEqual([]);
  });
});
