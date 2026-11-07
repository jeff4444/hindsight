-- 0034: the game — rounds, duels, and the schools' reads (docs/rules.md §23).
--
-- Not yet applied to the live project. Written to be applied after 0033, and drops nothing: the
-- trading platform's tables stay exactly as they are, with their data, as the game's predecessors
-- did before them.
--
-- ## The shape
--
--   charts.big_move    the larger of a tape's biggest rise and fall (§23.4), measured lazily
--   game_rounds        one trade, or none, on one tape: training, or one seat's tape in a duel
--   game_duels         two seats, ten tapes, a health bar each (§23.6)
--   game_duel_seats    who sits in each seat; a school duel has only seat 0, the school is seat 1
--   school_reads       each school's read of each tape, made once, offline (§23.7)
--
-- A round stores its intent, not its fills. Settling a round is deterministic — the exchange, the
-- tape's best and worst, the grade — so the server re-settles from the intent whenever a round is
-- shown, under the `game_version` it was played at. The grade and the three money columns are a
-- copy, for lists and duels, so neither has to settle a round to read it.
--
-- ## Integrity
--
-- The usual posture: RLS on, no policies, nothing granted to anon or authenticated. Only the
-- server, as the service role, reads these, which is what keeps a tape off the client until its
-- round is locked in, and a duel opponent's trade off it until yours is (§23.9).

alter table public.charts add column if not exists big_move double precision;

comment on column public.charts.big_move is
  'The larger of the tape''s biggest rise and biggest fall, as a share of where each started (docs/rules.md §23.2). A tape is dealt only if it is at least 0.03 (§23.4). Null until measured: the server measures a chart the first time it considers dealing it.';

create table if not exists public.game_duels (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[a-z0-9]{8}$'),
  kind            text not null check (kind in ('player', 'school')),
  school_code     text,
  school_version  text,
  -- The tapes, in order. Dealt when the second seat is taken, or at once against a school.
  chart_ids       uuid[],
  status          text not null default 'waiting' check (status in ('waiting', 'active', 'over')),
  -- The winning seat; null for a draw, or while the duel is on.
  winner          smallint check (winner in (0, 1)),
  knockout        boolean not null default false,
  game_version    text not null,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  ended_at        timestamptz,
  constraint game_duels_school check ((kind = 'school') = (school_code is not null and school_version is not null)),
  constraint game_duels_dealt check (status = 'waiting' or chart_ids is not null)
);

comment on table public.game_duels is
  'A duel (docs/rules.md §23.6): two seats on the same tapes, each starting at 1000 points. Its standing is folded from the seats'' grades, never stored as a running total.';

alter table public.game_duels enable row level security;
revoke all on public.game_duels from anon, authenticated;

create table if not exists public.game_duel_seats (
  duel_id     uuid not null references public.game_duels (id) on delete cascade,
  seat        smallint not null check (seat in (0, 1)),
  session_id  uuid not null,
  user_id     uuid references auth.users (id) on delete set null,
  owner       uuid generated always as (coalesce(user_id, session_id)) stored,
  joined_at   timestamptz not null default now(),
  primary key (duel_id, seat)
);

create index if not exists game_duel_seats_owner_idx on public.game_duel_seats (owner);

alter table public.game_duel_seats enable row level security;
revoke all on public.game_duel_seats from anon, authenticated;

create table if not exists public.game_rounds (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null,
  user_id        uuid references auth.users (id) on delete set null,
  owner          uuid generated always as (coalesce(user_id, session_id)) stored,
  chart_id       uuid not null references public.charts (id) on delete cascade,
  mode           text not null check (mode in ('training', 'duel')),
  duel_id        uuid references public.game_duels (id) on delete cascade,
  seat           smallint check (seat in (0, 1)),
  tape_index     smallint check (tape_index >= 0),
  status         text not null default 'reading' check (status in ('reading', 'locked')),
  intent         jsonb,
  grade          smallint check (grade between 0 and 1000),
  result_micros  bigint,
  best_micros    bigint,
  worst_micros   bigint,
  game_version   text not null,
  created_at     timestamptz not null default now(),
  locked_at      timestamptz,
  constraint game_rounds_duel check ((mode = 'duel') = (duel_id is not null and seat is not null and tape_index is not null)),
  constraint game_rounds_locked check (
    (status = 'locked') = (intent is not null and grade is not null and result_micros is not null and locked_at is not null)
  )
);

comment on table public.game_rounds is
  'One trade, or none, on one tape (docs/rules.md §23.1). Locked once; the result is re-settled from the intent whenever it is shown.';

create unique index if not exists game_rounds_duel_tape on public.game_rounds (duel_id, seat, tape_index) where duel_id is not null;
create index if not exists game_rounds_owner_idx on public.game_rounds (owner, created_at desc);
create index if not exists game_rounds_owner_chart_idx on public.game_rounds (owner, chart_id);

alter table public.game_rounds enable row level security;
revoke all on public.game_rounds from anon, authenticated;

create table if not exists public.school_reads (
  school_code     text not null,
  school_version  text not null,
  chart_id        uuid not null references public.charts (id) on delete cascade,
  -- The school's round, in indexed prices: what it saw (§23.8 — indexed, unmirrored, no symbol).
  intent          jsonb not null,
  -- Its thesis, reasoning, the levels it drew (indexed) and, when it sat out, why.
  read            jsonb not null,
  grade           smallint check (grade between 0 and 1000),
  sit_out_grade   smallint check (sit_out_grade between 0 and 1000),
  model           text,
  created_at      timestamptz not null default now(),
  primary key (school_code, school_version, chart_id)
);

comment on table public.school_reads is
  'Each school''s read of a tape, made once, offline, before any player meets it there (docs/rules.md §23.7). A stored read is final: a new playbook, prompt or model is a new school_version.';

alter table public.school_reads enable row level security;
revoke all on public.school_reads from anon, authenticated;

-- Tapes a set of players may be dealt: real charts none of them has played, that move enough or
-- have not been measured yet, in random order. With a school, only tapes it traded (§23.7).
create or replace function public.game_candidate_charts(
  p_owners uuid[], p_min_move double precision, p_limit integer,
  p_school_code text default null, p_school_version text default null
)
returns table (chart_id uuid, big_move double precision)
language sql stable security invoker set search_path = ''
as $$
  select c.id, c.big_move
  from public.charts c
  where c.synthetic = false
    and (c.big_move is null or c.big_move >= p_min_move)
    and not exists (
      select 1 from public.game_rounds r
      where r.chart_id = c.id and r.owner = any (p_owners)
    )
    and (
      p_school_code is null
      or exists (
        select 1 from public.school_reads s
        where s.chart_id = c.id and s.school_code = p_school_code and s.school_version = p_school_version
          and s.intent ->> 'kind' = 'trade'
      )
    )
  order by random()
  limit p_limit;
$$;
revoke all on function public.game_candidate_charts(uuid[], double precision, integer, text, text) from public, anon, authenticated;

-- Signing in adopts what the anonymous session played. Idempotent; called beside claim_session.
create or replace function public.game_claim_session(p_session uuid, p_user uuid)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  v_rounds integer := 0;
begin
  update public.game_rounds r set user_id = p_user where r.session_id = p_session and r.user_id is null;
  get diagnostics v_rounds = row_count;
  update public.game_duel_seats s set user_id = p_user where s.session_id = p_session and s.user_id is null;
  return v_rounds;
end;
$$;
revoke all on function public.game_claim_session(uuid, uuid) from public, anon, authenticated;
