-- Ratings for players and charts, and the tier a round was played under.
--
-- §8.1: "Treat every chart-and-tier pair as a Glicko-2 entity, exactly as the major chess platforms
-- treat a puzzle: each attempt is a rated game between the player and the chart."
--
-- The unit is (chart, tier), not chart. The same chart at Blackout is a harder opponent than at
-- Naked and rates accordingly — which is also how §3.4's "derive the multiplier rather than assert
-- it" falls out for free: the corpus-wide rating gap between the two IS the tier multiplier.

create table if not exists public.chart_ratings (
  chart_id   uuid not null references public.charts (id) on delete cascade,
  tier       text not null,
  rating     double precision not null default 1500,
  rd         double precision not null default 350,
  sigma      double precision not null default 0.04,
  plays      integer not null default 0,
  -- §8.2. A pending chart is unrated *for the player* in either direction — the literal "can only
  -- gain, never cost" is an unbounded one-sided random walk; see src/core/rating.ts for the
  -- arithmetic (~+2.3 points per pending chart, never converging).
  pending    boolean not null default true,
  retired    boolean not null default false,
  retired_at timestamptz,
  retired_rho double precision,
  retired_n  integer,
  retired_reason text,
  -- A retirement verdict is a population statistic, and §12.4 says those are not comparable across
  -- a change of rule. Storing the versions makes a verdict re-derivable and forces a reset.
  score_map_version text,
  achievable_version text,
  updated_at timestamptz not null default now(),
  primary key (chart_id, tier)
);
alter table public.chart_ratings enable row level security;
revoke all on public.chart_ratings from anon, authenticated;

create index if not exists chart_ratings_servable_idx
  on public.chart_ratings (tier, rating) where not retired;

-- `tier` is 'ALL' for the overall rating, which §3.4 wants driving matchmaking and placement —
-- estimated directly rather than pooled, so it sees every game and converges fastest (§15).
create table if not exists public.player_ratings (
  user_id    uuid not null references auth.users (id) on delete cascade,
  tier       text not null,
  rating     double precision not null default 1500,
  rd         double precision not null default 350,
  sigma      double precision not null default 0.06,
  attempts   integer not null default 0,
  last_rated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, tier)
);
alter table public.player_ratings enable row level security;
revoke all on public.player_ratings from anon, authenticated;

alter table public.rounds
  add column if not exists tier text,
  add column if not exists mods text[],
  add column if not exists player_rating_at_attempt double precision,
  add column if not exists glicko_score double precision,
  add column if not exists rated boolean not null default false,
  add column if not exists expires_at timestamptz,
  add column if not exists forfeited boolean not null default false,
  add column if not exists ranked_session uuid,
  add column if not exists ranked_index smallint;

comment on column public.rounds.player_rating_at_attempt is
  'The overall rating this player carried when the round was issued. §8.3 correlates this against '
  'the achieved percentile; correlating against the current rating would be a look-ahead.';

create index if not exists rounds_rated_idx on public.rounds (chart_id, tier)
  where rated and not superseded;
create index if not exists rounds_ranked_session_idx on public.rounds (ranked_session, ranked_index)
  where ranked_session is not null;

-- One rated attempt per player per (chart, tier). A repeat has seen the reveal, so it carries no
-- information about skill and would only inflate.
create unique index if not exists rounds_one_rated_attempt_idx
  on public.rounds (owner, chart_id, tier) where rated and not superseded;
