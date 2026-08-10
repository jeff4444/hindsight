-- Serve a round shaped by its tier. Applied via the connector; kept here for reproducibility.
--
-- §12.1 requires the projection to happen server-side: "serve the lead-in window server-side,
-- accept the committed order server-side, and only then stream the reveal." A tier that only hides
-- affordances in the client is decoration — the payload has to actually not contain them.
--
-- Two things are therefore withheld rather than hidden: candles beyond the tier's count, and the
-- one-minute detail path, which is the ONLY enforceable timeframe restriction (a client holding
-- the detail can render 1m whatever the picker offers).

-- The last `p_want` candles of (extra ++ base). Null when the chart cannot supply that many, so
-- the caller excludes it rather than serving a short window.
create or replace function public.project_lead_in(p_base jsonb, p_extra jsonb, p_want integer)
returns jsonb language sql immutable set search_path = ''
as $$
  with combined as (
    select value, row_number() over () as ord
    from jsonb_array_elements(coalesce(p_extra, '[]'::jsonb) || p_base)
  ), total as (select count(*)::integer as n from combined)
  select case
    when (select n from total) < p_want then null
    else (select jsonb_agg(value order by ord) from combined
          where ord > (select n from total) - p_want)
  end;
$$;
revoke all on function public.project_lead_in(jsonb, jsonb, integer) from public, anon, authenticated;

drop function if exists public.issue_round(uuid, uuid, text, text);

create function public.issue_round(
  p_session uuid, p_user uuid, p_nonce text,
  p_tape text default 'open', p_tier text default 'NTZ',
  p_candles integer default 80, p_detail boolean default false,
  p_clock_seconds integer default null
)
returns table (
  round_id uuid, chart_id uuid, lead_in_bars jsonb,
  atr14 double precision, tick_size double precision, entry_price double precision,
  start_dow integer, start_hour integer, lead_in_detail bytea, expires_at timestamptz
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_round_id uuid;
  v_owner uuid := coalesce(p_user, p_session);
  v_lead_in_bytes integer;
  v_tape public.tapes%rowtype;
  v_bars jsonb;
  v_extra integer;
  v_first timestamptz;
  v_expires timestamptz;
begin
  insert into public.play_sessions (id) values (p_session)
  on conflict (id) do update set last_seen_at = now();

  select * into v_tape from public.tapes t where t.slug = coalesce(p_tape, 'open');
  if not found then raise exception 'no such tape: %', p_tape; end if;
  if v_tape.locked_reason is not null then raise exception 'tape % is locked', p_tape; end if;

  -- A tier wanting more than the stored 80 needs the extended history, so charts without it are
  -- simply not in its pool.
  select c.* into v_chart from public.charts c
  where (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
    and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
    and (p_candles <= 80 or c.lead_in_extra is not null)
    and not exists (select 1 from public.rounds r where r.chart_id = c.id and r.owner = v_owner)
  order by random() limit 1;

  if not found then
    select c.* into v_chart from public.charts c
    where (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
      and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
      and (p_candles <= 80 or c.lead_in_extra is not null)
    order by random() limit 1;
  end if;
  if not found then raise exception 'corpus is empty - run the corpus pipeline first'; end if;

  v_bars := public.project_lead_in(v_chart.lead_in_bars, v_chart.lead_in_extra, p_candles);
  if v_bars is null then raise exception 'chart cannot supply % candles', p_candles; end if;

  -- How far back the first visible candle now sits, so the clock badge names the right weekday.
  v_extra := greatest(0, p_candles - jsonb_array_length(v_chart.lead_in_bars));
  v_first := v_chart.window_start - (v_extra || ' hours')::interval;

  if p_clock_seconds is not null then
    v_expires := now() + (p_clock_seconds || ' seconds')::interval;
  end if;

  insert into public.rounds (chart_id, session_id, user_id, nonce, tier, expires_at)
  values (v_chart.id, p_session, p_user, p_nonce, p_tier, v_expires)
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
revoke all on function public.issue_round(uuid, uuid, text, text, text, integer, boolean, integer)
  from public, anon, authenticated;

-- The daily stays at Naked (§10.1) but records the tier and the clock like everything else.
drop function if exists public.issue_daily(uuid, uuid, integer, text);

create function public.issue_daily(
  p_session uuid, p_user uuid, p_day integer, p_nonce text,
  p_tier text default 'NTZ', p_candles integer default 80, p_clock_seconds integer default null
)
returns table (
  round_id uuid, slot integer, lead_in_bars jsonb,
  atr14 double precision, tick_size double precision, entry_price double precision,
  start_dow integer, start_hour integer, lead_in_detail bytea, expires_at timestamptz
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_chart_id uuid;
  v_slot integer;
  v_round_id uuid;
  v_owner uuid := coalesce(p_user, p_session);
  v_bars jsonb;
  v_extra integer;
  v_first timestamptz;
  v_expires timestamptz;
begin
  insert into public.play_sessions (id) values (p_session)
  on conflict (id) do update set last_seen_at = now();

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));

  select d.chart_id, d.slot into v_chart_id, v_slot
  from public.daily_chart_ids(p_day) d
  where not exists (
    select 1 from public.rounds r
     where r.owner = v_owner and r.daily_day = p_day and r.daily_index = d.slot
       and r.committed_at is not null and not r.superseded)
  order by d.slot limit 1;

  if v_chart_id is null then return; end if;

  select r.id, r.expires_at into v_round_id, v_expires from public.rounds r
  where r.owner = v_owner and r.daily_day = p_day and r.daily_index = v_slot
    and r.committed_at is null and not r.superseded limit 1;

  select * into v_chart from public.charts c where c.id = v_chart_id;
  v_bars := public.project_lead_in(v_chart.lead_in_bars, v_chart.lead_in_extra, p_candles);
  if v_bars is null then
    v_bars := v_chart.lead_in_bars;
    p_candles := jsonb_array_length(v_chart.lead_in_bars);
  end if;

  v_extra := greatest(0, p_candles - jsonb_array_length(v_chart.lead_in_bars));
  v_first := v_chart.window_start - (v_extra || ' hours')::interval;

  if v_round_id is null then
    if p_clock_seconds is not null then
      v_expires := now() + (p_clock_seconds || ' seconds')::interval;
    end if;
    insert into public.rounds
      (chart_id, session_id, user_id, nonce, daily_day, daily_index, tier, expires_at)
    values (v_chart_id, p_session, p_user, p_nonce, p_day, v_slot, p_tier, v_expires)
    returning id into v_round_id;
  end if;

  return query select
    v_round_id, v_slot, v_bars, v_chart.atr14, v_chart.tick_size, v_chart.entry_price,
    (extract(isodow from (v_first at time zone 'UTC'))::integer - 1),
    extract(hour from (v_first at time zone 'UTC'))::integer,
    null::bytea, v_expires;
end;
$$;
revoke all on function public.issue_daily(uuid, uuid, integer, text, text, integer, integer)
  from public, anon, authenticated;
