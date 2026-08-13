-- §5.12 style fingerprinting: what the player's bracket looked like next to each engine's.
--
-- Stored on the round rather than recomputed, and that is the whole reason this migration exists.
-- The council's verdicts are produced at reveal time and thrown away; reconstructing them for a
-- player's history would mean replaying eight engines over every chart they have ever seen, on
-- every page load. Writing the comparison once, at the moment it is already computed, turns the
-- fingerprint into a cheap aggregate over rows this player already owns.
--
-- Shape:
--   {
--     "available": { "CHANNEL": -1.06, "SWEEP": 0.42 },   engine -> its own R on this chart, net
--     "matched":   ["CHANNEL"]                            of those, the ones the bracket resembled
--   }
--
-- `available` is the denominator and it is per-engine on purpose. §5.12's obvious reading — label
-- each chart with the nearest school — is degenerate on this roster: no school takes a position on
-- 66.9% of charts and exactly one does on a further 22.2%, so a nearest-school label would be
-- undefined two times in three and tautological most of the rest. Scoring each engine on its own
-- charts is defined whenever that engine spoke.
--
-- Null for a pass and for every round committed before this column existed. A pass carries no
-- bracket, and restraint is a verdict (§4.4) rather than a style — counting it as "did not resemble
-- Channel" would make an abstaining player look like the opposite of every school at once.

alter table public.rounds
  add column if not exists style jsonb;

comment on column public.rounds.style is
  'Style fingerprint evidence for this round (5.12): {available: {ENGINE: rMultiple}, matched: [ENGINE]}. available is every engine that took a position and what its own bracket returned here, net of costs; matched is the subset the player''s bracket resembled within one rung of the achievable grid. Null for a pass and for rounds predating the column.';

-- The fingerprint is always "this player's rounds, where an engine spoke", so the index is on the
-- owner and the presence of the column rather than on its contents.
create index if not exists rounds_style_owner_idx
  on public.rounds (owner)
  where style is not null;
