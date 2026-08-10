/**
 * The Phase 0 corpus universe.
 *
 * Scope §13.1 puts crypto first, and the reasons are specific: free bulk archives, one-minute
 * bars that give the intrabar resolver for free, delisted symbols retained, and 24/7 trading
 * so there are no session gaps to model.
 *
 * §13.3 is emphatic on one point that is easy to get wrong: "Include delisted and failed
 * instruments. Sampling from survivors bakes a long bias into every statistic in the product."
 * That is why the second block below exists. Every one of those pairs is gone from Binance
 * spot today, and every one of them is a window in which the correct trade was short.
 */

export interface Symbol {
  name: string;
  /** Free-text note on why the symbol is in the universe. Never shown to a player. */
  note: string;
}

/** Still listed. Deep, liquid, and spanning several market regimes. */
export const LISTED: Symbol[] = [
  { name: 'BTCUSDT', note: 'the reference instrument' },
  { name: 'ETHUSDT', note: 'second by liquidity' },
  { name: 'BNBUSDT', note: 'exchange token, idiosyncratic' },
  { name: 'XRPUSDT', note: 'long ranges punctuated by litigation news' },
  { name: 'ADAUSDT', note: 'high beta large cap' },
  { name: 'SOLUSDT', note: 'full collapse and recovery cycle' },
  { name: 'DOGEUSDT', note: 'reflexive, news-driven spikes' },
  { name: 'AVAXUSDT', note: 'high beta' },
  { name: 'LINKUSDT', note: 'long basing periods' },
  { name: 'DOTUSDT', note: 'sustained downtrend after listing' },
  { name: 'LTCUSDT', note: 'lower volatility, more chop' },
  { name: 'ATOMUSDT', note: 'persistent downtrend' },
  { name: 'NEARUSDT', note: 'high beta' },
  { name: 'FILUSDT', note: 'violent listing-era volatility' },
  { name: 'TRXUSDT', note: 'unusually low volatility for the class' },
];

/**
 * Delisted or failed. These are the survivorship correction and they are not optional.
 *
 * A corpus of currently listed instruments is a corpus of things that did not go to zero, and
 * §6 Layer 0 spells out the consequence: "every chart is a survivor, charts drift upward,
 * longs are systematically rewarded, and the leaderboard develops a long bias."
 */
export const DELISTED: Symbol[] = [
  { name: 'LUNAUSDT', note: 'Terra collapse, May 2022 — near-total loss in days' },
  { name: 'USTUSDT', note: 'the depeg itself' },
  { name: 'FTTUSDT', note: 'FTX collapse, November 2022' },
  { name: 'SRMUSDT', note: 'collapsed alongside FTX' },
  { name: 'WAVESUSDT', note: 'delisted 2024 after a long decline' },
];

export const UNIVERSE: Symbol[] = [...LISTED, ...DELISTED];

export const SYMBOL_NAMES = UNIVERSE.map((s) => s.name);

/**
 * Months to download, by mechanical rule rather than by hand: the first month of each quarter
 * from 2020 through 2025.
 *
 * §13.3 asks for stratification by published rule rather than hand-picking, because
 * "hand-curation changes the difficulty distribution non-randomly and invalidates every
 * population statistic computed on it." Picking the interesting months — the crash, the
 * squeeze — would be exactly that mistake. A fixed quarterly stride is dull on purpose.
 *
 * Windows are sliced inside a month and never across two, so non-adjacent months cost nothing.
 * A 720-hour month yields five 140-bar windows; 24 months across 20 symbols is roughly 2400
 * candidates before filtering, against a target of 1000.
 */
export const MONTHS: string[] = (() => {
  const months: string[] = [];
  for (let year = 2020; year <= 2025; year++) {
    for (const month of ['01', '04', '07', '10']) {
      months.push(`${year}-${month}`);
    }
  }
  return months;
})();

/** Charts to retain in the corpus. */
export const CORPUS_TARGET = 1000;

/** Master seed for every random choice in the pipeline. Published so the corpus is repeatable. */
export const MASTER_SEED = 0x48494e44; // 'HIND'
