-- The daily (§10.1) and Layer 1's verdict pinned to each round.
--
-- Five charts, identical for every player, one attempt. No table of assignments: the five are
-- derived from the day number by hashing it against each chart id, which makes the selection
-- identical for everyone, stable forever, and free of state that could drift out of sync with
-- what a player was actually served.
--
-- §10.1's 48-hour completion window is enforced in the route, being policy rather than shape.

alter table public.rounds
  add column if not exists daily_day integer,
  add column if not exists daily_index smallint,
  add column if not exists percentile double precision,
  add column if not exists oracle_r double precision,
  add column if not exists efficiency double precision,
  add column if not exists achievable_version text;

comment on column public.rounds.daily_day is
  'Daily number this round belongs to, or null for free play. One attempt per session per (day, slot).';
comment on column public.rounds.percentile is
  'Where this result sat in the chart achievable distribution (4.2), 0-1. A pass scores 0R against the same distribution (4.4).';
comment on column public.rounds.achievable_version is
  'The grid version this percentile was computed against. Percentiles are not comparable across a change of it.';

create unique index if not exists rounds_daily_attempt_idx
  on public.rounds (session_id, daily_day, daily_index)
  where daily_day is not null;

create index if not exists rounds_daily_idx on public.rounds (daily_day) where daily_day is not null;

create or replace function public.daily_chart_ids(p_day integer)
returns table (chart_id uuid, slot integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select id, (row_number() over (order by md5(id::text || p_day::text)))::integer - 1
  from public.charts
  where achievable_version is not null
  order by md5(id::text || p_day::text)
  limit 5;
$$;

revoke all on function public.daily_chart_ids(integer) from public, anon, authenticated;

create or replace function public.issue_daily(p_session uuid, p_day integer, p_nonce text)
returns table (
  round_id uuid,
  slot integer,
  lead_in_bars jsonb,
  atr14 double precision,
  tick_size double precision,
  entry_price double precision,
  start_dow integer,
  start_hour integer,
  lead_in_detail bytea
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_chart_id uuid;
  v_slot integer;
  v_round_id uuid;
  v_existing uuid;
  v_lead_in_bytes integer;
begin
  select d.chart_id, d.slot into v_chart_id, v_slot
  from public.daily_chart_ids(p_day) d
  where not exists (
    select 1 from public.rounds r
    where r.session_id = p_session
      and r.daily_day = p_day
      and r.daily_index = d.slot
      and r.committed_at is not null
  )
  order by d.slot
  limit 1;

  if v_chart_id is null then
    return;
  end if;

  select * into v_chart from public.charts c where c.id = v_chart_id;

  -- Resume rather than reissue: if the player reloaded, an uncommitted round for this slot
  -- already exists, and handing out a second would give two charts for one attempt.
  select r.id into v_existing
  from public.rounds r
  where r.session_id = p_session
    and r.daily_day = p_day
    and r.daily_index = v_slot
    and r.committed_at is null
  limit 1;

  if v_existing is not null then
    v_round_id := v_existing;
  else
    insert into public.rounds (chart_id, session_id, nonce, daily_day, daily_index)
    values (v_chart_id, p_session, p_nonce, p_day, v_slot)
    returning id into v_round_id;
  end if;

  v_lead_in_bytes := jsonb_array_length(v_chart.lead_in_bars) * 60 * 20;

  return query select
    v_round_id,
    v_slot,
    v_chart.lead_in_bars,
    v_chart.atr14,
    v_chart.tick_size,
    v_chart.entry_price,
    (extract(isodow from (v_chart.window_start at time zone 'UTC'))::integer - 1),
    extract(hour from (v_chart.window_start at time zone 'UTC'))::integer,
    substring(v_chart.detail_path from 1 for v_lead_in_bytes);
end;
$$;

revoke all on function public.issue_daily(uuid, integer, text) from public, anon, authenticated;
