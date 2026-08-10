-- §8.2's pending gate needs the mean deviation of the opponents a chart has faced: "a chart with
-- high deviation and twelve plays is not trustworthy", and one calibrated entirely against unrated
-- newcomers is not calibrated either.
--
-- Kept as a running mean on the row rather than recomputed from `rounds`, because the gate is
-- checked on every rated attempt and the alternative is an aggregate over a growing table on the
-- hot path.
alter table public.chart_ratings
  add column if not exists mean_opponent_rd double precision not null default 350;

comment on column public.chart_ratings.mean_opponent_rd is
  'Running mean rating deviation of the players this chart has faced. §8.2 will not let a chart '
  'leave pending on play count alone if everyone who played it was themselves unrated.';
