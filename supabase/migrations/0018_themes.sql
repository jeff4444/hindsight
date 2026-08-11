-- Theme tags, and the tapes that filter on them. Applied via the connector; kept here for
-- reproducibility.
--
-- §8.4 asks for every chart to carry themes. §6 adds the condition that makes them worth carrying:
-- there is no canonical specification of any of these formations, the two most-used open
-- implementations disagree by up to 13.6× on the same words, so "the choice is not between the
-- right definition and ours; it is between an undisclosed definition and a published one."
-- src/core/geometry/themes.ts is that published one and docs/rules.md §13.8 prints its numbers.
--
-- Two rules the columns below exist to enforce.
--
-- **Tags are pinned to the base lead-in.** docs/rules.md §13.3: geometry that becomes a stored
-- chart property is computed over the fixed 80-candle window, never over whatever the tier grants,
-- or the same chart would carry different themes at No Tools and at Naked.
--
-- **Tags are versioned.** A theme is a threshold away from being a different theme, so every row
-- records the geometry version that produced it. §12.4 is emphatic that population statistics are
-- not comparable across a change of rule, and a per-theme rating is exactly such a statistic.

alter table public.charts
  add column if not exists themes text[],
  add column if not exists geometry_version text;

-- Overlap queries (`themes && '{...}'`) are what the tape filter runs, and GIN is the index for
-- them. Partial, because an untagged chart can never match one.
create index if not exists charts_themes_idx
  on public.charts using gin (themes)
  where themes is not null;

-- The tape filter. Null means "no theme condition", exactly as the regime arrays already do, so
-- The Open Tape keeps matching everything.
alter table public.tapes
  add column if not exists themes text[];

comment on column public.tapes.themes is
  'Charts matching ANY of these themes. Null means no theme filter. Legal because themes are '
  'computed from the lead-in alone - see the note on this table about tape filters.';

-- Re-issue with the theme condition. Identical to 0015 apart from the two added predicates; the
-- whole body is repeated because plpgsql has no way to patch one.
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
    and (p_candles <= 80 or c.lead_in_extra is not null)
    and not exists (select 1 from public.rounds r where r.chart_id = c.id and r.owner = v_owner)
  order by random() limit 1;

  if not found then
    select c.* into v_chart from public.charts c
    where (v_tape.er_buckets is null or c.regime_er_bucket = any (v_tape.er_buckets))
      and (v_tape.vol_buckets is null or c.regime_vol_bucket = any (v_tape.vol_buckets))
      and (v_tape.themes is null or c.themes && v_tape.themes)
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

-- The six tapes.
--
-- Blurbs carry the corpus share, measured by `npm run themes` at geometry-1. That is not decoration:
-- a tape holding two thirds of the library is a weaker promise than one holding a fifteenth, and a
-- player choosing between them should be able to see which is which. The numbers move when the
-- spec moves, which is what the version column is for.
--
-- Sorted after the regime tapes, which remain the default way in.
insert into public.tapes (slug, name, blurb, themes, tier, sort, published, locked_reason) values
  ('sweep', 'The Sweep',
   'A tested level taken out by a hair and handed straight back. The best-evidenced formation in the set: Osler (2005) found stop orders clustering just past round numbers on a dealing bank''s full order book. 64% of the corpus - common, and the null in 2c will say whether it is more common than chance.',
   array['liquidity-sweep'], 'NTZ', 10, true, null),
  ('failed-break', 'Failed Breaks',
   'A close beyond the twenty-bar extreme, then a close back inside within five. Not a wick past the edge - that is a sweep, and conflating the two tagged every chart in the library. 52% of the corpus.',
   array['failed-breakout'], 'NTZ', 11, true, null),
  ('v-reversal', 'The Turn',
   'A leg of at least two ATR, reversed by at least 38.2% of itself inside twenty bars. The retrace is Bulkowski''s number and is not ours to move. 46% of the corpus.',
   array['v-reversal'], 'NTZ', 12, true, null),
  ('coil', 'The Coil',
   'Ten bars tighter than diffusion predicts, released by a bar of at least 1.5 ATR. The scale-free relative of NR7 and of Bollinger BandWidth percentile. 7% of the corpus, and the hardest tape to fill.',
   array['compression-expansion'], 'NTZ', 13, true, null),
  ('range', 'The Box',
   'A window narrower than a driftless walk would cover, where price reached both edges twice and alternated between them. Touching both edges is not enough - a slow drift does that once each way.',
   array['range-reversion'], 'NTZ', 14, true, null),
  ('trend', 'The Run',
   'Sloping, efficient, and distributed - no single bar carrying more than half the move, which is what separates a trend from a gap with scenery. Only 4% of the corpus reaches it: this library is mostly chop, and that is a fact about crypto rather than about the detector.',
   array['trend-continuation'], 'NTZ', 15, true, null)
on conflict (slug) do update set
  name = excluded.name,
  blurb = excluded.blurb,
  themes = excluded.themes,
  sort = excluded.sort,
  published = excluded.published;
