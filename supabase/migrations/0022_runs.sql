-- §10.1's two rep generators: Storm and Streak.
--
-- They exist because one chart a day cannot produce a thousand reps. §3 reclassifies the daily as a
-- distribution mechanism rather than a retention one and promotes these from "later" to core, and
-- every unanswered question in this project is waiting on the volume they make: calibration needs 30
-- forecasts before it will speak (§18), the style fingerprint needs 152 rounds (§17.4), and §7.2's
-- synthetic-control comparison needs more than either.
--
-- ## Server-authoritative, for the same reason Manage is
--
-- `ends_at` is the only Storm clock that counts. A client that owned it could award itself time, and
-- the mode's entire scarcity is the clock — exactly the argument §17.5 makes for metering the Manage
-- reveal from the server rather than trusting the tab.
--
-- ## The rule that stops both modes being farmed
--
-- Both score "beat the distribution median" — `par_r`, the median of the 98 enumerated brackets.
-- Measured over the corpus net of costs, **par_r is negative on 95.0% of charts** (mean −0.792R),
-- and a pass is exactly 0R. So a pass beats the median 95 times in 100, and as §10.1 writes them
-- both modes can be farmed by passing: +1 a chart in Storm, and a Streak that never dies.
--
-- Streak's fix is §10.1's own: `skips_left` starts at one. Storm's is ours and lives in
-- `src/core/run.ts` — a pass scores nothing, so it costs exactly the clock and nothing else.

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.play_sessions (id),
  user_id uuid references auth.users (id) on delete set null,
  owner uuid generated always as (coalesce(user_id, session_id)) stored,
  mode text not null check (mode in ('storm', 'streak')),
  tape text not null default 'open',
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  score integer not null default 0,
  combo integer not null default 0,
  best_combo integer not null default 0,
  length integer not null default 0,
  best_length integer not null default 0,
  skips_left integer not null default 0,
  charts integer not null default 0,
  alive boolean not null default true,
  ended_at timestamptz
);

comment on table public.runs is
  'Storm and Streak runs (10.1). Server-authoritative: ends_at is the only Storm clock that counts, exactly as manage_opened_at is for Manage, because a client that owned it could award itself time.';
comment on column public.runs.ends_at is
  'Storm only. Moves earlier by 10s on each stop-out. Null for Streak, which is untimed.';
comment on column public.runs.skips_left is
  'Streak only. 10.1 grants one skip per run, and it is also what stops the mode being farmed: a pass is 0R and the median bracket is negative on 95% of charts, so passing would otherwise never end a run.';

alter table public.rounds
  add column if not exists run_id uuid references public.runs (id) on delete set null;

comment on column public.rounds.run_id is
  'The Storm or Streak run this round belongs to, if any. Null for daily, tape, ranked and manage rounds.';

create index if not exists runs_owner_idx on public.runs (owner, started_at desc);
create index if not exists rounds_run_idx on public.rounds (run_id) where run_id is not null;

-- RLS with no policies: like charts and rounds, runs are reachable only through the service role.
alter table public.runs enable row level security;
