# Hindsight rules

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

## 11. The ladder

§3's claim is that the tiers are **strictly nested** — "each is a subset of the affordances of the
one above, nothing is added back" — so that "harder" is a fact rather than an opinion. That is a
property, and `tests/tiers.test.ts` tests it: if a rung ever grants something the rung above does
not, the suite fails.

| | Sandbox | No Tools | **Naked** ★ | Blackout |
| --- | --- | --- | --- | --- |
| Code | — | NT | **NTZ** | NTVZ |
| Candles | 300 | 300 | 80 | 60 |
| Timeframes | all six | 1h · 4h · 1d | 1h | 1h |
| Volume | yes | yes | yes | **no** |
| Clock | none | none | **90 s** | **20 s** |
| Rated | **no** | yes | yes | yes |

**Full Desk and News Blind are not built.** FD is defined by exactly one affordance the others lack
— pre-trade news headlines — and NN is "Full Desk except the headlines". Until the news panel
exists they are one ruleset wearing two names, and a ladder with two rungs that are one rung is the
arbitrary ladder §3 opens by warning against.

### 11.1 What is never taken away

§3.1 draws the line: restrict identity, hindsight and crutches; never restrict risk arithmetic.
"A player who does not know the instrument's typical range cannot place a stop that is neither
noise-adjacent nor absurd. Hiding it does not test skill; it randomises the result and compresses
the gap between expert and novice, which is the textbook definition of artificial difficulty."

So **the price axis, the ATR badge and the tick size are present at every rung**, including
Blackout. The only thing that removes the price axis is the opt-in Blind Scale mod, and it keeps the
ATR badge — risk arithmetic survives, the reading aid does not.

### 11.2 ATR is measured over a fixed window, at every tier

**ATR(14) is computed over the final 80 lead-in candles regardless of how many the tier shows.**

Not an implementation detail. If ATR followed what the player can see, the same chart would carry a
different ATR at No Tools and at Naked; the 98 stop distances are multiples of it, so the two tiers'
achievable grids would be scaled differently and their percentiles would not be comparable. That
breaks §3.5's "run both tiers on the same charts" and §8.1's chart-and-tier rating in a single move.
The badge means the same thing everywhere or the ladder is not a ladder.

A visible consequence: at No Tools the first candle on screen is **not** indexed to 100. The anchor
stays at the 80-candle mark so prices are identical across tiers. §12.2's purpose is destroying the
absolute price level, and that survives — the anchor's position is not what does that work.

### 11.3 What the tier actually withholds

A restriction the client applies is not a restriction. §12.1 requires the projection server-side, so
the payload does not contain what the tier does not grant: candles beyond the count, and the
one-minute detail path. That second one is the **only** enforceable timeframe restriction — a client
holding the detail can draw one-minute candles whatever the picker offers — and it is why Sandbox is
the only tier that receives it.

The clock is sent as a remaining duration, never a deadline. A wall-clock timestamp would let a
client with a skewed clock decide whether its own commit was late. A commit after the deadline is a
**forfeit**, not a rejection, so running out of time cannot be undone by reloading.

### 11.4 Full Desk, and the toolbox

**Full Desk is the top rung and it grants the tools.** 300 candles, three timeframes, volume,
unlimited time, indicators, drawings and overlays.

It nearly did not ship. §3.2 defined it as the tools rung *plus* pre-trade news headlines, and
News Blind as "Full Desk except the headlines" — so until a news layer existed the two were one
ruleset wearing two names, and Phase 1.5 deferred both. **News has since been dropped from the
plan**, which resolves it rather than postponing it again: with no headlines to withhold, Full Desk
*is* News Blind. One rung, and it ships. News Blind is deleted, not pending.

What Full Desk does **not** get, despite §3.2 listing it: **post-entry trade management**. That is
not a tool. §4.2 enumerates the achievable set over a *static* bracket, so a trade that can be
adjusted mid-flight is no longer described by the distribution it is scored against — a Layer 1
change wearing a chart affordance's clothes. §10.1's Manage mode is where it belongs.

#### The measure tool is universal

**Present at every rung, including Blackout.** §3.1 restricts identity, hindsight and crutches and
never restricts risk arithmetic, and a ruler that reads out in ATR and R is risk arithmetic: on a
chart with no ticker and no absolute price those are the only units that survive normalisation.
Withholding it would not make Blackout a harder reading test; it would make the arithmetic
guesswork. It sits beside the price axis and the ATR badge, and there is no field that could remove
it.

#### The stop-placement algorithms are Sandbox only

Chandelier Exit, Supertrend and Parabolic SAR are causal, cheap to build, and **literally
stop-placement algorithms**. In a game whose entire skill is placing a stop, showing one is showing
the answer key. Sandbox is unrated and §3.2 calls it "the learning surface, not a tier", so seeing
what a Chandelier would have suggested is a legitimate thing to learn from when nothing is at
stake. They appear on **no rated rung**, and a test asserts it.

#### The formulas, because there is no canonical one

TA-Lib and TradingView disagree on weekly BTCUSDT ATR(7) by **12%** — 998.11 against 891.05 — for a
formula published in a book in 1978. A player who reads an RSI of 71 and places a stop on it is
entitled to know which RSI. Every choice below is written out in `src/core/indicators.ts` and each
one is a place two respectable implementations differ.

| Indicator | The choice, where there is one |
| --- | --- |
| **EMA** | Seeded on the **SMA of the first *n* values**, nothing emitted before. Seeding on the first value converges to the same curve but is visibly wrong early — a 200-EMA seeded that way is essentially the first close for a hundred bars. |
| **Wilder's smoothing** | `α = 1/n`, **not** an EMA's `2/(n+1)`. Conflating the two is the single most common source of two implementations disagreeing, and it is most of that ATR gap. |
| **Bollinger** | **Population** standard deviation, divisor *n* — Bollinger's own definition and TradingView's. The sample divisor *n−1* makes the bands about 12% wider at the default settings. |
| **Keltner** | Raschke's modern form: EMA of close, banded by **Wilder-smoothed ATR** — the same ATR the badge and every stop distance already use. Not Keltner's original SMA of typical price. |
| **Donchian** | The current bar **counts**, so "price is at the top of its range" is true when price is at the top of its range. |
| **RSI** | Wilder's smoothing, not an EMA of the same period. Average loss of zero gives **100** by definition; a flat series with neither gains nor losses returns **nothing** rather than an invented 50. |
| **MACD** | The signal EMA is seeded on the first nine *defined* MACD values. Treating the warm-up as zeros drags the early signal toward zero and manufactures histogram crossings that are artefacts of the warm-up. |

Every indicator returns **one value per bar with nulls through the warm-up**, so an index into the
output is always an index into the input. The off-by-one that shifts an indicator a bar into the
future is the one this shape exists to prevent, and every one of them is held to
`tests/lookahead.test.ts` — the same harness the Layer 2 detectors pass.

#### What is excluded from the codebase, not merely from the toolbar

Recorded as data in `src/core/tiers.ts`, so adding one means deleting the line that argues against
it.

- **ZigZag, Auto Fib, Auto Trendlines, Auto Pitchfork, auto key levels** — they repaint. A pivot is
  not knowable until price has moved away from it, so the chart shows turning points nobody could
  have drawn. Two phases of causality work would be undone quietly by one of these.
- **Renko, Kagi, Point & Figure, Line Break, Heikin Ashi** — they destroy time and invent prices.
  The player would place levels in one coordinate system and be scored against real OHLC in another.
- **Gann, Elliott, Fibonacci circles, spirals, arcs and fans** — scale- and aspect-ratio-dependent.
  The signal changes when the window is resized.
- **Pivot Points, session VWAP, seasonality** — they need a session boundary, and §12.2 removes the
  calendar by design. Anchored VWAP from a swing works and is the more useful variant.
- **Andrews' Pitchfork** — StockCharts' own definition says "there are no hard rules for point
  placement… chartists must use judgment". It is not a function of the data.

### 11.5 Mods

Blind Scale, Silent, Iron, Wide and Assist. **Mirror is not among them.** §3.3's table prices it at
1.05×, but the pull-quote directly beneath calls it "permanent in ranked, not optional… randomise it
per chart", §12.2 lists vertical mirroring among the baseline identity defences, and the corpus has
baked it into stored prices since Phase 0. Three statements to one, and the three agree with the
code. A permanently-on randomised condition nobody chooses cannot carry a multiplier or a badge.

Fog is deferred: playing the lead-in forward once needs a replay surface for the *past*, and the
reveal loop only plays the future.

## 12. Rating

### 12.1 The score map

A result is measured from **doing nothing**, not from zero. Passing scores a mean 61st percentile
across the corpus (§10.3), so the curve is anchored there: `C(0.61) = 0`, which makes a pass a draw
against the chart. Below the 90th percentile the curve is a straight line; above it the slope is
damped by a third.

That shape is load-bearing rather than tasteful. §15's guarantee that "degenerate wide-stop
tight-target brackets do not top the leaderboard" was verified on **mean raw percentiles**, so any
kink inside the range outcomes actually occupy voids it silently. The obvious alternative — rescale
each side of the anchor to fill [0,1] — makes the degenerate 4-ATR/0.5R bracket **beat passing**,
0.5033 to 0.500. That map is kept in the test suite as a live counterexample.

The damped top decile is the only nonlinearity, and it is a penalty: it can sink a variance-seeking
strategy and can never rescue one. Separating the best bracket from the fifth-best of 98 is intrabar
resolution luck (§12.3 of the scope), not reading.

What is compressed is the **percentile** — and the honest framing is that the percentile already
*is* the compression table §4.3 asks for. An outcome 40R above par and one 4R above par can both be
the 99th of 98 brackets.

### 12.2 Glicko-2, and why the constants are not the chess ones

Standard Glicko-2 (Glickman 2013), with two extensions, both of which reduce to the published
algorithm when switched off. The suite reproduces Glickman's own worked example.

**One attempt counts as two rated games.** §8.1 says a percentile "carries more information than a
chess puzzle attempt does", and it does: the modelled outcome variance is about 0.043 against a
coin-flip reference near 0.244. That is worth roughly 5.8 games; **2.0 is shipped**, because the
estimate models a population that has not played yet, and under-shooting leaves rating deviation
conservatively high while over-shooting manufactures confidence that would corrupt the pending gate,
the retirement test and the fairness test at once.

**Deviation grows with elapsed time, not with periods counted.** The textbook form fires once per
rating period, which would inflate the deviation of a player who just played eight sessions in one
evening — someone who has been measured eight times as precisely.

**The deviation floor is 25, not the 45–60 chess deployments use.** The estimated population spread
here is about 42 rating points, because the environment is noisy and the achievable band is narrow.
A floor of 50 would give reliability 0.41 — less signal than noise.

A ranked session is one rating period: five charts at weight two is ten effective games, inside
Glickman's recommended 10–15 without tuning anything.

### 12.3 Ratings do not drift

§8.5 asks for "larger gains and smaller losses at the harder settings". §4.8 says "never award a
minimum gain per round" and cites a chess platform's post-mortem on rating inflation — and
asymmetric gain and loss *is* that mechanism.

**The Glicko update is symmetric.** §8.5's asymmetry lives in XP and in which charts get served, and
nowhere else. This matters beyond tidiness: §8.3's retirement test and §3.5's fairness test both
regress on player rating, so a rating that drifts stops being a measuring instrument and quietly
corrupts both. §8.5's "smaller losses" has no referent once XP is the only asymmetric quantity and
XP is non-negative; it is not implemented, and saying so is better than inventing a penalty for the
sentence to point at.

### 12.4 Pending charts

§8.2 asks that a new chart "can only gain a player rating, never cost it". Implemented literally
that is a one-sided random walk worth about **+2.3 rating points per pending chart, and it never
converges** — a hundred of them in a season is 234 points of pure inflation.

So a pending chart is **unrated for the player in either direction**. The chart still rates against
the player, which is exactly how a new opponent is calibrated against known-strength references, and
the promise §8.2 makes is kept by saying so in the interface and paying XP in full. A chart leaves
pending at 50 plays with deviation under 75, against opponents whose mean deviation is under 100 —
the play count binds, because §8.1 says in terms that "a chart with high deviation and twelve plays
is not trustworthy".

### 12.5 Retirement is an equivalence test

§8.3 retires charts on which "strong and weak players score identically". But "this chart is a coin
flip" is the **null**, and a null cannot be accepted. A naive `|rho| < threshold` inverts the burden
of proof and retires charts for having a small sample: at 60 attempts, a genuinely discriminating
chart falls inside a ±0.10 band often enough to destroy roughly 17 good charts per thousand.

So a chart is retired only when the 90% interval for Spearman's rho lies **entirely inside** ±0.20,
with at least 400 attempts. The failure mode is then the right one — too little data means keep the
chart — and the asymmetry demands it: retiring a good chart destroys content permanently, while
keeping a coin flip adds noise the rating already absorbs.

Spearman rather than Pearson, for three reasons in order of force: it is invariant to the score map,
so changing the map does not force every verdict to be re-adjudicated; the percentile is clumped,
because half the grid stops out at exactly −1R; and the relationship is monotone but not linear. The
correlation is against the rating the player held **at the attempt**, never today's — the latter
would be a look-ahead of exactly the kind this corpus's tests police.

A chart where weak players reliably outscore strong ones is **flagged for review, not retired**. An
inverted chart is far more likely a mis-signed mirror or a mislabelled regime than a real
phenomenon, and auto-retiring it would hide the bug.

### 12.6 What is never rated

An ambiguous fill — that is unfairness, not inaccuracy. A retired chart. The Sandbox. A round whose
clock expired. And a repeat attempt at a chart already played at that tier, because it has seen the
reveal.

### 12.7 Coming back to this when there is data

The rating system spends its first long stretch doing almost nothing visible, entirely correctly.
Charts sit pending because §8.2 will not graduate one before fifty plays. Nothing retires because
§8.3's equivalence test needs four hundred attempts on a single chart. No tier is validated because
§3.5 needs the same players on the same charts at two tiers.

All three are indistinguishable from "the code is broken" if the only thing visible is that no
numbers move — which is exactly how an un-called `exitsPending` hid for a whole phase, leaving every
chart pending and therefore every attempt unrated while each individual test passed.

So there is one command that prints the **distance to each gate** rather than the state at it:

```
npm run ladder
```

It reports the corpus, per-tier play counts, how close the most-played chart is to graduating, the
deepest chart-and-tier pair against the retirement threshold, how many player-and-chart pairs exist
at two tiers, and how many ranks are displayable. Read-only and safe against production. It also
says when a gate has opened and what to run next.

The two jobs behind it:

| Command | What it does | Today |
| --- | --- | --- |
| `npm run retire` | §8.3's equivalence test over every chart-and-tier pair. **Dry by default** — `-- --apply` writes the flags | Reports nothing to assess |
| `npm run fairness` | §3.5's test against simulated players of known skill | Recovers 3/3 known answers |
| `npm run fairness -- --live NT NTZ` | The same test against real attempts, with the attenuation correction | Reports how far short the data is |

`retire` is dry by default because retiring a chart destroys content permanently, and it is a job
that will eventually run unattended against a corpus nobody is watching. Removing a thousand charts
should not be one mistyped command away. Every verdict it writes is stored with the score-map and
achievable versions that produced it, because §12.4 makes population statistics incomparable across
a change of rule — a retirement decided under one score map has to be re-derivable, and thrown away
rather than inherited if the map moves.

## 13. Layer 2 geometry

The primitives exist and **nothing here reaches a player yet**. Phase 2a built the computation;
2b publishes the thresholds and wires it up; 2c publishes the permutation null beside it. Every
number below is a default that 2b may move, and the point of writing them down now is that a moved
default should have to argue with a recorded one.

### 13.1 Swing points are graded, and nothing unsettled is drawn

A swing high has persistence *p* iff price must retrace *p* before exceeding it. That is what a
trader means by a significant high, and it carries a theorem: **a peak of persistence p is destroyed
only by a perturbation of sup-norm ≥ p/2**, which turns the quarter-tick stability requirement from
a hope into a proof.

Persistence is `min(leftDrop, rightDrop)`, and `rightDrop` only grows, so the value is final the
moment either the right side has retraced as far as the left had or price exceeds the peak. **Until
one of those happens the swing is not emitted.** That is the whole of the anti-repainting rule: an
open peak is ZigZag's revisable last leg, and drawing it is the failure that disqualifies ZigZag.

`knownAt` is the settling bar, never the extremum's own bar. The lag is real — commonly five to
twenty bars on an hourly chart — and pre-confirmation stamping is one of the two look-ahead bugs
shipped in public packages.

The three nested grades are cuts on the one computation, at **0.5, 1.0 and 2.0 ATR** of persistence.
Sized from the one genuinely empirical result in the directional-change literature: average
overshoot exponent 1.04, so the expected leg is about twice the threshold, making these legs of
roughly one, two and four ATR. The event-count power law from the same paper justifies nothing here
— its exponent is 2.02 ± 0.098 against a Brownian first-passage prediction of exactly 2, so it is a
diffusion identity, not a market regularity.

On a representative 80-bar chart the three grades emit **108, 48 and 12** swings. Forty-eight marks
on eighty candles is a fog, not an annotation; 2b should default to the top of the ladder.

### 13.2 Geometry is computed in linear tick space, not log space

**Correction to the scope document as first drafted.** §6 specified "constrained slope optimisation
in log space" for trendlines. That is wrong here for two independent reasons.

The rendered price axis is linear — the log toggle is an unbuilt Standard-tier tool — so a line
straight in log space is a *curve* on the chart the player is looking at. Over a lead-in running 100
to 115 the log-space line sits about **26 ticks** below the linear one at the midpoint. A trader
draws on what they see.

And bar indices are integers while prices are tick-quantised, so in tick space the hull's
orientation predicate is exact in float64 with eight orders of magnitude of headroom. No epsilon
appears in the turn test, which matters because a tolerance there would smuggle back the free
parameter the hull existed to remove.

Log space survives where it belongs: kernel bandwidths, which are widths rather than straight lines
and must mean the same thing on a $60,000 instrument and a $1.08 one.

### 13.3 Geometry that becomes a stored chart property is pinned to the base window

The same argument that pinned ATR (§11.2), with a different conclusion about scope.

Persistence is not invariant under extending history leftwards: older bars can change a peak's left
drop, so No Tools and Naked genuinely disagree about the same swing. For ATR that was fatal, because
the 98-cell grid is denominated in it. For geometry it is not — geometry feeds display and the
engine council, never the achievable set, so percentiles stay comparable across tiers.

But the moment a geometry-derived value becomes a *stored chart property* — a theme tag — it has to
be one number per chart, not one per tier. So:

> **Geometry rendered for a player is computed over the bars that tier grants. Any geometry that
> becomes a stored chart property is computed over the pinned base 80-candle lead-in.**

Related: the volume profile is a statement about the base window, because that is where the
one-minute detail is stored. The extended lead-in No Tools grants has no minute detail, and
backfilling it would cost roughly 264 MB across the corpus.

### 13.4 The volume profile is built, not synthesised

Spreading a bar's volume across its range is a fabrication that looks plausible and encodes nothing.
But TradingView does not do that either — it "loads all 1-minute bars that were traded in that daily
session", which is exactly what the corpus stores: 4,800 lead-in minute bars with volume. So the
point of control and the 70% value area are built at **the same construction, not an approximation
of it**, and can be claimed at parity honestly.

No delta and no up/down split. TradingView's own is inferred from lower-timeframe bar direction, so
anything branded order flow there is already a proxy. Building the identical proxy would be fine;
calling it order flow would not.

### 13.5 Round-number levels are analysis-only, and the measurement says why

`src/core/geometry/roundNumbers.ts` computes levels on the **real** price lattice, because that is
where Osler's order-book clustering lives — 14.3% of executed stop-loss buys at rates ending [01,10]
against 6.9% at [91,00] — and a level computed on the indexed price would be a property of our own
normalisation rather than of the market.

`npm run leak` measured what drawing them costs under §12.2, and the answer settled it:

| what is drawn | signatures naming exactly one chart | median charts left | median instruments left |
| --- | --- | --- | --- |
| the whole round grid | **890 / 944 (94%)** | 1 | **1** of 314 |
| a single level | 0 / 33 | 23 | 21 of 314 |

The leak is in the **spacing**, not in any level's position. Consecutive round levels are
`0.25 · 10^m` apart in real price, so displayed they are `S = 0.25 · 10^m · factor` apart; §12.2
fixes `factor = 100 / firstOpen` by indexing every first candle to 100, and rearranging gives
`firstOpen = 25 · 10^m / S` — the instrument's real opening price, exactly, up to an unknown power
of ten, read off the chart with a ruler.

That is measured inside a corpus of a thousand windows. The real attacker searches every
symbol-month of public OHLCV, where the same mantissa is more identifying rather than less.

**So the module does not reach a player.** It keeps its evidence-faithful construction for theme
tagging, engine logic and the 2c null, all of which use the levels without exposing a position.
`tests/geometry/roundNumbers.boundary.test.ts` fails if anything under `src/app` imports it.

### 13.6 Deferred, with the reason

**The L∞ "tightest containing channel".** Theil–Sen ships instead: 29.3% breakdown point, pure order
statistics so it is bit-reproducible with no solver, one interpretable parameter. The Chebyshev LP
is provably tightest and parameter-free, and both of those hide a trap — an LP optimum sits at a
vertex, so the channel is set by **exactly three bars** and its breakdown point is **zero**, and with
four or more residuals tied at ±t (routine on tick-quantised data) the optimum is not unique and the
answer depends on the solver's pivoting rule. Two clients would return different channels for
identical input. It is a genuinely different object and may return when something needs it, with
canonical tie-breaking written down first.

**Trendline selection has no literature.** The candidate set is exact — any non-crossing line
touching two or more points is a hull edge, so there are exactly *h−1* of them — but which one is
"the trendline" is folklore. The rule is the most recent edge, ties broken by span, and it is
defended on determinism rather than on evidence. Its known cost, visible the first time you look at
a chart: the final bar is always a hull vertex, so the selected line is often short. A minimum-span
filter would fix it and would be a parameter.

R² is rejected outright. A supporting line has all its residuals on one side, so R² of a one-sided
envelope is not a goodness-of-fit measure and can go negative.

**Extended-history geometry.** No Tools shows 300 candles; the minute path covers 80. Out of scope
until the storage question is answered.

### 13.7 Themes — the published spec

There is no canonical definition of any of these formations. The two most-used open
implementations disagree by up to **13.6×** on the same words, swing counts differ 44 / 58 / 530 /
761 across defensible readings, and the most-cited supporting paper was withdrawn by its own author.
Even RSI has no canonical implementation — TA-Lib and TradingView disagree on weekly ATR(7) by 12%.

**So the choice is not between the right definition and ours. It is between an undisclosed
definition and a published one.** Here is ours. Every number is a named constant in
`src/core/geometry/themes.ts` and moving any of them is a `GEOMETRY_VERSION` bump, because a tag
stored under one set of numbers is not comparable to a tag stored under another.

| Theme | The rule | Share of corpus |
| --- | --- | --- |
| **liquidity-sweep** | A swing of ≥1.0 ATR persistence, touched ≥2 times within 0.3 ATR, exceeded by **0.05–0.75 ATR** and closed back inside within **3 bars**. | 64% |
| **failed-breakout** | A **close** beyond the 20-bar extreme by ≥0.1 ATR, then a close back inside within **5 bars**. | 52% |
| **v-reversal** | A leg of ≥**2.0 ATR**, retraced by ≥**38.2%** within **20 bars**. | 46% |
| **compression-expansion** | 10 bars whose range is under **0.6×** what diffusion predicts (`ATR·√n`), ended by a bar of ≥**1.5 ATR**. | 7% |
| **range-reversion** | Window range under **0.95×** `ATR·√n`, with ≥**2** swings in each outer **25%** of it, *alternating* between the edges. | 7% |
| **trend-continuation** | Theil–Sen slope ≥**0.06 ATR/bar**, efficiency ratio ≥**0.20**, and no single bar carrying more than **half** the net move. | 4% |

Two gates apply to every tag before it is stored, and both are load-bearing.

**Knowable by the decision bar.** A theme confirmed at bar 84 of an 80-candle lead-in is a fact
about the *reveal*. A tape filtered on it would announce the answer before the trade, which is the
same defect that keeps The Null Set locked.

**Within the last 20 bars.** A theme names the setup facing the player *now*, not an inventory of
everything that ever happened in the window.

#### The detection lag is stated, not hidden

Lo, Mamaysky & Wang (2000) is the template, and the part worth copying is their lag: "the lag *d*
ensures that we are computing our conditional returns completely out-of-sample and without any
look-ahead bias." Here that lag is the `knownAt` on every tag, inherited from the swings the theme
is built out of — the thing both public implementations of this vocabulary lack.

It is **conservative by construction**, and one consequence is worth stating because it will
otherwise be rediscovered as a bug. A V-reversal is arithmetically knowable the moment price has
retraced 38.2% of the leg. This detector waits for the pivot swing to *settle*, which needs a full
retrace or a break of the pivot. So a shallow V inside a window that never revisits the level is
never tagged. That is the price of never drawing a pivot that later bars could still deepen — the
repainting last leg that disqualifies ZigZag.

#### Four thresholds that were wrong, and how we know

The hit rates above are published for a reason: a rule whose hit rate nobody has looked at is not a
rule, it is a hope. A theme tagging 99% of the corpus is not a filter, and one tagging 0.2% cannot
fill a tape. `npm run themes` prints the distribution and refuses to stay quiet about either
failure. On the first pass it caught four:

- **compression** normalised a 10-bar range against `ATR × 10`. A random walk covers `ATR × √10`, so
  the denominator was three times too large and **99%** of charts looked compressed.
- **failed-breakout** triggered on a *wick* beyond the level. On any noisy series a high pokes past
  a 20-bar extreme constantly: **100%**. A close beyond is a commitment; a wick is an excursion, and
  excursions are what liquidity-sweep is for.
- **liquidity-sweep** scanned all ~108 settled swings rather than the handful a reader would be
  watching, so something was always being taken out and given back: **100%**.
- **range-reversion** asked for closes clustering in the middle *and* a narrow window — conditions
  that fight each other, since a narrow window is one price traverses repeatedly. **0.7%**.

And two more that only testing found: a **step** passes both of a trend's obvious conditions, since
it is perfectly efficient and Theil–Sen treats it as a level change rather than an outlier; and
counting edge visits does not separate a range from a **drift**, which touches both edges once each
on its way past.

Two further observations the measurement produced, which are facts about the corpus rather than
about the detectors. The efficiency ratio's 90th percentile here is **0.302**, so §6's `trend`
bucket at 0.35 is nearly empty — this is a crypto-spot library and it is mostly chop. And sweeps and
failed breaks are genuinely common in it; whether they are *more* common than chance is not a
question thresholds can answer, and **2c answers it** by running the same detectors on permuted
bars and publishing both counts.

### 13.8 The null — what Layer 2 finds in shuffled bars

§14 makes this Phase 2's exit condition, and is specific about the form: the comparison is
**published rather than merely passed**. So here it is, and it is not flattering.

Every detector was run over all 1,000 charts and over 20 shuffles of each of those same charts. The
shuffle keeps each chart's exact distribution of gaps and candle shapes and destroys only the
**order** — so a detector that beats it is responding to sequence, which is the only thing a chart
reader can be reading. `npm run null` reproduces the table.

| detector | real | shuffled | ratio | 95% CI | |
| --- | --- | --- | --- | --- | --- |
| **compression-expansion** | 7.1% | 3.0% | **2.39×** | [1.84, 2.94] | beats the null |
| liquidity-sweep | 64.0% | 62.5% | 1.02× | [0.98, 1.07] | no better than chance |
| v-reversal | 45.8% | 43.8% | 1.05× | [0.98, 1.11] | no better than chance |
| failed-breakout | 51.7% | 54.7% | 0.95× | [0.89, 1.00] | **noise produces more** |
| range-reversion | 6.7% | 11.8% | 0.57× | [0.45, 0.69] | **noise produces more** |
| trend-continuation | 3.8% | 5.5% | 0.69× | [0.51, 0.86] | **noise produces more** |
| swings per chart (minor) | 63.0 | 65.0 | 0.97× | [0.96, 0.98] | **noise produces more** |
| swings per chart (major) | 6.8 | 7.2 | 0.95× | [0.91, 0.99] | **noise produces more** |
| hull edges per chart | 9.2 | 9.6 | 0.96× | [0.95, 0.97] | **noise produces more** |
| levels per chart | 2.0 | 2.3 | 0.88× | [0.85, 0.90] | **noise produces more** |

**One of ten beats the shuffle.** Seven of ten fire *less* often on real charts than on shuffled
versions of those same charts.

This is Lo, Mamaysky & Wang's broadening-tops result, at scale. They found head-and-shoulders 1,611
real against 577 random — a real effect — and broadening tops **725 real against 1,227 random**,
where noise produced nearly twice as many. Nobody in this space has published that comparison since
2000. This is ours.

#### What it means, and what it does not

**It is not a bug, and the obvious confound was checked.** Every threshold in Layer 2 is denominated
in ATR, so each shuffled series is measured against *its own* ATR rather than inheriting the real
chart's. The median ATR ratio between a shuffle and its source is **0.991**, and repeating the whole
table with the ATR inherited instead moves every rate by a point or two and changes no verdict.

**§6 already says Layer 2 predicts nothing: "This layer predicts nothing. It draws."** The table is
that sentence with numbers attached. A swing high is a property of a *path*, and a shuffled path has
paths' properties. Expecting a geometric detector to find fewer swings in noise is expecting it to
stop being geometric.

**The one that discriminates is the one with a mechanism.** Compression-expansion beats the shuffle
2.4-fold because volatility clustering is the most robust stylised fact in empirical finance —
quiet begets quiet, violent begets violent — and shuffling is precisely the operation that destroys
it. That is a real, documented market property, and it is the only one of the six themes that
measures one.

**The limitation that matters most.** This test asks *"is this pattern more common in markets than
in noise?"* It does **not** ask *"does this pattern tell you what happens next?"* Those come apart:
a formation could occur at exactly the shuffle rate and still be informative about the future in
real data. Lo, Mamaysky & Wang measured conditional returns as well as counts; this measures counts
only. The conditional test is §6 Layer 5's job, and this table raises the prior against it rather
than settling it.

**What it does not undermine.** A theme tape is a filter, not a forecast. "The Coil" promises that
these charts share a stated property, and they verifiably do. Nothing on that page claims the
property is profitable, and after this table nothing should.

#### The efficiency ratio cannot see a shuffle at all

Found while checking whether the table was an artefact, and it is a fact about §6's own **trendiness
axis** rather than about the null.

    ER = |cₙ − c₀| / Σ|cᵢ − cᵢ₋₁|

The numerator is `|Σr|` and the denominator is `Σ|r|`. Both are sums over the same multiset whatever
order the returns arrive in, so the ratio is **exactly** order-independent — verified to the last
digit across five shuffles in `tests/geometry/nullTest.test.ts`. The efficiency ratio measures the
*composition* of a set of returns and never their *arrangement*.

Two consequences. Any theme gating on it — `trend-continuation` does — gets no discriminating power
from that gate. And the regime grid that the corpus is stratified over is stratified on a statistic
that carries no sequential information: it separates charts that *look* trendy from charts that do
not, which is a real and useful thing for serving variety, but it is not evidence that anything is
trending in a sense noise could fail to produce.

#### The weaker null, for comparison

Geometric Brownian motion calibrated per chart — the null Lo, Mamaysky & Wang used, reproduced so
the comparison is theirs as well as ours. It assumes normal log returns, which markets violate
badly, so beating it can mean nothing more than noticing a fat tail.

| detector | real | GBM | ratio |
| --- | --- | --- | --- |
| compression-expansion | 7.1% | 2.4% | 2.98× |
| failed-breakout | 51.7% | 34.7% | **1.49×** |
| liquidity-sweep | 64.0% | 86.0% | 0.74× |
| v-reversal | 45.8% | 57.7% | 0.79× |
| range-reversion | 6.7% | 23.4% | 0.29× |
| trend-continuation | 3.8% | 6.3% | 0.60× |

**Failed-breakout beats GBM at 1.49× and loses to the shuffle at 0.95×.** That single row is the
argument for running two nulls: against normal returns it looks like a discovery, and against the
real return distribution it disappears. What it was detecting was fat tails, which markets have and
Brownian motion does not. Anyone publishing only the GBM column would have reported an effect.

### 13.9 Do the themes predict anything?

§13.8 asked whether these patterns are *more common* in markets than in noise. This asks the
question that actually matters for the product: **conditional on a theme at the decision bar, does
what was achievable afterwards differ?**

The two come apart. A formation could occur at exactly the shuffle rate and still be informative.
Lo, Mamaysky & Wang measured both; §13.8 was the first, this is the second. `npm run conditional`
reproduces it over all 1,000 charts.

A theme is computed from the **lead-in alone**. The achievable set is computed from the **reveal**.
So nothing here can be circular.

#### Difficulty — is a tagged chart easier or harder?

| theme | n | par (tagged) | par (others) | Δ | 95% CI | |
| --- | --- | --- | --- | --- | --- | --- |
| liquidity-sweep | 640 | −0.741 | −0.773 | +0.032 | [−0.023, +0.086] | no difference |
| failed-breakout | 517 | −0.763 | −0.742 | −0.020 | [−0.072, +0.032] | no difference |
| v-reversal | 458 | −0.735 | −0.768 | +0.032 | [−0.019, +0.083] | no difference |
| compression-expansion | 71 | −0.809 | −0.749 | −0.061 | [−0.146, +0.029] | no difference |
| range-reversion | 67 | −0.775 | −0.751 | −0.024 | [−0.119, +0.076] | no difference |
| trend-continuation | 38 | −0.766 | −0.752 | −0.013 | [−0.150, +0.143] | no difference |

**Six of six: no difference.** That is a good result for the tapes — a theme tape is a fair slice of
the library rather than a stealth difficulty setting, so the ratings computed on it stay comparable.

#### Direction — did the side the theme named actually pay?

The sharp test. Five themes name a side; the grid is direction-major, so for each chart we can
compare what the named side achieved against the other side. A positive Δ means the named side beat
the other by more than it does on charts without the theme.

| theme | n | edge (tagged) | edge (others) | Δ | 95% CI | |
| --- | --- | --- | --- | --- | --- | --- |
| liquidity-sweep | 640 | +0.060 | +0.049 | +0.011 | [−0.195, +0.220] | no difference |
| failed-breakout | 517 | −0.071 | −0.120 | +0.048 | [−0.150, +0.256] | no difference |
| v-reversal | 458 | +0.100 | −0.096 | +0.196 | [−0.012, +0.402] | no difference |
| compression-expansion | 71 | −0.144 | −0.054 | −0.090 | [−0.452, +0.277] | no difference |
| range-reversion | 67 | −1.444 | −1.365 | −0.079 | [−0.306, +0.148] | no difference *(symmetry)* |
| **trend-continuation** | **38** | **+0.519** | **−0.076** | **+0.595** | **[+0.061, +1.123]** | **higher at 95% — gone once corrected** |

**Twelve comparisons. Zero survive.**

The one row that clears zero at 95% is the smallest group in the table, and it is one of twelve
tests: at that rate roughly 0.6 false positives are expected by chance. Correcting for the family
— Bonferroni at 1 − 0.05/12 — its interval covers zero comfortably. Park & Irwin (2007) reviewed 95
studies of technical analysis and named this exact failure, "data snooping, ex post selection of
trading rules", so the correction is applied and the uncorrected number is printed beside it rather
than in place of it.

The most *interesting* row is not that one. It is **v-reversal at +0.196 on n=458** — a near-miss on
the third-largest sample, which is a better candidate for a real effect than a marginal hit on 38
charts. It is still a near-miss, and it is recorded here so that if it is ever chased it is chased
knowingly rather than discovered afresh.

#### What this does and does not settle

**It does not make Layer 2 useless.** §6 already says the layer "predicts nothing. It draws." A
theme tape is a filter — "these charts share a stated property" — and they verifiably do. Nothing on
that page claims the property is profitable, and after this table nothing should.

**It does change what the engine council can claim.** §5's six engines read Layer 2 and nothing
else. Any engine asserting an edge from these themes would now be contradicted by our own published
table, on our own corpus. What survives is the thing §2 actually promises: *"markets are noisy,
edges are thin, and competent people disagree. Hindsight demonstrates that empirically instead of
asserting it."* This table is that demonstration, arriving a phase earlier than expected.

**It is an upper bound, not an edge.** No costs, no slippage, no sizing — and the achievable set is
the *best available* bracket rather than one anybody would have chosen in advance. Every number
above flatters the pattern, and they still come out at zero. Bajgrowicz & Scaillet (2012) found
transaction costs of 16–70bp erased every detected outperformance from 1897–1962 and found none at
all after 1962.

**One corpus, one asset class, one window.** Crypto spot, 80 candles. A different market or a
different horizon is a different question, and this says nothing about either.

### 13.10 How it is tested

Stability is measured in **price space** — Hausdorff distance on swing prices — never on index sets.
That is a correction to the scope document as first drafted: persistence theory gives stability of
critical *values* "in sharp contrast to the lack of stability of critical points", so an index-set
test would fail on correct code. In a flat region one tick of jitter moves the argmax arbitrarily far
along the time axis while the price does not move at all. Under a quarter-tick perturbation, 230 of
231 swings come through at exactly the same snapped price.

Six metamorphic relations, ordered by how much distinct code each exercises: invertive (reflection),
multiplicative, inclusive (no repainting), permutative (an **anti**-relation — the output must
change), volume-only, additive. The invertive one alone covers half the module surface, because it
is what catches a copy-paste asymmetry between the high-side and low-side paths — which is why the
detectors take a sign parameter instead of having two bodies.

Two canaries, both asserted to be *caught*, so the suite cannot quietly become decoration: a
quantised accumulator whose answer changes with its bin width, and a boolean threshold that flickers
where the graded one holds.

Every detector is plugged into `tests/lookahead.test.ts`. Swings and levels pass the strong form —
replace the future wholesale and nothing visible before the cut moves — which is the exact bug
shipped in `smartmoneyconcepts`, where appending bars takes the liquidity pools labelled inside a
*fixed* window from three to nine. Hull-derived lines pass the weaker prefix form and must therefore
be **computed on the prefix, never filtered from a whole-series result**; the two disagree, and the
test says so.

## 14. The engine council

Four engines read every chart under their own published rules and tell you what they would have
done. §5.5: *"The player-facing output is a spread of opinion, never a consensus verdict."* There is
no majority here and no aggregate — every engine gets a row, including every engine that passed.

### 14.1 The roster

| engine | school | fires on | stop | target |
| --- | --- | --- | --- | --- |
| **Channel** | Donchian / Turtle — Dennis & Eckhardt 1983, rules published by Faith | 19.8% | 2N, **theirs** | **ours** |
| **Reversion** | Connors & Alvarez, *Short Term Trading Strategies That Work* (2008) | **2.2%** | **ours** | **ours** |
| **Reversion (Hindsight)** | **Ours** — Connors without Rule 3, as a control on the regime filter | 8.8% | ours | ours |
| **Sweep** | **Ours** — in the ICT idiom; ICT publishes no spec, so nothing here is theirs | **40.0%** | ours | ours |
| **Pattern** | Bulkowski, *Encyclopedia of Chart Patterns*; measuring rule after Edwards & Magee | 3.2% | ours | **theirs** |
| **Geometry** | Carney, *Harmonic Trading*; tolerance and the Crab B-ratio are ours | **0.0%** | **theirs** | **theirs** |
| **Tape** | Volume Spread Analysis — Williams; every threshold is ours, because his are words | 6.1% | **theirs** | ours |
| **Engine Zero** | The null — a seeded coin flip, 2 ATR stop, 2R target | 100% | ours | ours |

Every threshold is a named constant in `src/core/engines/manifest.ts`, hashed as **`1fc650fc`**, and a
test fails if any of them moves. That is not tidiness: §14.7 asks whether any engine beats the null,
and that question has a family size. Pre-registering the numbers is what keeps it at eight rather
than *every threshold we tried*.

> **The guard was decoration for one release.** 3a shipped the hash as `digest(THRESHOLDS)` — computed
> at read time, so the test asserting the two agree compared a value to itself and could never fail.
> It is a hand-written literal now, and moving any threshold fails the build. `baseRates.ts` also
> records the hash it was measured under, so a track record cannot be inherited by a roster that
> never earned it.

**Four of the eight engines pass more than 90% of the time, and one passes always.** That is the
roster, not a defect in it — see §14.5 for what each one actually did.

### 14.1.1 Three engines could not ship as §5.2 described them

**Sweep was LIQUIDITY, and could not carry ICT's name.** The stop is nearly specifiable ("beyond the
sweep wick"). The target is fatal: defining "the next liquidity pool" deterministically needs a pivot
definition, an equal-level tolerance, a minimum touch count, a side convention, a tie-break among
qualifying pools, and a precedence rule between internal and external liquidity — **six rules, none
published anywhere authoritative**. The doctrine also makes the target explicitly *revisable*: pick
"the most obvious" pool and update as structure changes. A rule containing "most obvious" is a
discretionary loop, and the discretion is what the school considers the skill.

So the engine is ours, named ours, with our pseudocode in §14.8. **§5.2's "minimum 1:2" filter is
not in it** — that was never an ICT rule, it is our invention, and it silently overrides the pool
choice whenever the nearest pool sits closer than 2R, which would make the engine stop trading toward
the level it names on screen. The nearest opposing pool is the target at whatever R it implies, and
where there is no opposing pool the engine passes.

**Pattern is restricted to what 3.3 days of tape can hold.**

> **Correction to the research as first gathered.** The finding was reported as "80 hourly candles ≈
> 13 trading days", which assumes a 6.5-hour equity session. This corpus is **24/7 crypto**: 80
> candles is **3.3 calendar days** and 300 is **12.5**. The window problem is roughly four times
> worse than reported.

Bulkowski's research base is daily and weekly bars, his identification guidelines are prose with
escape hatches, and he warns that his own indicator on sub-weekly periods produces "a nasty
surprise". A double top needing peaks "usually several weeks apart" **cannot exist at either tier**,
so it is not implemented — an engine claiming to find one in 3.3 days would be finding something else
and calling it a double top. What ships is flags and pennants, which is also the weakest subset of
his catalogue. His percentages are **never used as conviction**: they are daily-bar priors applied
out of domain, and conviction comes from our own replay like every other engine's.

**Tape is directional, and its stop is its own.** §5.2 called VSA "a veto rather than a direction" —
that is our invention; Williams' signals are explicitly directional, and an upthrust is bearish
rather than a filter on someone else's trade. What is defensible in that description is the abstain
rate, so it ships as a directional engine that passes 94% of the time. §5.2 also said neither stop
nor target is native; **the stop is native** — beyond the signal bar's extreme, where the signal is
refuted. Only the target is ours.

Exactly one rule in VSA is numeric ("volume lower than each of the previous two bars"). "Narrow",
"wide" and "ultra-high" are words, and every number in circulation for them comes from vendors. **So
this engine's determinism is manufactured, not inherited** — it is exactly as reproducible as our
frozen percentiles and no better. Volume and spread are read as percentile ranks within the lead-in
rather than multiples of a median, because median-scaling equalises location but not dispersion and
would make coverage a property of the instrument.

### 14.2 Six of the eight schools have no price target

> **This section read "no school on this roster has a price target" at a roster of four, and that is
> now wrong.** Pattern and Geometry both publish one. The practice did not change — every target
> still says whose it is — but the claim did, and an overstatement in our favour is exactly the kind
> this document exists to catch.

Verified rather than assumed. The Turtles exit on a trailing breakout; Connors exits on a close above
the 5-bar mean; VSA exits on an opposing signal; Sweep's exit *is* its target. All are **conditions
evaluated per bar**, not prices — so at the decision bar there is no take-profit to report.

§5.5 demands one anyway, because you place a static bracket and the two have to be comparable. So
**six of the eight targets on this screen are ours**, and each verdict says which side is whose. The
two that are not: Bulkowski's measuring rule, and Carney's retracement of the AD leg.

Every engine also emits its *native* exit, resolved by walking the reveal path minute by minute. Both
records are kept, and the gap between them is the measured cost of forcing a school into a bracket:

| | bracket win / mean R | native exit win / mean R |
| --- | --- | --- |
| Channel | 39.4% / −0.027 | 27.3% / −0.074 |
| Reversion | 50.0% / +0.156 | 54.5% / −0.067 |
| Reversion (Hindsight) | 42.0% / +0.070 | 54.5% / −0.026 |

It does not go the way intuition suggests. Channel's trailing exit wins *less* often than our fixed
target — the Turtle exit is built for a position held for months, and sixty candles is not months.
Both Reversion variants invert: their native exit wins **more** often while making **less**, which is
what taking many small profits looks like measured in R.

### 14.3 Connors says our stop makes it worse, and we show that

**Rule 5 of *Short Term Trading Strategies That Work* is titled "Stops Hurt."** Connors and Alvarez
tested stops from 1% to 50% across fifteen years of liquid US equities and reported: *"In every
single case, the use of stops lowered the performance."* Risk is controlled by position sizing.

This product measures stop placement. So this is not an inconvenient gap quietly filled — it is a
school whose own published research says the thing we measure makes results worse. The stop is
marked **ours**, and the objection is printed beside it.

### 14.4 Silence is a verdict

**No school takes a position on 76.6% of charts.** Two or more speak on 6.7%, and when they do they
disagree on 5.2% — which is to say, **when both schools have an opinion they have never yet agreed**.

§14 chose Channel and Liquidity as "the pair guaranteed to disagree"; Channel and Reversion turn out
to be that pair, and the guarantee holds. But it holds on a twentieth of the corpus, so
disagreement-as-a-difficulty-signal has a 5% coverage rate and is reported with that number attached.

The silence is not a defect. §4.4 already scores restraint as a move *you* can make; an engine
passing is the same move for the same reason. "No school on this roster had a trade here" is a
useful sentence, and a council that could not say it would be lying by construction.

Two things were rejected in getting here. **Loosening the entries** until the engines speak more
often would be data snooping performed in advance and in public — the thresholds *are* the school.
**Serving only charts where engines fire** would change the selection rule, and §12.4 is emphatic
that population statistics do not survive that: every chart rating and every percentile would stop
being comparable.

### 14.5 Nothing here beats a coin flip

Every engine's mean R sits **inside Engine Zero's band**, measured at that engine's own sample size:

| engine | n | win | mean R | Engine Zero at the same n | |
| --- | --- | --- | --- | --- | --- |
| Channel | 198 | 39.4% | −0.027 | [−0.210, +0.165] | inside |
| Reversion | 22 | 50.0% | +0.156 | [−0.572, +0.492] | inside |
| Reversion (Hindsight) | 88 | 42.0% | +0.070 | [−0.290, +0.224] | inside |
| Sweep | 400 | 58.3% | −0.008 | [−0.158, +0.106] | inside |
| Pattern | 32 | 46.9% | −0.037 | [−0.429, +0.490] | inside |
| **Geometry** | **0** | — | — | — | **never fired** |
| Tape | 61 | 34.4% | +0.048 | [−0.358, +0.327] | inside |
| Engine Zero | 1000 | 32.7% | −0.091 | [−0.103, +0.064] | inside |

**Sweep has the best win rate on the roster and loses money.** It wins 58.3% of the time because its
target is the nearest opposing pool, which is usually close — a high hit rate on a small reward, and
the mean R says the two cancel almost exactly. It is the clearest demonstration on this page of why
§4.4 scores percentile rather than win rate.

**Geometry never fired.** Not "rarely" — zero charts in 1,000. Carney's ratios at our published ±5%
matched on exactly one chart, and that one was rejected because its own AD retracement pointed the
wrong way. **The tolerance is not the cause**: a diagnostic sweep found the median chart's
best-fitting XABC misses by **82%**, and even at ±20% — four times the published tolerance — only 17
charts in 1,000 would admit a pattern at all. The shapes are not there to be found.

It stays on the roster and in the registered family anyway. Dropping an engine because it returned an
unwelcome answer is the file-drawer problem, and pre-registering the family before touching the
corpus only means something if the family does not change afterwards. Its slot makes every other
engine's correction slightly more conservative, and that cost is part of having asked.

**The band is drawn at each engine's own n, and that is not a refinement.** An engine firing on 88
charts has 3.4× the sampling error of a band computed over 1,000; one firing on 22 has 6.7×. The
first version of this measurement printed n=88 estimates beside an n=1000 band, under which two
engines appeared to beat the null. They do not. The band also resamples *which charts* are drawn,
because choosing where to trade is part of what an engine does and the null it is measured against
has to be allowed to choose too.

Engine Zero's own win rate is **measured, never assumed**. A 2R target on a 2 ATR stop is not a 33.3%
proposition: drift moves it, the 60-candle timeout truncates it, and §12.3.2's stop-first convention
decides every bar that touches both. It came out at 32.7%.

**The council is silent on 39.7% of charts**, down from 76.6% at a roster of four, and two or more
schools now disagree on 10.9%, up from 5.2%. That is the roster doing what §5.5 wanted — a spread of
opinion needs opinions. Read it with one caveat: almost all the new coverage is Sweep, which takes a
position on 40% of charts by itself, so the silence fell because one engine is loose rather than
because six schools found agreement.

These are raw base rates and **they are not evidence of an edge in either direction**. Eight engines
against a band is eight comparisons, and §13.9 showed what happens without correction: twelve
comparisons, one hit at 95%, gone once corrected. §14.7 applies the correction.

### 14.6 What the engines see

Engines read the full stored lead-in — **up to 300 candles** — while you may have seen 80. That is
history *before* the window and never after it, so it is not a look-ahead, and every engine passes
the same causality suite as every detector in §13. But it is an asymmetry, so each verdict reports
how many candles it used and the debrief prints it.

It is also necessary rather than convenient: Connors' 200-period regime filter is Rule 3, it is
load-bearing, and it cannot exist in an 80-candle window at all.

### 14.7 Does any of it work? The leaderboard, corrected

Reproduce with `npm run leaderboard`. 1,000 charts, 314 symbols, **eight** pre-registered engines,
thresholds `1fc650fc`. Every bootstrap resamples **whole symbols** — up to eight windows come from
one instrument and two windows of the same instrument are not independent draws.

Each engine gets one number per chart: its R where it traded, **zero where it passed**. That is a
portfolio, and it is deliberately not the mean over an engine's own trades — a much easier question,
and the one under which a system that trades twice a decade looks superb.

| engine | fired | per-chart R | Sharpe |
| --- | --- | --- | --- |
| Channel | 198 | −0.0053 | −0.0093 |
| Reversion | 22 | +0.0034 | +0.0177 |
| Reversion (Hindsight) | 88 | +0.0061 | +0.0159 |
| Sweep | 400 | −0.0033 | −0.0053 |
| Pattern | 32 | −0.0012 | −0.0067 |
| Geometry | 0 | 0.0000 | — |
| Tape | 61 | +0.0029 | +0.0083 |
| Engine Zero | 1000 | −0.0907 | −0.0695 |
| **Never trade** | 0 | 0.0000 | — |

**The last row is the control, and it decides how the rest is read.** Engine Zero *loses money*: a 2R
target on a 2 ATR stop inside sixty candles is a negative-expectancy bet, measured at −0.091R per
chart. So anything that trades less than it beats it, skill or no skill.

**Question one — which would you rather have been running?** Romano–Wolf StepM against Engine Zero,
4,000 cluster resamples, α = 0.05, one-sided. StepM rather than Bonferroni because the engines read
the same charts, so their statistics are correlated and Bonferroni assumes they are not.

| | Δ vs Engine Zero | t | |
| --- | --- | --- | --- |
| Channel | +0.0855 | 1.93 | beats Engine Zero |
| Reversion | +0.0942 | 2.25 | beats Engine Zero |
| Reversion (Hindsight) | +0.0969 | 2.29 | beats Engine Zero |
| Sweep | +0.0875 | 1.95 | beats Engine Zero |
| Pattern | +0.0895 | 2.15 | beats Engine Zero |
| **Geometry** | **+0.0907** | **2.20** | beats Engine Zero |
| Tape | +0.0937 | 2.18 | beats Engine Zero |
| **Never trade** | **+0.0907** | **2.20** | **beats Engine Zero** |

Every school clears the null — and so does doing nothing, by the same margin. **Geometry's row is
identical to the control's, to four decimal places, because it is the same thing**: an engine that
never trades and a strategy of never trading are one object. The gap is abstention.

**Question two — on the charts it chose, did it beat a coin flip on those same charts?** Paired per
chart against Engine Zero's own outcome on that chart: same entry, same window, a rule against a
guess. Charts an engine passed contribute zero to both sides and cancel exactly, so coverage is held
fixed and only trade selection is left.

| | Δ vs a coin flip on its own charts | t | over |
| --- | --- | --- | --- |
| Channel | −0.0070 | −0.28 | 198 trades |
| Reversion | −0.0006 | −0.07 | 22 trades |
| Reversion (Hindsight) | −0.0020 | −0.13 | 88 trades |
| Sweep | +0.0340 | 1.08 | 400 trades |
| Pattern | +0.0026 | 0.27 | 32 trades |
| Geometry | 0.0000 | 0.00 | 0 trades |
| Tape | −0.0166 | −1.02 | 61 trades |

Sweep is the best of the eight and does not come close: t = 1.08 on its 400 trades, the largest
sample any school has. Hansen's SPA — one test for the whole roster, asked once, so that reporting
the smallest of seven p-values is not on the table — returns **p = 0.56**. There is no evidence of
superior predictive ability anywhere on this roster.

> At a roster of four this section said every engine was *negative* against a coin flip. At eight,
> Sweep and Pattern are fractionally positive. The honest claim was never "they all lose" — it is
> "none of them can be told apart from a coin flip", which is what SPA measures. A test in
> `tests/engines.test.ts` fails if the published numbers stop supporting the published sentence, and
> it is what caught this one.

**Is the ordering real?** It is worse than not-real. PBO by combinatorially symmetric
cross-validation, all 12,870 balanced splits of sixteen blocks, exhaustive: **0.826**, up from 0.473
at a roster of four. Above a half means the in-sample winner lands *below* median out of sample more
often than chance — its median finish is **8th of 9**. Picking the leader on past performance here is
not merely uninformative, it is actively misleading.

The rank distribution says the same thing directly — the share of 4,000 resamples each engine spends
in each place:

| | #1 | #2 | #3 | #4 | #5 | #6 | #7 | #8 | #9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Channel | 15.3% | 9.8% | 5.7% | 4.9% | 3.6% | 6.7% | 17.0% | 35.8% | 1.4% |
| Reversion | 7.5% | 24.4% | 25.8% | 14.2% | 9.2% | 9.8% | 7.6% | 1.3% | 0.1% |
| Reversion (Hindsight) | 31.2% | 20.7% | 11.1% | 5.7% | 4.8% | 7.3% | 10.2% | 8.7% | 0.3% |
| Sweep | 20.2% | 10.8% | 6.6% | 4.8% | 3.1% | 6.2% | 14.2% | 31.6% | 2.4% |
| Pattern | 3.1% | 8.8% | 12.6% | 13.0% | 13.6% | 19.9% | 22.2% | 6.7% | 0.1% |
| Geometry | 0.9% | 6.8% | 18.0% | 31.8% | 27.8% | 12.6% | 2.2% | 0.0% | 0.0% |
| Tape | 21.3% | 17.5% | 13.3% | 7.3% | 6.0% | 9.5% | 13.3% | 11.1% | 0.6% |
| Engine Zero | 0.4% | 0.3% | 0.1% | 0.4% | 0.1% | 0.3% | 0.7% | 2.5% | 95.2% |
| Never trade | 0.0% | 0.9% | 6.8% | 17.9% | 31.8% | 27.8% | 12.6% | 2.2% | 0.0% |

Only one row on that table is stable, and it is Engine Zero finishing last. Four different engines
take first place in at least 15% of resamples. So **no engine is ranked** — this table is published
instead, because printing a single ordering over these numbers would be the most misleading thing on
the page.

**Deflation.** With eight pre-registered trials, the best of eight *skill-free* engines is expected to
reach a Sharpe of 0.0403 by luck alone (Bailey & López de Prado; E[max] = 1.459 against a
cross-engine spread of 0.0276). The observed best is **0.0177** — below the noise floor. Note that
E[max] rose from 1.052 to 1.459 when the roster grew: **asking more questions raises the bar for
every answer**, which is the entire reason the family is frozen in advance.

**The headline, unchanged by doubling the roster: the only thing here that beats a coin flip is not
trading.** Six published schools and one of our own controls, read over 1,000 charts, and not one of
them picks better than chance on the charts it chooses. They win on the portfolio purely by staying
out of most of them — and the engine that stays out of *all* of them scores exactly the same as the
strategy of doing nothing, because it is that strategy.

That is a real and useful result. Restraint is the edge, and §4.4 already scores it as a move you can
make. But it is not any published school having an edge here, and this project does not get to round
it up into one.

**What n = 1,000 can and cannot resolve.** A per-trade edge of about 0.1R on 400 trades sits at the
edge of detection; Reversion's 22 trades and Pattern's 32 cannot resolve anything at all, and both
are published as unmeasurable rather than quietly dropped. So "no edge found" is not "no edge exists"
— it is the strongest statement this corpus supports, and the corpus is the thing to grow if a
stronger one is wanted.

### 14.8 Sweep, in full, because nobody else publishes it

The engine §5.2 called LIQUIDITY, written out so it can be argued with. Every constant is in
`THRESHOLDS.sweep`; nothing here is ICT's, because ICT publishes no spec.

```
pools   := swings at the intermediate grade (§13.1), confirmed strictly BEFORE the decision
           bar, within 60 bars of it
sweep   := the decision bar reaches at least 0.05 ATR beyond a pool
           AND closes at least 0.05 ATR back inside it
           (reaching without closing back is a breakout — a different engine's trade)
if both sides swept in one bar: pass. An outside bar resolved nowhere.
direction := the rejection's, not the poke's — a swept HIGH is short, a swept LOW is long
stop    := beyond the sweep wick by 0.25 ATR
target  := the NEAREST opposing pool, at whatever R that implies
           no minimum-R rule, and no adjustment
if there is no opposing pool in view: pass, rather than invent a price
```

The last two lines are the ones that matter. §5.2 gave this engine a "minimum 1:2" filter; it is not
an ICT rule, and it would silently move the target away from the level the engine names on screen
whenever the nearest pool sits closer than 2R. A poor reward ratio is information about the trade,
not a number to be corrected.

## 15. What is not built yet

Recorded so nothing here is mistaken for the finished product.

**Not built:** the per-theme ratings; the News Blind tier; the Fog mod; ranked sessions, divisions and
seasons; Manage, Storm, Duel, Racer and Calibration; creator maps and cohort dashboards; the cost
model; synthetic controls in the corpus; news.

**Layer 2 geometry: computed, published, and measured against noise.** §13 covers what exists. The
primitives are pure, causal and tested, the six themes are specified and stored, and **no annotation
reaches a player** — the round payload is unchanged and `tests/api-leak.test.ts` is untouched by all
three phases that built them. Themes are visible as tapes, which is a filter over charts rather than
a drawing on one. Two pieces are deferred outright with reasons in §13.6, round-number levels are
measured-and-withheld in §13.5, and news-spike is dropped outright rather than named after a cause
we cannot observe — §9 news has been dropped from the plan, so its deferral had no target left.

**The roster is complete at eight, and the answer is still no.** §14 has all six schools, our control
on one of them, and the null. §14.7 applies the corrections: Romano–Wolf StepM over the pre-registered
family, Hansen's SPA asked once, PBO over all 12,870 balanced splits, and bootstrap rank
distributions — all resampling whole symbols. Paired against a coin flip on the same charts, **no
engine on the roster can be distinguished from one** (best: Sweep, t = 1.08 on 400 trades; SPA p =
0.56). The ordering is worse than uninformative, at PBO 0.826. The best Sharpe is below the deflation
floor for eight trials, and that floor *rose* when the roster grew, which is what asking more
questions costs.

Two results are worth naming on their own. **Geometry never fired** — zero charts in 1,000, and not
because of our tolerance: even at four times it, 17 charts in 1,000 would qualify. It scores exactly
what a strategy of never trading scores, because it is that strategy. And **Sweep has the best win
rate on the roster at 58.3% while losing money**, which is the clearest demonstration in the document
of why §4.4 scores percentile instead.

**No engine is ranked**, and the council says so on screen. This is the second independent route to
the same answer §13.8 got from the themes.

**And §13.8 is the part to read first.** One detector of ten beats a shuffle of the same charts;
seven fire *less* often on real data than on noise. That is published rather than filed, because it
is the comparison §14 asked for and because a product claiming to sell calibration cannot decline to
report its own. What it does not establish is whether these patterns predict anything — that is
Layer 5's question, and this table raises the prior against it.

**Per-theme player ratings are not built.** §8.4 calls the diagnostic — "you are 1740 overall but
1490 on failed breakouts" — the most valuable sentence the product can say. The tags it needs now
exist; the ratings on top of them do not.

**Built but unvalidated:** the ladder has three rated rungs and **no tier has passed §3.5's test**,
because that needs a player pool and there is not one yet. The harness exists and is verified
against simulated players of known skill, in both directions — it calls a widened gap legitimate, a
compressed one artificial, and two identical tiers inconclusive. The claim about Naked versus
Blackout is published when the sample supports it (§4.9), and until then no tier is described here
as validated. §15.1 already suspects the answer: "whether Blackout should exist at all, or whether
it is the tier that proves §3.5's test by failing it."

**Themes, specifically.** §14 puts them in this phase and Layer 2 geometry in the next one, which
cannot work: five of the ten — failed-breakout, liquidity-sweep, v-reversal, distribution-top and
compression-expansion — are geometric and need swing points and levels. Tagging them now with a
hand-rolled heuristic would mean per-theme ratings built on labels that Phase 2 replaces, which
invalidates every rating computed against them. They wait.
