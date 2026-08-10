-- One-minute detail for the whole window, so the client can render finer candles as it zooms.
--
-- Separate from `resolution_path` on purpose. That column is the resolver's input and its
-- contract is frozen: changing it would invalidate every stored result. This one is a display
-- concern, carries volume (which the resolver does not read), and spans the lead-in as well as
-- the reveal. The reveal half is duplicated between the two, which costs ~58 KB a chart and
-- buys a resolver whose input never has to change again.
--
-- §12.1 still holds, and it is why `issue_round` slices rather than returning the column: the
-- lead-in half is the past and may be issued, the reveal half is the future and may not.

alter table public.charts
  add column if not exists detail_path bytea;

comment on column public.charts.detail_path is
  'One-minute OHLCV for the whole window, interleaved Float32, 20 bytes per bar. Display only - the resolver reads resolution_path. Contains the future; only the lead-in prefix may be issued before an order is committed (12.1).';

-- The return type grows, so the old signature has to go first.
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
  start_hour integer,
  lead_in_detail bytea
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_round_id uuid;
  v_lead_in_bytes integer;
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

  -- Lead-in candles x 60 minutes x 20 bytes. Derived from the chart's own shape rather than
  -- hardcoded, so it cannot drift out of step with the window geometry.
  v_lead_in_bytes := jsonb_array_length(v_chart.lead_in_bars) * 60 * 20;

  return query select
    v_round_id,
    v_chart.id,
    v_chart.lead_in_bars,
    v_chart.atr14,
    v_chart.tick_size,
    v_chart.entry_price,
    -- 0 = Monday. isodow is 1..7, always evaluated in UTC rather than the session timezone.
    (extract(isodow from (v_chart.window_start at time zone 'UTC'))::integer - 1),
    extract(hour from (v_chart.window_start at time zone 'UTC'))::integer,
    -- The past only. substring is 1-indexed, so this stops exactly at the decision bar close.
    substring(v_chart.detail_path from 1 for v_lead_in_bytes);
end;
$$;

revoke all on function public.issue_round(uuid, text) from public, anon, authenticated;

comment on function public.issue_round(uuid, text) is
  'Atomic round issuance. Returns the lead-in candles, the weekday and hour of the first visible candle, and the lead-in prefix of the one-minute detail. reveal_bars, resolution_path, the reveal half of detail_path and the calendar date are all unreachable through this function, so 12.1 and 12.2 are enforced by the schema rather than by convention.';
