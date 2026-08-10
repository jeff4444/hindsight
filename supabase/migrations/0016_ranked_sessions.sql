-- §10.1's ranked mode: "Five-chart sessions at Naked, minimum three entries, compressed scoring,
-- Glicko-2 against rated charts." Applied via the connector; kept here for reproducibility.
--
-- The five charts are drawn one at a time but the *session* is fixed at first issue: §4.4's quota
-- only means anything if a player who spent both passes cannot re-roll their way out of it.
--
-- The resume rule matters as much as the quota. A reload must never be a fresh attempt, so the most
-- recent session is always resumed — finished or not — and completion is reported rather than
-- hidden. Starting a new one is an explicit ask (`p_new`). The first cut of this filtered to
-- sessions with fewer than five committed rounds, which meant a finished session stopped matching
-- the moment it finished and the next call silently dealt a sixth chart into a new one. The player
-- never saw their result.
--
-- Retired charts (§8.3) and charts already rated by this player at this tier are excluded: a repeat
-- attempt has seen the reveal and carries no information about skill.

create or replace function public.issue_ranked(
  p_session uuid, p_user uuid, p_nonce text,
  p_tier text default 'NTZ', p_candles integer default 80,
  p_clock_seconds integer default 90, p_charts integer default 5,
  p_new boolean default false
)
returns table (
  session_id uuid, round_id uuid, slot integer,
  lead_in_bars jsonb, atr14 double precision, tick_size double precision,
  entry_price double precision, start_dow integer, start_hour integer,
  expires_at timestamptz, played integer, passes integer
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_owner uuid := coalesce(p_user, p_session);
  v_session uuid; v_slot integer; v_round_id uuid;
  v_chart public.charts%rowtype; v_bars jsonb; v_extra integer;
  v_first timestamptz; v_expires timestamptz; v_played integer; v_passes integer;
begin
  insert into public.play_sessions (id) values (p_session)
  on conflict (id) do update set last_seen_at = now();

  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':ranked', 0));

  if not p_new then
    select r.ranked_session into v_session
    from public.rounds r
    where r.owner = v_owner and r.ranked_session is not null and not r.superseded
    group by r.ranked_session order by max(r.issued_at) desc limit 1;
  end if;

  if v_session is null then v_session := gen_random_uuid(); end if;

  select count(*) filter (where committed_at is not null),
         count(*) filter (where committed_at is not null and passed)
  into v_played, v_passes
  from public.rounds where ranked_session = v_session and not superseded;

  if v_played >= p_charts then
    return query select v_session, null::uuid, null::integer, null::jsonb, null::double precision,
      null::double precision, null::double precision, null::integer, null::integer,
      null::timestamptz, v_played, v_passes;
    return;
  end if;

  select r.id, r.ranked_index, r.expires_at into v_round_id, v_slot, v_expires
  from public.rounds r
  where r.ranked_session = v_session and r.committed_at is null and not r.superseded
  order by r.ranked_index limit 1;

  if v_round_id is null then
    v_slot := v_played;
    select c.* into v_chart
    from public.charts c
    left join public.chart_ratings cr on cr.chart_id = c.id and cr.tier = p_tier
    where c.achievable_version is not null
      and (p_candles <= 80 or c.lead_in_extra is not null)
      and coalesce(cr.retired, false) = false
      and not exists (select 1 from public.rounds r
        where r.chart_id = c.id and r.owner = v_owner and r.tier = p_tier
          and r.rated and not r.superseded)
    order by random() limit 1;
    if not found then raise exception 'no rated charts available'; end if;

    v_bars := public.project_lead_in(v_chart.lead_in_bars, v_chart.lead_in_extra, p_candles);
    if v_bars is null then raise exception 'chart cannot supply % candles', p_candles; end if;

    if p_clock_seconds is not null then
      v_expires := now() + (p_clock_seconds || ' seconds')::interval;
    end if;

    insert into public.rounds
      (chart_id, session_id, user_id, nonce, tier, expires_at, ranked_session, ranked_index)
    values (v_chart.id, p_session, p_user, p_nonce, p_tier, v_expires, v_session, v_slot)
    returning id into v_round_id;
  else
    select c.* into v_chart from public.charts c
    join public.rounds r on r.chart_id = c.id where r.id = v_round_id;
    v_bars := public.project_lead_in(v_chart.lead_in_bars, v_chart.lead_in_extra, p_candles);
  end if;

  v_extra := greatest(0, p_candles - jsonb_array_length(v_chart.lead_in_bars));
  v_first := v_chart.window_start - (v_extra || ' hours')::interval;

  return query select
    v_session, v_round_id, v_slot, v_bars, v_chart.atr14, v_chart.tick_size, v_chart.entry_price,
    (extract(isodow from (v_first at time zone 'UTC'))::integer - 1),
    extract(hour from (v_first at time zone 'UTC'))::integer,
    v_expires, v_played, v_passes;
end;
$$;
revoke all on function public.issue_ranked(uuid, uuid, text, text, integer, integer, integer, boolean)
  from public, anon, authenticated;
