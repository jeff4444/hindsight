# Hindsight rules — Phase 0

Scope §3.6 argues that a ruleset has to be written at the level of specificity the Souls
no-hit community uses, and for a reason that is easy to underrate:

> "No indicators" is not a ruleset. [...] Write Hindsight's at that level before the first
> ranked season, because the first tournament dispute will be about an edge case and there
> will be no time to decide then.

This is that document, at Phase 0 size. It covers only what Phase 0 actually implements. It
grows with the ladder; it does not get rewritten.

Every rule here is enforced in code and pinned to a version constant in
[`src/core/versions.ts`](../src/core/versions.ts). Every stored result records the versions it
was produced under, so a result can always be re-derived from the rules that were in force
when it was played.

---

## 1. The chart

- **80 lead-in candles.** One timeframe. Volume shown.
- **60 reveal candles.** Released only after the order is committed.
- Display bars are one hour, aggregated from one-minute source bars on UTC boundaries.
- Every chart is **indexed to 100** at the open of the first visible candle.
- **No ticker, no date, no time axis, no currency.** Volume is rebased against the median
  lead-in volume, so it carries shape and not size.
- **Mirroring is randomised per chart** and fixed at generation. The reflection is
  `p' = 100² / p` with high and low swapped — a reflection in log space, so a ×1.5 move maps
  to a ×⅔ move at any distance from the base and the candle geometry stays realistic.
- The **ATR(14) badge is always shown**, in index units. §3.1 forbids hiding volatility scale
  at any tier: it is risk arithmetic, not a crutch.
- The **tick is 0.01 index units** — one basis point of the base — and is uniform across every
  instrument. Real per-instrument granularity is a fingerprinting surface (§3.2); a uniform
  tick preserves the risk arithmetic without feeding it.

### 1.1 The clock: weekday and hour, never a date

The chart shows the **weekday and the hour** of every candle, on the time axis and as a badge
on the decision bar. It never shows a year, a month, or a day of the month.

This is a deliberate exception to §12.2's "strip all dates", and the reasoning is §3.1's: the
axes to restrict are *identity*, *hindsight* and *crutches*. Session structure is none of them.
Crypto trades around the clock but not evenly — books thin across the weekend, and the
Asia/Europe/US handoffs show up in the range of the bars themselves. A player who notices that
a compression is happening at 03:00 on a Sunday is reading the chart, not looking it up. It
belongs in the same category as the ATR badge: context that makes the problem legible rather
than a shortcut past it.

What is released is three bits of weekday and a little under five of hour. The mechanism is a
**synthetic epoch**: bars are stamped into a fixed fictional week (anchored to Monday 5 January
1970) instead of carrying their real timestamps, so the charting library gets properly
hour-spaced times to lay an axis out from while the calendar date derivable from them is a
constant. Only the weekday and hour of the first visible candle leave the server; every other
bar's clock follows by index arithmetic, because the display timeframe is one hour.

**The residual risk, stated plainly.** This does not identify the instrument or the date, but
it does make a chart a player has *already recognised* easier to confirm. That is a small
addition to an attack that was already recognition-based, and recognition is what mirroring and
indexing (§12.2) exist to defeat.

**It will not transfer to equities unchanged.** §13.1 phase 3 brings instruments with fixed
session boundaries and a scheduled macro calendar, and there "Friday 08:30 Eastern" next to a
violent candle does not read as session structure — it reads as the payrolls print. That is a
material hint the 24/7 crypto corpus does not contain, and it edges toward the §9.1 leakage
rule. Revisit this decision before equities ship rather than inheriting it.

### 1.2 Identity is released after the commit, never before

Once the order is committed, the reveal names what the chart actually was: **the pair, the venue,
the calendar moment, and the instrument's real price at the entry**. If the chart was mirrored, it
says so.

This is not a relaxation of §12.2. That rule hides identity so a chart cannot be *looked up before
the decision*; once the decision is committed and scored there is nothing left to protect, and
something to gain — the player can check for themselves that the price action was real, which is
the claim the whole product rests on. §3.3 confirms the default by defining a **Silent** mod as
"no ticker or date reveal even after the round", and §13.1 assumes the same when it notes that
"the ticker and date are revealed afterwards".

The real price is recovered by undoing the transform in reverse: un-mirror first, then unscale.
The order is not symmetric, and getting it backwards returns a plausible-looking number that is
simply not the price.

**Every chart in the corpus today is real price action**, and the reveal says so. §7.2's synthetic
controls do not exist yet — Phase 0.5 built the permutation generator but deliberately kept
permuted charts out of the corpus. The field is stored per chart so that the day they land, the
reveal is not quietly lying.

> **Open, for Phase 4.** §7.2 wants synthetic charts mixed in "silently... invisible to the
> player". Labelling one at the reveal does not contaminate that round — the score is locked in
> before the label appears — but over many rounds it teaches players what a synthetic chart looks
> like, which erodes both the §7.2 measurement and its §12.6 use as a cheat detector. §15.1
> already lists the proportion of synthetic charts as an open question; whether they are disclosed
> belongs with it. This build discloses, because everything is currently real and silence would be
> the lie.

### 1.3 The player picks the resolution; the decision timeframe does not move

The hour is the **decision timeframe**, and no timeframe the player selects changes it. It is
marked in the menu. Specifically, the hour fixes:

- the **80 candles of history** the player reads before deciding,
- the **entry**, at the close of the last of them (§4.2),
- **ATR(14)**, which is the badge and the unit every stop distance is quoted in,
- the **60 candles** the trade has to resolve in before it is marked to market,
- and the units Phase 1's achievable set will be enumerated in.

It is *not* the resolution a trade is filled at. Fills are determined by walking the
**one-minute** path bar by bar, whichever timeframe is on screen — that is the whole point of
§12.3, and it does not change when the selector does. A stop is hit the minute it is hit, not
at the close of some hourly candle.

What the selector changes is what is drawn: **1m · 15m · 30m · 1h · 4h · 1d**. The corpus
already stores a one-minute path for the whole window — §12.3 needs it to resolve trades
without intrabar ambiguity — so the finer data is paid for whether or not it is shown.

The resolution is chosen, not inferred from the zoom. An earlier version derived it, and
deriving it means candles change shape while the player is still moving the wheel, which is
disorienting even when the choice is right; there is also no reading of "correct" that survives
someone wanting a dense one-minute view of six days. Every charting tool a trader has used
works this way.

Four consequences worth writing down:

- **Every timeframe is the same chart.** Sixty one-minute candles aggregate to exactly the hour
  candle containing them, prices to within Float32 noise and volume exactly. Volume at a fine
  timeframe is real minute volume, never an hour's volume spread across its minutes — that
  would be the same fabrication §1.1 rejects for volume-at-price.
- **4h and 1d are aligned to the clock, not to the window.** Neither divides an hour, and a
  window opens on whatever hour it opens on, so without alignment a "daily" candle would run
  15:00 to 15:00 and mean nothing. They are bucketed from midnight, which makes the first
  candle of those timeframes partial — correct, and what a real chart shows.
- **The selection survives the reveal.** The candles keep the timeframe the player chose while
  the future arrives; only the candles the newest hour touches are redrawn, so the append stays
  cheap at any resolution.
- **The rail band applies at the decision timeframe only.** The vertical range is widened to keep
  the rails reachable at an hour and above. Enforcing that below an hour would pin several ATR
  of range around a window in which price moves a fraction of one, flattening every candle into
  a horizontal line. Change timeframe or zoom out to move a rail.

None of this reaches the future. The client holds the lead-in's minutes and nothing else until
the order is committed; the reveal's minutes are withheld by the same rule as the reveal's
hours, and the database function that issues a round returns a slice rather than a column.

### 1.4 Panning and zooming is not hindsight

The chart pans and zooms freely while the order is being placed. This looks like it collides
with §3.1, which lists "scrollable data" under the *hindsight* axis to be restricted, so it is
worth settling now rather than during the first dispute (§3.6).

It does not collide, because §3.1's objection is to **reaching the future**, and here there is
no future to reach. The client holds the 80 lead-in candles and nothing else; the reveal bars
and the resolution path never leave the server until the order is committed (§12.1). Scrolling
right shows empty space. What §3.1 is actually describing is the dominant free replay tool,
whose future data sits in the browser so that scrolling *is* the exploit.

What panning and zooming does cost is deliberation time, and that is a real axis — §3.2 puts a
90-second clock on the Naked tier precisely because "the player willing to spend four minutes
wins, and willingness to spend four minutes is not a skill worth ranking." That clock is tier
machinery and arrives with the ladder. Until then this is an untimed sandbox, and inspection
is free.

One consequence is deliberate: **a rail can only be dragged to a price that is on screen.** To
place a wider stop, zoom out. That keeps the drag honest — you cannot set a level you have not
looked at — and it is how every real charting tool behaves.

## 2. The order

- **Entry is fixed at the close of the decision bar** (the last lead-in candle). The player
  does not choose it. §4.2 requires this: a fixed entry is what makes the achievable set
  enumerable in Phase 1.
- The player places **a stop and a target** and nothing else.
- **Direction is implied**, not declared. A stop below the entry is a long; a stop above it is
  a short. The target must be on the opposite side of the entry from the stop.
- Neither rail may sit on the entry. Initial risk of zero is not an order.
- Both rails are **snapped to the tick grid server-side**. Sub-tick precision from a client is
  discarded, not honoured.
- **Passing is a first-class action** and is recorded as `0R`. In Phase 0 it is only recorded;
  §4.4 scores it against the achievable distribution, which is Phase 1.
- A round **commits exactly once**. A committed round cannot be re-submitted, so the reveal
  can never be seen before the order is final.

## 3. Resolution

Trades resolve by walking the stored **one-minute resolution path** bar by bar — sixty
lower-timeframe bars per display bar. §12.3 requires this rather than a convention:

> Hindsight is a scored competition and ambiguity here is not inaccuracy, it is unfairness.

In order of precedence, per one-minute bar:

1. **Gap through the stop** — if the bar opens at or beyond the stop, the fill is **at the
   open**, not at the stop price. §12.3.4. A gap is a price the market never traded through.
2. **Gap through the target** — same rule, and the trader keeps the excess.
3. **Wick touch.** Stops and targets trigger on the **wick, not the close**. A bar whose low
   pierces the stop and closes back above it is still a stop.
4. **Both touched inside one minute** — the residual ambiguity the path cannot resolve.
   **Stop-first, and the fill is flagged `ambiguous`.** §12.3.2. Such rounds are excluded from
   ranked play once ranked exists.
5. **Neither touched by the end of the reveal** — the trade is **marked to market at the final
   close** and recorded as `timeout`.

**No proximity heuristic is used anywhere.** §12.3.3 rejects the common "if the open is nearer
the high, assume open-high-low-close" rule: it is a plausibility heuristic dressed as a
conservative one, and on exactly the bars where it matters it hands the trader the benefit of
the doubt.

## 4. The arithmetic

Van Tharp's definitions, per §4.1, and no others.

- **R is the initial risk**: the filled entry minus the stop, per unit.
- **The R-multiple is the outcome divided by that initial risk.** Stopped out is −1R. Risking
  one to make three and winning is +3R.
- Moving the stop **changes R**, because R is the denominator. Any future sensitivity analysis
  must say whether it holds dollar risk constant and resizes, or holds size constant — §4.4
  of v0.1 got this wrong and §7.5 of v0.2 fixes it.
- **MFE and MAE are reported on every result**, in R:
  - `mfeR` / `maeR` — the excursion over the **life of the trade**, the standard journal
    definition.
  - `windowMfeR` / `windowMaeR` — the excursion over the **whole reveal window**, open or not.
    This is the managed ceiling §4.6 wants the player to see: what a trade-management ladder
    could have captured and a set-and-forget bracket structurally cannot.

## 5. Costs

Phase 0 charges **zero**. The resolver takes a cost parameter and both the spread and the stop
slippage are stored on every round, currently as `0`.

This is a seam, not a feature. §7.5 is blunt about why it has to exist before results are
stored: a frictionless game trains players toward tight stops and marginal setups that lose
money net of costs, and the strongest negative finding in the technical-analysis literature is
that low transaction costs alone erase the profitability of technical rules. When the cost
model lands, it must not invalidate everything already recorded.

## 6. Integrity

- **Future data and identity never reach the client before the order is committed.** The
  issuance API returns eight fields — round id, lead-in bars, ATR, tick size, entry, reveal length — and the
  database function that serves it does not have the reveal bars in its return type at all.
  Enforced by [`tests/api-leak.test.ts`](../tests/api-leak.test.ts).
- **Charts and rounds are unreadable without the service-role key.** Both tables have RLS
  enabled with no policies and no grants to `anon` or `authenticated`.
- **A round belongs to one session** and can be committed only by that session.
- **Corpus generation is deterministic.** Every random choice — which pairs, which months, which
  windows, which are mirrored — derives from one published master seed, and mirror is a pure
  function of window identity rather than of iteration order.
- **No derived feature may read the future.** Enforced by
  [`tests/lookahead.test.ts`](../tests/lookahead.test.ts); see §8.

## 7. The corpus

§13.3 requires the corpus to be built "by **published rule**, not by hand", and §6 Layer 0 says
why: "Hand-curation changes the difficulty distribution non-randomly and invalidates every
population statistic computed on it." This is that rule. Nothing in it looks at whether a chart
is interesting.

### 7.1 The universe

Every USDT spot pair that has **ever** traded on Binance — 722 of them — read from the public
archive's own index.

The obvious source is unusable. `api.binance.com/exchangeInfo` returns *currently listed* pairs,
so a universe built from it is by construction a universe of instruments that did not die, which
is precisely the bias §6 Layer 0 rejects: *"every chart is a survivor, charts drift upward, longs
are systematically rewarded, and the leaderboard develops a long bias."* The archive still holds
directories for pairs delisted years ago, so it is the only survivorship-free source available.

A pair is **eligible** if it is USDT-quoted and has at least **18 monthly 1-minute archives**
inside 2020-01…2025-12. The floor is set by what the volatility axis needs, not by taste: a
percentile against the instrument's trailing year cannot exist for a pair that never traded a
year. That leaves **445 eligible pairs, 162 of them delisted — 36%**.

### 7.2 Which months get downloaded

A symbol-month is samplable if its 1-minute archive is at least **900,000 bytes** and the pair had
already traded for **13 months** by then.

The size floor is a liquidity measure, not a guess. Binance omits minutes in which nothing
traded, so an archive's size counts minutes that did. Complete coverage compresses to 1.2–1.5 MB;
below 0.9 MB enough minutes are missing that the contiguity filter below would reject most of the
month's windows anyway. It costs one pair out of 445 and leaves the delisted share untouched.

From the 13,577 samplable cells, **800** are drawn by seeded shuffle, capped at **4 months per
pair**. The shuffle is global rather than per pair, so a pair that traded for six years is
represented more than one that lasted eighteen months — it *is* more of the market's history, and
flattening that would be its own distortion. The cap stops proportionality becoming domination.

### 7.3 Which windows survive

Non-overlapping 140-hour windows, rejected for any of:

- a missing hour, or a missing minute anywhere in the window — a missing minute is a minute in
  which a stop could have fired, so the window is not fairly resolvable;
- a flatline, or an ATR below 0.1% of price;
- a bad print — broken OHLC ordering, or a single minute moving more than 15%;
- **the delisting cliff**: the reveal ends within 7 days of the pair's last archived data. This
  drops the flat artefact after trading effectively stopped and deliberately *keeps* the collapses
  before it. The LUNA and FTT crashes are real price action and belong in the corpus;
- no trailing year of daily closes, so the window cannot be tagged.

### 7.4 Which windows are kept

Every surviving window is tagged on two axes, both of which §6 Layer 2 specifies and both of which
are causal:

- **Kaufman efficiency ratio** over the lead-in closes — net distance over distance walked.
  Buckets are anchored to a derivation rather than to round numbers: over *n* bars a driftless
  random walk averages ≈ 1/√n, which for the 80-candle lead-in is ≈ 0.11. So `chop` is < 0.10 —
  *less directional than noise* — then `noise` < 0.20, `directional` < 0.35, `trend` above.
- **Realised-volatility percentile**: the trailing 7-day realised volatility ranked within the
  preceding 365 days of it, from daily closes strictly before the decision bar. Quartiles:
  `quiet`, `subdued`, `active`, `violent`.

1000 charts are then selected by **equal allocation across the resulting 4 × 4 grid**, ordered
within each cell by a hash of window identity, with shortfall in sparse cells redistributed over
the rest in the published cell order.

This is the point of the exercise and it has a cost worth stating. Most windows are chop, because
most of the time markets chop. A uniform random 1000 would therefore be a corpus *about* chop, and
every statistic computed on it would describe chop while claiming to describe trading. Equal
allocation fixes that, and in exchange the corpus is deliberately **not** representative of how
often each regime occurs — which is exactly why §12.4 insists engine performance is reported per
regime rather than in aggregate.

## 8. Causality

§6 Layer 0: *"Each annotation record carries the index at which the feature exists and the index
at which it could first have been known. Rendering and scoring both gate on the second."*

A swing high *exists* at the bar that made it and is not *known* until later bars confirm it.
Drawing it at the bar it exists on puts an annotation on the chart at a moment nobody could have
drawn it — in a product whose premise is "no hindsight", not a subtle bug. §15 records that both
major open-source implementations of these primitives ship look-ahead, "one via a whole-dataset
range and one via pre-confirmation stamping".

Neither is visible in the output, so the suite tests a property instead: **change the future, and
anything that was knowable before the change must not move.** It carries canaries — deliberately
broken features reproducing both bugs — asserted to be caught, because a test suite that cannot
fail is decoration.

Phase 0.5 uses none of this itself. It exists so Layer 2 cannot be written without it.

## 9. Permutation

A bar-permutation generator, per §6 Layer 0. Each bar is decomposed in log space into a **gap**
from the previous close and an **intrabar triple** relative to its own open; gaps and triples are
shuffled under separate seeded permutations and reassembled multiplicatively.

Because every triple came from a real bar, candle realism survives by construction, and because
the sums are only reordered the series ends exactly where the original did. What is destroyed is
serial structure — which is the point: §6 Layer 2 wants a null where *"a geometry layer that finds
structure in shuffled data at the same rate as in real data is telling you nothing."*

Volume travels with its bar's geometry rather than being shuffled separately. §6 does not say
which; separating them would put wide candles on no volume at a rate the real series never shows,
visible to anyone reading the volume pane.

The generator exists; permuted charts are **not** in the corpus. Synthetic controls are §7.2 and
Phase 4.

## 10. Scoring against what was achievable

A bare R-multiple is mostly luck, and §4 opens by saying that any system rewarding realised
profit teaches the player that reckless trades work whenever they happen to print. So the score
is not "did you make money". It is **of everything this exact path allowed, how much did you
take**.

### 10.1 The achievable set

Because every player gets the identical future path, the set of outcomes is finite and is
enumerated rather than sampled (§4.2): **2 directions × 7 stop distances × 7 targets = 98
brackets**, each resolved against the same one-minute path the player's own trade is resolved
against. Stops run 0.5 to 4.0 ATR; targets run 0.5R to 8R. Every level snaps to the published
tick, so no cell is a trade that could not have been placed.

Exact, not estimated — there is no sampling error to explain when a percentile moves — and
reproducible, so the same chart yields the same distribution forever. That second property is why
it is computed once, offline, and stored.

Your **percentile** is where your result sits among those 98, mid-rank for ties. It is meaningful
with nobody else playing, because the comparison is against the chart, not against a population.

### 10.2 The oracle, and efficiency

The **oracle** is the best R any stop and target pair could have produced on that path. It has a
closed form: to survive to a given bar, a long's stop must sit below every low so far, so the
tightest surviving stop is one tick under the running minimum, and the best R at that bar is the
bar's high over that risk. Sweep the bars, take the maximum, mirror it for shorts.

It is a real bracket, not a theoretical ceiling — the test suite reconstructs it and resolves it.
Because its stop is one tick wide, the number is large: **the median chart's oracle is 19R**.
**Efficiency** is your R as a share of it, and §4.5 calls it the closest thing to trade quality.

### 10.3 Restraint

Passing is scored as **0R against that same distribution** (§4.4). Nothing special-cases it, and
the consequence falls out of the arithmetic: on a chart where most brackets lost, passing beats
most of them.

That is not a rare case. Because the grid is direction-symmetric, roughly half of it is always on
the wrong side and stops out at exactly −1R, which puts 0R above the median on **95% of charts**.
Measured across the corpus, always passing scores a **mean 61st percentile** — and it never
exceeds the 80th.

**So the honest position is this**: passing is a strong baseline that a reader has to beat, not a
free win. §15 asks for a check that "degenerate wide-stop tight-target brackets do not top the
leaderboard", and they do not — the best single bracket played blindly on every chart is a short
with a 4 ATR stop and a 0.5R target, at a mean 57.7th percentile, which is *worse* than passing.
No fixed strategy beats restraint, and restraint does not beat reading. §4.4's only brake on
passing everything in the daily is social: the card prints how many of the five you traded.

### 10.4 What the debrief shows

§4.5's decomposition, read off the grid's marginals — five of its six axes:

| Axis | What it says |
| --- | --- |
| Direction | What share of the winning brackets were on your side |
| Stop placement | What share of brackets at your stop distance were swept, and whether your stop sat inside the drawdown the winners survived |
| Target placement | Whether it printed, and what share of the available move you captured |
| Restraint | What passing would have scored here |
| Efficiency | Your R as a share of the oracle |

**Entry timing is deliberately absent.** §4.5 defines it as the cost of entering early or late
"relative to the structural trigger", and §4.2 fixes entry at the decision bar — so there is
nothing to be early or late against until Layer 2 defines a trigger. Approximating it against an
arbitrary offset would measure something else and have to be replaced.

### 10.5 The daily and the card

Five charts, identical for every player, one attempt, rolling at midnight UTC with a 48-hour
completion window (§10.1). The five are derived from the day number rather than assigned, so
everyone provably gets the same set.

§10.1 says one chart; §4.4 and §10.4's example card both say five. Five wins: a pass count cannot
be printed on a card for a single chart, and §14 puts "scored pass with quota" in this phase.

The share card is **spoiler-free** by construction — a percentile, a bar and a traded count.
Never the R-multiple, the direction, the ticker or the date, so posting it cannot spoil the setup
for someone who has not played.

## 11. What is not built yet

Recorded so nothing here is mistaken for the finished product: no achievable set, no oracle
bound, no percentile, no scored pass, no engines, no accounts, no rating, no chart rating, no
tiers or mods beyond mirroring, no clock, no daily, no share card, no cost model, no synthetic
controls in the corpus, no news, and no Layer 2 geometry.

Phase 0 answered one question, and §14 says it is the most important one in the document: **is the
loop fun with no analysis layer at all?** Phase 0.5 answers a different one, and §14 allows it to
precede the fun only because retrofitting it is close to impossible: **can anything in this corpus
see its own future?**
