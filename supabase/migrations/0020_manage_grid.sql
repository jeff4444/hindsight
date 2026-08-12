-- §10.1's Manage ladder: its own achievable set, because it cannot share Naked's.
--
-- `docs/phase-5-research.md` §1.2 has the measurement that forced this. Both grids net of costs,
-- over the same 250 charts:
--
--     grid      oracle    par (median cell)
--     bracket    4.38R      -0.880R
--     manage     4.67R      -0.458R
--
-- Par is 0.42R apart. A percentile is a rank against a distribution, so scoring a managed trade in
-- the bracket distribution would hand it that gap as a gift — and the bracket grid contains no
-- managed outcomes at all, so it compares unlike things whatever the numbers do.
--
-- Same shape as 0008's columns on purpose: the Manage grid is also 98 cells (2 directions x 7 stops
-- x 7 policies), so a percentile means the same thing on both ladders. §14's exit condition is a
-- correlation between the two ratings, and it would be measuring resolution differences rather than
-- skill differences if the grids disagreed on size.
--
-- Future data, exactly like `achievable_r`: never issued, released only after an order is committed.

alter table public.charts
  -- 98 R-multiples as interleaved Float32, in the canonical grid order:
  -- direction-major, then stop, then policy.
  add column if not exists manage_r bytea,
  -- 98 outcome codes, one byte each: 0 stop, 1 target, 2 timeout.
  add column if not exists manage_outcome bytea,
  -- The best R any policy could have produced on this path.
  add column if not exists manage_oracle_r double precision,
  -- The distribution's median — Manage's own par, and not the bracket grid's.
  add column if not exists manage_par_r double precision,
  add column if not exists manage_version text;

comment on column public.charts.manage_r is
  'The 98-cell Manage achievable distribution (10.1), Float32, direction-major then stop then policy. Future data - never issued before an order is committed. Separate from achievable_r because par differs by 0.42R and the bracket grid contains no managed outcomes.';
comment on column public.charts.manage_oracle_r is
  'Best of the 98 Manage cells. NOT the analogue of oracle_r: that column is a PATH bound (the best any entry and exit could have produced anywhere on the path, ~62R on average) while this is the best of an enumerated policy family (~4.5R). Comparing the two directly is a category error - the like-for-like comparison to oracle_r is oracle_r itself, which is a property of the path and not of the policy family.';
comment on column public.charts.manage_par_r is
  'Median of the Manage distribution. Manage''s own par; scoring a managed trade against par_r would flatter it.';
comment on column public.charts.manage_version is
  'MANAGE_VERSION the grid was enumerated under. A Manage percentile is not comparable across a change of it (12.4).';

-- Charts still awaiting enumeration, which is what the backfill pages through.
create index if not exists charts_manage_pending_idx
  on public.charts (id)
  where manage_r is null;
