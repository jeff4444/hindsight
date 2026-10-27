-- 0033: the official tapes, described as scenarios.
--
-- Markets lists the official tapes as scenarios: a published filter over the library that picks
-- markets by what they were doing before the replay starts. The 0029 blurbs were written for the
-- chart game, and three of them are now wrong rather than merely dated:
--
-- * The Drop said "half are mirrored rallies". `trade_open_session` applies a tape's drift bounds
--   to the *real* drift (a mirrored chart's stored drift has the other sign), so every market The
--   Drop deals really did fall, and every one The Ramp deals really did rise.
-- * High Seas pointed at the ATR badge, which the terminal does not have.
-- * Every blurb said "charts"; a scenario deals markets.
--
-- Copy only: no filter, slug or lock changes. The Null Set stays locked, and is no longer offered
-- or dealt (0031 refuses a locked tape; Markets does not list one). Creator tapes are untouched.

update public.tapes set
  blurb = 'Every market in the library — any pair, any mood. The closest thing to an ordinary day.'
  where slug = 'open' and owner_id is null;
update public.tapes set
  blurb = 'Price covering ground without going anywhere. Stops get tagged both ways — the account killer.'
  where slug = 'chop' and owner_id is null;
update public.tapes set
  blurb = 'The calmest markets of their own year. Coiled and thin, and easy to misjudge the size of a move.'
  where slug = 'quiet-books' and owner_id is null;
update public.tapes set
  blurb = 'The most violent markets of their own year. Wide bars and wide stops — size down.'
  where slug = 'high-seas' and owner_id is null;
update public.tapes set
  blurb = 'A level taken out by a hair and handed straight back. The most common formation in the library.'
  where slug = 'sweep' and owner_id is null;
update public.tapes set
  blurb = 'A close beyond the twenty-bar extreme, then straight back inside. Breakouts that did not.'
  where slug = 'failed-break' and owner_id is null;
update public.tapes set
  blurb = 'A big leg, reversed hard within twenty bars. Spot the turn, or get turned.'
  where slug = 'v-reversal' and owner_id is null;
update public.tapes set
  blurb = 'Ten quiet bars, then one that is not. Compression before release — the rarest scenario here.'
  where slug = 'coil' and owner_id is null;
update public.tapes set
  blurb = 'Price bouncing between two edges. Fade the edges, or catch the break.'
  where slug = 'range' and owner_id is null;
update public.tapes set
  blurb = 'Steady, efficient moves in one direction. Rare in this library, which is mostly chop.'
  where slug = 'trend' and owner_id is null;
update public.tapes set
  blurb = 'Markets that had fallen eight ATR or more before the replay starts. Catch the bounce, or ride the slide.'
  where slug = 'crash' and owner_id is null;
update public.tapes set
  blurb = 'Markets that had risen eight ATR or more before the replay starts. Late to the move, or early to the exit?'
  where slug = 'euphoria' and owner_id is null;
update public.tapes set
  blurb = 'Markets where the schools disagreed: at least one long and one short on the same candles.'
  where slug = 'council-split' and owner_id is null;
