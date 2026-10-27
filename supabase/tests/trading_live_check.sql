-- A read-only check of migrations 0030–0033 on a live project. Safe on production: it is one
-- SELECT, it calls only `stable` read functions, and it writes nothing. Paste it into the Supabase
-- SQL editor, or:
--
--   psql "$DATABASE_URL" -f supabase/tests/trading_live_check.sql
--
-- One row per check. `ok` is what you want; `FAIL` names what is wrong; `todo` is a step not yet
-- run (the schools' accounts stay empty until `npm run bots -- --write`). A missing function shows
-- as FAIL rather than stopping the query: the calls below run only when the function exists.

with
tables(name) as (
  values ('trade_accounts'), ('trade_sessions'), ('trade_order_events'), ('trade_fills'), ('trade_round_trips')
),
functions(signature) as (
  values
    ('public.trade_daily_chart(integer)'),
    ('public.trade_player_account(uuid, uuid, text, bigint, jsonb)'),
    ('public.trade_open_session(uuid, uuid, text, text, text, text, integer, boolean, bigint, integer, text, jsonb)'),
    ('public.trade_append_event(uuid, uuid, integer, text, jsonb)'),
    ('public.trade_set_clock(uuid, integer, integer, timestamptz, integer, boolean, timestamptz, integer)'),
    ('public.trade_finalize_session(uuid, jsonb, jsonb, jsonb, jsonb)'),
    ('public.trade_reset_account(uuid, uuid, text, bigint, jsonb)'),
    ('public.trade_bot_account(text, text, bigint, jsonb)'),
    ('public.trade_record_bot_session(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb)'),
    ('public.claim_session(uuid, uuid)'),
    ('public.trade_leaderboard(text, integer, text, integer)'),
    ('public.trade_daily_board(integer, text, integer)'),
    ('public.trade_daily_field(integer)'),
    ('public.trade_daily_standing(integer, uuid)'),
    ('public.trade_account_sessions(uuid, integer)'),
    ('public.trade_account_curve(uuid, integer)'),
    ('public.trade_markets(text)')
),
-- Run a query only if `fn` exists, and return its single value as text. Lazily: CASE does not
-- evaluate the branch it does not take, and query_to_xml runs its text at execution time.
today as (
  select ((now() at time zone 'utc')::date - date '2026-08-01') as day
),
checks(sort, name, status, detail) as (
  -- 0030: every table exists, has RLS on, and grants nothing to the client roles.
  select 10, 'table ' || t.name,
    case
      when to_regclass('public.' || t.name) is null then 'FAIL'
      when not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t.name)) then 'FAIL'
      when has_table_privilege('anon', to_regclass('public.' || t.name), 'select, insert, update, delete')
        or has_table_privilege('authenticated', to_regclass('public.' || t.name), 'select, insert, update, delete') then 'FAIL'
      else 'ok'
    end,
    case
      when to_regclass('public.' || t.name) is null then 'missing — 0030 not applied'
      when not (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || t.name)) then 'row level security is off'
      when has_table_privilege('anon', to_regclass('public.' || t.name), 'select, insert, update, delete')
        or has_table_privilege('authenticated', to_regclass('public.' || t.name), 'select, insert, update, delete') then 'a client role can read or write it'
      else 'exists, RLS on, no client grants'
    end
  from tables t

  union all
  -- 0031 and 0032: every function exists and only the service role may execute it.
  select 20, 'function ' || split_part(f.signature, '(', 1),
    case
      when to_regprocedure(f.signature) is null then 'FAIL'
      when has_function_privilege('anon', to_regprocedure(f.signature), 'execute')
        or has_function_privilege('authenticated', to_regprocedure(f.signature), 'execute') then 'FAIL'
      else 'ok'
    end,
    case
      when to_regprocedure(f.signature) is null then 'missing — ' || f.signature
      when has_function_privilege('anon', to_regprocedure(f.signature), 'execute')
        or has_function_privilege('authenticated', to_regprocedure(f.signature), 'execute') then 'a client role may execute it'
      else 'exists, service role only'
    end
  from functions f

  union all
  -- claim_session v2 adopts the anonymous trading accounts on sign-in.
  select 30, 'claim_session adopts trading accounts',
    case when (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.claim_session(uuid, uuid)')) ilike '%trade_accounts%' then 'ok' else 'FAIL' end,
    'the 0031 body, which claims trade_accounts as well as rounds'

  union all
  -- The latest 0031: a locked scenario is refused rather than dealt as a random market.
  select 31, 'trade_open_session refuses locked scenarios',
    case when (select p.prosrc from pg_proc p
               where p.oid = to_regprocedure('public.trade_open_session(uuid, uuid, text, text, text, text, integer, boolean, bigint, integer, text, jsonb)'))
              ilike '%locked_reason%' then 'ok' else 'FAIL' end,
    're-run 0031 if this fails: an earlier draft dealt The Null Set as a random market'

  union all
  -- Markets: the real pairs the platform can deal.
  select 40, 'markets',
    case
      when to_regprocedure('public.trade_markets(text)') is null then 'FAIL'
      when coalesce((xpath('/row/n/text()', query_to_xml('select count(*) as n from public.trade_markets(null)', false, true, '')))[1]::text::int, 0) > 0 then 'ok'
      else 'FAIL'
    end,
    case
      when to_regprocedure('public.trade_markets(text)') is null then 'trade_markets is missing'
      else coalesce((xpath('/row/n/text()', query_to_xml('select count(*) as n from public.trade_markets(null)', false, true, '')))[1]::text, '0')
        || ' pairs, from '
        || (select count(*) from public.charts c where c.synthetic = false)::text || ' real charts'
    end

  union all
  -- Today's market is a real chart.
  select 41, 'today''s market',
    case
      when to_regprocedure('public.trade_daily_chart(integer)') is null then 'FAIL'
      when exists (
        select 1 from public.charts c
        where c.synthetic = false
          and c.id::text = (xpath('/row/id/text()', query_to_xml(
            'select public.trade_daily_chart(' || (select day from today) || ') as id', false, true, '')))[1]::text
      ) then 'ok'
      else 'FAIL'
    end,
    'daily #' || (select day from today)::text

  union all
  -- 0033: scenario copy, and The Null Set still locked (and so never listed or dealt).
  select 50, 'scenario copy (0033)',
    case when exists (select 1 from public.tapes t where t.slug = 'crash' and t.owner_id is null and t.blurb ilike 'Markets that had fallen%')
      then 'ok' else 'FAIL' end,
    'The Drop describes markets that really fell'
  union all
  select 51, 'The Null Set stays locked',
    case when exists (select 1 from public.tapes t where t.slug = 'null-set' and t.owner_id is null and t.locked_reason is not null)
      then 'ok' else 'FAIL' end,
    'its rule reads the outcome, so it is never dealt'

  union all
  -- The schools: empty until the bot writer runs, then eight accounts at the current version.
  select 60, 'school accounts (bots-1)',
    case
      when to_regclass('public.trade_accounts') is null then 'FAIL'
      when (select count(*) from public.trade_accounts a where a.kind = 'bot' and a.bot_version = 'bots-1') = 0 then 'todo'
      when (select count(*) from public.trade_accounts a where a.kind = 'bot' and a.bot_version = 'bots-1') = 8 then 'ok'
      else 'FAIL'
    end,
    case
      when to_regclass('public.trade_accounts') is null then 'trade_accounts is missing'
      else (select count(*) from public.trade_accounts a where a.kind = 'bot' and a.bot_version = 'bots-1')::text
        || ' of 8 accounts; '
        || coalesce((select min(a.sessions)::text || '–' || max(a.sessions)::text
                     from public.trade_accounts a where a.kind = 'bot' and a.bot_version = 'bots-1'), '0')
        || ' sessions each — run `npm run bots -- --write` until every school has one per real chart'
    end
)
select name as check, status, detail
from checks
order by case status when 'FAIL' then 0 when 'todo' then 1 else 2 end, sort, name;
