-- Layer 1: the achievable set, stored per chart.
--
-- §13.2 puts this in the offline pipeline — the generator "runs the full council and the
-- achievable-set enumeration against each, and stores the finished chart". Computing it on demand
-- would work (98 resolutions is milliseconds) but storing it is what makes §6's second property
-- true: "the same chart yields the same distribution forever, which matters enormously when
-- leaderboards are involved."
--
-- Everything here is derived from the reveal path, so it is future data and travels under §12.1's
-- rule exactly like reveal_bars: never issued, released only after an order is committed.

alter table public.charts
  -- 98 R-multiples as interleaved Float32, in the canonical grid order.
  add column if not exists achievable_r bytea,
  -- 98 outcome codes, one byte each: 0 stop, 1 target, 2 timeout; high bit flags an ambiguous fill.
  add column if not exists achievable_outcome bytea,
  -- The best R any stop and target pair could have produced on this path (§4.2).
  add column if not exists oracle_r double precision,
  -- The distribution's median. §8.1 calls this parR; negative means passing was the right play.
  add column if not exists par_r double precision,
  -- The percentile a pass scores here, precomputed because every result needs it (§4.4).
  add column if not exists pass_percentile double precision,
  add column if not exists achievable_version text;

comment on column public.charts.achievable_r is
  'The 98-cell achievable distribution (4.2), Float32. Future data - never issued before an order is committed.';
comment on column public.charts.oracle_r is
  'Best R achievable by any stop/target pair on this path. Efficiency is realised R over this.';
comment on column public.charts.par_r is
  'Median of the achievable distribution (8.1 parR). Negative means restraint outscores most entries.';

-- The Null Set map (§11.1) is exactly the charts where par_r is negative, and reporting the
-- share of them is one of this phase's checks.
create index if not exists charts_par_r_idx on public.charts (par_r);
