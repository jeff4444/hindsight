-- §10.1's Duel and Racer, and the one primitive they share.
--
-- Both modes need something nothing else in this product has: **a fixed, ordered chart sequence that
-- several players play independently and are scored against.** A duel is two players on that
-- sequence with a health bar; a race is n players on it against a clock. One table, two scorers.
--
-- ## The sequence is drawn when the second player arrives, and that is a fairness rule
--
-- Every other mode picks charts the player has not seen — `issue_round` carries a `not exists`
-- clause for exactly that. A duel cannot use it, because both players must see the *same* charts,
-- and a chart one of them has already played is a chart they have already been told the answer to.
--
-- So a duel is created empty. `chart_ids` stays null until a second player joins, and the sequence is
-- then drawn from charts **neither** of them has played. That is why a duel is a challenge sent by
-- link rather than a lobby: the opponent has to be known before the charts can be chosen.
--
-- A race cannot do this — its later runners are not known when the first one starts — so a runner who
-- has already seen a chart in the sequence is *flagged*, not silently ranked beside people who had
-- not. See `clean` below.
--
-- ## Duels are unrated, for now
--
-- §12's ladder is not fed by these. §17 made the same call for Manage and for the same reason: a
-- format has to be shown to measure the same skill before its results are allowed to move a rating
-- that means something else.

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('duel', 'race')),
  -- The map the sequence is drawn from, so a duel can be fought on The Drop or on someone's own map.
  tape text not null default 'open',
  length smallint not null default 7 check (length between 1 and 20),
  tier text not null default 'NTZ',
  -- Null until the sequence exists. For a duel that is when the second player joins; for a race it is
  -- set at creation, because a race has no second player to wait for.
  chart_ids uuid[],
  status text not null default 'open' check (status in ('open', 'live', 'done')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

comment on table public.matches is
  'A fixed ordered chart sequence played independently by several players (10.1). Duel and Racer are two scorers over one primitive.';
comment on column public.matches.chart_ids is
  'The sequence, in order. Null until it can be drawn fairly: for a duel that means once both players are known, since it must contain charts neither has already been shown the answer to.';
comment on column public.matches.created_by is
  'The owner who opened it - coalesce(user_id, session_id), matching rounds.owner.';

create table if not exists public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  owner uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  seat smallint not null,
  joined_at timestamptz not null default now(),
  -- Duel: what is left of this player's bar. Null for a race.
  health smallint,
  -- Race: milliseconds from this player's own start, so a recording can be replayed against a clock.
  started_at timestamptz,
  finished_at timestamptz,
  score real not null default 0,
  charts smallint not null default 0,
  /*
   * Whether this player's run is comparable to the others'.
   *
   * False when they had already played a chart in the sequence before the match began. A duel cannot
   * produce this — its sequence is drawn to exclude both players' history — but a race can, because
   * its later runners were unknown when the sequence was fixed. Flagged rather than dropped: a run
   * that happened is a fact, and hiding it would leave a player wondering where their result went.
   */
  clean boolean not null default true,
  primary key (match_id, owner)
);

comment on column public.match_players.clean is
  'False if this player had already seen a chart in the sequence. Duels cannot produce this; races can, and the standings say so rather than quietly excluding the run.';

-- Which match a round belongs to, and where in the sequence. Both are needed: the index is what lets
-- two players' rounds on the same chart be paired without joining on the chart itself.
alter table public.rounds
  add column if not exists match_id uuid references public.matches (id) on delete set null,
  add column if not exists match_index smallint;

comment on column public.rounds.match_index is
  'Position in the match sequence, 0-based. Paired with match_id it is what identifies "the same chart, the other player" without joining on chart_id.';

create index if not exists matches_open_idx on public.matches (mode, created_at desc)
  where status = 'open';
create index if not exists match_players_owner_idx on public.match_players (owner, joined_at desc);
create index if not exists rounds_match_idx on public.rounds (match_id, match_index)
  where match_id is not null;

alter table public.matches enable row level security;
alter table public.match_players enable row level security;

/*
 * Draw a sequence of charts nobody in `p_owners` has played.
 *
 * Separate from `issue_round` because it answers a different question — *which* charts, once, for
 * everybody — rather than "one chart, for this player, now". Returns null if the map cannot supply
 * enough unseen charts, which the caller reports rather than papering over: a duel short of its
 * charts is a duel where one player runs out first.
 */
create or replace function public.draw_sequence(
  p_tape text, p_length integer, p_owners uuid[]
)
returns uuid[]
language plpgsql security invoker set search_path = ''
as $$
declare
  v_tape public.tapes%rowtype;
  v_ids uuid[];
begin
  select * into v_tape from public.tapes t where t.slug = coalesce(p_tape, 'open');
  if not found then raise exception 'no such tape: %', p_tape; end if;
  if v_tape.locked_reason is not null then raise exception 'tape % is locked', p_tape; end if;

  select array_agg(c.id) into v_ids from (
    select c.id from public.charts c
    where (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
      and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
      and (v_tape.themes is null or c.themes && v_tape.themes)
      and (v_tape.drift_below is null or c.lead_in_drift_atr <= v_tape.drift_below)
      and (v_tape.drift_above is null or c.lead_in_drift_atr >= v_tape.drift_above)
      and (not v_tape.council_split or c.council_minority > 0)
      and not exists (
        select 1 from public.rounds r
        where r.chart_id = c.id and r.owner = any (p_owners)
      )
    order by random() limit p_length
  ) c;

  if v_ids is null or array_length(v_ids, 1) < p_length then return null; end if;
  return v_ids;
end;
$$;
revoke all on function public.draw_sequence(text, integer, uuid[]) from public, anon, authenticated;

/*
 * Issue one round of a match.
 *
 * A near-copy of `issue_round`, and deliberately a separate function rather than a parameter on it.
 * The two differ in the one thing that function exists to guarantee: `issue_round` *chooses* a chart
 * and must never be handed one, because a caller that could name a chart could name the same chart
 * repeatedly and farm the reveal. This one is handed a chart, and is safe only because the chart
 * comes from a sequence the server drew and the client never sees — §12.1's payload carries no chart
 * id, and `tests/api-leak.test.ts` keeps it that way.
 */
create or replace function public.issue_match_round(
  p_session uuid, p_user uuid, p_nonce text,
  p_match uuid, p_index integer,
  p_tier text default 'NTZ', p_candles integer default 80,
  p_detail boolean default false, p_clock_seconds integer default null
)
returns table (
  round_id uuid, chart_id uuid, lead_in_bars jsonb,
  atr14 double precision, tick_size double precision, entry_price double precision,
  start_dow integer, start_hour integer, lead_in_detail bytea, expires_at timestamptz
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_match public.matches%rowtype;
  v_chart public.charts%rowtype;
  v_round_id uuid;
  v_owner uuid := coalesce(p_user, p_session);
  v_lead_in_bytes integer;
  v_bars jsonb;
  v_extra integer;
  v_first timestamptz;
  v_expires timestamptz;
  v_chart_id uuid;
begin
  insert into public.play_sessions (id) values (p_session)
  on conflict (id) do update set last_seen_at = now();

  select * into v_match from public.matches m where m.id = p_match;
  if not found then raise exception 'no such match'; end if;
  if v_match.chart_ids is null then raise exception 'match has no sequence yet'; end if;
  if not exists (select 1 from public.match_players mp where mp.match_id = p_match and mp.owner = v_owner) then
    raise exception 'not a player in this match';
  end if;
  if p_index < 0 or p_index >= array_length(v_match.chart_ids, 1) then
    raise exception 'past the end of the sequence';
  end if;

  -- One round per player per position. Without this a player could re-issue a chart they had
  -- already seen the reveal for and answer it again.
  if exists (
    select 1 from public.rounds r
    where r.match_id = p_match and r.match_index = p_index and r.owner = v_owner
  ) then
    raise exception 'already played that position';
  end if;

  v_chart_id := v_match.chart_ids[p_index + 1];
  select c.* into v_chart from public.charts c where c.id = v_chart_id;
  if not found then raise exception 'chart missing from the sequence'; end if;

  v_bars := public.project_lead_in(v_chart.lead_in_bars, v_chart.lead_in_extra, p_candles);
  if v_bars is null then raise exception 'chart cannot supply % candles', p_candles; end if;

  v_extra := greatest(0, p_candles - jsonb_array_length(v_chart.lead_in_bars));
  v_first := v_chart.window_start - (v_extra || ' hours')::interval;

  if p_clock_seconds is not null then
    v_expires := now() + (p_clock_seconds || ' seconds')::interval;
  end if;

  insert into public.rounds (chart_id, session_id, user_id, nonce, tier, expires_at, tape, match_id, match_index)
  values (v_chart.id, p_session, p_user, p_nonce, p_tier, v_expires, v_match.tape, p_match, p_index)
  returning id into v_round_id;

  v_lead_in_bytes := jsonb_array_length(v_chart.lead_in_bars) * 60 * 20;

  return query select
    v_round_id, v_chart.id, v_bars, v_chart.atr14, v_chart.tick_size, v_chart.entry_price,
    (extract(isodow from (v_first at time zone 'UTC'))::integer - 1),
    extract(hour from (v_first at time zone 'UTC'))::integer,
    case when p_detail then substring(v_chart.detail_path from 1 for v_lead_in_bytes) else null end,
    v_expires;
end;
$$;
revoke all on function public.issue_match_round(uuid, uuid, text, uuid, integer, text, integer, boolean, integer)
  from public, anon, authenticated;
