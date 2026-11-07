# Hindsight rules

> **Hindsight is a game again, and §23 is its rulebook.** Nobody holds money: a round is one tape
> and a fresh $500, graded from 0 to 1000 against the best and worst trade that tape allowed, and
> the training grounds, duels and duels against a school are three ways of using that grade. It is
> built in [`src/core/game/`](../src/core/game/) and pinned to `GAME_VERSION`; §22's pages redirect to
> it.
>
> Two products came before it. Sections 1–21 describe the chart game — the bracket, the R-multiple,
> the percentile, the ladder, the rating and the modes. That game is retired: its pages redirect,
> its API is gone, and nothing new is scored by it. §22 describes the paper-trading platform that
> replaced it, whose exchange §23 keeps and whose accounts §23 retires (§23.9). Both stay, unedited
> except where they were wrong, because every result stored under them was produced by these rules
> and can still be re-derived from them, and because the game reuses their corpus (§7), causality
> (§8), duel dealing (§21.1) and exchange (§22.3–22.5).

Scope §3.6 argues that a ruleset has to be written at the level of specificity the Souls
no-hit community uses, and for a reason that is easy to underrate:

> "No indicators" is not a ruleset. [...] Write Hindsight's at that level before the first
> ranked season, because the first tournament dispute will be about an edge case and there
> will be no time to decide then.

This is that document. It began at Phase 0 size and has grown with the ladder rather than being
rewritten; it covers what the game actually implements, and §15 lists what it does not.

Every rule here is enforced in code and pinned to a version constant in
[`src/core/versions.ts`](../src/core/versions.ts). Every stored result records the versions it
was produced under, so a result can always be re-derived from the rules that were in force
when it was played.

**The names on screen were plainer than the names here.** This document keeps its technical
vocabulary, because the code and the stored results use it. The game said the same things in
words a player already had:

| here | on screen |
| --- | --- |
| percentile (§4.4) | **Score**, 0–100 |
| the oracle (§10.2) | **Best in hindsight**, drawn in gold |
| pass / stand aside | **Sit out** |
| commit | **Lock in** |
| bracket | stop and target |
| MFE / MAE | peak gain / deepest dip |
| efficiency | captured |
| IMPs, compressed score | ranked points |
| the engine council (§14) | **the Panel**, one persona per engine |
| Streak, the run mode (§19) | **Survival** |
| maps (§20) | **tapes** |
| FD, NT, NTZ, BO | Full Desk, No Tools, Naked, Blackout |

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

Phase 0 charged **zero**: the resolver took a cost parameter and stored `0` for both the spread and
the stop slippage on every round. That seam was filled in Phase 4. **§16.1 is the game's cost model**
— Binance spot commission plus 5 bps of stop slippage, inside the enumeration rather than beside it
— and every round scored since carries it.

One correction to §16.1, stated here because it changes what that section's numbers mean: the
resolver charges `spreadBps` **half at entry and half at exit**, so with `spreadBps = 10` the round
trip it actually charged was **10 bps**, not the 20 that §16.1 and `ROUND_TRIP_BPS` state. The
measured grid (§16.1's second table) was produced by the resolver and is right; the cost-in-R
table, computed from the stated 20, is twice what was charged. The values are frozen — stored
results depend on them — so this is a documentation fix only.

The trading platform charges commission and spread separately and in full: **§22.5**.

## 6. Integrity

- **Future data and identity never reach the client before the order is committed.** The
  issuance API returns eight fields — round id, lead-in bars, ATR, tick size, entry, reveal length — and the
  database function that serves it does not have the reveal bars in its return type at all.
  Enforced, while the game ran, by `tests/api-leak.test.ts`, which retired with its API; the
  trading platform's equivalent is §22.9.
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

### 12.8 Divisions are a display, not a rating

A division is the overall rating said in words: **Paper, Retail, Swing, Desk, Prop, Fund, Wizard**.
Nothing is scored, served or matched on one. The Glicko rating does all of that, unchanged, and a
division is shown only once the rating itself is: at least 30 rated charts and a rating deviation of
100 or less (`RANK_MIN_ATTEMPTS` and `RANK_MAX_RD` in [`src/core/rating.ts`](../src/core/rating.ts)).

The bands are cut in standard deviations of the population rather than in round numbers, because
§12.2 puts the spread at about **42 points** — a ladder cut every hundred points would put nearly
everyone in one band. Mean 1500, half-SD steps:

| division | from | z |
| --- | --- | --- |
| Paper | — | below −1.5 |
| Retail | 1437 | −1.5 |
| Swing | 1469 | −0.75 |
| Desk | 1500 | 0 |
| Prop | 1532 | +0.75 |
| Fund | 1563 | +1.5 |
| Wizard | 1595 | +2.25 |

**These thresholds are ours and provisional.** 42 is an estimate made before there was a
population. When there is one, the bands are re-cut from its measured spread and the change is
published here, not tuned quietly. The code is [`src/core/divisions.ts`](../src/core/divisions.ts).

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
| **Sweep** | **Ours** — in the ICT idiom; ICT publishes no spec, so nothing here is theirs | 5.4% | ours | ours |
| **Pattern** | Bulkowski, *Encyclopedia of Chart Patterns*; measuring rule after Edwards & Magee | 3.2% | ours | **theirs** |
| **Geometry** | Carney, *Harmonic Trading*; tolerance and the Crab B-ratio are ours | **0.0%** | **theirs** | **theirs** |
| **Tape** | Volume Spread Analysis — Williams; every threshold is ours, because his are words | 6.1% | **theirs** | ours |
| **Engine Zero** | The null — a seeded coin flip, 2 ATR stop, 2R target | 100% | ours | ours |

Every threshold is a named constant in `src/core/engines/manifest.ts`, hashed as **`7e7c197a`**, and a
test fails if any of them moves. That is not tidiness: §14.7 asks whether any engine beats the null,
and that question has a family size.

**The family is eight engines and ten trials**, and the gap is the point. Sweep has been replayed
under three specifications, so the search that produced these numbers tried ten things, not eight.
The deflation floor in §14.7 is computed against ten. See §14.9 for what those three specifications
did to the same 1,000 charts — the strongest argument in this document for counting.

> **The guard was decoration for one release.** 3a shipped the hash as `digest(THRESHOLDS)` — computed
> at read time, so the test asserting the two agree compared a value to itself and could never fail.
> It is a hand-written literal now, and moving any threshold fails the build. `baseRates.ts` also
> records the hash it was measured under, so a track record cannot be inherited by a roster that
> never earned it.

**Six of the eight engines pass more than 90% of the time, and one passes always.** That is the
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

**No school takes a position on 66.9% of charts.** Two or more speak on 10.9%, and when they do they
disagree on 7.1% — so **when the council has more than one opinion, those opinions conflict about
two times in three**.

At a roster of two schools the silence was 76.6% and the conflict rate was 100%: Channel and
Reversion, when both spoke, never once agreed. §14 predicted that pair would be "guaranteed to
disagree" and on this corpus it was. Six schools disagree less often as a proportion but far more
often in absolute terms, which is what a spread of opinion is supposed to look like.

Disagreement-as-a-difficulty-signal therefore has a 7.1% coverage rate, and is reported with that
number attached rather than presented as though it were always available.

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
| Sweep | 54 | 40.7% | −0.179 | [−0.383, +0.318] | inside |
| Pattern | 32 | 46.9% | −0.037 | [−0.429, +0.490] | inside |
| **Geometry** | **0** | — | — | — | **never fired** |
| Tape | 61 | 34.4% | +0.048 | [−0.358, +0.327] | inside |
| Engine Zero | 1000 | 32.7% | −0.091 | [−0.103, +0.064] | inside |

**Sweep has the worst expectancy of any school at −0.179R**, on the smallest sample of any engine
that trades at all. It has been specified three times and each version was a different engine: 400
charts winning 58.3% at −0.008R, then 184 winning 63.0% at −0.127R, then 54 winning 40.7% at −0.179R.
Expectancy fell every time; the win rate rose and then fell. §14.9 has the whole sequence, and it is
the clearest demonstration in this document of why §4.4 scores percentile rather than win rate.

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

**The council is silent on 66.9% of charts**, down from 76.6% at a roster of four, and two or more
schools now disagree on 7.1%, up from 5.2%. That is the roster doing what §5.5 wanted — a spread of
opinion needs opinions.

Read those two numbers as statements about our thresholds before statements about the market. Across
Sweep's three specifications the silence figure read 39.7%, then 56.5%, then 66.9%, **and not one
chart changed**. A coverage figure is a property of the spec, which is the argument for publishing
the spec rather than the figure.

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

Reproduce with `npm run leaderboard`. 1,000 charts, 314 symbols, **eight** pre-registered engines
over **ten** specifications, thresholds `7e7c197a`. Every bootstrap resamples **whole symbols** — up to eight windows come from
one instrument and two windows of the same instrument are not independent draws.

Each engine gets one number per chart: its R where it traded, **zero where it passed**. That is a
portfolio, and it is deliberately not the mean over an engine's own trades — a much easier question,
and the one under which a system that trades twice a decade looks superb.

| engine | fired | per-chart R | Sharpe |
| --- | --- | --- | --- |
| Channel | 198 | −0.0053 | −0.0093 |
| Reversion | 22 | +0.0034 | +0.0177 |
| Reversion (Hindsight) | 88 | +0.0061 | +0.0159 |
| Sweep | 54 | −0.0097 | −0.0366 |
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
| Sweep | +0.0810 | 1.92 | beats Engine Zero |
| Pattern | +0.0895 | 2.15 | beats Engine Zero |
| **Geometry** | **+0.0907** | **2.20** | beats Engine Zero |
| Tape | +0.0937 | 2.18 | beats Engine Zero |
| **Never trade** | **+0.0907** | **2.20** | **beats Engine Zero** |

Every school clears the null — and so does doing nothing, by the same margin. **Geometry's row is
identical to the control's, to four decimal places, because it is the same thing**: an engine that
never trades and a strategy of never trading are one object. The gap is abstention.

Sweep clears it here by trading on only 54 charts. Under `engine-3` the same engine, on a looser
pool definition, was the *only* one that failed to clear it. Nothing about the market distinguishes
those two runs.

**Question two — on the charts it chose, did it beat a coin flip on those same charts?** Paired per
chart against Engine Zero's own outcome on that chart: same entry, same window, a rule against a
guess. Charts an engine passed contribute zero to both sides and cancel exactly, so coverage is held
fixed and only trade selection is left.

| | Δ vs a coin flip on its own charts | t | over |
| --- | --- | --- | --- |
| Channel | −0.0070 | −0.28 | 198 trades |
| Reversion | −0.0006 | −0.07 | 22 trades |
| Reversion (Hindsight) | −0.0020 | −0.13 | 88 trades |
| Sweep | +0.0063 | 0.50 | 54 trades |
| Pattern | +0.0026 | 0.27 | 32 trades |
| Geometry | 0.0000 | 0.00 | 0 trades |
| Tape | −0.0166 | −1.02 | 61 trades |

Sweep is nominally the best of the eight and does not come close: t = 0.50 on its 54 trades.
Hansen's SPA — one test for the whole roster, asked once, so that reporting the smallest of seven
p-values is not on the table — returns **p = 0.85**. There is no evidence of superior predictive
ability anywhere on this roster.

> At a roster of four this section said every engine was *negative* against a coin flip. At eight,
> Sweep and Pattern are fractionally positive. The honest claim was never "they all lose" — it is
> "none of them can be told apart from a coin flip", which is what SPA measures. A test in
> `tests/engines.test.ts` fails if the published numbers stop supporting the published sentence, and
> it is what caught this one.

**Is the ordering real?** It is worse than not-real. PBO by combinatorially symmetric
cross-validation, all 12,870 balanced splits of sixteen blocks, exhaustive: **0.752**, against 0.473
at a roster of four. Above a half means the in-sample winner lands *below* median out of sample more
often than chance — its median finish is **7th of 9**. Picking the leader on past performance here is
not merely uninformative, it is actively misleading.

The rank distribution says the same thing directly — the share of 4,000 resamples each engine spends
in each place:

| | #1 | #2 | #3 | #4 | #5 | #6 | #7 | #8 | #9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Channel | 18.2% | 8.6% | 5.9% | 4.1% | 3.4% | 7.4% | 16.5% | 34.3% | 1.6% |
| Reversion | 10.2% | 29.0% | 24.8% | 10.4% | 9.8% | 9.7% | 5.3% | 0.8% | 0.0% |
| Reversion (Hindsight) | 37.2% | 18.7% | 9.0% | 5.0% | 5.5% | 7.4% | 9.5% | 7.2% | 0.3% |
| Sweep | 2.6% | 4.1% | 3.9% | 3.2% | 4.1% | 10.9% | 27.0% | 42.4% | 1.8% |
| Pattern | 4.7% | 10.9% | 13.1% | 13.1% | 12.6% | 22.5% | 18.7% | 4.5% | 0.0% |
| Geometry | 1.5% | 8.9% | 22.7% | 35.0% | 22.9% | 8.4% | 0.6% | 0.0% | 0.0% |
| Tape | 25.1% | 18.1% | 11.4% | 6.3% | 6.6% | 10.3% | 13.4% | 8.4% | 0.4% |
| Engine Zero | 0.4% | 0.3% | 0.2% | 0.3% | 0.1% | 0.3% | 0.6% | 1.8% | 95.9% |
| Never trade | 0.0% | 1.5% | 8.9% | 22.6% | 35.0% | 22.9% | 8.4% | 0.6% | 0.0% |

One row on that table is stable, and it is not a school being good at anything: Engine Zero finishes
last 95.9% of the time. Everything above it is noise — three different engines take first place in at
least 18% of resamples, and Sweep's most likely finish (42.4% second-to-last) was 31.6% one
specification ago. So **no engine is ranked**, and this table is published instead, because printing
a single ordering over these numbers would be the most misleading thing on the page.

**Deflation.** With **ten** pre-registered trials — eight engines, one of them specified three times
— the best of ten *skill-free* strategies is expected to reach a Sharpe of 0.0466 by luck alone
(Bailey & López de Prado; E[max] = 1.575 against a cross-engine spread of 0.0296). The observed best
is **0.0177**, well under half the floor.

E[max] has now risen three times: 1.052 at four engines, 1.459 at eight, 1.521 and then 1.575 as
Sweep's discarded specifications were counted. **Asking more questions raises the bar for every
answer**, and that includes questions you asked, disliked the answer to, and asked again — which is
the entire reason the family is frozen in advance and every discarded attempt is still counted.

**The headline, unchanged by doubling the roster: the only thing here that beats a coin flip is not
trading.** Six published schools and one of our own controls, read over 1,000 charts, and not one of
them picks better than chance on the charts it chooses. They win on the portfolio purely by staying
out of most of them — and the engine that stays out of *all* of them scores exactly the same as the
strategy of doing nothing, because it is that strategy.

That is a real and useful result. Restraint is the edge, and §4.4 already scores it as a move you can
make. But it is not any published school having an edge here, and this project does not get to round
it up into one.

**What n = 1,000 can and cannot resolve.** A per-trade edge of about 0.15R on 200 trades sits at the
edge of detection; Reversion's 22 trades and Pattern's 32 cannot resolve anything at all, and both
are published as unmeasurable rather than quietly dropped. So "no edge found" is not "no edge exists"
— it is the strongest statement this corpus supports, and the corpus is the thing to grow if a
stronger one is wanted.

### 14.8 Sweep, in full, because nobody else publishes it

The engine §5.2 called LIQUIDITY, written out so it can be argued with. Every constant is in
`THRESHOLDS.sweep`; nothing here is ICT's, because ICT publishes no spec.

```
pools   := swings at the MAJOR grade (§13.1 -- 2 ATR persistence), confirmed strictly
           BEFORE the decision bar, within 80 bars of it
           (major because the engine's whole claim is that other traders' stops rest
            here, which needs a level other traders marked; 80 because that is the
            ranked window, so the level is one the player could have seen too)
sweep   := the decision bar reaches at least 0.25 ATR beyond a pool
           AND closes at least 0.25 ATR back inside it
           (0.25 because that is what this engine already calls "beyond" for its own
            stop; 0.05 -- the engine-2 value -- made "swept" mean "touched")
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

### 14.9 What three specifications of one engine did

Sweep has been registered three times: `engine-2`, `engine-3`, `engine-4`. Every change was argued
from the spec and none from a measurement.

- **`engine-3`** tightened penetration and rejection from 0.05 ATR to 0.25, because the engine
  already used 0.25 ATR as "clearly beyond a level" for its own stop buffer, and two notions of
  *beyond* differing fivefold inside one engine is a defect. At 0.05 ATR — a twentieth of a bar's
  range — "swept" meant "touched".
- **`engine-4`** restricted pools to **major**-grade swings and tied the lookback to the ranked
  80-candle window. The engine's entire claim is that *other traders' stops rest beyond this level*,
  which requires a level other traders marked; intermediate grade admitted levels half the chart
  would never have drawn. And §14.6 already discloses that engines read 300 candles while a Naked
  player sees 80 — the levels an engine trades *against* are the one place that asymmetry costs
  nothing to remove.

Same corpus, same code, same seeds, all three times:

| | `engine-2` | `engine-3` | `engine-4` |
| --- | --- | --- | --- |
| fires on | 400 charts | 184 | **54** |
| win rate | 58.3% | **63.0%** | 40.7% |
| mean R | −0.008 | −0.127 | **−0.179** |
| beats Engine Zero? | yes | **no** | yes |
| most likely bootstrap finish | 8th (31.6%) | 8th (72.0%) | 8th (42.4%) |
| council silence | 39.7% | 56.5% | **66.9%** |
| SPA over the roster | p = 0.56 | p = 0.46 | **p = 0.85** |

Four things follow, and they are why this section exists rather than the changes being made quietly.

**A win rate is not a result.** It went 58.3% → 63.0% → 40.7% while expectancy fell monotonically,
−0.008 → −0.127 → −0.179. The hit rate is not even a consistent *direction* here, let alone a proxy
for profitability. An engine sold on its win rate would have looked improved at `engine-3` and
ruined at `engine-4`; by expectancy it got worse both times.

**A coverage figure is a property of the spec.** Council silence moved from 39.7% to 66.9% across
these three runs without a single chart changing. Any product quoting "the schools disagree on X% of
charts" is quoting its own thresholds, and ours are published for exactly that reason.

**"Beats the null" survived a round trip.** Sweep cleared Engine Zero, then failed to, then cleared
it again — because what it is really measuring is how much abstention the definition buys against how
badly the surviving trades do. A verdict that flips twice under three defensible readings of the same
idea is not a fact about markets.

**Every discarded attempt still counts.** `REGISTERED.trials` is 10 against a roster of 8, and the
deflation floor in §14.7 is computed against 10 — which raised it from 0.0403 to 0.0556 to 0.0466 as
the trial count and the cross-engine spread both moved. Each replaced specification was replaced by
someone who had seen how it scored, and that is precisely the search cost Bailey & López de Prado's
deflation exists to price. Counting only the surviving specification is how a backtest flatters
itself.

Three attempts is still a small number, and the effect on the floor is small. It is documented at
this size because the mechanism does not become more visible later — it becomes invisible, and by
then nobody can say what N was.

## 15. What is not built yet

Recorded so nothing here is mistaken for the finished product.

**Not built:** the per-theme ratings; the News Blind tier; seasons; news. §10.1's *box* variant of
calibration is not built either, and §18.5 explains why it cannot be until a design question is
settled. **Mods are built and not offered**: §11.5's code is in `src/core` and nothing in the game
exposes it, because several were never drawn and the XP they were priced in does not exist.

**Built since this section was first written:** ranked sessions (§12), divisions (§12.8), Storm and
Streak (§19), creator maps and cohort dashboards (§20), and Duel and Racer (§21). Leaderboards — the
daily field, the ranked ladder and per-tape boards — are read-only views over stored results, gated
on the same sample sizes §12 and §20 already use, and change no score.

**Manage is built and unvalidated.** §17 has the ladder: its own 98-cell achievable set, its own par,
its own rating, and a reveal metered by the server because the player is still deciding while it
arrives. What is *not* known is the thing the phase exists to find out — whether the Manage rating
and the Naked rating measure different skills. That is a correlation between two numbers, and it
needs players. The ladders are built so it can be asked; the answer is not claimed here.

**Built, and waiting on players to mean anything.** §16 has the cost model, the synthetic controls
and the regime marginals. What none of them can answer yet is §7.2's actual question — whether
players score higher on real charts than on fabricated ones — because that needs volume. The
controls are in the corpus accumulating from the first round played; the answer is not claimed in
any direction until there is a sample.

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
engine on the roster can be distinguished from one** (best: Sweep, t = 0.50 on 54 trades; SPA p =
0.85). The ordering is worse than uninformative, at PBO 0.752. The best Sharpe is well under half the
deflation floor, and that floor has *risen* three times — once when the roster grew and twice as
discarded specifications were counted, which is what asking more questions costs.

Three results are worth naming on their own. **Geometry never fired** — zero charts in 1,000, and not
because of our tolerance: even at four times it, 17 charts in 1,000 would qualify. It scores exactly
what a strategy of never trading scores, because it is that strategy. **Sweep has the worst expectancy of any
school at −0.179R**, which is the clearest demonstration in the document of why §4.4 scores
percentile instead. And §14.9 records what happened across Sweep's three registrations: coverage fell
from 400 charts to 54, expectancy fell every time, the win rate rose and then fell, and "beats the
null" flipped twice — with nothing about the market changing.

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

## 16. Costs, controls, and what the corpus cannot say

Phase 4's honesty programme, minus everything that needs players. Three pieces: the cost model, the
synthetic controls, and an admission about the regime breakdown.

### 16.1 Every score is now net of costs

The corpus is Binance spot, so a round trip is **20 basis points** — 0.1% maker and taker at VIP 0 —
before slippage. (As implemented, the resolver charged half of that: see the correction in §5.) We add **5 bps of stop slippage**, which is **ours**: a stop is a market order on a
trigger and does not fill at the trigger, and no published figure exists. It is the only number here
without a source and is labelled accordingly.

**Cost in R is inversely proportional to stop distance**, because R *is* the stop distance. ATR(14)
is 1.505% of price at the median chart, so:

| stop | cost, median chart | cost, quietest 5% of charts |
| --- | --- | --- |
| **0.5 ATR** | **0.266R** | **0.571R** |
| 1 ATR | 0.133R | 0.285R |
| 2 ATR | 0.066R | 0.143R |
| 4 ATR | 0.033R | 0.071R |

On the quietest charts a half-ATR stop pays **more than half its own risk in fees**.

**What that does to the 98 brackets**, measured over 250 charts enumerated twice:

| stop | mean R gross | mean R net |
| --- | --- | --- |
| 0.5 ATR | −0.026 | **−0.215** |
| 1 ATR | −0.020 | −0.119 |
| 1.5 ATR | **+0.002** | −0.065 |
| 2 ATR | −0.014 | −0.064 |
| 4 ATR | −0.012 | **−0.035** |

Read the columns against each other. **Gross, stop distance does not matter** — every row sits within
0.03R of every other and the best is 1.5 ATR by a margin indistinguishable from noise. **Net, it is
the largest single determinant of expectancy in the grid, and it is monotone.**

§15 lists as a risk that *"percentile scoring rewards lottery tickets"*. This is the mechanism,
measured: gross scoring makes tight stops look free. They are the most expensive choice on the board,
and a player optimising against a gross percentile is being trained toward the one decision that
costs the most money.

**So costs are inside the enumeration, not beside it.** Bajgrowicz & Scaillet, revisiting technical
trading rules on the Dow, are explicit about why:

> We explain why break-even transaction costs are not a satisfactory indicator, and why it is
> important to consider transaction costs already during the selection process.

With costs outside the grid, **the best bracket on the chart is a different bracket on 22% of
charts** — so the oracle you are measured against would be the best trade in a game nobody plays.
The oracle itself falls 6.2% once fees are in.

**The price of this was paid deliberately.** `ACHIEVABLE_VERSION` is now `achievable-2`, all 1,000
charts were re-enumerated, and **every percentile, chart rating and retirement verdict computed under
`achievable-1` is invalid** — §12.4's rule that population statistics do not survive a change of
rule. It was done now because there are no players yet, and it will never be cheaper.

The debrief shows **both numbers and the gap between them**, because the gap is the lesson and a
single net figure would hide what the stop choice cost.

### 16.2 Some of these charts are not real

§7.2's synthetic controls are in the corpus and are **issued exactly like any other chart**. Nothing
about issuance changed: the round payload is a closed allowlist and `synthetic` is not in it, so the
blinding holds by construction rather than by care — `tests/api-leak.test.ts` asserts the field set.
The flag is released **on the reveal**, with the rest of the chart's identity, and the debrief says
plainly that the chart was not a market. A product that told you a fabricated chart was real trading
would be doing the one thing this document exists to prevent.

**Currently 111 of 1,111 charts (10%).**

**The generator the scope named first is not used.** Measured on this corpus, against the two
properties that make a chart look like a market:

| | volatility clustering, ACF(&#124;r&#124;) | kurtosis |
| --- | --- | --- |
| **real** | **0.183** | **13.02** |
| permutation | −0.004 | 12.96 |
| block bootstrap, 16 hours | 0.151 | 11.21 |
| **GBM** | **−0.001** | **2.98** |

GBM has no fat tails at all — no gaps, no shocks, nothing resembling a cascade. It is not a hard
control, it is an obviously fake chart.

**Two generators ship, half the charts each, because they answer different questions.**

*Permutation* is the cleanest null: it destroys exactly the serial structure technical analysis
claims to read and preserves the marginal distribution perfectly. It is also **known to be
detectable** — Hasanhodzic, Lo & Viola ran precisely this experiment, cumulating randomly permuted
returns, and subjects distinguished them from real series with p-values of at most 0.503% across
eight datasets. The paper names immediate feedback as a key feature, and subjects could practise
first. That is a description of this product, so the effect should be expected here.

*Block bootstrap* is the least detectable and a **weaker null**: structure survives inside each
16-hour block, so a player profiting on one may be reading real structure that was resampled rather
than removed. Disagreement between the two generators is itself the finding.

**What the engines do on them**, free and available now — the council replayed over the controls
(`npm run engines -- --synthetic`):

| | real (1,000) | synthetic (111) |
| --- | --- | --- |
| Channel fires | 19.8% | 26.1% |
| Sweep fires | 5.4% | **11.7%** |
| council silent | 66.9% | 56.8% |

**The engines fire more often on the fake charts than on the real ones.** At n = 111 the R figures
resolve nothing and are not reported as findings, but the coverage difference is large enough to
note — and it points the same way §13.8 did, where seven detectors of ten fired *more* on shuffled
data than on real data.

The comparison that matters — whether *players* score higher on real charts — needs players, and is
not claimed here in any direction.

### 16.3 The regime breakdown §7.3 asks for cannot be published

§7.3: *"Never publish an aggregate engine number without the regime breakdown next to it."* The rule
is right. The corpus cannot satisfy its letter.

Eight engines across the 16 regime cells of §11.1 is 128 cells. **Not one school engine reaches 30
trades in any single cell** — Channel's largest is 22, Reversion's is 3, Geometry's is 0. §14.7
needed 198 trades to *fail* to resolve a 0.1R edge; 22 trades resolve nothing at all, and 128 of them
would be a multiple-comparison problem dwarfing the eight-engine family §14.7 was built to correct.

The corpus is also not balanced, and cannot be: twelve cells hold ~78 charts each, but the whole
**trend** row holds 63 between them, because a high efficiency ratio is genuinely uncommon and the
selection rule cannot manufacture what the market did not do.

So `npm run engines` publishes the **marginals** — by efficiency ratio and by volatility, each with
its trade count attached — and states that the cross is unmeasurable. That keeps the spirit of §7.3,
which is that no aggregate stands unqualified, without inventing resolution the sample does not have.
Even the marginals are thin: only Channel clears 45 trades in every bucket.

### 16.4 Which school you actually trade as

§5.12 wants one sentence: *"you describe yourself as a breakout trader, but 68% of your entries match
the Reversion engine, and that is the engine you underperform against."* Nobody else says this,
because nobody else has eight schools reading the same chart you just traded.

**The obvious construction does not work here, and the corpus says so before it is built.** Labelling
each chart with the *nearest* school is undefined when no school traded and tautological when exactly
one did:

| on a given chart | |
| --- | --- |
| no school took a position | **66.9%** — nothing to be near |
| exactly one did | 22.2% — "nearest" is trivially that one |
| two or more did | **10.9%** — a genuine choice exists |

So each engine is scored **on its own charts** instead: of the charts where Channel traded and you
also traded, on how many did your bracket look like Channel's? That is well defined whenever the
engine spoke and does not compete for a single label.

**"Looks like" is one rung of the achievable grid.** Two brackets resemble each other when the
direction matches and both the stop distance and the reward ratio are within a factor of **1.5** —
which is one step of §1's enumerated ladder, since `STOP_ATR_MULTIPLES` steps by 1.33–1.5. Two
brackets a rung apart scored in adjacent cells of the same distribution, so calling them different
systems would be a distinction the scoring itself cannot make. The number is taken from the grid
rather than invented.

**The sample cost is severe, and it is published rather than discovered later.** An affinity is a
proportion, and the floor is 30 charts on which that engine traded — the same bar §16.3 applies to
the regime cells. Because the engines are mostly silent:

| engine | fires on | rounds you must play first |
| --- | --- | --- |
| **Channel** | 19.8% | **152** |
| Reversion (Hindsight) | 8.8% | 341 |
| Tape | 6.1% | 492 |
| Sweep | 5.4% | 556 |
| Pattern | 3.2% | 938 |
| Reversion | 2.2% | 1,364 |
| Geometry | 0% | **never** |

For most players this will report Channel and nothing else for a long time. It says so, rather than
showing six percentages computed from four trades each — and it returns **nothing at all** below the
floor, because a fingerprint drawn from nine charts is a different claim, not a weaker one.

**Matching a school is not praise.** §14.7 could not tell any engine on this roster apart from a coin
flip on the charts it chose. "You trade like Channel" is a description; the only comparative claim
made is the one §5.12 asks for — whether you did better or worse than that engine **on the same
charts**, which is why both means are computed over the same chart set rather than over each side's
own history.

Evidence is written to the round as it is played (migration 0019), because the council's verdicts are
discarded after the reveal and rebuilding a player's history would mean replaying eight engines over
every chart they have ever seen.

## 17. Manage

§10.1: *"Same charts, candles advance in real time, player may trail, scale out, move to breakeven,
or exit early. **Separate rating.**"* §3 calls it the largest architectural gap in v0.1 and compares
it to blitz against classical — a different game on the same board.

Play it at `/manage`, or from any tape.

### 17.1 There is no target

You place a stop and open. Nothing closes the position but you, the stop, or the end of the window.
That is the whole difference: Naked asks *where do the levels go*, Manage asks *when do you leave*.

Four moves, and they are deliberately discrete rather than a drag:

| | |
| --- | --- |
| **Tighten** | move the stop a quarter of an ATR closer |
| **Breakeven** | move it to the entry |
| **Take half** | close half the position at the current price, once |
| **Close** | leave |

Dragging is right when nothing is moving. Here the candles arrive every second, and the one action
that must never be ambiguous is the stop — a stop a tick lower is a different R. Each control is a
thing you *meant*, which is also what makes the action log a readable record of the round.

**The stop can only ever tighten.** R is the *initial* risk (§4.1), so a stop walked away from entry
would change the denominator after the fact — and a player who could widen would never take a loss.

### 17.2 It is scored against management, not against brackets

Manage has its own achievable set: **direction × initial stop × exit policy = 2 × 7 × 7 = 98 cells**,
the same size as §1's bracket grid so that a percentile means the same thing on both ladders.

The seven policies, pre-registered and frozen under `MANAGE_VERSION` on the §14 pattern:

| policy | mean R over all 1,111 charts |
| --- | --- |
| trail 1 ATR | **−0.092** |
| half off at 1R, breakeven, then trail 2 ATR | −0.092 |
| trail 3 ATR | −0.099 |
| hold to the end | −0.102 |
| breakeven at 1R, then trail 2 ATR | −0.103 |
| trail 2 ATR | −0.110 |
| **breakeven at 1R** | **−0.134** |

**Every one of them loses money**, which is by now the least surprising sentence in this document.
The ordering is the part worth reading: the top four sit within 0.010R of each other and are not
distinguishable, but **moving to breakeven at 1R is the worst of the seven** by a margin larger than
the spread among all the others — worse even than doing nothing. Breakeven stops are among the most
widely taught habits in retail trading, and on this corpus they convert trades that would have
recovered into scratches.

> **A 250-chart sample of that table said the loosest trail was clearly best, at −0.017R against
> −0.117R.** On 1,111 charts it is not. That claim was sampling noise, it reached a commit message
> before the full enumeration existed, and it is withdrawn. §14.7 needed 198 trades to *fail* to
> resolve a 0.1R edge; these differences are a tenth of that size.

### 17.3 Why it could not share Naked's grid

Both grids, net of costs, over all 1,111 charts:

| grid | best cell | par (median cell) |
| --- | --- | --- |
| bracket (§1's 98) | 4.55R | **−0.782R** |
| manage (§17.2's 98) | 4.51R | **−0.415R** |

The two ceilings are equal to within noise. **Par is 0.367R apart**, and that is the whole argument:
a percentile is a rank against a distribution, so scoring a managed trade among static brackets would
hand it that gap before it did anything — and the bracket grid contains no managed outcomes at all,
so it would be comparing unlike things whatever the numbers did.

For the same reason a chart's **Manage rating is separate from its Naked rating**. How hard a chart
is to manage is not how hard it is to bracket.

> Perfect-foresight management — exiting at the exact extreme the window reached — beats the best
> static bracket on **79%** of charts. That is a real measurement and it is why the ladder exists,
> but it is a ceiling no rule reaches: the seven mechanical policies top the bracket grid's best cell
> on **20.7%**. An earlier draft of the research used the 79% to argue that percentile scoring would
> pin at 100th, which it would not.

### 17.4 The rating is separate, and never blended

Manage writes to its own ladder and **never touches the overall rating**. §15 of the scope leaves
open whether it should be blended; it is not, because the phase's exit condition is *"a Manage rating
that correlates only partly with the Naked rating"* — and two numbers that feed each other cannot be
correlated in any way that means anything. `tests/manage-rating.test.ts` asserts that a Manage
attempt writes one player row and never reads the reserved overall key.

Whether the two actually decorrelate is not known and needs players. It is the phase's open question,
not an answer this document is entitled to give.

### 17.5 The candles come from the server, one at a time

§6 says future data never reaches the client before the order is committed. Naked satisfies that by
construction: the reveal ships **at commit**, after the only decision. **Manage does not** — you keep
deciding while the candles arrive, so shipping the window when the position opens would hand over the
entire future with every remaining decision still ahead of you. No amount of care in the interface
fixes that; whatever it chose to draw, the bytes would be in the tab.

So the reveal is metered by the server. A tick returns the bars that have elapsed against the round's
own clock and not one more, and an action is stamped with **the index the server believes is
current** — the request has no field for a client index at all, so there is nothing to forge. The
score is derived from the stored action log by the same walk the 98 policies use, so replaying the
log reproduces it exactly and the client never sends an outcome.

**A position that has already stopped out is over.** Every tick asks whether the exit has already
happened in revealed time and ends the round when it has — found by playing it, after a partial and a
close were recorded at bars 46 and 54 on a position that closed at bar 9. The walk discarded them
correctly, but forty bars had been spent managing something that was not there.

## 18. Calibration

§4.7: *"Players stake a probability on each trade and are scored with a proper scoring rule,
producing a calibration curve over time."*

**This is the only thing in the product with published evidence of being trainable**, and that is why
it is here rather than parked as a side meter:

> In the Good Judgment Project a probabilistic-reasoning module that **lasted less than one hour**
> improved Brier scores by **6 to 11% over the control condition**, and the benefit persisted across
> multiple years of the IARPA tournament.

Set that beside the rest of this document. §14.7 could not separate a single trading school from a
coin flip on the charts it chose. §13.8 found nine geometric detectors of ten no better than a
shuffle of the same data. Calibration is the one place where *"this is trainable"* is a citation
rather than a hope — which is what converts the product's claim from **learn to read price action**,
which is indefensible, into **get calibrated about uncertain outcomes, and see the curve**.

### 18.1 The stake

Beside Commit there are five buttons: **10, 30, 50, 70, 90**. They ask one question — *how likely is
this trade to finish green?* — and the answer is scored.

Five steps rather than a slider, because a slider invites a shrug at the midpoint and the entire
measurement is about whether a stated number means anything. Each step is a claim you would defend
out loud.

**It is optional on every round.** A mandatory forecast gets answered carelessly, and careless
forecasts are worse than none: they enter the curve and flatten it toward the base rate. A round
played without a stake is simply absent from every statistic here — never counted as a half, because
putting an opinion you did not express into your own curve is the one thing a calibration measure
must not do.

A pass carries no stake either. There is no trade to be confident about.

### 18.2 The event is "finishes green, net of costs"

Not *"hits target before stop"* — a timeout is neither, and a proper scoring rule needs an event that
always resolves. It is the same number §16.1 scores everything else on, so you are forecasting the
thing you are graded on rather than a proxy for it.

### 18.3 Scored with the Brier score, against the base rate

`(stated − outcome)²`, lower is better. It is **proper**: the expected score is minimised by stating
what you actually believe, so there is no shading, no hedging toward the middle, and no way to game
it short of forecasting better.

A Brier alone is uninterpretable, so it is never shown alone. Measured over all **98,000** enumerated
brackets in the corpus, net of costs:

| | |
| --- | --- |
| a bracket finishes in profit | **39.2%** of the time |
| Brier of saying 39.2% every time | **0.2384** |
| Brier of saying 50% every time | 0.2500 |
| Brier of saying 100% every time | 0.6076 |

**0.2384 is the number to beat**, not zero. The skill score reports it directly: positive means better
than having no opinion at all, negative means worse.

The base rate is not flat across charts — it runs from about 30% at the tenth percentile to 50% at
the ninetieth — so there is real chart-to-chart signal for a forecaster to find. Saying 39% on
everything is the floor, not the ceiling.

### 18.4 The curve says which half you are missing

Murphy's decomposition splits the Brier exactly:

```
Brier = reliability − resolution + uncertainty
```

- **Reliability** — does 70% mean 70%? This is the distance from the diagonal, and the thing an hour
  of training moves.
- **Resolution** — do you say *different* numbers on different charts, and turn out to be right? A
  forecaster who says 39.2% on every chart is perfectly calibrated and has learned nothing about any
  individual chart.
- **Uncertainty** — the outcome's own variance. It belongs to the corpus and no amount of skill
  moves it.

Reporting only the Brier would leave you unable to tell which half you lack, and the two have
opposite remedies: one says *be less certain*, the other says *have more of an opinion*. Both are on
the stats page, with the curve drawn bucket by bucket so the side of the diagonal you sit on is
readable at a glance.

Nothing is diagnosed below **30 forecasts** — the same floor §16.3 uses for the regime cells and
§17.4 for the style fingerprint. Ten proportions over twenty forecasts is ten pieces of noise
arranged to look like a diagnosis. The curve is drawn as it fills; the sentence waits.

### 18.5 What is not built

§10.1 describes a *different* calibration mode: draw a box, at a fixed 80%, and be scored on whether
price stays inside it. **It is not implemented, and as written it cannot be** — `docs/phase-5-research.md`
§2.2 shows why. Fixing the probability and letting the player choose the event inverts what makes a
scoring rule proper: the widest box always wins, and nothing in the sentence charges for width.

Repairing it needs Winkler's interval score, which does charge for width — but that rule needs a
**scalar** outcome, and *"stays inside the box over the next N bars"* is a property of the whole path.
So the box mode needs a decision first: ask about the price at bar N, which the interval score can
grade, or keep the path question and accept that no proper rule scores it.

Measured, for whenever that decision is taken: an 80% box price never leaves is **9.73 ATR** wide,
against **5.83 ATR** for an interval containing the final close — the path version asks for a box
1.67× wider at the same nominal coverage.

---

## 19. Storm and Streak

§10.1: **Storm** — *"Three-minute clock. +1 per chart where you beat the distribution median. −10
seconds when stopped out. Combo bonuses at 5, 12, 20 and 30 and every 10 thereafter."* **Streak** —
*"Untimed. The run ends on the first sub-median result. One skip per run."*

Play either from the home screen, or at `/play?mode=storm` and `/play?mode=streak`.

They exist because one chart a day cannot produce a thousand reps. §3 reclassifies the daily as a
distribution mechanism rather than a retention one and promotes these two from "later" to core, and
every unanswered question in this project is waiting on the volume they make: calibration will not
speak until 30 forecasts (§18), the style fingerprint until 152 rounds (§17.4), and §7.2's
synthetic-control comparison needs more than either.

A run is a **wrapper over ordinary rounds**, not a second kind of round. The player issues from
`/api/round` and commits to `/api/round/[id]/order` exactly as in free play; the only difference is
that the round carries a `run_id` and the commit reports what the run did in response. One scoring
path, deliberately — a second one would drift from the first, and these are precisely the modes whose
volume feeds measurements taken everywhere else.

### 19.1 The rule §10.1 does not contain, and both modes need

Both are scored on beating the **distribution median** — `par_r`, the median of the 98 enumerated
brackets. Measured over the corpus, net of costs (§16.1):

| | |
| --- | --- |
| charts where `par_r` is negative | **950 of 1,000 — 95.0%** |
| mean `par_r` | **−0.792R** |
| what a pass scores | **exactly 0R** |

So **a pass beats the median on 95 charts in 100**, and both modes as §10.1 writes them are trivially
farmed: pass every chart in Storm for +1 each, or pass forever in Streak and never post a sub-median
result.

Neither number is a mistake. §4.4 means it when it says restraint is a real move, and §16.1 measured
that the median bracket loses money. What is missing is a statement of what a *pass* does when
"beat the median" is used as a game objective.

**Streak already carries its own fix, and §10.1 supplies it: one skip per run.** That is the pass,
rationed. A pass with no skip left ends the run rather than being rejected — a rejected move would
let a player sit on a chart they disliked until the mode offered a different one, which is
cherry-picking with extra steps and a risk §15 names in its own right.

**Storm has no such limit in the specification, so one is added here and marked as ours: a pass
scores nothing.** Not a point, not a penalty, just the clock. Passing then costs exactly what it
should — time — and a player who passes everything finishes a three-minute run on zero.

### 19.2 Storm's three minutes are decision time

This changed after the mode was played, and the reason is worth recording.

A round takes about **eleven seconds** end to end, of which roughly ten are the reveal animation and
one is the decision. Under a wall-clock deadline a three-minute Storm is therefore mostly a queue for
the animation: the score is set by how fast the reveal plays, not by how fast a player reads a chart.

And the reveal can be skipped. So the optimal strategy under a wall clock was to commit and
immediately skip — **to never look at the outcome**, which is the one thing this product exists to
make people do. A scoring rule that pays players to stop learning is not a scoring rule worth having.

So the clock is a budget of decision time. Each round charges `committed_at − issued_at`; the reveal,
the debrief and the pause between charts are free. §10.1's three minutes and its ten-second stop
penalty are unchanged — what changed is which seconds count. Nothing is lost by the switch: a player
who opens a chart and walks away is still charged for every second of it.

The budget is **server-authoritative**, on the same argument §17.5 makes for metering the Manage
reveal: the mode's entire scarcity is the clock, so a client that owned it would own the score. The
figure on screen is a display of the server's last word, reset by every commit.

### 19.3 The combo bonus is the rung

§10.1 asks for *"a flat penalty against a superlinear bonus"* and does not say what the bonus is.
Ours: **the bonus at each rung is the rung itself.** Five in a row pays 5, twelve pays 12.

That makes the cumulative reward grow faster than the run length — twelve charts scores 12 + 5 + 12 =
29, against six charts scoring 6 + 5 = 11, so a run twice as long is worth more than twice as much —
while staying a number a player can compute mid-run.

A pass does not break a combo. It did not fail, it declined, and ending a run of twelve because a
player correctly stood aside would punish the exact move §4.4 rewards.

### 19.4 What ends a run

| | Storm | Streak |
| --- | --- | --- |
| clock | 3 minutes of decision time | none |
| a sub-median result | costs the combo | **ends the run** |
| a stop-out | −10 seconds | ends the run, like any other miss |
| a pass | scores nothing | spends the one skip; the next one ends the run |

Storm ends only on the commit that spends the last of the budget. The client never ends a run — it
cannot even end its own, because a client that could would be a client that could end one early.

The chart a player is on when the budget runs out **counts as seen and scores nothing**: a quiz does
not credit the question you were still answering when the bell went. Both halves matter — an earlier
build dropped that chart from the count entirely, so a run that ended on its first chart reported
having seen none.

### 19.5 Known limits

**A refresh abandons the run.** Run state lives in the surface, so reloading mid-run starts a new one
and leaves the old row alive in the database. A run is a sprint rather than a session, and resuming
one is not built.

**Storm inherits the per-round decision clock from its ruleset**, so a single chart can cost up to
90 seconds of a 180-second budget. The two clocks measure the same thing at different scales and do
not conflict, but only one of them is §10.1's.

**Neither mode is rated.** These are volume generators; §12's ladder is not fed by them.

---

## 20. Maps

§11 is the part of the scope with a commercial argument attached: *"Maps convert Hindsight into
infrastructure that other people build businesses on top of."* This section is what shipped, and the
two claims in §11.1 that did not survive being measured.

**A map is a tape.** The product's word is "tape" and §11's is "map"; they are the same thing, and
`/tapes` is where both live. §11.1's official maps and §11.2's creator maps differ in exactly one
column — whether `owner_id` is null — and run through the same issuance, the same chart count and the
same ruleset lock.

### 20.1 The rule is published, not merely applied

§11.1: *"Every official map is defined by a published filter over the regime tags and theme tags, not
by hand-picking, so the map's difficulty distribution is reproducible and its statistics are valid."*

Every predicate a map may use reads a **stored tag computed from the lead-in**:

| | |
| --- | --- |
| regime | `regime_er_bucket` — trend, directional, chop, noise |
| volatility | `regime_vol_bucket` — violent, active, subdued, quiet |
| themes | §13.8's six formations; a chart qualifies on *any* of them |
| drift | `lead_in_drift_atr`, the move across the visible window |
| council | `council_minority > 0` — the schools take opposite sides |

The vocabulary is closed on purpose. A filter over anything derived from the reveal would announce
part of the answer in the map's own definition, which is precisely why **The Null Set is locked**: its
filter reads `par_r`, so the map's name would tell a player most brackets lose there before they
traded. The council filter is legal under the same rule, because the council reads the lead-in alone.

**Hand-picking is not built**, and §11.2 offers it. A set someone chose chart by chart has no
reproducible difficulty distribution, so every percentile computed on it is conditioned on that
choice in a way nobody can state. It is unbuilt rather than refused: it returns when there is an
honest answer for what its leaderboard means.

### 20.2 Two of §11.1's descriptions were wrong

**The Drop and The Ramp are the same map, reflected.** §11.1 describes Crash as *"violent downside,
volatility expansion, failed bounces"* and Euphoria as *"parabolic advances, shallow pullbacks,
blow-off tops"* — a claim about asymmetry, and one of the better-supported regularities in the
literature. This corpus cannot contain it: §12.2 mirrors half the charts at random, so half of every
displayed crash is a mirrored rally.

Measured at the ±8 ATR threshold the two maps use: **135 charts fall in one, 138 in the other.** Of
the 453 charts past ±6, 237 are in the down tail against an expected 226.5 under a fair split — 0.99
standard errors. Both cards say so. What they train is reading a chart that has been going against
you for sixty candles, which is a real skill and not a claim about crash dynamics.

**Split Decision is not "the hardest map in the game".** §5's own exit condition asks whether engine
disagreement predicts difficulty, and it does not:

| group | n | median `par_r` | median pass %ile |
| --- | --- | --- | --- |
| council split | 71 | −1.022 | 0.612 |
| council agreed | 38 | −1.021 | 0.602 |
| one school spoke | 222 | −1.020 | 0.612 |
| council silent | 669 | −1.018 | 0.622 |
| **all charts** | **1,000** | **−1.019** | **0.612** |

Welch's *t*, split against everything else: **0.10** on `par_r`, **0.79** on pass percentile. Flat.
The minority side also never exceeds one anywhere in the corpus, so *"where the engines disagree
most"* is not a spectrum to sort by — it is a single 71-chart set. It ships for what it is: the 7.1%
where two published methodologies read the same candles and reach opposite conclusions.

### 20.3 Drift, and the error that looked like a finding

`lead_in_drift_atr` is `ln(last / first) / (atr14 / entry_price)` — a log return over a relative ATR,
computed on the mirrored bars, so it is the direction the player sees.

The obvious definition, `(last − first) / atr14`, gave **88 charts past −10 ATR and 39 past +10**:
4.4 standard errors from a fair split, a large asymmetry, pointing exactly where the literature says
it should. It was the measurement. §12.2's mirror is `BASE² / p`, exact in *log* space, so a linear
difference is not the negation of its original; and `atr14` is an absolute price distance, so a chart
that fell sits at lower prices with a smaller ATR. Corrected, the same corpus reads **65 and 65**.

The obvious *fix* is wrong too: a geometric mean over the window looks more principled than a single
price and misses by 29%, because `atr14` is Wilder's ATR(14) and is anchored at the **end** of the
lead-in. The denominator has to be measured where the numerator's ATR is.

What remains is second order in the total move — 1.3% over a window that travelled 3%, 2.6% at the
±13 ATR tail where the maps live, 19.1% over 61%. `tests/map-filters.test.ts` pins it as a property:
mirroring a chart must negate its drift.

Nothing but the mirror made any of this checkable. Random mirroring **cannot** produce a directional
skew, so the number was falsifiable on its face; a corpus without that property would have shipped
it.

### 20.4 The tier lock

§11.2: *"a tier lock, so an operator can require that their cohort plays at Naked and the results are
comparable."* Tapes always carried a `tier` column and nothing read it — the launcher's choice won,
so it was a suggestion.

It is enforced in `/api/round`, because that is what turns a ruleset into a candle count, a tool
grant and a clock. Three properties, all of which failed at least once when first built:

- **Shown, not silently applied.** A player who picked Full Desk and got Naked without being told
  would reasonably conclude the ladder was broken.
- **Mods are cleared too.** Ours, not §11.2's — a mod changes affordances exactly as a tier does, and
  "comparable" cannot mean "comparable except for whichever mods each student picked".
- **It fails closed.** A lookup error refuses the round, and a lock naming a ruleset that no longer
  resolves refuses it too, rather than issuing the default and recording it as the required one. Open
  is the direction that silently invalidates a cohort's data.

### 20.5 Visibility

| | |
| --- | --- |
| **public** | listed |
| **unlisted** | the slug is the secret, which is what a share link is — named honestly rather than called private |
| **private** | enforced in `issue_round` against the caller, so the play URL fails for everyone else too |

A private map answers exactly as a missing one does: **404, never 403**. The two differ only in
whether they confirm the thing exists, and confirming that is the one thing private has to withhold.

### 20.6 The cohort dashboard, and what it cannot claim

§11.2: *"Cohort dashboards for the owner: aggregate scores, weakest axes across the group, per-student
progress, per-theme ratings."* All of it ships at `/tapes/<slug>/cohort`, owner-only.

**It is the one surface in this product with no null behind it.** Every other number here is
published beside a measured baseline — a shuffle, a coin flip, a random engine. There is no second
cohort to compare a cohort against, and no baseline for what a group of a given size should score on
a map of a given difficulty. The page says that on itself.

With one player it says more: *"a cohort's weakest axis needs a cohort; this is one person's weakest
axis with a wider heading."* Sample sizes are on every figure, an axis under five rounds is not shown
at all, and the §4.9 gate that governs a player's own percentile governs these too.

Two honest limits stated on the page rather than buried: there is **no invitation mechanism**, so a
cohort is whoever played the map — the public, for a public map. And a chart carries several themes
and counts towards each, so the axis counts sum to more than the round total.

`rounds.tape` is what makes any of it possible, and nothing recorded it until 5d. Rounds played
before then carry null; inferring the map from a chart's tags would be a guess dressed as data, since
most charts qualify for several.

---

## 21. Duels and races

§10.1's last two modes, and the only two whose value depends on other people existing. What follows
is what shipped, plus the two justifications §4.3 gives for the duel format — **both of which are
wrong**, one unnecessary and one crediting the wrong mechanism.

| | §10.1 |
| --- | --- |
| **Duel** | *"Two players, identical charts, health-bar damage equal to the compressed score difference. Escalating multiplier, capped per round in ranked, uncapped in casual."* |
| **Racer** | *"Five to ten players, same charts, ninety seconds, live positions."* |

Play either at `/versus`. Neither is rated — §12's ladder is not fed by them, on the same argument
§17 made for Manage: a format has to be shown to measure the same skill before it may move a rating
that means something else.

**For a while the code disagreed with that paragraph.** A match round was written as an ordinary
Naked round, and the order route rated it like one, so duels and races moved the ladder while the
screen said "unrated". The order route now skips the rating update for any round with a `match_id`.
Ratings already moved by match rounds before the fix were not recomputed.

### 21.1 One primitive, two scorers

Both modes need something nothing else in this product has: **a fixed, ordered chart sequence that
several players play independently and are scored against.** A duel is two players on that sequence
with a health bar; a race is *n* players on it against a clock. That is why they ship together.

**A duel's charts are drawn when the second player joins.** Every other mode picks charts the player
has not seen — `issue_round` carries a `not exists` clause for exactly that — and a duel cannot,
because both players must get the *same* charts. A chart either has already played is one they have
already been shown the answer to.

So the sequence is drawn from charts **neither** has played, which requires knowing both, which is
why **a duel is a link rather than a lobby**. If the map cannot supply enough charts unseen by both,
the join fails and says so: it does not shorten the duel and it does not reuse a chart one player
knows.

That also makes the mode asynchronous for free, which matters a great deal for a product whose
player base is currently one person. Each chart resolves as the *second* player finishes it; until
then the round reports `pending`, and that is the common state rather than an edge case.

A race cannot do this — its later runners are unknown when the sequence is fixed — so a runner who
has already seen a chart in it is **flagged**, not quietly ranked beside people who had not. The run
is real and the player is entitled to it; what they are not entitled to is silent comparison.

### 21.2 The escalating multiplier is withdrawn

§4.3 justifies it twice: it *"manufactures comebacks and guarantees termination"*, and uncapped it
*"makes round order decisive rather than round quality"*.

The null for all of this is **two players picking at random**, which is what a bracket chosen at
random does against the achievable distribution by construction. 20,000 duels per cell:

| schedule | health | cap | median rounds | p99 | unfinished | agrees with total IMP |
| --- | --- | --- | --- | --- | --- | --- |
| **flat (none)** | 40 | **yes** | **8** | **15** | **0.0%** | **99.4%** |
| flat (none) | 40 | no | 8 | 15 | 0.0% | 100.0% |
| ×1 per 3 rounds | 40 | yes | 7 | 11 | 0.0% | 93.7% |
| ×1 per 3 rounds | 40 | no | 5 | 9 | 0.0% | 92.7% |
| doubling per 5 | 40 | yes | 8 | 12 | 0.0% | 95.4% |
| flat (none) | 100 | yes | 23 | 33 | 0.0% | 98.7% |
| ×1 per 3 rounds | 100 | yes | 15 | 20 | 0.0% | 90.0% |

**Termination never needed it.** Nothing failed to finish in any cell, including with no multiplier
at all. Damage averaging 8 a round against a 40-point bar is what guarantees termination; escalation
only makes the duel shorter.

**Escalation is itself what makes round order decisive.** Weighting later rounds more heavily is
exactly a statement that the same results in a different order should give a different winner, and it
costs **6 to 10 points** of agreement with total score — the direct test of §4.3's own concern.

**And the cap is not the remedy §4.3 credits it as.** It moves agreement by 0.6 to 2.7 points, and at
health 100 with escalation it moves it the *wrong way* (90.6% uncapped against 90.0% capped).

What remains of the multiplier's case is "manufactures comebacks" — entertainment bought with
correctness, and §4.3 opens by rejecting that exact trade for the ranked ladder. So damage is flat.

**The cap stays**, for the thing it actually does: 16.2% of rounds against the null are at or above
15 IMPs, and without it a single catastrophic chart can end a duel outright.

### 21.3 What ships

| | |
| --- | --- |
| health | **40** — ours; §10.1 asks for a bar and never sizes it |
| damage | the IMP difference, flat |
| cap | **15**, §10.1's, and the same number as the ranked IMP bound because it is the same scale |
| a chart both read equally well | **does nothing** |

Health 40 puts an even duel at a median of 8 charts and a p99 of 15 — a sitting. The honest failure
mode is left visible rather than tuned away: **two strong players take a median of 17**, because they
differ less.

The format is fair and it detects skill:

| matchup | stronger player wins |
| --- | --- |
| even | **49.9%** |
| slight edge | **93.1%** |
| clear edge | **99.9%** |

### 21.4 The engines cannot duel, which is a finding about the mode

The eight engines are the only opponents with a measured record over the corpus. Across all 28 pairs
and all 1,000 charts:

| | engines | random players |
| --- | --- | --- |
| mean damage | **1.05** | 8.06 |
| rounds doing zero damage | **79.5%** | 4.3% |
| rounds at or above the cap | **0.0%** | 16.2% |

**Four rounds in five are a draw**, and the cap never binds once. The cause is §14.4's silence
figure: no school takes a position on 66.9% of charts, a pass is 0R scored against the same
distribution for both players, and IMPs are a compressed integer scale — so two engines that both
stand aside record identically.

That is a warning about the mode, not about the engines: **a duel between two players who mostly
agree does not move a health bar.** Whether real players agree more like the engines or more like the
null decides whether duels are tense or tedious, and it needs players to answer.

### 21.5 Racer cannot be what §10.1 describes

*"Five to ten players, same charts, ninety seconds, live positions."* Five simultaneous humans is not
something this product can produce, and filling a lobby with bots is the one move it exists to avoid
— a leaderboard whose opponents are fabricated is worse than no leaderboard.

What ships is a **ghost race**: the same fixed sequence, and opponents who are *recordings* of people
who ran it earlier, labelled as recordings. No simultaneity is needed, it works with a player base of
one and improves as that grows, and "live positions" survives intact — a recording's position at each
second is known exactly.

A race is scored on **IMPs, not charts finished**. Rushing eight badly loses to reading three well,
and ties break towards the player who needed *fewer* charts. Making raw speed the objective would
reward exactly the guessing the rest of this scoring model exists to discourage.

## 22. Trading

> **§23 keeps this section's exchange and retires its accounts.** §23.9 says which rules survive
> into a round. The platform's pages, its API and the code only they used are gone; its pages
> redirect to the game's. What follows is kept, as the earlier sections are, because every session
> stored under it can still be re-derived from its log by `src/core/trading/`.

The platform that replaced the game. A trader gets a $100,000 paper account, a real market from the
Binance archive replayed minute by minute, and an exchange that fills orders against the real
minute bars and charges for every one of them. Every rule below is enforced in
[`src/core/trading/`](../src/core/trading/) and pinned to `SIM_VERSION`, `FEE_VERSION`,
`MARGIN_VERSION` and `INSTRUMENT_VERSION` in [`src/core/versions.ts`](../src/core/versions.ts);
every session stores the versions it ran under.

Where a number is published by Binance it says so. Where it is ours, it says that.

### 22.1 The market

A session is **one corpus chart**, shown as the instrument it really was.

- **History**: up to 300 hourly bars before the replay (`lead_in_bars` plus `lead_in_extra`), and
  the one-minute bars under the last 80 of them (the first half of `detail_path`).
- **Tape**: the 60-hour reveal, **3,600 one-minute bars**. Fills walk `resolution_path`, the array
  every stored bracket was resolved against, so a session and a bracket on the same chart agree to
  the minute. Volume comes from the reveal half of `detail_path`.
- **Real prices.** A stored chart is indexed to 100 and, about half the time, mirrored (§1). Both
  are undone: un-mirror first, then divide by `index_factor` — the reverse of the order the
  pipeline applied them. Volume is multiplied back by `volume_base`.
- **Only real charts are dealt.** Synthetic controls (§16) are never a market: a generated walk
  under a real ticker would be a lie about the product's one claim.

**Tick and step are derived from the price at the start of the replay**, because the corpus never
stored Binance's filters and they are unrecoverable for delisted pairs:

    e    = floor(log10(price))
    tick = 10^(e − 5)        about six significant digits
    step = 10^(−1 − e)       so tick × step = 10^−6 exactly

A price in ticks times a quantity in steps is a notional in **micro-USDT**, an integer, so the
whole ledger — cash, fees, realised P&L — is exact integer arithmetic. BTC at 43,000 gets a 0.1
tick and a 0.00001 step, which is close to what Binance uses. The smallest order is **$5** of
notional, Binance spot's `MIN_NOTIONAL` for USDT pairs.

**Markets are dealt** at random (preferring markets the account has not traded), by pair, as
today's market (the same chart for everyone, chosen deterministically from the day number), or by
scenario — an official tape (§20) whose filter picks markets by what they were doing before the
replay. A tape's drift bounds are applied to the **real** drift: a mirrored chart's stored drift
has the other sign, so The Drop deals markets that really fell. A locked tape is never dealt.

### 22.2 The clock

The server keeps the replay clock, and nothing the browser says moves it.

- The state is an **anchor**: at server time `anchorAt`, `anchorRevealed` minutes had printed, and
  since then the replay has run at `speed` tape-minutes per second. Play, pause, a speed change and
  a step all re-anchor at the present, so the arithmetic never accumulates drift.
- **Speeds** are 1, 5, 15, 60 and 240 tape-minutes per second. The default, 15, plays a session in
  four minutes. A **step** reveals a whole number of minutes while paused.
- **A lease.** The clock runs only while the trader keeps asking for it: every request extends a
  15-second lease, and if it lapses the clock stops at the moment it lapsed. A replay that ran on
  in an empty room would fill stops and liquidate a position nobody was watching.
- Updates are **compare-and-swap** on a version number, so two tabs cannot race the clock.
- A session opens **paused** at the decision close, with nothing of the tape revealed.

### 22.3 Orders

| | |
| --- | --- |
| **side** | buy or sell. Selling with no position opens a short. |
| **type** | market, limit or stop |
| **quantity** | whole steps, at least $5 of notional |
| **take-profit / stop-loss** | optional, attached to an entry; a one-cancels-other pair |
| **reduce-only** | may only shrink the position |

- **One position per market**, signed. Buying more scales in; selling part scales out; selling more
  than is held flips the position, realising the old side first.
- **Take-profit and stop-loss** wait, pending, until their entry fills, then become working
  reduce-only orders sized to the entry. When one fills the other is cancelled. If the position is
  closed some other way, they are cancelled with it.
- **Modify** changes a working order's price, stop price or quantity. A limit moved through the
  market fills at once, as a taker; a stop moved through the market is rejected.
- **Close position** sends a reduce-only market order for a fraction of the position.
- **End session** cancels everything and closes the position at the last price.

Every order is checked when it is placed, and rejected with a reason: below the minimum notional,
a bracket on the wrong side of the entry, a stop that would trigger the moment it is placed, a
reduce-only order with nothing to reduce, too large for the market's liquidity, or more than the
buying power allows (§22.6).

**The liquidity guard is ours.** An order may not exceed **5% of the trailing 24 hours' traded
value**. The tape is history, and a size history could not have absorbed would fill at prices that
never existed.

### 22.4 Fills

The exchange generalises the bracket resolver (§3) from one bracket to an order book.

1. **Time.** An event stamped at minute `i` happens at the close of minute `i`, after that minute's
   intrabar fills. A resting order placed at `i` is live from minute `i + 1`. The browser sends
   only intent; the server stamps the minute.
2. **Market orders** fill at once at the last trade price — the close of the latest printed minute
   — buying the ask and selling the bid: the close plus or minus half the spread. Taker.
3. **Limit orders** fill when the market trades through them: a buy when the minute's low (plus
   half the spread) reaches the limit, at the limit or at a better open if the minute gapped
   through it. Maker. A limit that is already marketable when placed fills at once, as a taker.
4. **Stop orders** trigger on the wick and fill at the trigger or at a worse open, across half the
   spread **plus stop slippage** (§22.5). Taker.
5. **Inside one minute** the path is open → low → high → close or open → high → low → close, and the
   bar cannot say which. Whenever two or more levels sit inside the bar, **both orders are
   simulated; if they disagree, the one that leaves the account poorer at the close is taken**, and
   its fills are flagged `ambiguous` and counted in the review. For a single stop-and-target
   bracket this is exactly §3's stop-first rule, and a test holds the two equal on 500 paths.
   Among levels equally far from the open, liquidation comes first, then stops, then limits.
6. **Buying power is checked twice**: when an order is placed, at its expected price, and again
   when it fills, at its fill price. An order that would breach it at the fill is cancelled with
   its take-profit and stop-loss.
7. **The end of the tape** cancels every order and closes the position at the last close, as a
   taker.

Everything is integer arithmetic, so replaying the same log over the same tape produces the same
account to the micro-dollar. **The account is the replay of its log** — nothing else about a
session's money is stored as authoritative — and a test holds that an incremental replay equals a
fold from the start, and that changing the future changes nothing about the past.

### 22.5 Costs

| | value | source |
| --- | --- | --- |
| maker commission | **0.10%** of notional | Binance spot VIP 0, published |
| taker commission | **0.10%** of notional | Binance spot VIP 0, published |
| half spread | **1 bp**, at least one tick | **ours** — the corpus has trades, not quotes |
| stop slippage | **5 bp** | **ours**, as in §16.1 |
| liquidation fee | **1%** of what is closed | **ours** |

**Commission and spread are separate charges.** The spread moves the fill price; the commission is
a line on the statement, rounded against the trader to the micro-dollar. (The game folded both into
one "spread" and charged half of it each way — §5.) A market order round trip therefore costs about
22 bps; a stop-loss exit costs 5 bps more.

### 22.6 Margin and liquidation

- **Buying power.** The position plus every resting order that would add to it may be worth up to
  **2× equity**, long or short. Reducing exposure is always allowed.
- **Maintenance.** When equity falls below **25% of the position's value**, the position is
  **liquidated**: every order is cancelled and the position is closed at the liquidation level, or
  at the open if the market gapped through it, less the spread and stop slippage, with the
  liquidation fee on top of the taker commission. The level is shown on the terminal.
- **Bankruptcy.** If a liquidation leaves equity at or below zero, cash is set to zero and the
  account is **bankrupt**: it can open no session until it is reset.

### 22.7 Profit and loss

- **Equity** = cash + the position valued at the last trade price. **Unrealised P&L** is that
  position's value minus its cost basis.
- **Realised P&L** is booked when a position shrinks or flips, against the average cost of what was
  held. Fees are kept apart and shown separately; net P&L is both.
- **A round trip** runs from flat to flat (a flip closes one and opens the next). Each records its
  side, average entry and exit, largest size, fees, net P&L, and its best and worst moments in
  dollars (MFE and MAE) on the minute path.
- **Session figures**: return on the session's starting equity, fees, round trips, win rate (round
  trips that made money after fees), profit factor (gross profit over gross loss), maximum
  drawdown on hourly equity, and ambiguous fills.
- **Benchmarks** in the review, at the largest size the trader held: buying at the decision close and
  selling at the last close, and the best single long and best single short the tape allowed in
  hindsight — market orders at minute closes, across the spread, with fees.

### 22.8 Accounts and sessions

- **Two accounts per trader.** **Main** is ranked and never shows dates while a session is open.
  **Practice** may show the real dates and is never ranked. Both start at $100,000.
- **Money carries.** A session starts at the account's equity and its result is the account's new
  cash; there is no reset between sessions. **Reset** archives the account — its history is kept —
  and opens a fresh one at $100,000; it is refused while a session is open.
- **One open session per account**, because margin is account-wide. Opening another returns the one
  already open.
- **Today's market** is once per account per day.
- **Accounts belong to the browser until the trader signs in.** Signing in adopts the anonymous
  accounts, or archives them if the user already has their own.
- A session **finalises once**, in one transaction: its summary, fills, round trips and equity
  curve are written and the account is updated together, so a result can never be booked twice.

### 22.9 Integrity

Enforced at the API boundary by `tests/trading-api-leak.test.ts`, which was removed with the API
(§23.9 says what the game keeps of it; `tests/game-views.test.ts` checks the game's version):

- **No minute the server clock has not reached is ever sent.** Every response carries bars only up
  to the revealed minute, and the review of an open session is refused.
- **No date while a session is open** — no calendar date, no year, no epoch — unless it is a
  Practice session with dates turned on. The weekday and the time of day are real; the date
  arrives with the review.
- **Nothing about how the chart was stored**: not its id, its index factor, whether it was mirrored,
  or its raw paths.
- **A session belongs to its account.** Anyone else asking about it is told it does not exist.
- **Today's market keeps its date until the day rolls over**, even in the review, and its board —
  every trader's result on it and every school's — opens only to a trader whose own session on it
  has closed. A session still open is trading the very market the board describes.
- **The tables are unreadable without the service-role key**, as in §6.

A determined trader can still recognise a famous market from its pair, its price and the time of
day. The mitigations are the ones above: the date is held back, dated play is never ranked, the
daily's date and board are embargoed, other traders' sessions are never listed by market, and a
board needs ten sessions before it ranks anyone.

### 22.10 The schools as traders

Every engine on the council (§14) trades its own $100,000 account, on every real market in the
library in the order history dealt them. The engines are **unchanged**: `Engine.read` is called
exactly as the council calls it, so `THRESHOLD_HASH`, the look-ahead suite and the published base
rates still describe the same rules. What a bot adds is pinned by `BOT_SPEC_HASH` under
`BOT_VERSION`, and changing it starts a new account rather than rewriting the old one.

- **Reads.** At every hourly close while flat, the bot shows its engine every closed bar — the
  stored history plus the tape hours so far, indexed and un-mirrored, as the council sees a chart.
  A mirrored chart read as stored would turn a long-only school into a short seller on half the
  corpus.
- **Entries** are market orders at that close, with the engine's stop attached as a stop-loss.
- **Sizing**: the stop costs **1% of equity**, capped by buying power; an order below the minimum
  notional is skipped.
- **Exits** are each school's own:

  | school | exit |
  | --- | --- |
  | Channel (the Turtle) | the opposite 10-bar extreme of the bars *before* the one traded, as a trailing stop |
  | Reversion, and our variant | the first close beyond the 5-bar average, over the full history |
  | Tape | an opposing signal from the engine |
  | Sweep, Pattern, Geometry | the engine's stop and target, resting |
  | Engine Zero | a 2 ATR stop and a target twice as far, then flips again: always in the market |

- **Two exit bugs were fixed on the way.** The measurement helper in `scripts/engines.ts` compared
  the Turtle's close to a window that included its own bar — a close can never be below its own
  bar's low, so the exit almost never fired — and took Connors' average over the reveal only. What
  `src/core/engines/baseRates.ts` publishes as those schools' native exits was measured under the
  old code and is due a re-measurement.
- **Recorded offline**, by `npm run bots -- --write`, through the same finalise path a trader's
  session ends with. A bot's log replays to its account like anyone's.

### 22.11 Leaderboards

- **Ranked by money**: return on the account, win rate, maximum drawdown, sessions or profit
  factor.
- **A sample before a rank.** A trader appears after **ten** closed Main sessions, and only signed-in
  traders are named. Practice never reaches a board.
- **The schools are on the board**, tagged as schools, at the current bot version.
- **Today's market** has its own board, ranked by session return, with the schools' sessions on the
  same market beside the traders'. It opens only once the trader's own session on it has closed
  (§22.9).

## 23. The game

> **Written before the code, then built to it.** This section was written first, so its edge cases
> were decided before anyone played them — the argument this document opens with — and the game was
> then built in [`src/core/game/`](../src/core/game/) and [`src/lib/game/`](../src/lib/game/), pinned
> to `GAME_VERSION`. Where building it showed a rule could not stand as first written, the rule was
> changed here and says so. Every number marked **ours** is a first setting, not a measurement, and
> §23.10 lists them.

Hindsight is a game again, and nobody holds money in it. **A round is one tape and a fresh $500.**
The player reads the history, draws on it, places one trade with its take-profit and stop-loss, and
locks it in. Then the tape plays. When it ends, the result is **graded from 0 to 1000 against the
best and the worst trade that tape allowed** (§23.3).

That grade is the only number the game has, and every mode is a way of using it:

| mode | what the grade does |
| --- | --- |
| **Training grounds** | it is the score (§23.5) |
| **Duel** | the gap between two players' grades is damage to whoever graded lower (§23.6) |
| **Against a school** | a duel whose opponent is a school; afterwards the player reads what it saw and why (§23.7) |

This replaces §22's accounts, not its exchange. A round is placed, filled and charged exactly as
§22.3–22.5 describe, on the market §22.1 describes, under §22.9's integrity rules. What goes is
everything that made money persistent, and §23.9 lists it rule by rule.

### 23.1 A round

- **One tape**, dealt as §22.1 deals a market: up to 300 hourly bars of history, then the 60-hour
  tape of 3,600 one-minute bars. Only tapes that move enough are dealt (§23.4), and never one the
  player has already played.
- **A stake of $500, every round.** Nothing carries in and nothing carries out. The stake is the
  same for everyone so that a dollar means the same thing on every screen, but the grade divides it
  out (§23.3): a round would grade the same at $50 or $5,000.
- **No clock.** The player reads for as long as they like. A duel is asynchronous (§23.6), so nobody
  is kept waiting.
- **One trade, or none:**

  | | |
  | --- | --- |
  | **side** | buy, or sell to open a short |
  | **size** | a dollar amount, at least $5 (§22.1's minimum) and at most **$500**. The quantity is worked out at the price the entry expects to trade at — the ask or bid for a market entry, its own price for a limit or a stop — and rounded down, so a market or limit entry never costs more than the size. A stop that fills worse than its trigger can carry a little more, by its slippage or by a gap |
  | **entry** | market, filled at the decision close; or a limit or a stop that rests on the tape from its first minute |
  | **take-profit / stop-loss** | optional, attached to the entry, one cancels the other — exactly §22.3 |

- **Sitting out is a move**, not an absence. The round ends at $500 and is graded like any other.
- **An entry that never fills** leaves the round flat at $500: the same result as sitting out, and
  the same grade.
- **No leverage, and a round cannot lose more than its stake.** §22.6's buying power and
  maintenance margin do not apply. A position whose losses reach $500 is closed there, with no
  liquidation fee — only a short can get that far, by the price doubling — and the round ends at $0.
  Ours.

  > **This changed while it was built.** It first read that a short with no stop could lose more than
  > the stake. The exchange closes a position whose equity reaches zero rather than carry it below,
  > and keeping that is both simpler to explain and what a player would expect of a $500 stake.
- **The liquidity guard is off.** §22.3 refuses an order larger than 5% of the trailing day's
  volume. No $500 order comes near that on a real pair; the guard would only fire on a tape whose
  volume was badly recorded, and there it would refuse every order, the best and worst included.
- **A round locks in once**, and after that nothing changes: no modify, no cancel, no closing early.
  §22.3's modify, reduce-only, close-position and end-session are not available in a round.
- **The result** is the round's value when the tape ends: $500 plus its net profit or loss after
  every cost §22.5 charges. A trade still open at the end is closed at the last close, as §22.4
  closes one.

**Why set and forget.** A trade that can be managed while the tape plays turns "the best trade the
tape allowed" into a question about every decision a player could have made at every minute, and it
makes a duel depend on both players watching at once. Locked in, a round is decided the moment it is
placed: the server resolves it at lock-in and the replay only shows it. So the whole tape is sent
once the round is locked in, and the replay runs in the browser at whatever speed the player likes;
before lock-in not one minute of it leaves the server. Managing a live trade is a different skill,
and §17 kept it on its own ladder for the same reason.

### 23.2 The best and worst the tape allowed

The grade needs two numbers per tape: **the best and the worst result of any trade the player could
have locked in**. "Could have locked in" is literal — the orders §23.1 allows, at full size, filled
by §22.4 and charged by §22.5.

The tape's **biggest rise** is the largest gain from the decision close or any minute's low to a
later minute's high; its **biggest fall** is the largest drop from the decision close or any
minute's high to a later minute's low. Each is a share of the price it starts from.

- **Best**: buying the bottom of the biggest rise and selling its top, or shorting the top of the
  biggest fall and covering its bottom — whichever made more.
- **Worst**: the same two moves the wrong way round — buying the top of the biggest fall and stopped
  at its bottom, or shorting the bottom of the biggest rise and stopped at its top — whichever lost
  more.

Both are computed by the exchange's own fill code, so neither is a trade that could not have been
filled. As with the oracle (§10.2), the test suite will rebuild both as real orders and resolve them.

**They are mirror images, apart from costs.** The best and the worst are made of the same two moves,
so before costs they sit the same distance either side of $500. Both pay commission and spread; the
worst also pays stop slippage on both legs. Sitting out pays nothing, which is why it grades a
little *above* the middle (§23.3).

**Full size bounds everything.** A smaller trade moves its result towards $500 in proportion, so no
trade at any size, entered and exited anywhere, can land outside the two.

### 23.3 The grade

    grade = 1000 × (result − worst) / (best − worst)

rounded to the nearest whole point. 1000 is the best trade the tape allowed and 0 is the worst. It is
clamped to 0–1000 only as a guard: §23.2 makes a result outside the two impossible, so a clamp that
ever binds is a bug, and the test suite will say so.

**A worked example.** On a tape whose best trade ends at $650 and whose worst ends at $350 — a range
of $300:

| | ended at | grade |
| --- | --- | --- |
| A | $625 | 1000 × (625 − 350) / 300 = **917** |
| B | $400 | 1000 × (400 − 350) / 300 = **167** |

**Sitting out grades a little above 500**, because it is the only result that pays no costs. Under
§22.5's costs, estimated with the 1 bp half spread rather than the one-tick minimum:

| the tape's biggest move | best | worst | sitting out grades |
| --- | --- | --- | --- |
| 3% (the minimum, §23.4) | $513.88 | $483.37 | **545** |
| 5% | $523.87 | $473.34 | 528 |
| 10% | $548.84 | $448.29 | 514 |
| 20% | $598.78 | $398.18 | 508 |

That is restraint scored as §10.3 scored it: not a free 500 and not a penalty. A trade has to beat
it to have been worth taking, and on a tape that barely moved the bar is higher, because costs eat
more of what the tape offered.

**The grade does not care how volatile the tape was.** A 3% tape and a 30% tape both run from 0 to
1000, so a round on a quiet market counts the same as a round on a violent one. That is the point of
normalising, and §23.4 is its price.

### 23.4 Which tapes are dealt

**A tape is dealt only if its biggest rise or its biggest fall (§23.2) is at least 3%.** Ours.

Normalising divides by the tape's range, and on a tape that barely moved the range is a few dollars:
costs become most of it, and a small difference between two players becomes a large share of a
grade. A minimum move keeps the denominator large enough that a grade measures the reading rather
than the spread.

3% is a first setting. The share of the corpus it removes, and how that share falls across §7.4's
regime grid, will be measured and printed here before it ships. If it empties the `quiet` cells, the
threshold is wrong, not the cells.

Otherwise tapes are dealt under §22.1's rules — real charts only, never a synthetic control — and
never one the player has already played.

### 23.5 Training grounds

One player, one tape, one grade, and the grade is the score.

After the tape, the review draws **the best and the worst trades on the chart** beside the player's
own — the two §23.2 computed, with where each entered and exited — and shows the grade. The best
trade is the gold line the old game called Best in hindsight (§10.2). It is shown so the player can
see what the tape offered, not to suggest it was findable.

### 23.6 Duels

Two players, the same tapes in the same order, each starting at **1000 points**. Points are the
duel's health bar: they exist for that duel and carry nowhere.

- **Dealing is §21.1's.** A duel is a link; its tapes are drawn when the second player joins, from
  tapes **neither** has played, and every one passes §23.4. Each round resolves when the second
  player locks in, so the two never need to be online together.
- **Nobody sees an opponent's trade before locking in their own.** Afterwards, both trades play on
  the same chart.
- **Damage.** Each round, the player with the lower grade loses

      gap    = (higher grade − lower grade) / 1000
      damage = round(1000 × (e^(k·gap) − 1) / (e^k − 1)),   k = 2

  and points never go below zero. Equal grades do nothing. The winner of a round gains nothing:
  damage only comes off.
- **The end.** A duel ends when a player reaches 0, or after **10 tapes**, when the player with more
  points wins. Equal points after ten is a draw. Both ours.

**The curve is on the gap, not on each grade.** Curving each grade would move sitting out off its
place in §23.3 and change what the training grounds score. Curving the gap leaves every grade alone
and changes only how hard a round hits: a small gap barely hurts, and a large one hurts a great deal.

| gap | linear | **k = 2** | k = 3 |
| --- | --- | --- | --- |
| 0.10 | 100 | **35** | 18 |
| 0.25 | 250 | **102** | 59 |
| 0.50 | 500 | **269** | 182 |
| 0.75 | 750 | **545** | 445 |
| 0.90 | 900 | **790** | 727 |
| 1.00 | 1000 | **1000** | 1000 |

In §23.3's example A out-grades B by 750 points, a gap of 0.75, so B takes **545** and drops to 455.

At k = 2 a duel at a steady gap of 0.75 ends in **2 tapes**, at 0.5 in **4**, and at 0.25 in **10**.
That is the intended shape: a mismatch is over quickly, and two strong players, whose grades differ
less, play longer. Two players a steady 0.1 apart would need 29 tapes, which is why there is a limit
at ten.

**What the curve gives up.** §21.2 withdrew the old escalating multiplier because it made *round
order* decide duels. The curve does not: it is the same function every round, so the same rounds in a
different order deal the same damage, until a knockout ends the duel early. What it does give up, on
purpose, is that the winner is always the player with the higher total grade — one decisive round
outweighs several narrow ones. How often that overturns the total will be measured against two
random players before it ships, as §21.2 measured the multiplier, and k moves if the answer is
unreasonable.

**No per-round cap.** §21.3 capped damage at 15 of 40 so that one chart could not end a duel. Here a
one-tape knockout needs a gap of 1.0 — one player took the best trade the tape allowed and the other
the worst — and the curve already makes the near misses cost far less: a gap of 0.9 deals 790.

### 23.7 Against a school

A duel whose opponent is a school (§23.8), under §23.6's rules, with three differences:

- **The school reads first, once, offline.** Each school's read of each tape is made before any
  player is dealt it, and stored. Every player who meets that school on that tape meets the same
  read, and the school never sees anyone's trade.
- **Its trade plays live.** Once the player locks in, the school's entry, stop and target go on the
  chart beside the player's, and both play out on the tape together.
- **Its working opens when the tape ends**: the levels it drew, what it saw, why it took the trade,
  where it put its stop and target and why, and its grade.

A duel against a school is dealt from tapes on which **that school traded**, because a round against
an opponent who sat out is a round against sitting out's grade. That tells the player the tape held a
setup in the school's playbook — not which way it pointed — and it is stated on screen rather than
hidden.

### 23.8 What a school must be

§14's engines were built as an experiment. Each coded a published method literally and froze its
thresholds, to ask whether that method had an edge on this corpus, and the answer stands: none picks
trades better than a coin flip on the tapes it chooses, and the only thing on the roster that beats a
coin flip is not trading (§14.7). Together they sit out 66.9% of tapes, and Geometry never fired at
all (§14.5). That is the right way to test a book and the wrong way to build an opponent or a teacher.

So **the seven schools are retired as opponents.** Their measurements stay in §14 as the record, and
Engine Zero stays as a yardstick. A school that replaces them has to clear three bars:

1. **It speaks.** It trades on at least half the tapes it is shown — ours — and when it sits out, it
   says why.
2. **It shows its working.** Every trade carries a thesis in words, the levels it drew, a stop and a
   target placed at those levels, and a size. A read that would not pass §23.1's order checks is
   recorded as a sit-out with the rejection, never repaired.
3. **It beats sitting out on tapes it has never seen.** The corpus is split **by symbol** into
   development and held-out tapes, because two windows of one instrument are not independent draws
   (§14.7). A school is built and tuned on the first and graded once on the second. On the held-out
   tapes it trades, its grade must beat what sitting out grades on those same tapes — paired per
   tape, bootstrapped by symbol, one-sided, as §14.7 measures. Every version tried is counted, as
   §14.7 counts Sweep's three specifications, and the deflation that implies applies.

A coin flip is not the bar. §14.7 showed it loses money, so anything that trades less than it beats
it, skill or no skill. Sitting out is the bar, because sitting out is what the player could have done
instead.

**The first school is a pilot, and it is written by a model.** Given one playbook — price action:
trend structure, support and resistance, breakouts and retests — a language model reads the history
up to the decision close, draws the levels it uses, and returns one §23.1 order or a sit-out, with its
reasoning. It is graded on about 200 held-out tapes, a fifth of the symbols. If it clears the bars,
more playbooks follow the same way; if it does not, that is published here as §14's results were.

- **It reads what the player reads**: the same history, and nothing after the decision close (§8).
- **It reads the tape blind.** Prices are indexed to 100 as the corpus stores them (§22.1), with no
  symbol and no date, so the model cannot recall what that market did next. The chart is **not
  mirrored** for it, as stored charts sometimes are: a mirrored read would put its "support" under the
  player's resistance.
- **Its writing names levels, never prices.** Levels come back as data and are converted to real
  prices for the screen; prose that quoted an indexed price would contradict the chart beside it.
- **A stored read is final.** Changing the playbook, the prompt or the model makes a new school
  version with new reads, as `BOT_VERSION` did for §22.10's bots. Old reads are kept, never
  rewritten.

**As built.** The pilot is **Price Action**, version `price-action-1`; its playbook is printed word
for word on the Schools page and lives in [`src/lib/game/schools.ts`](../src/lib/game/schools.ts).
`npm run school` reads each tape once with `claude-opus-5-5` at high effort, asking for a structured
answer: a thesis, its reasoning, up to six named levels, and one order or a sit-out with the reason.
A request the model declines on safety grounds is re-run server-side on Anthropic's recommended
fallback model, and every read records which model answered. A trade the exchange would refuse is
stored as a sit-out with the refusal. `npm run school -- --report` prints the third bar on the
held-out fifth of the symbols: the paired difference against sitting out, a 95% interval
bootstrapped by symbol, a one-sided p, and how many versions of the school are stored, for the
deflation §14.7 demands.

A fixture reader — follow the last day's direction, stop beyond its extreme, target twice the risk —
exists so a school duel can be played on a local database without a model. It labels every read it
writes as a fixture, and the script refuses to store it anywhere else.

### 23.9 What survives from §22

| §22 | in the game |
| --- | --- |
| 22.1 The market | **kept**: a round's tape is a §22.1 market |
| 22.2 The clock | **gone**: the result is settled at lock-in, so the replay runs in the browser on a tape the server sends only then |
| 22.3 Orders | **one entry** with its take-profit and stop-loss; no modify, reduce-only, close-position or end-session, and no liquidity guard (§23.1) |
| 22.4 Fills | **kept** unchanged, and the source of §23.2's best and worst |
| 22.5 Costs | **kept** unchanged; the liquidation fee has nothing to apply to |
| 22.6 Margin and liquidation | **gone**: no leverage; a position is closed only when its losses reach the stake (§23.1) |
| 22.7 Profit and loss | **the result** is the round's end value; session figures and benchmarks give way to the grade and to §23.2 |
| 22.8 Accounts and sessions | **gone**: no accounts, no $100,000, no money that carries, no Main or Practice, no reset, no bankruptcy |
| 22.9 Integrity | **kept**, plus two rules: not one minute of the tape before the round is locked in, and no opponent's trade or grade on a tape before yours is |
| 22.10 The schools as traders | **gone**: a school plays rounds, not an account (§23.7, §23.8) |
| 22.11 Leaderboards | **gone**: they ranked money |

### 23.10 Not decided

Recorded so that nothing here is mistaken for settled.

- **Ratings and boards.** Whether duels or the training grounds feed a rating or a leaderboard, and
  what a player's record shows. §12 rated percentiles; nothing rates a grade yet.
- **A daily.** Whether there is a shared tape of the day, as §10.5 and §22.1 each had.
- **The drawing tools** a player has while reading.
- **Every number marked ours**: the $500 stake (cosmetic, since the grade divides it out), the 3%
  minimum move, k = 2, the ten-tape limit, and a school's half-the-tapes coverage. The minimum is
  measured against the corpus, and k and the limit against simulated duels, before any of them ships.
- **Whether the pilot clears the bar.** It has not been run over the library: no reads exist on the
  live project, so no school has a record yet, and a school duel deals nothing until `npm run school`
  has read enough tapes the player has not seen.
