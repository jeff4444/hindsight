-- 0031: trading — the functions the server calls.
--
-- Every function runs as the service role (security invoker, execute revoked from everyone else),
-- like every other function in this schema. Each one that changes a session takes the session's
-- row lock first, so two tabs racing two orders are serialised by the database rather than by luck.

-- ------------------------------------------------------------------ helpers

/** The day's market, the same for everyone: a real chart chosen by hashing the day number. */
create or replace function public.trade_daily_chart(p_day integer)
returns uuid
language sql stable security invoker set search_path = ''
as $$
  select c.id from public.charts c
  where c.synthetic = false
  order by md5(c.id::text || ':trade-daily:' || p_day::text)
  limit 1
$$;
revoke all on function public.trade_daily_chart(integer) from public, anon, authenticated;

/** The player's active account for a purpose, created at the starting balance if there is none. */
create or replace function public.trade_player_account(
  p_session uuid, p_user uuid, p_purpose text, p_starting_micros bigint, p_versions jsonb
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_owner uuid := coalesce(p_user, p_session);
  v_id uuid;
begin
  insert into public.play_sessions (id) values (p_session)
  on conflict (id) do update set last_seen_at = now();

  perform pg_advisory_xact_lock(hashtextextended('trade:' || v_owner::text, 0));

  select a.id into v_id from public.trade_accounts a
  where a.owner = v_owner and a.purpose = p_purpose and a.kind = 'player' and a.status = 'active';
  if found then return v_id; end if;

  insert into public.trade_accounts (
    kind, purpose, session_id, user_id, starting_micros, cash_micros, peak_micros,
    sim_version, fee_version, margin_version
  ) values (
    'player', p_purpose, p_session, p_user, p_starting_micros, p_starting_micros, p_starting_micros,
    p_versions ->> 'sim', p_versions ->> 'fee', p_versions ->> 'margin'
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.trade_player_account(uuid, uuid, text, bigint, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ opening a market

/**
 * Open a session, or hand back the one already open.
 *
 * One open session per account: margin is account-wide, and two replays are two different moments
 * in history, so they cannot share one equity figure (§22.8).
 *
 * Only real charts are ever dealt here — a synthetic control shown under a real ticker would be a
 * lie (§16.2) — and charts this account has already traded are preferred.
 */
create or replace function public.trade_open_session(
  p_session uuid, p_user uuid, p_purpose text, p_source text,
  p_symbol text, p_scenario text, p_day integer, p_show_dates boolean,
  p_starting_micros bigint, p_speed integer, p_nonce text, p_versions jsonb
)
returns table (session_id uuid, account_id uuid, chart_id uuid, existing boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_account public.trade_accounts%rowtype;
  v_open public.trade_sessions%rowtype;
  v_tape public.tapes%rowtype;
  v_chart public.charts%rowtype;
  v_session uuid;
  v_dates boolean := (p_purpose = 'practice' and coalesce(p_show_dates, false));
begin
  if p_purpose not in ('main', 'practice') then raise exception 'unknown account purpose %', p_purpose; end if;
  if p_source not in ('random', 'pair', 'daily', 'scenario') then raise exception 'unknown market source %', p_source; end if;
  if p_source = 'daily' and p_purpose <> 'main' then raise exception 'the daily is played on the main account'; end if;

  -- Two statements, not one: a select cannot see a row its own subquery inserted.
  v_session := public.trade_player_account(p_session, p_user, p_purpose, p_starting_micros, p_versions);
  select * into v_account from public.trade_accounts a where a.id = v_session;
  v_session := null;

  if v_account.bankrupt then raise exception 'account is bankrupt - reset it to trade again'; end if;

  select * into v_open from public.trade_sessions s
  where s.account_id = v_account.id and s.status = 'open';
  if found then
    return query select v_open.id, v_account.id, v_open.chart_id, true;
    return;
  end if;

  if p_source = 'daily' then
    if exists (select 1 from public.trade_sessions s where s.account_id = v_account.id and s.daily_day = p_day) then
      raise exception 'daily % already played', p_day;
    end if;
    select c.* into v_chart from public.charts c where c.id = public.trade_daily_chart(p_day);
  elsif p_source = 'scenario' then
    select * into v_tape from public.tapes t where t.slug = p_scenario;
    if not found then raise exception 'no such scenario: %', p_scenario; end if;
    if v_tape.visibility = 'private' and (p_user is null or p_user is distinct from v_tape.owner_id) then
      raise exception 'scenario % is private', p_scenario;
    end if;
    -- The tape's filter, over real charts. Drift was measured on the stored bars, so a mirrored
    -- chart's real drift is the opposite sign (the reflection is in log space).
    select c.* into v_chart from public.charts c
    where c.synthetic = false
      and (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
      and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
      and (v_tape.themes is null or c.themes && v_tape.themes)
      and (v_tape.drift_below is null or (case when c.mirrored then -c.lead_in_drift_atr else c.lead_in_drift_atr end) <= v_tape.drift_below)
      and (v_tape.drift_above is null or (case when c.mirrored then -c.lead_in_drift_atr else c.lead_in_drift_atr end) >= v_tape.drift_above)
      and (not v_tape.council_split or c.council_minority > 0)
    order by (exists (select 1 from public.trade_sessions s where s.account_id = v_account.id and s.chart_id = c.id)), random()
    limit 1;
  else
    select c.* into v_chart from public.charts c
    where c.synthetic = false
      and (p_source <> 'pair' or c.symbol = p_symbol)
    order by (exists (select 1 from public.trade_sessions s where s.account_id = v_account.id and s.chart_id = c.id)), random()
    limit 1;
  end if;

  if v_chart.id is null then
    raise exception 'no market matches (% %)', p_source, coalesce(p_symbol, p_scenario, '');
  end if;

  insert into public.trade_sessions (
    account_id, chart_id, source, scenario, daily_day, ranked, dates_visible, symbol,
    total_minutes, starting_micros, nonce, speed, paused, lease_until,
    sim_version, fee_version, margin_version, instrument_version
  ) values (
    v_account.id, v_chart.id, p_source,
    case when p_source = 'scenario' then p_scenario end,
    case when p_source = 'daily' then p_day end,
    p_purpose = 'main' and not v_dates,
    v_dates,
    v_chart.symbol,
    octet_length(v_chart.resolution_path) / 16,
    v_account.cash_micros,
    p_nonce, p_speed, true, now() + interval '15 seconds',
    p_versions ->> 'sim', p_versions ->> 'fee', p_versions ->> 'margin', p_versions ->> 'instrument'
  ) returning id into v_session;

  return query select v_session, v_account.id, v_chart.id, false;
end;
$$;
revoke all on function public.trade_open_session(uuid, uuid, text, text, text, text, integer, boolean, bigint, integer, text, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------------ the log and the clock

/**
 * Append one event to a session's log.
 *
 * The minute it is stamped at is never earlier than the last event's (no retroactive orders), the
 * sequence number is assigned here, and a retried request with the same client key returns the
 * event it already made rather than making a second one.
 */
create or replace function public.trade_append_event(
  p_session uuid, p_owner uuid, p_at integer, p_client_key text, p_event jsonb
)
returns table (seq integer, at_index integer, duplicate boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_session public.trade_sessions%rowtype;
  v_owner uuid;
  v_seq integer;
  v_at integer;
begin
  select s.* into v_session from public.trade_sessions s where s.id = p_session for update;
  if not found then raise exception 'no such session'; end if;
  select a.owner into v_owner from public.trade_accounts a where a.id = v_session.account_id;
  if v_owner is distinct from p_owner then raise exception 'not your session'; end if;
  if v_session.status <> 'open' then raise exception 'session is closed'; end if;

  if p_client_key is not null then
    select e.seq, e.at_index into v_seq, v_at from public.trade_order_events e
    where e.session_id = p_session and e.client_key = p_client_key;
    if found then
      return query select v_seq, v_at, true;
      return;
    end if;
  end if;

  v_at := greatest(p_at, v_session.high_water);
  v_seq := v_session.event_count + 1;
  insert into public.trade_order_events (session_id, seq, at_index, client_key, event)
  values (p_session, v_seq, v_at, p_client_key, p_event);
  update public.trade_sessions s set event_count = v_seq, high_water = v_at where s.id = p_session;

  return query select v_seq, v_at, false;
end;
$$;
revoke all on function public.trade_append_event(uuid, uuid, integer, text, jsonb) from public, anon, authenticated;

/** Move the clock, if nobody else has since it was read. Returns false on a lost race. */
create or replace function public.trade_set_clock(
  p_session uuid, p_expected_version integer,
  p_anchor_revealed integer, p_anchor_at timestamptz, p_speed integer, p_paused boolean,
  p_lease_until timestamptz, p_version integer
)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.trade_sessions s
     set anchor_revealed = p_anchor_revealed,
         anchor_at = p_anchor_at,
         speed = p_speed,
         paused = p_paused,
         lease_until = p_lease_until,
         clock_version = p_version
   where s.id = p_session and s.clock_version = p_expected_version and s.status = 'open';
  return found;
end;
$$;
revoke all on function public.trade_set_clock(uuid, integer, integer, timestamptz, integer, boolean, timestamptz, integer)
  from public, anon, authenticated;

-- ------------------------------------------------------------------ closing

/**
 * Close a session: write what its log came to, and carry the result into the account.
 *
 * Idempotent: a session already closed is left alone and the call returns false, so two requests
 * that both reach the end of the tape cannot book the result twice.
 */
create or replace function public.trade_finalize_session(
  p_session uuid, p_summary jsonb, p_fills jsonb, p_trips jsonb, p_curve jsonb
)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_session public.trade_sessions%rowtype;
  v_ending bigint := (p_summary ->> 'ending_micros')::bigint;
  v_profit bigint;
  v_loss bigint;
begin
  select s.* into v_session from public.trade_sessions s where s.id = p_session for update;
  if not found then raise exception 'no such session'; end if;
  if v_session.status = 'closed' then return false; end if;

  insert into public.trade_fills (
    session_id, seq, order_id, at_index, side, qty_steps, price_ticks, notional_micros, fee_micros,
    liquidity, role, gap, ambiguous, realized_micros
  )
  select p_session, f.seq, f.order_id, f.at_index, f.side, f.qty_steps, f.price_ticks, f.notional_micros,
         f.fee_micros, f.liquidity, f.role, f.gap, f.ambiguous, f.realized_micros
  from jsonb_to_recordset(coalesce(p_fills, '[]'::jsonb)) as f (
    seq integer, order_id text, at_index integer, side text, qty_steps bigint, price_ticks bigint,
    notional_micros bigint, fee_micros bigint, liquidity text, role text, gap boolean, ambiguous boolean,
    realized_micros bigint
  );

  insert into public.trade_round_trips (
    session_id, n, side, opened_at_index, closed_at_index, max_qty_steps, entry_avg_ticks, exit_avg_ticks,
    gross_micros, fees_micros, net_micros, mfe_micros, mae_micros
  )
  select p_session, t.n, t.side, t.opened_at_index, t.closed_at_index, t.max_qty_steps, t.entry_avg_ticks,
         t.exit_avg_ticks, t.gross_micros, t.fees_micros, t.net_micros, t.mfe_micros, t.mae_micros
  from jsonb_to_recordset(coalesce(p_trips, '[]'::jsonb)) as t (
    n integer, side text, opened_at_index integer, closed_at_index integer, max_qty_steps bigint,
    entry_avg_ticks double precision, exit_avg_ticks double precision, gross_micros bigint, fees_micros bigint,
    net_micros bigint, mfe_micros bigint, mae_micros bigint
  );

  select coalesce(sum(greatest(t.net_micros, 0)), 0), coalesce(sum(greatest(-t.net_micros, 0)), 0)
    into v_profit, v_loss
  from public.trade_round_trips t where t.session_id = p_session;

  update public.trade_sessions s set
    status = 'closed',
    closed_at = now(),
    paused = true,
    close_reason = coalesce(p_summary ->> 'close_reason', 'end'),
    ending_micros = v_ending,
    realized_micros = (p_summary ->> 'realized_micros')::bigint,
    fees_micros = (p_summary ->> 'fees_micros')::bigint,
    return_pct = (p_summary ->> 'return_pct')::double precision,
    max_drawdown = (p_summary ->> 'max_drawdown')::double precision,
    round_trips = (p_summary ->> 'round_trips')::integer,
    wins = (p_summary ->> 'wins')::integer,
    ambiguous_fills = (p_summary ->> 'ambiguous_fills')::integer,
    bankrupt = coalesce((p_summary ->> 'bankrupt')::boolean, false),
    equity_curve = p_curve
  where s.id = p_session;

  update public.trade_accounts a set
    cash_micros = v_ending,
    realized_micros = a.realized_micros + (p_summary ->> 'realized_micros')::bigint,
    fees_micros = a.fees_micros + (p_summary ->> 'fees_micros')::bigint,
    sessions = a.sessions + 1,
    round_trips = a.round_trips + (p_summary ->> 'round_trips')::integer,
    wins = a.wins + (p_summary ->> 'wins')::integer,
    gross_profit_micros = a.gross_profit_micros + v_profit,
    gross_loss_micros = a.gross_loss_micros + v_loss,
    peak_micros = greatest(a.peak_micros, v_ending),
    max_drawdown = greatest(
      a.max_drawdown,
      coalesce((p_summary ->> 'max_drawdown')::double precision, 0),
      case when greatest(a.peak_micros, v_ending) > 0
           then 1 - v_ending::double precision / greatest(a.peak_micros, v_ending) else 0 end
    ),
    bankrupt = a.bankrupt or coalesce((p_summary ->> 'bankrupt')::boolean, false)
  where a.id = v_session.account_id;

  return true;
end;
$$;
revoke all on function public.trade_finalize_session(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;

/** Archive the active account and open a fresh one. Refused while a session is open. */
create or replace function public.trade_reset_account(
  p_session uuid, p_user uuid, p_purpose text, p_starting_micros bigint, p_versions jsonb
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_owner uuid := coalesce(p_user, p_session);
  v_old uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('trade:' || v_owner::text, 0));
  select a.id into v_old from public.trade_accounts a
  where a.owner = v_owner and a.purpose = p_purpose and a.kind = 'player' and a.status = 'active';
  if v_old is not null then
    if exists (select 1 from public.trade_sessions s where s.account_id = v_old and s.status = 'open') then
      raise exception 'close the open session before resetting';
    end if;
    update public.trade_accounts a set status = 'archived', archived_at = now() where a.id = v_old;
  end if;
  return public.trade_player_account(p_session, p_user, p_purpose, p_starting_micros, p_versions);
end;
$$;
revoke all on function public.trade_reset_account(uuid, uuid, text, bigint, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ the schools

/** A school's account for one bot version, created on first use. */
create or replace function public.trade_bot_account(
  p_code text, p_version text, p_starting_micros bigint, p_versions jsonb
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
begin
  select a.id into v_id from public.trade_accounts a
  where a.kind = 'bot' and a.bot_code = p_code and a.bot_version = p_version;
  if found then return v_id; end if;
  insert into public.trade_accounts (
    kind, purpose, bot_code, bot_version, starting_micros, cash_micros, peak_micros,
    sim_version, fee_version, margin_version
  ) values (
    'bot', 'main', p_code, p_version, p_starting_micros, p_starting_micros, p_starting_micros,
    p_versions ->> 'sim', p_versions ->> 'fee', p_versions ->> 'margin'
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.trade_bot_account(text, text, bigint, jsonb) from public, anon, authenticated;

/**
 * Record one market a school traded, offline, through the same finalize a player's session uses.
 * Idempotent per (account, chart): re-running the script never books a market twice.
 */
create or replace function public.trade_record_bot_session(
  p_account uuid, p_chart uuid, p_symbol text, p_events jsonb,
  p_summary jsonb, p_fills jsonb, p_trips jsonb, p_curve jsonb
)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  v_account public.trade_accounts%rowtype;
  v_session uuid;
begin
  select * into v_account from public.trade_accounts a where a.id = p_account for update;
  if not found or v_account.kind <> 'bot' then raise exception 'not a school''s account'; end if;
  if exists (select 1 from public.trade_sessions s where s.account_id = p_account and s.chart_id = p_chart) then
    return false;
  end if;

  insert into public.trade_sessions (
    account_id, chart_id, source, ranked, symbol, total_minutes, starting_micros,
    sim_version, fee_version, margin_version, instrument_version, bot_version
  )
  select p_account, c.id, 'corpus', true, p_symbol, octet_length(c.resolution_path) / 16, v_account.cash_micros,
         v_account.sim_version, v_account.fee_version, v_account.margin_version,
         coalesce(p_summary ->> 'instrument_version', 'instrument-1'), v_account.bot_version
  from public.charts c where c.id = p_chart
  returning id into v_session;
  if v_session is null then raise exception 'no such chart'; end if;

  insert into public.trade_order_events (session_id, seq, at_index, event)
  select v_session, (e ->> 'seq')::integer, (e ->> 'at')::integer, e - 'seq' - 'at'
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) as e;

  perform public.trade_finalize_session(v_session, p_summary, p_fills, p_trips, p_curve);
  return true;
end;
$$;
revoke all on function public.trade_record_bot_session(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;

-- ------------------------------------------------------------------ signing in

/**
 * claim_session, extended to trading accounts. The body up to step 5 is 0011's, unchanged;
 * plpgsql has no way to patch a function, so it is repeated whole.
 *
 * 6. An anonymous trading account comes with the session. If the user has no active account for
 *    that purpose it simply becomes theirs. If they already have one, the account they built while
 *    signed in stands — the same "the account's record wins" rule as step 3 — and the anonymous one
 *    is archived (still attached to the user, so its history is not lost) with any session it had
 *    open marked superseded.
 */
create or replace function public.claim_session(p_session uuid, p_user uuid)
returns table (claimed integer, superseded_count integer, refused_to uuid)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_owner uuid;
  v_claim integer := 0;
  v_super integer := 0;
  v_account record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  insert into public.play_sessions (id) values (p_session) on conflict (id) do nothing;

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

  delete from public.rounds a
   where a.session_id = p_session and a.user_id is null
     and a.daily_day is not null and a.committed_at is null
     and exists (select 1 from public.rounds b
                  where b.user_id = p_user and b.daily_day = a.daily_day and b.daily_index = a.daily_index);

  delete from public.rounds b
   where b.user_id = p_user and b.daily_day is not null and b.committed_at is null
     and exists (select 1 from public.rounds a
                  where a.session_id = p_session and a.user_id is null
                    and a.daily_day = b.daily_day and a.daily_index = b.daily_index
                    and a.committed_at is not null);

  update public.rounds a set superseded = true
   where a.session_id = p_session and a.user_id is null and not a.superseded
     and a.daily_day is not null and a.committed_at is not null
     and exists (select 1 from public.rounds b
                  where b.user_id = p_user and b.daily_day = a.daily_day
                    and b.daily_index = a.daily_index and b.committed_at is not null);
  get diagnostics v_super = row_count;

  update public.rounds a set user_id = p_user
   where a.session_id = p_session and a.user_id is null and not a.superseded;
  get diagnostics v_claim = row_count;

  perform public.backfill_daily_completions(p_user);

  -- 6. Trading accounts.
  for v_account in
    select a.id, a.purpose from public.trade_accounts a
    where a.session_id = p_session and a.user_id is null and a.kind = 'player'
  loop
    if exists (select 1 from public.trade_accounts b
               where b.user_id = p_user and b.purpose = v_account.purpose
                 and b.kind = 'player' and b.status = 'active') then
      update public.trade_sessions s set status = 'closed', close_reason = 'superseded', closed_at = now(), paused = true
       where s.account_id = v_account.id and s.status = 'open';
      update public.trade_accounts a set user_id = p_user, status = 'archived', archived_at = now()
       where a.id = v_account.id;
    else
      update public.trade_accounts a set user_id = p_user where a.id = v_account.id;
    end if;
  end loop;

  return query select v_claim, v_super, null::uuid;
end;
$$;
revoke all on function public.claim_session(uuid, uuid) from public, anon, authenticated;
