-- Wholesale corpus replacement.
--
-- A change to the published selection rule changes *which* charts exist, and §12.4 does not
-- allow population statistics to be compared across such a change. So a regeneration replaces
-- the corpus rather than adding to it — leaving old charts in place would silently mix two
-- rules in one set of ratings and track records.
--
-- This exists because the obvious `delete from charts` cannot do the job: a thousand rows
-- carrying ~144 MB of TOASTed price data exceeds the statement timeout. TRUNCATE does no
-- per-row work and cascades to rounds, which is correct — a round is a result against a chart
-- that no longer exists.

create or replace function public.clear_corpus()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  truncate table public.charts cascade;
end;
$$;

revoke all on function public.clear_corpus() from public, anon, authenticated;

comment on function public.clear_corpus() is
  'Destructive. Truncates charts and cascades to rounds, for a corpus regeneration under a new selection rule. Service role only.';
