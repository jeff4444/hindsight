-- Storm's clock measures deciding, not waiting.
--
-- 0022 gave Storm a wall-clock deadline (`ends_at`). Playing it showed what that actually charges
-- for: a round took about eleven seconds end to end, of which roughly ten were the reveal animation
-- and one was the decision. A three-minute wall clock is therefore mostly a queue for the animation,
-- and a player's score is set by how fast the reveal plays rather than by how fast they read a
-- chart.
--
-- Worse, the reveal can be skipped. So the optimal Storm strategy under a wall clock is to commit
-- and immediately skip the reveal — that is, **to never look at the outcome**, which is the one
-- thing this entire product exists to make people do. A scoring rule that pays players to stop
-- learning is not a scoring rule worth having.
--
-- So the clock is a budget of *decision* time: each round charges `committed_at - issued_at`, and
-- the reveal, the debrief and the pause between charts cost nothing. §10.1's three minutes and its
-- ten-second stop penalty are unchanged; what changed is which seconds count.
--
-- Nothing is lost by the switch: a player who opens a chart and walks away is still charged for
-- every second of it, so there is no version of "stop the clock" available to them.

alter table public.runs
  add column if not exists remaining_ms integer;

-- Live storms keep whatever their wall clock had left; everything else is settled.
update public.runs
   set remaining_ms = case
         when mode = 'storm' and alive and ends_at is not null
           then greatest(0, (extract(epoch from (ends_at - now())) * 1000)::integer)
         when mode = 'storm' then 0
         else null
       end
 where remaining_ms is null;

-- Dropped rather than left in place: a wall-clock deadline sitting beside a decision-time budget is
-- an invitation to read the wrong one, which is the bug this migration exists to remove.
alter table public.runs drop column if exists ends_at;

comment on column public.runs.remaining_ms is
  'Storm only. Milliseconds of decision time left: each round charges committed_at - issued_at, and a stop-out charges a further 10s. Null for Streak, which is untimed. Server-authoritative — a client that owned this would own the score.';

comment on table public.runs is
  'Storm and Streak runs (10.1). Server-authoritative: remaining_ms is the only Storm clock that counts, exactly as manage_opened_at is for Manage. It measures deciding, not waiting — the reveal is free, because charging for it would pay players to skip the debrief.';
