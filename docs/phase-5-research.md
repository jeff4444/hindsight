# Phase 5 research — modes and maps, before building them

Research conducted before writing any Phase 5 code, on the pattern Phases 2–4 established. Phase 5
is the largest phase in the document — six unbuilt modes plus maps, dashboards and tier locks — and
two of its pieces have design problems that are cheaper to find now than after the code exists.

**Three findings change the plan.**

1. **Manage cannot be scored the way everything else is scored.** Perfect management beats the best
   of the 98 enumerated brackets on **79% of charts**, by a mean of **2.93R**. So a managed trade
   routinely exceeds the entire achievable set, and percentile scoring — the product's central
   mechanic — degenerates to "100th" almost every round. Manage needs **its own achievable set**: a
   grid of management *policies*, enumerated exactly as the bracket grid is.
2. **The scope specifies Calibration two different ways, in two places, and they are different
   modes.** §4.7 has the player stake a probability; §10.1 has the player draw an interval. Only one
   of them is cheap, and **§10.1's phrasing as written cannot be scored by any proper rule** — it
   asks the player to choose the *event* while the probability is fixed, under which the widest box
   always wins.
3. **Calibration carries the only trainability evidence in the product, and it checks out.** In the
   Good Judgment Project a **sub-one-hour** probabilistic-reasoning module improved Brier scores by
   **6–11%** over control, and the effect persisted across years of the tournament.

---

## 1. Manage

### 1.1 The headroom is real, and it is large

§4.6 already reports `windowMfeR` as "the managed ceiling". This measures it against the thing the
product actually scores against — the best of the 98 enumerated brackets — over 300 real charts:

| | mean | median |
| --- | --- | --- |
| best static bracket (the 98-cell oracle) | 4.37R | 3.78R |
| perfect management, at 1 ATR of risk | **7.29R** | **5.51R** |
| headroom | **+2.93R** | +1.78R |
| **charts where management beats every static bracket** | **79.0%** | |

Both numbers are oracles — neither is reachable — so the comparison is fair as a ceiling against a
ceiling. §3's claim that Manage is "the other half of the skill" is not decoration: **four fifths of
charts contain value that a set-and-forget bracket structurally cannot capture.**

### 1.2 …which is exactly why percentile scoring breaks

Layer 1 scores a player by their rank among 98 enumerated brackets. A managed trade exceeds all 98
on 79% of charts, so the percentile would read 100th almost every round — and a score that is
always maximal is not a score. Every downstream construct inherits the failure: Glicko needs an
outcome that varies with skill, chart ratings need the same, and §16.3's regime work assumes a
comparable percentile.

**The fix is the one Layer 1 already used: enumerate.** A management policy is as parameterisable as
a bracket, so the same trick applies — resolve a grid of policies against the same one-minute path
and rank the player among them. A first cut of the axes, to be pre-registered like §14's thresholds:

| axis | rungs |
| --- | --- |
| initial stop | the existing `STOP_ATR_MULTIPLES` |
| trail | none, chandelier at k ATR, breakeven after m R |
| partial | none, half off at n R |

That is a Cartesian product of the same shape as the 98-cell grid and resolves on the same stored
minute path, so it costs one more offline enumeration per chart and nothing at request time. It also
gives Manage its own oracle and its own par, which the exit condition needs — "a Manage rating that
correlates only partly with the Naked rating" is not computable until both ladders have comparable
scores.

**This is the crux of 5a and it should be settled before any Manage UI exists.** Building the
real-time interaction first and discovering the scoring afterwards is the expensive order.

### 1.3 What is not yet known

- **The grid's size.** 98 cells was chosen for the bracket because it enumerates in reasonable time
  and reads as a picture. A policy grid multiplies stops by trails by partials and could be several
  hundred; it needs a deliberate bound, and the bound is a pre-registered choice.
- **Whether the two ratings actually decorrelate.** That is the phase's exit condition and it needs
  players. It cannot be answered by this corpus.

---

## 2. Calibration

### 2.1 The scope specifies two different modes and calls them one

> **§4.7:** *"Players stake a probability on each trade and are scored with a proper scoring rule,
> producing a calibration curve over time."*

> **§10.1:** *"Instead of a stop and target, the player declares a confidence interval: '80% chance
> price stays inside this box over the next N bars.' Scored with a proper scoring rule."*

These are not the same mechanic. The first **rides the existing bracket loop** — the player places
the bracket they already place and adds a number. The second **replaces** it with a new interaction,
a new resolution rule and a new scoring rule. Treating them as one feature is how a phase overruns.

### 2.2 §10.1 as written cannot be scored properly

A proper scoring rule needs the forecaster to choose the *probability* while the *event* is fixed —
that is what makes honesty optimal. §10.1 fixes the probability at 80% and lets the player choose
the event by drawing the box, which inverts it: a box wide enough is inside with near-certainty, so
under Brier the dominant strategy is to draw the widest box the screen allows. There is no penalty
for width anywhere in the sentence.

Two repairs, both standard, and they are the two modes:

**(a) Fixed event, chosen probability.** Keep the bracket. Ask "how likely is this to reach target
before stop?" and score with Brier or log loss. Proper, and it is §4.7 exactly. It costs one slider
and produces a calibration curve immediately.

**(b) Fixed probability, chosen interval, scored on a scalar.** This is the **interval score** of
Winkler (1972), listed among the proper rules by Gneiting & Raftery (2007). For a central (1−α)
interval [l, u] and outcome y:

```
S = (u − l) + (2/α)(l − y)·1{y < l} + (2/α)(y − u)·1{y > u}
```

Lower is better. The first term charges for width, the others for missing — which is precisely the
penalty §10.1 lacks, and it is what makes drawing a huge box a losing strategy.

**But note the constraint the formula carries: y is a scalar.** "Stays inside the box over the next
N bars" is a property of the whole path, not of a number, so the interval score does not apply to it
directly. To use it, the question has to become *"where will price be at bar N"* — an interval on
the terminal close.

### 2.3 What each version asks of the player, measured

Half-widths in ATR, over 400 real charts and the 60-candle window:

| coverage | box price never leaves (§10.1's reading) | interval containing the final close (scalar) |
| --- | --- | --- |
| 50% | 5.44 | 2.57 |
| **80%** | **9.73** | **5.83** |
| 90% | 13.36 | 8.60 |
| 95% | 17.22 | 11.29 |

The path version demands a box **1.67× wider** at the same nominal coverage, because it must survive
every bar rather than one. That is a real difference in what the player is being asked, and it is
another reason the two readings are two modes.

### 2.4 The evidence, which is the best in the product

> **Source status: fact.** In the Good Judgment Project, training that "lasted less than one hour"
> improved Brier scores by **6 to 11% over the control condition**, and the benefit persisted across
> multiple years of the IARPA tournament (Mellers, Tetlock et al.).

§4.7's promotion of calibration from a side meter to a first-class axis is therefore the
best-supported design decision in the document. Everything else this product trains has weak or
absent evidence — §14.7 could not separate a single engine from a coin flip, and §13.8 found nine
detectors of ten no better than a shuffle. **Calibration is the one place where "this is trainable"
is a citation rather than a hope**, and that argues for building it earlier than its position in §14
suggests.

---

## 3. The rest of the phase, briefly

| mode | what it needs | blocked on people? |
| --- | --- | --- |
| **Storm** | A three-minute clock and a run loop over the existing scoring. The median comparison already exists (`par_r`). | no |
| **Streak (mode)** | A run that ends on the first sub-median result, one skip. Note `src/core/streak.ts` is the **retention** streak — consecutive daily days — and is a different thing entirely. | no |
| **Duel** | Realtime pairing, plus a per-round damage cap. The compression table §4.3 needs already exists in `src/core/ranked.ts`. | **yes** |
| **Racer** | Realtime, 5–10 players, live positions. | **yes** |
| **Maps / tier locks** | Creator-assembled chart sets with a locked ruleset, and a cohort roll-up. Tapes are most of this already: a tape is a published rule over the corpus. | partly |
| **Cohort dashboards** | The operator view over a map's players. | **yes** |

**Two of the six modes and both of the dashboard features need other humans**, and the phase's exit
condition needs an external educator. So Phase 5, like Phase 4, splits cleanly into what can be
built now and what cannot.

---

## 4. What Phase 5 should be

| | | needs players |
| --- | --- | --- |
| **5a — Manage** | The policy grid and its enumeration first, then the real-time interaction on top. The keystone: the phase's exit condition is stated in terms of the Manage rating. | scoring no, exit condition yes |
| **5b — Calibration** | §4.7's version: a probability stake on the existing bracket, Brier and a calibration curve. §10.1's interval version is a **separate** mode and needs the terminal-price reading to be scorable. | no |
| **5c — Storm and Streak** | Rep generators over machinery that already exists. Cheapest per unit of value in the phase. | no |
| **5d — Maps, tier locks, cohorts** | Creator maps on top of tapes; the operator surface is the new part. | partly |
| **5e — Duel and Racer** | Realtime multiplayer. | **yes** |

**Recommended order: 5a, then 5b, then 5c.** 5a because the exit condition names it and because its
scoring problem invalidates everything built on top if it is discovered late; 5b because it is the
one mechanic in the product with published evidence of trainability; 5c because it is nearly free
and it generates the volume every unanswered question in Phases 4 and 5 is waiting on.

## Open items

- **The management policy grid is a pre-registered choice** and, under §14's discipline, adding it
  after the corpus has been measured makes the family larger. It should be registered and hashed
  before the first Manage round is scored, exactly as `THRESHOLDS` was.
- **Whether Manage's rating blends into the overall rating** is listed as an open question in §15 of
  the scope and is not resolved here. The measurement in §1.1 argues they are different skills; the
  correlation that would prove it needs players.
- **§10.1's box mode needs a decision** between the path reading (not scorable as stated) and the
  terminal reading (scorable by the interval score). §2.3 measures what each asks of the player.
