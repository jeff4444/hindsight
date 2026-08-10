-- Accounts, profiles, streaks and tapes.
--
-- Applied via the Supabase connector; kept here so a fresh project is reproducible from the repo.
--
-- The first three statements are the important ones. Verified against the live project:
--
--   pg_default_acl, schema public, objtype 'r':  anon=arwdDxtm, authenticated=arwdDxtm
--
-- Every new table in `public` is granted ALL privileges to anon and authenticated on creation.
-- `charts` and `rounds` are safe only because 0001 revoked them explicitly. Closing the default
-- means a table added later is invisible to a client until someone deliberately grants it, which
-- is the direction §12.1 wants to be surprised in.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;

create table if not exists public.play_sessions (
  id           uuid primary key,
  user_id      uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  claimed_at   timestamptz
);

comment on table public.play_sessions is
  'One row per hs_session cookie. user_id is null until a sign-in claims it; the claim is a compare-and-swap on that column and is the only thing standing between two accounts and one history.';

create index if not exists play_sessions_user_idx on public.play_sessions (user_id) where user_id is not null;
alter table public.play_sessions enable row level security;
revoke all on public.play_sessions from anon, authenticated;

insert into public.play_sessions (id)
select distinct session_id from public.rounds
on conflict (id) do nothing;

alter table public.rounds
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists superseded boolean not null default false;

-- The single identity every query keys on, so claiming is one UPDATE and the daily rule, the
-- don't-repeat-a-chart rule and every statistic are written once rather than branched on sign-in.
alter table public.rounds
  add column if not exists owner uuid generated always as (coalesce(user_id, session_id)) stored;

comment on column public.rounds.owner is
  'coalesce(user_id, session_id). Rewritten automatically when a claim sets user_id.';

alter table public.rounds drop constraint if exists rounds_session_fk;
alter table public.rounds
  add constraint rounds_session_fk foreign key (session_id) references public.play_sessions (id);

drop index if exists public.rounds_daily_attempt_idx;
create unique index rounds_daily_attempt_idx
  on public.rounds (owner, daily_day, daily_index)
  where daily_day is not null and not superseded;

create index if not exists rounds_owner_idx on public.rounds (owner, issued_at desc);
create index if not exists rounds_user_idx on public.rounds (user_id) where user_id is not null;

create table if not exists public.profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  handle            text not null,
  handle_display    text,
  display_name      text,
  avatar_seed       integer not null,
  avatar_accent     text not null default 'ember',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  handle_changed_at timestamptz,
  constraint profiles_handle_format check (handle ~ '^[a-z0-9][a-z0-9_-]{1,20}[a-z0-9]$'),
  constraint profiles_handle_no_run check (handle !~ '[_-]{2}'),
  constraint profiles_handle_display_folds check (handle_display is null or lower(handle_display) = handle),
  constraint profiles_display_name_len check (display_name is null or char_length(btrim(display_name)) between 1 and 40),
  constraint profiles_accent check (avatar_accent in ('ember','signal','frost','moss','violet','slate')),
  constraint profiles_avatar_seed check (avatar_seed between 0 and 2147483647)
);

comment on table public.profiles is
  'Public by construction: every column is safe to render to a signed-out visitor on /u/[handle]. Anything private belongs in user_settings — that invariant is what lets the read policy be using (true).';

create unique index if not exists profiles_handle_key on public.profiles (handle);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

create table if not exists public.reserved_handles (handle text primary key);
alter table public.reserved_handles enable row level security;
revoke all on public.reserved_handles from anon, authenticated;

insert into public.reserved_handles (handle) values
  ('admin'),('api'),('auth'),('u'),('me'),('new'),('edit'),('settings'),('about'),('home'),
  ('daily'),('play'),('practice'),('ranked'),('manage'),('storm'),('streak'),('duel'),('tape'),
  ('tapes'),('racer'),('calibration'),('map'),('maps'),('leaderboard'),('login'),('logout'),
  ('signin'),('sign-in'),('signup'),('sign-up'),('register'),('support'),('help'),('legal'),
  ('privacy'),('terms'),('hindsight'),('official'),('staff'),('mod'),('null'),('undefined'),
  ('root'),('rules'),('honesty'),('stats')
on conflict do nothing;

create table if not exists public.user_settings (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  reduce_motion boolean not null default false,
  default_tape  text,
  created_at    timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;

-- Deliberately no FK to `rounds`: clear_corpus() truncates it via cascade, and regenerating the
-- corpus must never reset a player's streak.
create table if not exists public.daily_completions (
  user_id         uuid not null references auth.users (id) on delete cascade,
  day             integer not null,
  completed_at    timestamptz not null default now(),
  charts          smallint not null,
  traded          smallint not null,
  mean_percentile double precision,
  primary key (user_id, day)
);
create index if not exists daily_completions_day_idx on public.daily_completions (day);
alter table public.daily_completions enable row level security;
revoke all on public.daily_completions from anon, authenticated;

create table if not exists public.player_streaks (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  -- §10.3: two granted up front. Two outperform one; three are no better than two.
  freezes_remaining smallint not null default 2 check (freezes_remaining between 0 and 2),
  freezes_earned    integer not null default 0,
  longest_length    integer not null default 0,
  longest_perfect   integer not null default 0,
  updated_at        timestamptz not null default now()
);
alter table public.player_streaks enable row level security;
revoke all on public.player_streaks from anon, authenticated;

create table if not exists public.streak_freezes (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      integer not null,
  spent_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.streak_freezes enable row level security;
revoke all on public.streak_freezes from anon, authenticated;

create table if not exists public.streak_repairs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  broken_run_end_day integer not null,
  broken_length      integer not null,
  charts_required    smallint not null,
  charts_done        smallint not null default 0,
  covers_from_day    integer not null,
  covers_to_day      integer,
  opened_at          timestamptz not null default now(),
  expires_at         timestamptz not null,
  redeemed_at        timestamptz,
  state              text not null default 'open' check (state in ('open','redeemed','expired'))
);
create unique index if not exists streak_repairs_one_open_idx on public.streak_repairs (user_id) where state = 'open';
alter table public.streak_repairs enable row level security;
revoke all on public.streak_repairs from anon, authenticated;

create table if not exists public.streak_history (
  user_id       uuid not null references auth.users (id) on delete cascade,
  run_end_day   integer not null,
  run_start_day integer not null,
  length        integer not null,
  perfect       boolean not null,
  ended_at      timestamptz not null default now(),
  primary key (user_id, run_end_day)
);
alter table public.streak_history enable row level security;
revoke all on public.streak_history from anon, authenticated;

-- §11.1: "Every official map is defined by a published filter over the regime tags and theme tags,
-- not by hand-picking, so the map's difficulty distribution is reproducible and its statistics are
-- valid." These columns are that published filter.
--
-- And a rule the scope document does not state but §12.1 requires: a tape's filter must be
-- computable from the LEAD-IN alone. par_r is derived from the reveal path, so a tape defined on it
-- announces the answer before the trade — which is why The Null Set ships locked.
create table if not exists public.tapes (
  slug          text primary key,
  name          text not null,
  blurb         text not null,
  er_buckets    text[],
  vol_buckets   text[],
  tier          text not null default 'NTZ',
  sort          integer not null default 0,
  published     boolean not null default true,
  locked_reason text,
  created_at    timestamptz not null default now()
);
alter table public.tapes enable row level security;
revoke all on public.tapes from anon, authenticated;

insert into public.tapes (slug, name, blurb, er_buckets, vol_buckets, sort, published, locked_reason) values
  ('open', 'The Open Tape',
   'Every chart in the corpus, equally weighted across all sixteen regime cells. The default, and the only one whose statistics describe the whole population.',
   null, null, 0, true, null),
  ('chop', 'Chop',
   'Efficiency ratio under 0.20 — price covering ground without going anywhere. §11.1 calls it the account killer.',
   array['chop','noise'], null, 1, true, null),
  ('trend', 'Trend',
   'Efficiency ratio above 0.35. The lead-in went somewhere; the question is whether it keeps going.',
   array['trend'], null, 2, true, null),
  ('quiet-books', 'Quiet Books',
   'The lowest quartile of realised volatility against the instrument''s own trailing year. Coiled, thin, and easy to misjudge the scale of.',
   null, array['quiet'], 3, true, null),
  ('high-seas', 'High Seas',
   'The top quartile of realised volatility. Wide bars, wide stops, and an ATR badge you should probably read twice.',
   null, array['violent'], 4, true, null),
  ('null-set', 'The Null Set',
   'Charts where the median achievable outcome is negative and passing is the correct play.',
   null, null, 90, true,
   'Locked. The filter reads par_r, which is derived from the reveal path — so the tape''s own name would tell you most brackets lose here before you traded. §12.1 forbids that, and passing everything would score a mean 61st percentile anyway. It returns when there is a scoring mode that can hold it honestly.')
on conflict (slug) do nothing;
