-- 0029: leaderboards, today's field, and tape descriptions in plain words.
--
-- ## The boards
--
-- The redesign's social layer reads the field without changing anything it reads. Every function
-- here is a pure read over rows that already exist — rounds, daily_completions, player_ratings,
-- profiles — so nothing about scoring, rating or issuance moves. Like every other function in this
-- schema they run as the service role (security invoker, execute revoked from everyone else), so
-- the RLS posture is unchanged: no client reads these tables directly.
--
-- Every board is gated on a sample, in the same spirit as rules §4.9: a ladder position is not
-- shown until the rating has settled (the same RANK_MIN_ATTEMPTS / RANK_MAX_RD the app uses, passed
-- in so the two cannot drift), and a tape board counts a player only after a minimum number of
-- rounds on that tape.
--
-- Today's field counts anonymous players too. Its unit is the owner (coalesce(user_id, session_id),
-- the same key rounds.owner already stores), and a player is in the field once all five charts of
-- the day are committed. Named rows on the daily board come from daily_completions, which only
-- signed-in players have — an anonymous player can see where they stand without appearing by name.
--
-- ## The tape descriptions
--
-- The official tapes' blurbs were written for the research log: section citations, corpus
-- percentages, a paper reference. They now say what a player will meet. The measurements they
-- carried are kept in docs/rules.md and on the Methods page, where they belong.

create index if not exists rounds_daily_owner_idx
  on public.rounds (daily_day, owner)
  where daily_day is not null and committed_at is not null and superseded = false;

create index if not exists rounds_tape_user_idx
  on public.rounds (tape, user_id)
  where user_id is not null and committed_at is not null and superseded = false;

-- ---------------------------------------------------------------- today's field

-- Per-owner mean score for one daily, among owners who finished all of it.
create or replace function public.daily_means(p_day integer, p_charts integer default 5)
returns table (owner uuid, mean_percentile double precision)
language sql stable security invoker set search_path = ''
as $$
  select r.owner, avg(r.percentile)::double precision
  from public.rounds r
  where r.daily_day = p_day
    and r.committed_at is not null
    and r.superseded = false
  group by r.owner
  having count(*) >= p_charts and count(r.percentile) > 0
$$;

-- Ten buckets of the field's scores (0 = 0–9, 9 = 90–100), and how many players fell in each.
create or replace function public.daily_field(p_day integer, p_charts integer default 5)
returns table (bucket integer, players integer)
language sql stable security invoker set search_path = ''
as $$
  select least(9, floor(m.mean_percentile * 10)::integer) as bucket, count(*)::integer
  from public.daily_means(p_day, p_charts) m
  group by 1
  order by 1
$$;

-- Where one owner stands in a daily's field: how many finished, and how many they beat.
create or replace function public.daily_standing(p_day integer, p_owner uuid, p_charts integer default 5)
returns table (players integer, beaten integer, mean_percentile double precision)
language sql stable security invoker set search_path = ''
as $$
  with field as (select * from public.daily_means(p_day, p_charts)),
       mine as (select f.mean_percentile from field f where f.owner = p_owner)
  select
    (select count(*)::integer from field),
    (select count(*)::integer from field f, mine where f.mean_percentile < mine.mean_percentile),
    (select mine.mean_percentile from mine)
$$;

-- The named top of a daily: signed-in players who completed it, best mean first, ties to whoever
-- finished first.
create or replace function public.daily_leaderboard(p_day integer, p_limit integer default 20)
returns table (
  user_id uuid,
  handle text,
  avatar_seed integer,
  avatar_accent text,
  mean_percentile double precision,
  traded smallint,
  completed_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select c.user_id, p.handle, p.avatar_seed, p.avatar_accent, c.mean_percentile, c.traded, c.completed_at
  from public.daily_completions c
  join public.profiles p on p.user_id = c.user_id
  where c.day = p_day and c.mean_percentile is not null
  order by c.mean_percentile desc, c.completed_at asc
  limit p_limit
$$;

-- ---------------------------------------------------------------- the ladder

create or replace function public.ranked_ladder(
  p_limit integer default 50,
  p_min_attempts integer default 30,
  p_max_rd double precision default 100
)
returns table (
  user_id uuid,
  handle text,
  avatar_seed integer,
  avatar_accent text,
  rating double precision,
  rd double precision,
  attempts integer
)
language sql stable security invoker set search_path = ''
as $$
  select r.user_id, p.handle, p.avatar_seed, p.avatar_accent, r.rating, r.rd, r.attempts
  from public.player_ratings r
  join public.profiles p on p.user_id = r.user_id
  where r.tier = 'ALL' and r.attempts >= p_min_attempts and r.rd <= p_max_rd
  order by r.rating desc
  limit p_limit
$$;

-- A placed player's position on the ladder, 1-based, and how many are on it. Null position for a
-- player who is not placed yet.
create or replace function public.ranked_position(
  p_user uuid,
  p_min_attempts integer default 30,
  p_max_rd double precision default 100
)
returns table (rank_position integer, players integer)
language sql stable security invoker set search_path = ''
as $$
  with placed as (
    select r.user_id, r.rating
    from public.player_ratings r
    where r.tier = 'ALL' and r.attempts >= p_min_attempts and r.rd <= p_max_rd
  ),
  me as (select rating from placed where user_id = p_user)
  select
    case when exists (select 1 from me)
      then (select count(*)::integer + 1 from placed q, me where q.rating > me.rating)
      else null
    end,
    (select count(*)::integer from placed)
$$;

-- ---------------------------------------------------------------- tape boards

create or replace function public.tape_leaderboard(
  p_tape text,
  p_min_rounds integer default 10,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  handle text,
  avatar_seed integer,
  avatar_accent text,
  rounds integer,
  mean_percentile double precision
)
language sql stable security invoker set search_path = ''
as $$
  select r.user_id, p.handle, p.avatar_seed, p.avatar_accent, count(*)::integer, avg(r.percentile)::double precision
  from public.rounds r
  join public.profiles p on p.user_id = r.user_id
  where r.tape = p_tape
    and r.user_id is not null
    and r.committed_at is not null
    and r.superseded = false
    and r.percentile is not null
  group by r.user_id, p.handle, p.avatar_seed, p.avatar_accent
  having count(*) >= p_min_rounds
  order by avg(r.percentile) desc
  limit p_limit
$$;

revoke all on function public.daily_means(integer, integer) from public, anon, authenticated;
revoke all on function public.daily_field(integer, integer) from public, anon, authenticated;
revoke all on function public.daily_standing(integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.daily_leaderboard(integer, integer) from public, anon, authenticated;
revoke all on function public.ranked_ladder(integer, integer, double precision) from public, anon, authenticated;
revoke all on function public.ranked_position(uuid, integer, double precision) from public, anon, authenticated;
revoke all on function public.tape_leaderboard(text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- plain tapes

update public.tapes set name = 'Shuffle',
  blurb = 'Every chart in the library — any market, any mood. The closest thing to an ordinary day.'
  where slug = 'open' and owner_id is null;
update public.tapes set
  blurb = 'Price covering ground without going anywhere. Stops get tagged both ways — the account killer.'
  where slug = 'chop' and owner_id is null;
update public.tapes set
  blurb = 'The calmest charts of their own year. Coiled and thin, and easy to misjudge the size of a move.'
  where slug = 'quiet-books' and owner_id is null;
update public.tapes set
  blurb = 'The most violent charts of their own year. Wide bars, wide stops — read the ATR badge twice.'
  where slug = 'high-seas' and owner_id is null;
update public.tapes set
  locked_reason = 'Not open yet. Its rule would tell you how its charts end before you trade them.'
  where slug = 'null-set' and owner_id is null;
update public.tapes set
  blurb = 'A level taken out by a hair and handed straight back. The most common formation in the library.'
  where slug = 'sweep' and owner_id is null;
update public.tapes set
  blurb = 'A close beyond the twenty-bar extreme, then straight back inside. Breakouts that did not.'
  where slug = 'failed-break' and owner_id is null;
update public.tapes set
  blurb = 'A big leg, reversed hard within twenty bars. Spot the turn, or get turned.'
  where slug = 'v-reversal' and owner_id is null;
update public.tapes set
  blurb = 'Ten quiet bars, then one that is not. Compression before release — the rarest tape here.'
  where slug = 'coil' and owner_id is null;
update public.tapes set
  blurb = 'Price bouncing between two edges. Fade the edges, or catch the break.'
  where slug = 'range' and owner_id is null;
update public.tapes set
  blurb = 'Steady, efficient moves in one direction. Rare in this library, which is mostly chop.'
  where slug = 'trend' and owner_id is null;
update public.tapes set
  blurb = 'Charts that have fallen eight ATR or more. Half are mirrored rallies — read the chart, not the story.'
  where slug = 'crash' and owner_id is null;
update public.tapes set
  blurb = 'Charts that have risen eight ATR or more: The Drop, reflected. Do you read them differently?'
  where slug = 'euphoria' and owner_id is null;
update public.tapes set
  blurb = 'Charts where the Panel takes opposite sides. Same candles, two schools, opposite calls.'
  where slug = 'council-split' and owner_id is null;
