-- 0030: trading — accounts, replay sessions, the order-event log, and what a closed session left.
--
-- Not yet applied to the live project. It is written to be applied after 0029 and drops nothing:
-- every table the game used (rounds, ratings, runs, matches, …) stays exactly as it is, with its
-- data, so every stored result can still be re-derived under the versions it was played at.
--
-- ## The shape
--
--   trade_accounts       one per player and purpose (main / practice), one per school and version
--   trade_sessions       one replay of one corpus chart, with the server's clock for it
--   trade_order_events   the append-only log a session's account is replayed from
--   trade_fills          ┐ projections of the log, written once when the session closes, so
--   trade_round_trips    ┘ statements and boards never replay a log on read
--
-- The log is the source of truth (docs/rules.md §22.8). Account state is whatever replaying the
-- events over the tape produces under the session's `sim_version`; the projections are a cache of
-- that and can be rebuilt from it.
--
-- ## Integrity
--
-- Same posture as every other table: RLS enabled, no policies, nothing granted to anon or
-- authenticated (0010 closed the default privileges). Only the server, as the service role, reads
-- these — which is what keeps the tape's future and the chart's identity off the client (§22.9).

create table if not exists public.trade_accounts (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('player', 'bot')),
  purpose              text not null default 'main' check (purpose in ('main', 'practice')),
  session_id           uuid references public.play_sessions (id),
  user_id              uuid references auth.users (id) on delete set null,
  owner                uuid generated always as (coalesce(user_id, session_id)) stored,
  bot_code             text,
  bot_version          text,
  starting_micros      bigint not null check (starting_micros > 0),
  cash_micros          bigint not null,
  realized_micros      bigint not null default 0,
  fees_micros          bigint not null default 0,
  peak_micros          bigint not null,
  max_drawdown         double precision not null default 0,
  sessions             integer not null default 0,
  round_trips          integer not null default 0,
  wins                 integer not null default 0,
  gross_profit_micros  bigint not null default 0,
  gross_loss_micros    bigint not null default 0,
  status               text not null default 'active' check (status in ('active', 'archived')),
  bankrupt             boolean not null default false,
  sim_version          text not null,
  fee_version          text not null,
  margin_version       text not null,
  created_at           timestamptz not null default now(),
  archived_at          timestamptz,
  constraint trade_accounts_bot check ((kind = 'bot') = (bot_code is not null and bot_version is not null)),
  constraint trade_accounts_player check (kind = 'bot' or session_id is not null or user_id is not null)
);

comment on table public.trade_accounts is
  'A paper account. Money is integer micro-USDT. A reset archives the account and opens a new one, so a track record is never edited; a school gets a new account for every BOT_VERSION.';

create unique index if not exists trade_accounts_active_player
  on public.trade_accounts (owner, purpose) where kind = 'player' and status = 'active';
create unique index if not exists trade_accounts_bot_version
  on public.trade_accounts (bot_code, bot_version) where kind = 'bot';
create index if not exists trade_accounts_user_idx on public.trade_accounts (user_id) where user_id is not null;
create index if not exists trade_accounts_session_idx on public.trade_accounts (session_id) where session_id is not null;

alter table public.trade_accounts enable row level security;
revoke all on public.trade_accounts from anon, authenticated;

create table if not exists public.trade_sessions (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references public.trade_accounts (id) on delete cascade,
  chart_id            uuid not null references public.charts (id) on delete cascade,
  source              text not null check (source in ('random', 'pair', 'daily', 'scenario', 'corpus')),
  scenario            text,
  daily_day           integer,
  ranked              boolean not null default false,
  dates_visible       boolean not null default false,
  symbol              text not null,
  total_minutes       integer not null check (total_minutes > 0),
  starting_micros     bigint not null,
  nonce               text,

  -- The replay clock (src/core/trading/clock.ts). The server is the only thing that moves it.
  anchor_revealed     integer not null default 0,
  anchor_at           timestamptz not null default now(),
  speed               integer not null default 15,
  paused              boolean not null default true,
  lease_until         timestamptz not null default now(),
  clock_version       integer not null default 0,

  -- The log's bookkeeping: events are numbered and never stamped earlier than the last one.
  high_water          integer not null default -1,
  event_count         integer not null default 0,

  status              text not null default 'open' check (status in ('open', 'closed')),
  close_reason        text check (close_reason in ('end', 'user', 'abandoned', 'superseded')),
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz,

  -- What the session came to, written once by trade_finalize_session.
  ending_micros       bigint,
  realized_micros     bigint,
  fees_micros         bigint,
  return_pct          double precision,
  max_drawdown        double precision,
  round_trips         integer,
  wins                integer,
  ambiguous_fills     integer,
  bankrupt            boolean,
  equity_curve        jsonb,

  sim_version         text not null,
  fee_version         text not null,
  margin_version      text not null,
  instrument_version  text not null,
  bot_version         text
);

comment on table public.trade_sessions is
  'One replay of one chart. Holds the server clock that meters the tape; the client never sends a minute index. Summary columns are null until the session closes.';
comment on column public.trade_sessions.dates_visible is
  'Practice only. A session that showed real dates while open is never ranked (§22.9).';

create unique index if not exists trade_sessions_one_open
  on public.trade_sessions (account_id) where status = 'open';
create unique index if not exists trade_sessions_daily
  on public.trade_sessions (account_id, daily_day) where daily_day is not null;
create unique index if not exists trade_sessions_corpus
  on public.trade_sessions (account_id, chart_id) where source = 'corpus';
create index if not exists trade_sessions_account_idx on public.trade_sessions (account_id, opened_at desc);
create index if not exists trade_sessions_chart_idx on public.trade_sessions (chart_id) where status = 'closed';
create index if not exists trade_sessions_daily_board_idx
  on public.trade_sessions (daily_day, return_pct desc) where status = 'closed' and daily_day is not null;

alter table public.trade_sessions enable row level security;
revoke all on public.trade_sessions from anon, authenticated;

create table if not exists public.trade_order_events (
  session_id   uuid not null references public.trade_sessions (id) on delete cascade,
  seq          integer not null,
  at_index     integer not null,
  client_key   text,
  -- The OrderEvent without `seq` and `at`, in ticks and steps (src/core/trading/types.ts).
  event        jsonb not null,
  received_at  timestamptz not null default now(),
  primary key (session_id, seq)
);

comment on table public.trade_order_events is
  'Append-only. The account is the replay of these events over the tape; nothing else about a session''s money is authoritative.';

create unique index if not exists trade_order_events_key
  on public.trade_order_events (session_id, client_key) where client_key is not null;

alter table public.trade_order_events enable row level security;
revoke all on public.trade_order_events from anon, authenticated;

create table if not exists public.trade_fills (
  session_id       uuid not null references public.trade_sessions (id) on delete cascade,
  seq              integer not null,
  order_id         text not null,
  at_index         integer not null,
  side             text not null check (side in ('buy', 'sell')),
  qty_steps        bigint not null,
  price_ticks      bigint not null,
  notional_micros  bigint not null,
  fee_micros       bigint not null,
  liquidity        text not null check (liquidity in ('maker', 'taker')),
  role             text not null,
  gap              boolean not null,
  ambiguous        boolean not null,
  realized_micros  bigint not null,
  primary key (session_id, seq)
);
alter table public.trade_fills enable row level security;
revoke all on public.trade_fills from anon, authenticated;

create table if not exists public.trade_round_trips (
  session_id       uuid not null references public.trade_sessions (id) on delete cascade,
  n                integer not null,
  side             text not null check (side in ('long', 'short')),
  opened_at_index  integer not null,
  closed_at_index  integer not null,
  max_qty_steps    bigint not null,
  entry_avg_ticks  double precision not null,
  exit_avg_ticks   double precision not null,
  gross_micros     bigint not null,
  fees_micros      bigint not null,
  net_micros       bigint not null,
  mfe_micros       bigint not null,
  mae_micros       bigint not null,
  primary key (session_id, n)
);
alter table public.trade_round_trips enable row level security;
revoke all on public.trade_round_trips from anon, authenticated;
