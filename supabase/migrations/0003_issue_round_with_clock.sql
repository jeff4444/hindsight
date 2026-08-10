-- Expose the weekday and hour of the first visible candle, and nothing else about when it was.
--
-- §12.2 requires stripping "all dates, tickers and currency-denominated volume", and weekday
-- and hour are components of a date, so this needs justifying rather than assuming. The
-- argument is in docs/rules.md §1.1 and src/lib/clock.ts: §3.1 draws the line at identity,
-- hindsight and crutches, and session structure is none of the three.
--
-- What is released is three bits of weekday and a little under five of hour — enough to read
-- session and weekend structure, and not enough to place the window in a year, a month or a
-- day of the month. The client reconstructs every other bar's clock by index arithmetic,
-- because the display timeframe is one hour, so no further timestamps leave the server.
--
-- The return type changes, so the old signature has to go first.

drop function if exists public.issue_round(uuid, text);

create or replace function public.issue_round(p_session uuid, p_nonce text)
returns table (
  round_id uuid,
  chart_id uuid,
  lead_in_bars jsonb,
  atr14 double precision,
  tick_size double precision,
  entry_price double precision,
  start_dow integer,
  start_hour integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_round_id uuid;
begin
  -- Prefer a chart this session has not already been served.
  select c.* into v_chart
  from public.charts c
  where not exists (
    select 1 from public.rounds r
    where r.chart_id = c.id and r.session_id = p_session
  )
  order by random()
  limit 1;

  -- Exhausted the corpus: repeats are better than a dead end.
  if not found then
    select c.* into v_chart from public.charts c order by random() limit 1;
  end if;

  if not found then
    raise exception 'corpus is empty - run the corpus pipeline first';
  end if;

  insert into public.rounds (chart_id, session_id, nonce)
  values (v_chart.id, p_session, p_nonce)
  returning id into v_round_id;

  return query select
    v_round_id,
    v_chart.id,
    v_chart.lead_in_bars,
    v_chart.atr14,
    v_chart.tick_size,
    v_chart.entry_price,
    -- 0 = Monday. isodow is 1..7, always evaluated in UTC rather than the session timezone.
    (extract(isodow from (v_chart.window_start at time zone 'UTC'))::integer - 1),
    extract(hour from (v_chart.window_start at time zone 'UTC'))::integer;
end;
$$;

revoke all on function public.issue_round(uuid, text) from public, anon, authenticated;

comment on function public.issue_round(uuid, text) is
  'Atomic round issuance. Returns lead-in bars plus the weekday and hour of the first visible candle; reveal_bars, resolution_path and the calendar date are not in the return type, so 12.1 and 12.2 are enforced by the schema rather than by convention.';
