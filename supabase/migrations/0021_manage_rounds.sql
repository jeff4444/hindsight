-- §10.1's Manage round: server-authoritative state for a trade managed while the candles advance.
--
-- ## Why this cannot reuse the Naked flow
--
-- In Naked the reveal bars are shipped **at commit** — after the only decision — so §6's rule that
-- "future data never reaches the client before the order is committed" is satisfied by construction.
--
-- Manage breaks that. The player keeps deciding *during* the reveal, so shipping all sixty bars when
-- the position opens would put the entire future on the client while every remaining decision is
-- still ahead of them. There is no client-side discipline that fixes it: whatever the UI chooses to
-- draw, the bytes are there to read.
--
-- So the reveal is metered by the server. `manage_opened_at` is the only clock that counts; a tick
-- request returns the bars that have elapsed against it and not one more, and an action is stamped
-- with the index the server believes is current rather than the one the client claims.
--
-- ## The action log is the record of the round
--
-- `manage_events` stores what the player did and when, in path indices. The result is *derived* from
-- it by `resolvePlayerManaged`, never sent by the client — so a replay of the log reproduces the
-- score exactly, and a client that lies about its outcome is simply ignored.

alter table public.rounds
  -- The initial stop. Manage has no target: you leave when you decide to leave.
  add column if not exists manage_stop double precision,
  -- Server clock. The reveal is metered against this and nothing else.
  add column if not exists manage_opened_at timestamptz,
  -- [{ atPathIndex, action: { kind, price? } }, …], in the order the server accepted them.
  add column if not exists manage_events jsonb,
  -- Rank among the 98 Manage cells. Deliberately not `percentile`, which is the Naked ladder's.
  add column if not exists manage_percentile double precision,
  add column if not exists manage_version text;

comment on column public.rounds.manage_opened_at is
  'Server clock for the metered reveal. The client is never told how many bars exist beyond the ones elapsed against this, because in Manage the player is still deciding while they arrive (6).';
comment on column public.rounds.manage_events is
  'The action log, in path indices: what the player did and when. The score is derived from this by resolvePlayerManaged and never accepted from the client, so replaying the log reproduces it exactly.';
comment on column public.rounds.manage_percentile is
  'Rank among the 98 Manage cells (manage_r), not among the 98 brackets. Par differs by 0.367R between the two grids, so the ladders are not interchangeable.';

create index if not exists rounds_manage_open_idx
  on public.rounds (id)
  where manage_opened_at is not null and committed_at is null;
