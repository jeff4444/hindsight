-- The extra history the No Tools tier reads. Applied via the connector; kept here so a fresh
-- project is reproducible from the repo.
--
-- §3.2 grants NT "300 candles, three timeframes"; the corpus stores 80. This is additive rather
-- than a regeneration, and the reason it can be is a rule that had to be settled first:
--
--   **ATR(14) is computed over the final 80 lead-in bars, at every tier, forever.**
--
-- If ATR followed the visible candles instead, the same chart would show a different ATR at NT and
-- at NTZ, their 98-cell grids would be scaled differently, and percentiles would stop being
-- comparable across tiers — which breaks §3.5's "run both tiers on the same charts" and §8.1's
-- chart-and-tier rating at the same time. With ATR pinned, nothing derived changes: entry_price,
-- atr14, resolution_path, detail_path, achievable_r, par_r, oracle_r and pass_percentile are all
-- untouched, and no stored percentile is invalidated. Verified: after the backfill, `npm run
-- verify` reproduced all 33 stored rounds with zero mismatches.
--
-- Minute detail is deliberately NOT extended. No shipping tier grants a sub-hour timeframe outside
-- the unrated Sandbox, so detail_path stays its current size and the payload does not grow.

alter table public.charts
  add column if not exists lead_in_extra jsonb,
  add column if not exists lead_in_extra_bars smallint not null default 0;

comment on column public.charts.lead_in_extra is
  'The 220 display candles immediately before lead_in_bars, same index_factor and mirrored flag. '
  'Null where the instrument had no such contiguous history — those charts are not served at NT.';

create index if not exists charts_extended_idx
  on public.charts (id)
  where lead_in_extra is not null and achievable_version is not null;
