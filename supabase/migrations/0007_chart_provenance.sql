-- Whether a chart is real price action, so the reveal can say so truthfully.
--
-- Every chart in the corpus today is real: §7.2's synthetic controls are Phase 4, and the
-- permutation generator built in Phase 0.5 deliberately does not write into the corpus. The
-- column exists now anyway, because the alternative is a reveal screen that hardcodes "real"
-- and quietly becomes a lie the day synthetic charts land.
--
-- §7.2 wants those mixed in "silently... invisible to the player", so what this column is
-- allowed to surface, and when, is a Phase 4 decision rather than one to bake in here.

alter table public.charts
  add column if not exists synthetic boolean not null default false,
  add column if not exists source_note text;

comment on column public.charts.synthetic is
  'False for real price action. Reserved for 7.2 synthetic controls, which do not exist yet - the permutation generator does not write into the corpus.';
comment on column public.charts.source_note is
  'How a synthetic chart was produced (permutation, GBM, block bootstrap). Null for real charts.';
