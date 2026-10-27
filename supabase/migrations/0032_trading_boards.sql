-- 0032: trading — leaderboards, the daily field, statements and the schools' curves.
--
-- Pure reads over 0030's tables. Every board ranks money, not a score: return on the account,
-- win rate, drawdown, sessions. And every board keeps two rules from the game's boards (0029):
--
-- - **A sample before a rank.** A player appears once they have closed `p_min_sessions` ranked
--   sessions; a single lucky replay is not a track record (§4.9).
-- - **Only ranked sessions count.** A practice session that showed real dates while it was open
--   could have been looked up, so it never reaches a board (§22.9).

create or replace function public.trade_leaderboard(
  p_order text default 'return', p_min_sessions integer default 10,
  p_bot_version text default null, p_limit integer default 50
)
returns table (
  kind text, account_id uuid, handle text, display_name text, avatar_seed integer, avatar_accent text,
  bot_code text, equity_micros bigint, starting_micros bigint, return_pct double precision,
  sessions integer, round_trips integer, wins integer, win_rate double precision,
  max_drawdown double precision, profit_factor double precision
)
language sql stable security invoker set search_path = ''
as $$
  with board as (
    select 'player'::text as kind, a.id as account_id, p.handle, p.display_name, p.avatar_seed, p.avatar_accent,
           null::text as bot_code, a.cash_micros, a.starting_micros, a.sessions, a.round_trips, a.wins,
           a.max_drawdown, a.gross_profit_micros, a.gross_loss_micros
    from public.trade_accounts a
    join public.profiles p on p.user_id = a.user_id
    where a.kind = 'player' and a.purpose = 'main' and a.status = 'active'
      and a.sessions >= p_min_sessions
    union all
    select 'bot', a.id, null, null, null, null, a.bot_code, a.cash_micros, a.starting_micros, a.sessions,
           a.round_trips, a.wins, a.max_drawdown, a.gross_profit_micros, a.gross_loss_micros
    from public.trade_accounts a
    where a.kind = 'bot' and (p_bot_version is null or a.bot_version = p_bot_version)
  )
  select b.kind, b.account_id, b.handle, b.display_name, b.avatar_seed, b.avatar_accent, b.bot_code,
         b.cash_micros, b.starting_micros,
         b.cash_micros::double precision / b.starting_micros - 1,
         b.sessions, b.round_trips, b.wins,
         case when b.round_trips > 0 then b.wins::double precision / b.round_trips end,
         b.max_drawdown,
         case when b.gross_loss_micros > 0 then b.gross_profit_micros::double precision / b.gross_loss_micros end
  from board b
  order by
    case when p_order = 'win_rate' then case when b.round_trips > 0 then b.wins::double precision / b.round_trips end end desc nulls last,
    case when p_order = 'drawdown' then b.max_drawdown end asc nulls last,
    case when p_order = 'sessions' then b.sessions end desc nulls last,
    case when p_order = 'profit_factor' then case when b.gross_loss_micros > 0 then b.gross_profit_micros::double precision / b.gross_loss_micros end end desc nulls last,
    b.cash_micros::double precision / b.starting_micros desc
  limit p_limit
$$;
revoke all on function public.trade_leaderboard(text, integer, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------- the daily market

/**
 * Everyone's result on one day's market, best first. The schools appear too: the daily chart is a
 * corpus chart, so each school's offline session on it is the same market traded by its rules.
 */
create or replace function public.trade_daily_board(p_day integer, p_bot_version text default null, p_limit integer default 50)
returns table (
  kind text, handle text, display_name text, avatar_seed integer, avatar_accent text, bot_code text,
  return_pct double precision, pnl_micros bigint, round_trips integer, wins integer, max_drawdown double precision
)
language sql stable security invoker set search_path = ''
as $$
  select 'player'::text, p.handle, p.display_name, p.avatar_seed, p.avatar_accent, null::text,
         s.return_pct, s.ending_micros - s.starting_micros, s.round_trips, s.wins, s.max_drawdown
  from public.trade_sessions s
  join public.trade_accounts a on a.id = s.account_id
  join public.profiles p on p.user_id = a.user_id
  where s.daily_day = p_day and s.status = 'closed' and s.ranked and s.close_reason in ('end', 'user')
  union all
  select 'bot', null, null, null, null, a.bot_code,
         s.return_pct, s.ending_micros - s.starting_micros, s.round_trips, s.wins, s.max_drawdown
  from public.trade_sessions s
  join public.trade_accounts a on a.id = s.account_id
  where a.kind = 'bot' and (p_bot_version is null or a.bot_version = p_bot_version)
    and s.chart_id = public.trade_daily_chart(p_day) and s.status = 'closed'
  order by 7 desc
  limit p_limit
$$;
revoke all on function public.trade_daily_board(integer, text, integer) from public, anon, authenticated;

/** The day's field as a histogram of returns, in percent buckets from −10% to +10%, anonymous players included. */
create or replace function public.trade_daily_field(p_day integer)
returns table (bucket integer, players integer)
language sql stable security invoker set search_path = ''
as $$
  select greatest(-10, least(10, floor(s.return_pct * 100)::integer)) as bucket, count(*)::integer
  from public.trade_sessions s
  join public.trade_accounts a on a.id = s.account_id
  where s.daily_day = p_day and s.status = 'closed' and s.ranked and a.kind = 'player'
  group by 1
  order by 1
$$;
revoke all on function public.trade_daily_field(integer) from public, anon, authenticated;

/** Where one owner's daily result stands: their return, rank, and the size of the field. */
create or replace function public.trade_daily_standing(p_day integer, p_owner uuid)
returns table (return_pct double precision, rank integer, field integer)
language sql stable security invoker set search_path = ''
as $$
  with field as (
    select a.owner, s.return_pct
    from public.trade_sessions s
    join public.trade_accounts a on a.id = s.account_id
    where s.daily_day = p_day and s.status = 'closed' and s.ranked and a.kind = 'player'
  )
  select f.return_pct,
         (select count(*) from field g where g.return_pct > f.return_pct)::integer + 1,
         (select count(*) from field)::integer
  from field f where f.owner = p_owner
$$;
revoke all on function public.trade_daily_standing(integer, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- statements

/** An account's sessions, newest first, with what each came to. */
create or replace function public.trade_account_sessions(p_account uuid, p_limit integer default 50)
returns table (
  session_id uuid, symbol text, source text, scenario text, daily_day integer, ranked boolean, status text,
  close_reason text, opened_at timestamptz, closed_at timestamptz, starting_micros bigint, ending_micros bigint,
  return_pct double precision, round_trips integer, wins integer, fees_micros bigint, max_drawdown double precision
)
language sql stable security invoker set search_path = ''
as $$
  select s.id, s.symbol, s.source, s.scenario, s.daily_day, s.ranked, s.status, s.close_reason, s.opened_at,
         s.closed_at, s.starting_micros, s.ending_micros, s.return_pct, s.round_trips, s.wins, s.fees_micros,
         s.max_drawdown
  from public.trade_sessions s
  where s.account_id = p_account
  order by s.opened_at desc
  limit p_limit
$$;
revoke all on function public.trade_account_sessions(uuid, integer) from public, anon, authenticated;

/**
 * An account's equity after each closed session, oldest first. For a school the order is the
 * order it met the markets in (calendar order of the decision bar); for a player, the order they
 * closed them. Symbols and dates are deliberately not returned (§22.9).
 */
create or replace function public.trade_account_curve(p_account uuid, p_limit integer default 2000)
returns table (n integer, equity_micros bigint, return_pct double precision)
language sql stable security invoker set search_path = ''
as $$
  select (row_number() over (order by coalesce(c.decision_at, s.closed_at), s.closed_at))::integer,
         s.ending_micros, s.return_pct
  from public.trade_sessions s
  join public.trade_accounts a on a.id = s.account_id
  left join public.charts c on c.id = s.chart_id and a.kind = 'bot'
  where s.account_id = p_account and s.status = 'closed' and s.ending_micros is not null
  order by 1
  limit p_limit
$$;
revoke all on function public.trade_account_curve(uuid, integer) from public, anon, authenticated;

/** The pairs on offer, with how many replay windows each has. No dates, no eras. */
create or replace function public.trade_markets(p_query text default null)
returns table (symbol text, windows integer, delisted boolean)
language sql stable security invoker set search_path = ''
as $$
  select c.symbol, count(*)::integer, bool_or(coalesce(c.delisted, false))
  from public.charts c
  where c.synthetic = false
    and (p_query is null or c.symbol ilike '%' || p_query || '%')
  group by c.symbol
  order by count(*) desc, c.symbol
$$;
revoke all on function public.trade_markets(text) from public, anon, authenticated;
