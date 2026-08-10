-- Applying the streak decisions, recording a completed daily, and crediting earn-back.
-- Applied via the Supabase connector; kept here so a fresh project is reproducible from the repo.

-- The decisions are computed by a pure TypeScript function (src/core/streak.ts) so the boundary
-- cases can be a golden table rather than a manual QA pass. This function *re-validates* the one
-- decision that spends a resource, so a bug up there cannot mint freezes.
create or replace function public.apply_streak_decisions(p_user uuid, p_decisions jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_freeze_days integer[] := coalesce(
    (select array_agg(value::integer) from jsonb_array_elements_text(p_decisions->'spendFreezeDays')), '{}');
  v_expire uuid[] := coalesce(
    (select array_agg(value::uuid) from jsonb_array_elements_text(p_decisions->'expireRepairIds')), '{}');
  v_break jsonb := p_decisions->'broke';
  v_open jsonb := p_decisions->'openRepair';
  v_redeem text := p_decisions->>'redeemRepairId';
  v_today integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  insert into public.player_streaks (user_id) values (p_user) on conflict do nothing;

  if array_length(v_expire, 1) > 0 then
    update public.streak_repairs set state = 'expired'
     where user_id = p_user and id = any (v_expire) and state = 'open';
  end if;

  if array_length(v_freeze_days, 1) > 0 then
    -- The database decides whether the player can afford this, not the caller.
    update public.player_streaks
       set freezes_remaining = freezes_remaining - array_length(v_freeze_days, 1),
           updated_at = now()
     where user_id = p_user and freezes_remaining >= array_length(v_freeze_days, 1);
    if not found then
      raise exception 'insufficient freezes' using errcode = '23514';
    end if;
    insert into public.streak_freezes (user_id, day)
    select p_user, unnest(v_freeze_days) on conflict do nothing;
  end if;

  if v_break is not null and v_break <> 'null'::jsonb then
    insert into public.streak_history (user_id, run_end_day, run_start_day, length, perfect)
    values (p_user,
            (v_break->>'runEndDay')::integer,
            (v_break->>'runStartDay')::integer,
            (v_break->>'length')::integer,
            (v_break->>'perfect')::boolean)
    on conflict (user_id, run_end_day) do nothing;

    update public.player_streaks s
       set longest_length = greatest(s.longest_length, (v_break->>'length')::integer),
           longest_perfect = case when (v_break->>'perfect')::boolean
                                  then greatest(s.longest_perfect, (v_break->>'length')::integer)
                                  else s.longest_perfect end,
           updated_at = now()
     where s.user_id = p_user;
  end if;

  if v_open is not null and v_open <> 'null'::jsonb then
    insert into public.streak_repairs
      (user_id, broken_run_end_day, broken_length, charts_required, covers_from_day, expires_at)
    values (p_user,
            (v_open->>'brokenRunEndDay')::integer,
            (v_open->>'brokenLength')::integer,
            (v_open->>'chartsRequired')::smallint,
            (v_open->>'brokenRunEndDay')::integer + 1,
            now() + interval '48 hours')
    on conflict do nothing;
  end if;

  if v_redeem is not null then
    select max(day) into v_today from public.daily_completions where user_id = p_user;
    update public.streak_repairs
       set state = 'redeemed', redeemed_at = now(),
           covers_to_day = greatest(covers_from_day, coalesce(v_today, covers_from_day))
     where id = v_redeem::uuid and user_id = p_user and state = 'open';
  end if;
end;
$$;
revoke all on function public.apply_streak_decisions(uuid, jsonb) from public, anon, authenticated;

-- Called when a daily's fifth chart commits. Writes the durable record streaks read, and grants a
-- freeze back every ten completed dailies so the mitigation stack replenishes through play.
create or replace function public.record_daily_completion(p_user uuid, p_day integer)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_charts smallint;
  v_traded smallint;
  v_mean double precision;
  v_total integer;
begin
  if p_user is null then return; end if;

  select count(*)::smallint,
         count(*) filter (where not passed)::smallint,
         avg(percentile)
    into v_charts, v_traded, v_mean
  from public.rounds
  where user_id = p_user and daily_day = p_day and committed_at is not null and not superseded;

  if v_charts is null or v_charts = 0 then return; end if;

  insert into public.daily_completions (user_id, day, charts, traded, mean_percentile)
  values (p_user, p_day, v_charts, v_traded, v_mean)
  on conflict (user_id, day) do update
    set charts = excluded.charts, traded = excluded.traded, mean_percentile = excluded.mean_percentile;

  insert into public.player_streaks (user_id) values (p_user) on conflict do nothing;

  select count(*) into v_total from public.daily_completions where user_id = p_user;
  if v_total % 10 = 0 then
    update public.player_streaks
       set freezes_remaining = least(2, freezes_remaining + 1),
           freezes_earned = freezes_earned + 1,
           updated_at = now()
     where user_id = p_user and freezes_remaining < 2;
  end if;
end;
$$;
revoke all on function public.record_daily_completion(uuid, integer) from public, anon, authenticated;

-- Any committed round in the window counts toward an open repair, passes included. Excluding
-- passes would push players to trade everything to earn a streak back, which fights §4.4's whole
-- design — restraint is a scored action, not an absence of one.
create or replace function public.credit_repair(p_user uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if p_user is null then return; end if;
  update public.streak_repairs
     set charts_done = least(charts_required, charts_done + 1)
   where user_id = p_user and state = 'open' and now() < expires_at;
end;
$$;
revoke all on function public.credit_repair(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Backfill the durable daily-completion records after a claim.
--
-- Without this, a player who completed dailies anonymously and then signed in kept their rounds
-- but lost their streak: `daily_completions` is only written when the fifth chart commits, and at
-- that moment there was no account to write it against. The sign-in screen promises "nothing is
-- lost", so the claim has to make that true for streaks too.
create or replace function public.backfill_daily_completions(p_user uuid)
returns integer language plpgsql security invoker set search_path = ''
as $$
declare
  v_day integer;
  v_count integer := 0;
begin
  if p_user is null then return 0; end if;

  for v_day in
    select r.daily_day
    from public.rounds r
    where r.user_id = p_user and r.daily_day is not null
      and r.committed_at is not null and not r.superseded
    group by r.daily_day
    having count(*) >= 5
  loop
    perform public.record_daily_completion(p_user, v_day);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke all on function public.backfill_daily_completions(uuid) from public, anon, authenticated;
