-- §11.1's three missing official maps, and §11.2's tier lock.
--
-- Four of §11.1's seven maps already ship as tapes. These are the rest, and both new filter
-- predicates read columns 0024 added — so every map here is still "a published filter over the
-- tags", which is §11.1's own requirement and the thing that makes a map's difficulty distribution
-- reproducible rather than a curator's taste.
--
-- ## Crash and Euphoria are the same map, reflected, and say so
--
-- §12.2 mirrors half the corpus at random, so half of every displayed crash is a mirrored rally.
-- Measured at the ±8 ATR threshold these two use: **135 charts fall in one and 138 in the other**.
-- That near-equality is not a coincidence to be admired, it is the design working — and it means
-- neither card may claim crash *dynamics*, only a falling or rising chart. `docs/phase-5d-research.md`
-- §2 records the two wrong definitions of drift that came before this one, the first of which
-- produced a spurious 88-against-39 asymmetry pointing exactly where the literature says it should.
--
-- ## Council Split ships with its claim withdrawn
--
-- §11.1 calls it "the hardest map in the game". Measured, it is not harder by any available
-- measure: median par_r -1.022 against -1.019 for the corpus, median pass percentile 0.612 against
-- 0.612, Welch's t of 0.10 and 0.79. It is still worth playing — it is the set where two published
-- methodologies read the same candles and reach opposite conclusions — and the blurb says exactly
-- that and nothing more.
--
-- ## The tier lock
--
-- §11.2: "a tier lock, so an operator can require that their cohort plays at Naked and the results
-- are comparable." Tapes already carried a `tier` column but it was advisory — the launcher's choice
-- won, and nothing read it. `tier_locked` makes the tape's ruleset win instead.
--
-- Enforced in the API rather than here, because the API is what turns a ruleset into the candle
-- count, the detail grant and the clock this function is handed. It is also shown rather than
-- silently applied: a player who picked Full Desk and got Naked without being told would reasonably
-- conclude the ladder was broken.

alter table public.tapes
  add column if not exists drift_below   double precision,
  add column if not exists drift_above   double precision,
  add column if not exists council_split boolean not null default false,
  add column if not exists tier_locked   boolean not null default false;

comment on column public.tapes.drift_below is
  'Charts whose lead-in drift is at most this, in ATR. Null means no condition. Negative for a falling map.';
comment on column public.tapes.drift_above is
  'Charts whose lead-in drift is at least this, in ATR. Null means no condition.';
comment on column public.tapes.council_split is
  'Charts where the schools conflict (council_minority > 0). Legal because the council reads the lead-in alone, unlike The Null Set''s par_r filter, which is why that one is locked and this one is not.';
comment on column public.tapes.tier_locked is
  'The tape''s tier is required rather than suggested (11.2). Enforced in /api/round, and shown at the launcher rather than applied silently.';

-- Re-issue with the two new conditions. Identical to 0018 apart from those; the whole body is
-- repeated because plpgsql has no way to patch one.
drop function if exists public.issue_round(uuid, uuid, text, text, text, integer, boolean, integer);

create function public.issue_round(
  p_session uuid, p_user uuid, p_nonce text,
  p_tape text default 'open', p_tier text default 'NTZ',
  p_candles integer default 80, p_detail boolean default false,
  p_clock_seconds integer default null
)
returns table (
  round_id uuid, chart_id uuid, lead_in_bars jsonb,
  atr14 double precision, tick_size double precision, entry_price double precision,
  start_dow integer, start_hour integer, lead_in_detail bytea, expires_at timestamptz
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_chart public.charts%rowtype;
  v_round_id uuid;
  v_owner uuid := coalesce(p_user, p_session);
  v_lead_in_bytes integer;
  v_tape public.tapes%rowtype;
  v_bars jsonb;
  v_extra integer;
  v_first timestamptz;
  v_expires timestamptz;
begin
  insert into public.play_sessions (id) values (p_session)
  on conflict (id) do update set last_seen_at = now();

  select * into v_tape from public.tapes t where t.slug = coalesce(p_tape, 'open');
  if not found then raise exception 'no such tape: %', p_tape; end if;
  if v_tape.locked_reason is not null then raise exception 'tape % is locked', p_tape; end if;

  select c.* into v_chart from public.charts c
  where (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
    and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
    and (v_tape.themes is null or c.themes && v_tape.themes)
    and (v_tape.drift_below is null or c.lead_in_drift_atr <= v_tape.drift_below)
    and (v_tape.drift_above is null or c.lead_in_drift_atr >= v_tape.drift_above)
    and (not v_tape.council_split or c.council_minority > 0)
    and (p_candles <= 80 or c.lead_in_extra is not null)
    and not exists (select 1 from public.rounds r where r.chart_id = c.id and r.owner = v_owner)
  order by random() limit 1;

  if not found then
    select c.* into v_chart from public.charts c
    where (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
      and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
      and (v_tape.themes is null or c.themes && v_tape.themes)
      and (v_tape.drift_below is null or c.lead_in_drift_atr <= v_tape.drift_below)
      and (v_tape.drift_above is null or c.lead_in_drift_atr >= v_tape.drift_above)
      and (not v_tape.council_split or c.council_minority > 0)
      and (p_candles <= 80 or c.lead_in_extra is not null)
    order by random() limit 1;
  end if;
  if not found then raise exception 'corpus is empty - run the corpus pipeline first'; end if;

  v_bars := public.project_lead_in(v_chart.lead_in_bars, v_chart.lead_in_extra, p_candles);
  if v_bars is null then raise exception 'chart cannot supply % candles', p_candles; end if;

  v_extra := greatest(0, p_candles - jsonb_array_length(v_chart.lead_in_bars));
  v_first := v_chart.window_start - (v_extra || ' hours')::interval;

  if p_clock_seconds is not null then
    v_expires := now() + (p_clock_seconds || ' seconds')::interval;
  end if;

  insert into public.rounds (chart_id, session_id, user_id, nonce, tier, expires_at)
  values (v_chart.id, p_session, p_user, p_nonce, p_tier, v_expires)
  returning id into v_round_id;

  v_lead_in_bytes := jsonb_array_length(v_chart.lead_in_bars) * 60 * 20;

  return query select
    v_round_id, v_chart.id, v_bars, v_chart.atr14, v_chart.tick_size, v_chart.entry_price,
    (extract(isodow from (v_first at time zone 'UTC'))::integer - 1),
    extract(hour from (v_first at time zone 'UTC'))::integer,
    case when p_detail then substring(v_chart.detail_path from 1 for v_lead_in_bytes) else null end,
    v_expires;
end;
$$;
revoke all on function public.issue_round(uuid, uuid, text, text, text, integer, boolean, integer)
  from public, anon, authenticated;

-- The three maps.
--
-- Blurbs carry the measured share, as the theme tapes do: a map holding an eighth of the library is
-- a different promise from one holding two thirds, and a player choosing between them should be able
-- to see which is which. They also carry what the map may *not* claim, which is the part §11.1 got
-- wrong.
insert into public.tapes (slug, name, blurb, drift_below, drift_above, council_split, tier, sort, published, locked_reason) values
  ('crash', 'The Drop',
   'Eight ATR down or worse across the visible window - 13.5% of the library. Not a crash map in the market sense and it cannot be one: every chart here is mirrored at random (§12.2), so half of these are rallies reflected, and the falling half holds 135 charts against the rising half''s 138. What it trains is reading a chart that has been going against you for sixty candles, which is a different thing from a crash and the one that actually matters at the moment of the decision.',
   -8, null, false, 'NTZ', 20, true, null),
  ('euphoria', 'The Ramp',
   'Eight ATR up or better across the visible window - 13.8% of the library, and the same distribution as The Drop reflected. Kept as its own map because the reader is not symmetric even where the data is: whether players actually score worse on one than the other is an open question this is built to answer.',
   null, 8, false, 'NTZ', 21, true, null),
  ('council-split', 'Split Decision',
   'The 7.1% of charts where the schools take opposite sides. §11.1 called this the hardest map in the game; measured, it is not harder at all - median par_r -1.022 against -1.019 for the corpus, median pass percentile 0.612 against 0.612. Play it for what it is instead: the set where two published methodologies read the same candles and reach opposite conclusions, with both arguments on the reveal.',
   null, null, true, 'NTZ', 22, true, null)
on conflict (slug) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  drift_below = excluded.drift_below,
  drift_above = excluded.drift_above,
  council_split = excluded.council_split,
  sort = excluded.sort,
  published = excluded.published;
