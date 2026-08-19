-- The columns three of §11.1's official maps are filtered on.
--
-- §11.1's requirement is that an official map is "defined by a published filter over the regime tags
-- and theme tags, not by hand-picking, so the map's difficulty distribution is reproducible and its
-- statistics are valid." Crash, Euphoria and Council Split all need a tag that does not exist yet,
-- and computing either one at query time is not an option — the council alone means running eight
-- engines over 300 candles per chart.
--
-- ## Drift is measured on what the player sees, in the space the mirror works in
--
-- `lead_in_drift_atr` is the close-to-close move across the *visible* lead-in, expressed in ATRs. It
-- is computed from `lead_in_bars`, which are already indexed and mirrored (§12.2) — so it is the
-- drift on the screen rather than the instrument's.
--
-- It is a **log return over a relative ATR**: `ln(last / first) / (atr14 / entry_price)`. The
-- obvious definition, `(last - first) / atr14`, is wrong twice over. §12.2's mirror is `BASE² / p`,
-- exact in log space, so drift must be read in log space for a mirrored chart to be the negation of
-- its original; and `atr14` is an absolute price distance, so a chart that fell sits at lower prices
-- with a smaller ATR, which inflates every down move and compresses every up move.
--
-- The artifact was large enough to look like a finding: under the linear definition the corpus held
-- 88 charts past −10 ATR and 39 past +10 — 4.4 standard errors from a fair split, an asymmetry random
-- mirroring cannot produce. Under this one it is 65 and 65.
--
-- `entry_price` rather than a mean price across the window, because `atr14` is Wilder's ATR(14) and
-- is anchored at the end of the lead-in. A geometric-mean normaliser looks more principled and
-- misses by 29%. `tests/map-filters.test.ts` holds both numbers.
--
-- That distinction is the whole of what Crash and Euphoria can honestly claim. Mirroring is random
-- per chart, so half of every displayed crash is a mirrored rally, and the two maps are the same
-- distribution reflected — 237 charts below −6 against 216 above +6, and 65 against 65 past ±10. A
-- map named Crash on this corpus is a map of falling *charts*, not of crash dynamics, and
-- `docs/phase-5d-research.md` §2 is the record of why.
--
-- ## The council columns, and the claim they cost §11.1
--
-- `council_speakers` counts the schools that take a position, excluding Engine Zero — the null
-- always speaks, and counting it would make every chart look like a live council.
-- `council_minority` is the size of the smaller side, so 0 is unanimous-or-silent and anything above
-- 0 is a genuine conflict.
--
-- §11.1 calls Council Split "the hardest map in the game". It is not harder at all. Median par_r on
-- the 71 conflicted charts is −1.022 against −1.019 for the corpus, median pass percentile 0.612
-- against 0.612, and Welch's t is 0.10 and 0.79 — flat on every difficulty measure there is. The map
-- ships named for what it is, and the claim is withdrawn.
--
-- Note also that `council_minority` never exceeds 1 anywhere in the corpus: every disagreement is
-- n−1 against 1, so "the charts where the engines disagree *most*" is not a spectrum to sort by.

alter table public.charts
  add column if not exists lead_in_drift_atr  double precision,
  add column if not exists map_filter_version text,
  add column if not exists council_speakers   smallint,
  add column if not exists council_minority   smallint,
  add column if not exists council_version    text;

comment on column public.charts.lead_in_drift_atr is
  'Drift across the visible lead-in in ATRs, as ln(last/first) / (atr14/entry_price). Log because the mirror is exact in log space; relative ATR because an absolute one inflates down moves, which produced a spurious 88-vs-39 tail asymmetry. Computed from the mirrored bars, so it is the direction the player sees. Filters Crash and Euphoria (11.1).';
comment on column public.charts.map_filter_version is
  'The rule under which lead_in_drift_atr was computed. Separate from council_version because the two invalidate for different reasons: this one moves with normalization, that one with the engine roster.';
comment on column public.charts.council_speakers is
  'Schools taking a position, Engine Zero excluded. The null always speaks, so counting it would make every chart look like a live council.';
comment on column public.charts.council_minority is
  'Size of the smaller side when schools conflict; 0 when unanimous or silent. Never exceeds 1 anywhere in the corpus — every disagreement is n-1 against 1.';
comment on column public.charts.council_version is
  'The engine version these council columns were computed under. An engine bump invalidates them, exactly as it invalidates every published track record (12.4).';

-- Partial rather than full: the maps ask "which charts are in the tail", and the tails are a quarter
-- of the corpus each. Indexing the middle would be indexing the rows no map ever selects.
create index if not exists charts_drift_down_idx on public.charts (lead_in_drift_atr)
  where lead_in_drift_atr <= -4;
create index if not exists charts_drift_up_idx on public.charts (lead_in_drift_atr)
  where lead_in_drift_atr >= 4;
create index if not exists charts_council_split_idx on public.charts (id)
  where council_minority > 0;
