-- §11.2's creator maps.
--
-- "Any user can assemble a map from filter-generated or hand-picked charts, name it, describe it and
-- share it by link. This is the feature that makes the product sellable and licensable."
--
-- ## They live in `tapes`, not a table of their own
--
-- A creator map is assembled from exactly the vocabulary the official maps already use: regime
-- buckets, volatility buckets, themes, lead-in drift, council conflict. A second table would mean a
-- second issuance function, a second chart count and a second tier lock, and the three would drift
-- apart — the count already had to be taught the map predicates once (`listTapes`) and the lesson
-- there was that a count computed from a different rule than the issuer uses advertises a size the
-- tape cannot serve.
--
-- So `owner_id is null` is what "official" means, and everything else is one code path.
--
-- ## Hand-picking is deliberately not built
--
-- §11.2 offers "filter-generated **or hand-picked**" charts. Only the first ships. §11.1's own
-- requirement is that a map be a published filter "so the map's difficulty distribution is
-- reproducible and its statistics are valid", and a hand-picked set has no such distribution — an
-- operator who picks forty charts they find instructive has curated for outcome, and every
-- percentile computed on the set is conditioned on that choice in a way nobody can state. The
-- feature is not refused, it is unbuilt until there is an honest answer for what its leaderboard
-- means.
--
-- ## Visibility
--
-- Private is enforced in `issue_round` against the caller, because a map that only checks the slug
-- is not private — it is unlisted with extra confidence. Unlisted is exactly "the slug is the
-- secret", which is what a share link is, and is named honestly rather than called private.

alter table public.tapes
  add column if not exists owner_id   uuid references auth.users (id) on delete cascade,
  add column if not exists visibility text not null default 'public'
    check (visibility in ('private', 'unlisted', 'public')),
  add column if not exists created_at timestamptz not null default now();

comment on column public.tapes.owner_id is
  'The user who made this map. Null means official (11.1) - that is the only thing separating the two, because a creator map is assembled from the same filter vocabulary and runs through the same issuance.';
comment on column public.tapes.visibility is
  'private: only the owner may play or see it, enforced in issue_round against the caller. unlisted: the slug is the secret, which is what a share link is. public: listed.';

-- Official maps keep their sort order; creator maps are listed newest first by their owner, so the
-- index that matters is per-owner recency.
create index if not exists tapes_owner_idx on public.tapes (owner_id, created_at desc)
  where owner_id is not null;

-- Which map a round was played on, which nothing recorded until now.
--
-- §11.2's cohort dashboard is an aggregate over "a map's players", and there was no column joining
-- the two — every per-tape statistic this product could have quoted was unavailable, including the
-- ones the tape pages already imply. Rounds played before this migration carry null, because the
-- fact was never recorded and inferring it from the chart's tags would be a guess dressed as data:
-- most charts qualify for several tapes.
--
-- Deliberately **not** a foreign key. A round's record of where it was played has to survive the map
-- being deleted — a cohort's results are not the operator's to erase by removing the map they were
-- scored on — and a slug that no longer resolves is a truthful record of a map that no longer
-- exists.
alter table public.rounds
  add column if not exists tape text;

comment on column public.rounds.tape is
  'The map slug this round was issued from. Not a foreign key: the record must outlive the map, since a cohort''s results are not the map owner''s to erase. Null for rounds played before 0026, and for the daily and ranked, which do not come from a map.';

create index if not exists rounds_tape_idx on public.rounds (tape, committed_at desc)
  where tape is not null;

-- Re-issue with the private-map guard. Identical to 0025 apart from that one condition; the whole
-- body is repeated because plpgsql has no way to patch one.
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

  -- A private map is private from the server, not from the URL. Checked against p_user rather than
  -- the session, because a signed-out visitor sharing a session cookie is not the owner.
  if v_tape.visibility = 'private'
     and v_tape.owner_id is not null
     and (p_user is null or p_user <> v_tape.owner_id) then
    raise exception 'tape % is private', p_tape;
  end if;

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

  insert into public.rounds (chart_id, session_id, user_id, nonce, tier, expires_at, tape)
  values (v_chart.id, p_session, p_user, p_nonce, p_tier, v_expires, v_tape.slug)
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
