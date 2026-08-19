-- The product's word is "tape", so the schema says tape.
--
-- §20 of the ruleset settled this already: *"A map is a tape. The product's word is 'tape' and §11's
-- is 'map'; they are the same thing."* The scope document says map because §11 says map, and the
-- ruleset quotes it faithfully. Everything the player touches has said tape for a while. This column
-- was the last place the older word survived below the surface, and 0024 named it `map_filter_version`
-- at a point when the UI still said "map" too.
--
-- ## What this is not
--
-- Not a data change. `alter ... rename column` rewrites a catalogue entry and no heap pages, so it is
-- instant on a table of any size and takes no lock worth planning around here.
--
-- ## The stored value moves with the column, and that is safe
--
-- The tag rows carry is bumped from `map-filter-1` to `tape-filter-1` in the same statement, so a
-- backfilled chart does not end up under a renamed column still announcing the old name.
--
-- This is safe only because nothing compares the value. `scripts/backfill-tape-filters.ts` selects on
-- `tape_filter_version is null` to find unfinished rows and rewrites every row under `--recompute`;
-- it never asks which version a row carries. So this is a relabel, not an invalidation: no chart is
-- reprocessed, and `lead_in_drift_atr` — the number the version describes — is untouched. Were the
-- rule itself to change, that is a *new* version and a real recompute, which is a different commit.

alter table public.charts
  rename column map_filter_version to tape_filter_version;

update public.charts
  set tape_filter_version = 'tape-filter-1'
  where tape_filter_version = 'map-filter-1';

comment on column public.charts.tape_filter_version is
  'The rule under which lead_in_drift_atr was computed. Separate from council_version because the two invalidate for different reasons: this one moves with normalization, that one with the engine roster.';
