-- Claiming an anonymous session, tape-filtered issuance, and the guards that go with accounts.
-- Applied via the Supabase connector; kept here so a fresh project is reproducible from the repo.

create or replace function public.claim_session(p_session uuid, p_user uuid)
returns table (claimed integer, superseded_count integer, refused_to uuid)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_owner uuid;
  v_claim integer := 0;
  v_super integer := 0;
begin
  -- Serialises two claims for the same account (two tabs, two devices) against each other and
  -- against issue_daily, which takes the same lock.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  insert into public.play_sessions (id) values (p_session) on conflict (id) do nothing;

  -- Compare-and-swap. Under READ COMMITTED a second transaction blocks on the row lock and then
  -- re-evaluates `user_id is null` against the updated row, so exactly one caller wins.
  update public.play_sessions s
     set user_id = p_user, claimed_at = now()
   where s.id = p_session and s.user_id is null
  returning s.user_id into v_owner;

  if v_owner is null then
    select s.user_id into v_owner from public.play_sessions s where s.id = p_session;
    if v_owner is null or v_owner is distinct from p_user then
      return query select 0, 0, v_owner;
      return;
    end if;
  end if;

  -- 1. Anonymous, uncommitted, colliding with a slot the account already holds. No result to keep.
  delete from public.rounds a
   where a.session_id = p_session and a.user_id is null
     and a.daily_day is not null and a.committed_at is null
     and exists (select 1 from public.rounds b
                  where b.user_id = p_user and b.daily_day = a.daily_day and b.daily_index = a.daily_index);

  -- 2. The mirror: the account holds an empty round for a slot the anonymous session played.
  delete from public.rounds b
   where b.user_id = p_user and b.daily_day is not null and b.committed_at is null
     and exists (select 1 from public.rounds a
                  where a.session_id = p_session and a.user_id is null
                    and a.daily_day = b.daily_day and a.daily_index = b.daily_index
                    and a.committed_at is not null);

  -- 3. Both committed. The attempt already on the account stands. This is the rule that stops
  --    signing in from buying a second attempt — and it is "the account's attempt wins" rather
  --    than "the better score wins", because the latter makes reading the reveal in a private
  --    window and replaying signed-in a strategy rather than an exploit.
  update public.rounds a set superseded = true
   where a.session_id = p_session and a.user_id is null and not a.superseded
     and a.daily_day is not null and a.committed_at is not null
     and exists (select 1 from public.rounds b
                  where b.user_id = p_user and b.daily_day = a.daily_day
                    and b.daily_index = a.daily_index and b.committed_at is not null);
  get diagnostics v_super = row_count;

  -- 4. Everything left binds. Collisions were resolved above, so this cannot raise 23505.
  update public.rounds a set user_id = p_user
   where a.session_id = p_session and a.user_id is null and not a.superseded;
  get diagnostics v_claim = row_count;

  -- 5. Every daily the merged history actually completed now gets its durable record, so the
  --    streak the player earned before signing in is the streak they see afterwards.
  --    (Defined in 0012; claim_session is re-created there once it exists.)
  perform public.backfill_daily_completions(p_user);

  return query select v_claim, v_super, null::uuid;
end;
$$;
revoke all on function public.claim_session(uuid, uuid) from public, anon, authenticated;

drop function if exists public.issue_round(uuid, text);

create function public.issue_round(p_session uuid, p_user uuid, p_nonce text, p_tape text default 'open')
returns table (
  round_id uuid, chart_id uuid, lead_in_bars jsonb,
  atr14 double precision, tick_size double precision, entry_price double precision,
  start_dow integer, start_hour integer, lead_in_detail bytea
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_round_id uuid;
  v_owner uuid := coalesce(p_user, p_session);
  v_lead_in_bytes integer;
  v_tape public.tapes%rowtype;
begin
  insert into public.play_sessions (id) values (p_session)
  on conflict (id) do update set last_seen_at = now();

  select * into v_tape from public.tapes t where t.slug = coalesce(p_tape, 'open');
  if not found then raise exception 'no such tape: %', p_tape; end if;
  if v_tape.locked_reason is not null then raise exception 'tape % is locked', p_tape; end if;

  -- Prefer a chart this *player* has not been served. After a claim that spans every device they
  -- have ever played on, which is what a signed-in player expects.
  select c.* into v_chart
  from public.charts c
  where (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
    and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
    and not exists (select 1 from public.rounds r where r.chart_id = c.id and r.owner = v_owner)
  order by random() limit 1;

  if not found then
    select c.* into v_chart
    from public.charts c
    where (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
      and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
    order by random() limit 1;
  end if;
  if not found then raise exception 'corpus is empty - run the corpus pipeline first'; end if;

  insert into public.rounds (chart_id, session_id, user_id, nonce)
  values (v_chart.id, p_session, p_user, p_nonce)
  returning id into v_round_id;

  v_lead_in_bytes := jsonb_array_length(v_chart.lead_in_bars) * 60 * 20;

  return query select
    v_round_id, v_chart.id, v_chart.lead_in_bars, v_chart.atr14, v_chart.tick_size,
    v_chart.entry_price,
    (extract(isodow from (v_chart.window_start at time zone 'UTC'))::integer - 1),
    extract(hour from (v_chart.window_start at time zone 'UTC'))::integer,
    substring(v_chart.detail_path from 1 for v_lead_in_bytes);
end;
$$;
revoke all on function public.issue_round(uuid, uuid, text, text) from public, anon, authenticated;

drop function if exists public.issue_daily(uuid, integer, text);

create function public.issue_daily(p_session uuid, p_user uuid, p_day integer, p_nonce text)
returns table (
  round_id uuid, slot integer, lead_in_bars jsonb,
  atr14 double precision, tick_size double precision, entry_price double precision,
  start_dow integer, start_hour integer, lead_in_detail bytea
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_chart_id uuid;
  v_slot integer;
  v_round_id uuid;
  v_owner uuid := coalesce(p_user, p_session);
  v_lead_in_bytes integer;
begin
  insert into public.play_sessions (id) values (p_session)
  on conflict (id) do update set last_seen_at = now();

  -- Two tabs both asking for "the next slot" read the same answer and both insert; without this
  -- that races into a 23505. It is the same lock claim_session takes, so a claim cannot interleave
  -- with an issuance either.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));

  select d.chart_id, d.slot into v_chart_id, v_slot
  from public.daily_chart_ids(p_day) d
  where not exists (
    select 1 from public.rounds r
     where r.owner = v_owner and r.daily_day = p_day and r.daily_index = d.slot
       and r.committed_at is not null and not r.superseded)
  order by d.slot limit 1;

  if v_chart_id is null then return; end if;

  select r.id into v_round_id
  from public.rounds r
  where r.owner = v_owner and r.daily_day = p_day and r.daily_index = v_slot
    and r.committed_at is null and not r.superseded
  limit 1;

  if v_round_id is null then
    insert into public.rounds (chart_id, session_id, user_id, nonce, daily_day, daily_index)
    values (v_chart_id, p_session, p_user, p_nonce, p_day, v_slot)
    returning id into v_round_id;
  end if;

  select * into v_chart from public.charts c where c.id = v_chart_id;
  v_lead_in_bytes := jsonb_array_length(v_chart.lead_in_bars) * 60 * 20;

  return query select
    v_round_id, v_slot, v_chart.lead_in_bars, v_chart.atr14, v_chart.tick_size,
    v_chart.entry_price,
    (extract(isodow from (v_chart.window_start at time zone 'UTC'))::integer - 1),
    extract(hour from (v_chart.window_start at time zone 'UTC'))::integer,
    substring(v_chart.detail_path from 1 for v_lead_in_bytes);
end;
$$;
revoke all on function public.issue_daily(uuid, uuid, integer, text) from public, anon, authenticated;

create or replace function public.clear_corpus()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  -- truncate ... cascade reaches `rounds`, which once accounts exist means every player's history.
  if exists (select 1 from auth.users limit 1) then
    raise exception 'clear_corpus refuses to run on a database with accounts: it truncates rounds via cascade and would erase every player history.';
  end if;
  truncate table public.charts cascade;
end;
$$;
revoke all on function public.clear_corpus() from public, anon, authenticated;

-- Armed but inert: the policies exist, the GRANT does not. Turning on a browser-side client later
-- is then a one-line reviewable diff rather than an architecture change.
drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
