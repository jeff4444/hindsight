-- Atomic round issuance.
--
-- This is a database function rather than a pair of client-side queries for two reasons. The
-- weak one is that PostgREST cannot express `order by random()`. The strong one is §12.1:
--
--   "The client must never receive future price data before the order is submitted... If
--    Hindsight ever becomes popular with future candles in the payload, someone will write a
--    userscript within a week."
--
-- The function's return type names five columns and `reveal_bars` and `resolution_path` are
-- not among them. There is no argument that can make it return them. That makes the integrity
-- rule a property of the schema rather than a property of whoever writes the next route.

create or replace function public.issue_round(p_session uuid, p_nonce text)
returns table (
  round_id uuid,
  chart_id uuid,
  lead_in_bars jsonb,
  atr14 double precision,
  tick_size double precision,
  entry_price double precision
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_round_id uuid;
begin
  -- Prefer a chart this session has not already been served, so a player is not handed the
  -- same setup twice in a sitting.
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
    raise exception 'corpus is empty — run the corpus pipeline first';
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
    v_chart.entry_price;
end;
$$;

revoke all on function public.issue_round(uuid, text) from public, anon, authenticated;
