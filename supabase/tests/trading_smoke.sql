-- A smoke test of 0030–0033 against a fresh scratch database with every migration applied (never
-- the live project, and not one the bot writer has already filled — it expects no school accounts):
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/trading_smoke.sql
--
-- Runs in one transaction and rolls back. Fails loudly (an exception) on the first broken rule.
begin;

-- Two real charts and one synthetic one. Only the columns the trading functions read matter.
insert into public.charts (id, symbol, window_start, decision_at, display_tf, resolution_tf, lead_in_bars, reveal_bars,
  resolution_path, index_factor, volume_base, mirrored, atr14, tick_size, entry_price, selection_seed,
  pipeline_version, normalization_version, synthetic)
values
  ('00000000-0000-0000-0000-0000000000c1', 'BTCUSDT', now() - interval '100 days', now() - interval '99 days', '1h', '1m', '[]', '[]',
   decode(repeat('00', 3600 * 16), 'hex'), 1, 1, false, 1, 0.01, 100, 1, 'p', 'n', false),
  ('00000000-0000-0000-0000-0000000000c2', 'ETHUSDT', now() - interval '50 days', now() - interval '49 days', '1h', '1m', '[]', '[]',
   decode(repeat('00', 3600 * 16), 'hex'), 1, 1, true, 1, 0.01, 100, 2, 'p', 'n', false),
  ('00000000-0000-0000-0000-0000000000c3', 'FAKEUSDT', now() - interval '10 days', now() - interval '9 days', '1h', '1m', '[]', '[]',
   decode(repeat('00', 3600 * 16), 'hex'), 1, 1, false, 1, 0.01, 100, 3, 'p', 'n', true);

do $$
declare
  v_anon uuid := '00000000-0000-0000-0000-00000000a001';
  v_user uuid := '00000000-0000-0000-0000-00000000b001';
  v_versions jsonb := '{"sim":"sim-1","fee":"fees-1","margin":"margin-1","instrument":"instrument-1"}';
  r record;
  v_session uuid;
  v_account uuid;
  v_again record;
  v_ok boolean;
  v_count integer;
begin
  insert into auth.users (id) values (v_user);

  -- Opening deals a real chart, paused, at the account's cash, with the tape's length.
  select * into r from public.trade_open_session(v_anon, null, 'main', 'random', null, null, null, false, 100000000000, 15, 'n1', v_versions);
  v_session := r.session_id; v_account := r.account_id;
  if r.existing then raise exception 'a first session should be new'; end if;
  if r.chart_id = '00000000-0000-0000-0000-0000000000c3' then raise exception 'dealt a synthetic chart'; end if;
  perform 1 from public.trade_sessions s where s.id = v_session and s.paused and s.total_minutes = 3600 and s.ranked and s.starting_micros = 100000000000;
  if not found then raise exception 'session opened in the wrong state'; end if;

  -- A second open returns the same session rather than a second one.
  select * into v_again from public.trade_open_session(v_anon, null, 'main', 'random', null, null, null, false, 100000000000, 15, 'n2', v_versions);
  if not v_again.existing or v_again.session_id <> v_session then raise exception 'one open session per account'; end if;

  -- Events: numbered, never earlier than the last, idempotent on the client key.
  select * into r from public.trade_append_event(v_session, v_anon, 10, 'k1', '{"kind":"place"}');
  if r.seq <> 1 or r.at_index <> 10 or r.duplicate then raise exception 'first append wrong: %', r; end if;
  select * into r from public.trade_append_event(v_session, v_anon, 5, 'k2', '{"kind":"cancel"}');
  if r.seq <> 2 or r.at_index <> 10 then raise exception 'a late event must not go back in time: %', r; end if;
  select * into r from public.trade_append_event(v_session, v_anon, 20, 'k1', '{"kind":"place"}');
  if r.seq <> 1 or not r.duplicate then raise exception 'a retried key must not append twice: %', r; end if;
  begin
    perform public.trade_append_event(v_session, v_user, 30, 'k3', '{}');
    raise exception 'a stranger appended to the session';
  exception when others then
    if sqlerrm not like '%not your session%' then raise; end if;
  end;

  -- The clock is compare-and-swap.
  v_ok := public.trade_set_clock(v_session, 0, 60, now(), 60, false, now() + interval '15 seconds', 1);
  if not v_ok then raise exception 'clock update refused'; end if;
  v_ok := public.trade_set_clock(v_session, 0, 99, now(), 60, false, now(), 1);
  if v_ok then raise exception 'a stale clock version won'; end if;

  -- Finalize books the result once.
  v_ok := public.trade_finalize_session(v_session,
    '{"ending_micros":101000000000,"realized_micros":1100000000,"fees_micros":100000000,"return_pct":0.01,"max_drawdown":0.02,"round_trips":2,"wins":1,"ambiguous_fills":0,"close_reason":"user","bankrupt":false}',
    '[{"seq":1,"order_id":"a","at_index":10,"side":"buy","qty_steps":100,"price_ticks":1000,"notional_micros":100000,"fee_micros":100,"liquidity":"taker","role":"entry","gap":false,"ambiguous":false,"realized_micros":0}]',
    '[{"n":1,"side":"long","opened_at_index":10,"closed_at_index":40,"max_qty_steps":100,"entry_avg_ticks":1000,"exit_avg_ticks":1100,"gross_micros":1500000000,"fees_micros":50000000,"net_micros":1450000000,"mfe_micros":2000000000,"mae_micros":-10000000},
      {"n":2,"side":"short","opened_at_index":50,"closed_at_index":60,"max_qty_steps":100,"entry_avg_ticks":1100,"exit_avg_ticks":1140,"gross_micros":-400000000,"fees_micros":50000000,"net_micros":-450000000,"mfe_micros":0,"mae_micros":-500000000}]',
    '[100000000000, 101000000000]');
  if not v_ok then raise exception 'finalize refused'; end if;
  if public.trade_finalize_session(v_session, '{"ending_micros":1}', '[]', '[]', '[]') then raise exception 'finalized twice'; end if;
  perform 1 from public.trade_accounts a where a.id = v_account and a.cash_micros = 101000000000 and a.sessions = 1
    and a.round_trips = 2 and a.wins = 1 and a.gross_profit_micros = 1450000000 and a.gross_loss_micros = 450000000;
  if not found then raise exception 'account not carried forward: %', (select row_to_json(a) from public.trade_accounts a where a.id = v_account); end if;

  -- The next session starts at the new cash.
  select * into r from public.trade_open_session(v_anon, null, 'main', 'pair', 'ETHUSDT', null, null, false, 100000000000, 15, 'n3', v_versions);
  perform 1 from public.trade_sessions s where s.id = r.session_id and s.starting_micros = 101000000000 and s.symbol = 'ETHUSDT';
  if not found then raise exception 'second session did not start at the carried equity on the asked pair'; end if;

  -- Practice with dates is never ranked; dates are refused on main.
  select * into r from public.trade_open_session(v_anon, null, 'practice', 'random', null, null, null, true, 100000000000, 15, 'n4', v_versions);
  perform 1 from public.trade_sessions s where s.id = r.session_id and s.dates_visible and not s.ranked;
  if not found then raise exception 'practice with dates must be unranked'; end if;
  select * into r from public.trade_open_session(v_user, v_user, 'main', 'random', null, null, null, true, 100000000000, 15, 'n5', v_versions);
  perform 1 from public.trade_sessions s where s.id = r.session_id and not s.dates_visible and s.ranked;
  if not found then raise exception 'main must never show dates'; end if;

  -- The daily is once per account per day, and is the same chart for everyone.
  insert into auth.users (id) values ('00000000-0000-0000-0000-00000000b002');
  select * into r from public.trade_open_session('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000b002', 'main', 'daily', null, null, 77, false, 100000000000, 15, 'n6', v_versions);
  if r.chart_id <> public.trade_daily_chart(77) then raise exception 'daily dealt the wrong chart'; end if;
  perform public.trade_finalize_session(r.session_id, '{"ending_micros":100000000000,"realized_micros":0,"fees_micros":0,"return_pct":0,"max_drawdown":0,"round_trips":0,"wins":0,"ambiguous_fills":0}', '[]', '[]', '[]');
  begin
    perform public.trade_open_session('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000b002', 'main', 'daily', null, null, 77, false, 100000000000, 15, 'n7', v_versions);
    raise exception 'played the daily twice';
  exception when others then
    if sqlerrm not like '%already played%' then raise; end if;
  end;

  -- Reset is refused with a session open, and otherwise archives and starts again.
  begin
    perform public.trade_reset_account(v_anon, null, 'main', 100000000000, v_versions);
    raise exception 'reset with a session open';
  exception when others then
    if sqlerrm not like '%close the open session%' then raise; end if;
  end;

  -- The schools: one account per version, one session per chart, booked through finalize.
  v_account := public.trade_bot_account('CHANNEL', 'bots-1', 100000000000, v_versions);
  if public.trade_bot_account('CHANNEL', 'bots-1', 100000000000, v_versions) <> v_account then raise exception 'two accounts for one school'; end if;
  if not public.trade_record_bot_session(v_account, '00000000-0000-0000-0000-0000000000c1', 'BTCUSDT',
      '[{"kind":"place","seq":1,"at":-1,"order":{"id":"x"}}]',
      '{"ending_micros":99000000000,"realized_micros":-900000000,"fees_micros":100000000,"return_pct":-0.01,"max_drawdown":0.01,"round_trips":1,"wins":0,"ambiguous_fills":0}',
      '[]', '[]', '[]') then raise exception 'bot session not recorded'; end if;
  if public.trade_record_bot_session(v_account, '00000000-0000-0000-0000-0000000000c1', 'BTCUSDT', '[]', '{"ending_micros":1}', '[]', '[]', '[]') then
    raise exception 'bot session recorded twice';
  end if;
  select count(*) into v_count from public.trade_order_events e join public.trade_sessions s on s.id = e.session_id where s.account_id = v_account;
  if v_count <> 1 then raise exception 'bot events not stored'; end if;

  -- Boards: the anonymous main account has no profile and so no name on the board; the school does.
  select count(*) into v_count from public.trade_leaderboard('return', 0, 'bots-1', 50);
  if v_count <> 1 then raise exception 'leaderboard should list the school only, got %', v_count; end if;
  select count(*) into v_count from public.trade_account_curve(v_account);
  if v_count <> 1 then raise exception 'curve wrong'; end if;
  select count(*) into v_count from public.trade_markets(null);
  if v_count <> 2 then raise exception 'markets should list the two real pairs, got %', v_count; end if;

  -- Scenarios: the rule is applied to the real drift (a mirrored chart's stored drift has the other
  -- sign), and a locked scenario is never dealt.
  update public.charts set lead_in_drift_atr = -9
  where id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
  insert into public.tapes (slug, name, blurb, drift_below, published) values ('smoke-drop', 'Smoke drop', 'x', -8, false);
  insert into public.tapes (slug, name, blurb, locked_reason, published) values ('smoke-locked', 'Smoke locked', 'x', 'closed', false);
  select * into r from public.trade_open_session('00000000-0000-0000-0000-00000000a003', null, 'main', 'scenario', null, 'smoke-drop', null, false, 100000000000, 15, 'n8', v_versions);
  if r.chart_id <> '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'a scenario dealt a market outside its rule: %', r.chart_id;
  end if;
  begin
    perform public.trade_open_session('00000000-0000-0000-0000-00000000a004', null, 'main', 'scenario', null, 'smoke-locked', null, false, 100000000000, 15, 'n9', v_versions);
    raise exception 'a locked scenario was dealt';
  exception when others then
    if sqlerrm not like '%is not open%' then raise; end if;
  end;

  -- Signing in: the anonymous accounts come with the session.
  insert into auth.users (id) values ('00000000-0000-0000-0000-00000000b003');
  perform public.claim_session(v_anon, '00000000-0000-0000-0000-00000000b003');
  select count(*) into v_count from public.trade_accounts a where a.user_id = '00000000-0000-0000-0000-00000000b003' and a.status = 'active';
  if v_count <> 2 then raise exception 'claim should adopt both anonymous accounts, got %', v_count; end if;

  raise notice 'trading smoke test: ok';
end;
$$;

rollback;
