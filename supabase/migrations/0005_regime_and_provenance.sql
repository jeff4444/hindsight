-- Regime tags and selection provenance on every chart.
--
-- §8.1 lists `regimeTags` as a field of a rated chart — "Efficiency ratio bucket and volatility
-- percentile" — and §12.4 requires engine performance to be reported per regime rather than in
-- aggregate: "A pattern library learned on a single enormous bull market is a library about that
-- bull market." Neither is possible unless the tag is stored with the chart that carries it.
--
-- `selection_version` is separate from `pipeline_version` because they invalidate different
-- things. A pipeline change alters how a chart was built. A selection change alters which charts
-- exist, and therefore every population statistic computed over the corpus. §12.4 does not allow
-- those to be compared across a change of rule, so each chart records the rule that admitted it.

alter table public.charts
  add column if not exists efficiency_ratio double precision,
  add column if not exists volatility_percentile double precision,
  add column if not exists regime_er_bucket text,
  add column if not exists regime_vol_bucket text,
  add column if not exists delisted boolean,
  add column if not exists symbol_last_month text,
  add column if not exists selection_version text;

alter table public.charts
  drop constraint if exists charts_er_bucket_check,
  drop constraint if exists charts_vol_bucket_check;

alter table public.charts
  add constraint charts_er_bucket_check
    check (regime_er_bucket is null or regime_er_bucket in ('chop', 'noise', 'directional', 'trend')),
  add constraint charts_vol_bucket_check
    check (regime_vol_bucket is null or regime_vol_bucket in ('quiet', 'subdued', 'active', 'violent'));

comment on column public.charts.efficiency_ratio is
  'Kaufman efficiency ratio over the lead-in closes. Bounded [0,1], computed on visible bars only.';
comment on column public.charts.volatility_percentile is
  'Where this instrument sat in its own trailing year of 7-day realised volatility, from daily closes strictly before the decision bar.';
comment on column public.charts.delisted is
  'The pair stopped trading before the archive frontier. Present so the corpus is survivorship-free (6 Layer 0) and so the share can be reported.';
comment on column public.charts.selection_version is
  'The published selection rule that admitted this chart. Population statistics are not comparable across a change of it (12.4).';

-- Stratified reporting is the main read pattern over these.
create index if not exists charts_regime_idx
  on public.charts (regime_er_bucket, regime_vol_bucket);
