-- Hindsight Phase 0 — the playable loop.
--
-- Two tables. `charts` is the corpus; `rounds` is issuance and result.
--
-- The integrity rules this schema encodes:
--   §12.1  Future data never reaches the client. `reveal_bars` and `resolution_path` live here
--          and are read only by the server, only after an order is committed.
--   §12.2  Identity is destroyed at generation time. `symbol`, `window_start` and
--          `decision_at` are retained for pipeline reproducibility and auditing, and are
--          never selected by any client-facing query.
--   §1.2   "Engine versioning pinned to every stored result. This must be in the first commit.
--          It is unfixable later." Hence the version columns on `rounds`.

create table public.charts (
  id uuid primary key default gen_random_uuid(),

  -- Private. Server-only, never in a response payload.
  symbol text not null,
  window_start timestamptz not null,
  decision_at timestamptz not null,

  -- Geometry.
  display_tf text not null,
  resolution_tf text not null,
  lead_in_bars jsonb not null,
  reveal_bars jsonb not null,
  -- Interleaved Float32 OHLC, 4 bytes per price. 3600 one-minute bars = 57.6 KB, against
  -- 150-250 KB for the same data as JSONB.
  resolution_path bytea not null,

  -- Normalisation, stored so the transform is reproducible from the raw source.
  index_factor double precision not null,
  volume_base double precision not null,
  mirrored boolean not null,

  -- Risk arithmetic, preserved at every tier per §3.1.
  atr14 double precision not null,
  tick_size double precision not null,
  -- Close of the decision bar. Entry is fixed here per §4.2; the player places rails only.
  entry_price double precision not null,

  -- Reproducibility.
  selection_seed bigint not null,
  pipeline_version text not null,
  normalization_version text not null,
  created_at timestamptz not null default now(),

  constraint charts_window_unique unique (symbol, window_start)
);

comment on table public.charts is
  'Pre-generated chart corpus. Contains future price data and must never be exposed to a client.';
comment on column public.charts.resolution_path is
  'Lower-timeframe resolution path, interleaved Float32 OHLC. Walked bar by bar to resolve trades (§12.3).';

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references public.charts (id) on delete cascade,

  -- An anonymous cookie value, not an account. Phase 0 has no accounts (§14).
  session_id uuid not null,
  -- Per-round nonce for server-side issuance (§12.6).
  nonce text not null,

  issued_at timestamptz not null default now(),
  committed_at timestamptz,

  -- The committed order.
  order_stop double precision,
  order_target double precision,
  passed boolean not null default false,

  -- The resolution.
  outcome text check (outcome in ('target', 'stop', 'timeout', 'pass')),
  direction text check (direction in ('long', 'short')),
  entry_fill double precision,
  exit_fill double precision,
  exit_path_index integer,
  exit_bar_index integer,
  risk_per_unit double precision,
  r_multiple double precision,
  mfe_r double precision,
  mae_r double precision,
  window_mfe_r double precision,
  window_mae_r double precision,
  -- Set when stop and target were touched inside a single lower-timeframe bar (§12.3.2).
  -- Excluded from ranked play once ranked exists.
  ambiguous boolean,

  -- Costs charged at resolution. Zero in Phase 0; the columns exist so the §7.5 cost model
  -- does not invalidate stored results when it lands.
  spread_bps double precision not null default 0,
  stop_slippage_bps double precision not null default 0,

  -- Pinned versions. A stored result must stay re-derivable.
  resolver_version text,
  normalization_version text,
  pipeline_version text
);

comment on column public.rounds.session_id is
  'Anonymous browser session. Phase 0 has no accounts; this is not a user reference.';

create index rounds_session_idx on public.rounds (session_id, issued_at desc);
create index rounds_chart_idx on public.rounds (chart_id);
create index rounds_open_idx on public.rounds (id) where committed_at is null;

-- Row level security: enabled with no policies at all.
--
-- Phase 0 has no user authentication and every read and write goes through a server route
-- holding the service-role key, which bypasses RLS. Deny-all to anon and authenticated is
-- therefore both correct and the strictest available posture — and `charts` holds the future
-- bars, so an accidental client-side read of it would invalidate every result in the product.
alter table public.charts enable row level security;
alter table public.rounds enable row level security;

revoke all on public.charts from anon, authenticated;
revoke all on public.rounds from anon, authenticated;
