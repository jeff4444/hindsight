# Phase 5d research — maps, before building them

§11 is the part of the scope with a commercial argument attached: *"Maps convert Hindsight into
infrastructure that other people build businesses on top of."* §11.1 lists seven official maps, four
of which already exist as tapes. This is the measurement of the other three, plus the two things the
map layer needs that no tape has: a ruleset lock, and an owner.

Everything below is measured over the **1,000 real charts** (synthetic controls excluded, per §7.2).

---

## 1. Three of §11.1's seven maps do not exist yet

| §11.1 map | status |
| --- | --- |
| Chop | ships as `chop` |
| Compression | ships as `coil` |
| Liquidity Sweeps | ships as `sweep` |
| The Null Set | ships, **locked** — its filter reads `par_r`, which is derived from the reveal, so the map's own name would tell a player most brackets lose there before they traded (§12.1) |
| **Crash** | missing |
| **Euphoria** | missing |
| **Council Split** | missing |

The Null Set's lock is the precedent that matters here: **a map is a claim about its charts, made
before the player trades them.** A filter over reveal-derived quantities leaks; a filter over
lead-in quantities does not. Both of the remaining three are lead-in filters, so both are allowed —
but they fail in a different way, and that is the rest of this document.

---

## 2. Crash and Euphoria are the same map, reflected

§11.1 describes them as different phenomena: Crash is *"violent downside, volatility expansion,
failed bounces"*, Euphoria is *"parabolic advances, shallow pullbacks, blow-off tops"*. That
description is a claim about asymmetry — that falling markets behave differently from rising ones,
which is one of the better-supported regularities in the literature.

**This corpus cannot contain that asymmetry, by design.** §12.2 randomises vertical mirroring per
chart, precisely so a player cannot recognise an instrument from its shape. Half of every displayed
crash is a mirrored rally.

Measured — lead-in drift, in ATR, as displayed:

| percentile | drift | | percentile | drift |
| --- | --- | --- | --- | --- |
| p1 | −14.32 | | p75 | +5.37 |
| p5 | −10.49 | | p95 | +10.56 |
| p25 | −5.76 | | p99 | +13.85 |
| **p50** | **−0.24** | | | |

| threshold | charts | | threshold | charts |
| --- | --- | --- | --- | --- |
| drift ≤ −6 ATR | 237 (23.7%) | | drift ≥ +6 ATR | 216 (21.6%) |
| drift ≤ −8 ATR | 135 (13.5%) | | drift ≥ +8 ATR | 138 (13.8%) |
| drift ≤ −10 ATR | 65 (6.5%) | | drift ≥ +10 ATR | 65 (6.5%) |

Symmetric in the tails where a map would live. Testing that properly rather than by eye: of the 453
charts past ±6 ATR, 237 fall in the down tail against an expected 226.5 under a fair split — **0.99
standard errors**, which is what symmetry looks like. Past ±10 it is 65 and 65.

Downside is not more violent here. It cannot be, because mirroring erased the difference before the
corpus was built.

### 2.1 Two definitions of drift were wrong first, and the first error looked like a finding

The obvious definition is `(last − first) / atr14`. Under it the corpus held **88 charts past −10 ATR
and only 39 past +10** — 4.4 standard errors from a fair split, a large asymmetry, exactly the
asymmetry §11.1 predicts, and entirely an artifact of the measurement.

Two things were wrong with it, and they compound:

- **§12.2's mirror is `BASE² / p`** — a reflection exact in *log* space, chosen so a mirrored chart is
  not subtly readable as mirrored. A drift read in linear price differences is not the negation of
  its original.
- **`atr14` is an absolute price distance.** A chart that fell sits at lower prices and carries a
  smaller ATR, so dividing by it inflates every down move and compresses every up move.

The fix for the second one is a *relative* ATR, and the obvious relative ATR is also wrong. A
geometric mean over the window looks more principled than a single price and misses by **29%**,
because `atr14` is Wilder's ATR(14) — an average anchored at the *end* of the lead-in, not across it.
The denominator has to be measured where the numerator's ATR is measured, which is `entry_price`.

So: `ln(last / first) / (atr14 / entry_price)`.

That is still not exact, and the honest statement of the residual is that it is **second order in the
total move** — 1.3% over a window that travelled 3%, 5.2% over 13%, 19.1% over 61% — because ATR
averages over fourteen bars during which a trending chart changes price level. Real lead-ins move a
few percent; measured on a fixture out at ±13 ATR, where the two maps actually live, the asymmetry is
**2.6%**. `tests/map-filters.test.ts` pins both that and the extreme-chart bound.

The lesson is not about crypto. A quantity was divided by another quantity correlated with it, in a
space where the corpus's own symmetry operation is not linear, and the result was a clean, plausible,
publishable asymmetry pointing the way the literature says it should point. Nothing but the mirror
made it checkable: random mirroring *cannot* produce a directional skew, so the number was falsifiable
on its face. A corpus without that property would have shipped it.

### 2.2 They should still ship, and the reason is about the player, not the data

Two maps that are statistical mirror images are not two maps' worth of *content*. But they are two
maps' worth of *task*: a human reading a chart that has been falling for sixty candles is not in the
same state as one reading a chart that has been rising, whatever the data says. Loss aversion is
asymmetric even when the price path is not.

So both ship, filtered on **displayed** direction — the stored bars are already mirrored, so drift
computed from them is the drift the player sees — and the scope's causal language is corrected. A
map named Crash may not claim crash *dynamics* on this corpus, and the card says so.

This also sets up a question the product can answer later and nobody else can: **do players score
worse on the falling half than on the rising half of the same distribution?** If they do, that is a
measured asymmetry in the reader rather than in the market, and it is exactly the kind of claim
§4.9 exists to license.

---

## 3. Council Split is not the hardest map. It is not any harder at all.

§11.1: *"Council Split — the charts where the engines disagree most. **The hardest map in the
game.**"* §5's own exit condition asks the same thing — whether disagreement predicts chart
difficulty. Neither has been measured until now.

First, how much disagreement there is to work with. Reproducing §14.4's published figures exactly:

| | charts | |
| --- | --- | --- |
| no school speaks | 669 | 66.9% |
| exactly one speaks | 222 | 22.2% |
| two or more speak | 109 | 10.9% |
| …and conflict | **71** | **7.1%** |
| …and agree | 38 | 3.8% |

The minority side is **never larger than one**. There is no chart in the corpus where two schools
oppose two others — every disagreement is *n*−1 against 1. So "the charts where the engines disagree
**most**" is not a spectrum to sort by; it is a single 71-chart set.

Then the difficulty claim:

| group | n | median `par_r` | median `oracle_r` | median pass %ile | mean `par_r` |
| --- | --- | --- | --- | --- | --- |
| **council split** | 71 | **−1.022** | 17.88 | **0.612** | −0.786 |
| council agreed | 38 | −1.021 | 24.29 | 0.602 | −0.801 |
| one school spoke | 222 | −1.020 | 19.74 | 0.612 | −0.812 |
| council silent | 669 | −1.018 | 19.09 | 0.622 | −0.785 |
| **all charts** | 1,000 | −1.019 | 19.25 | 0.612 | −0.792 |

Welch's *t*, split against everything else: **`par_r` 0.10**, **pass percentile 0.79**. Nothing.

`oracle_r` comes out at *t* = −2.016, and it is an artifact: the 38-chart "agreed" group has a mean
`oracle_r` of 203.4 against a median of 24.29, so one or two charts with enormous headroom are
carrying the whole statistic. The medians — 17.88 against 19.25 — say there is nothing there.

**So the disagreement is real and the difficulty claim attached to it is false.** Every measure of
how hard a chart is to trade is flat across all four council states, including the state where no
school will touch the chart at all.

### 3.1 What that means for the map

It ships, named for what it is rather than for what §11.1 assumed it would be: the charts where the
schools conflict. That is a genuinely interesting 7.1% of the corpus — it is the set where a player
can watch two published methodologies reach opposite conclusions from the same candles, which is
§5's whole argument made concrete. It is simply not harder, and the card says so.

Withdrawing "the hardest map in the game" costs nothing that was ever true. Keeping it would have
been the third time this project shipped a difficulty claim it had not measured.

---

## 4. What the map layer needs that tapes do not have

A tape is a published filter with a name. A map is a tape with three additions, and only one of them
is hard.

| | | |
| --- | --- | --- |
| **A ruleset lock** | §11.2's tier lock: *"an operator can require that their cohort plays at Naked and the results are comparable."* Tapes already carry a `tier` column, but it is advisory — the launcher's choice wins. A lock has to win over the launcher, and be visible rather than silently applied. | small |
| **An owner** | Creator maps need a user, visibility (private/unlisted/public) and a share link. The corpus filters already exist; this is a table, a builder and a page. | medium |
| **A cohort roll-up** | The operator view over a map's players. The queries are ordinary aggregates over `rounds`. | small to write, **impossible to validate** |

### 4.1 The cohort dashboard cannot be verified yet, and should say so

Every other number in this product has been checked against a measured null. A cohort dashboard has
no null available: it aggregates over a group of players, and there is one player. The queries can
be written and they can be shown to return the right shape for a cohort of one, but *"weakest axis
across the group"* over a single member is that member's weakest axis with extra words.

It ships because §11.3's commercial argument depends on it existing, and because a dashboard nobody
has looked at is cheaper to fix than a dashboard designed after the fact. It ships with its sample
size on the screen and the same §4.9 gate as everything else — a cohort of one is shown as a cohort
of one, not as a group.

---

## 5. What 5d should be

| | |
| --- | --- |
| **The filter columns** | `lead_in_drift_atr` and a council-split flag, backfilled over the corpus, so all three new maps are published filters over stored tags rather than hand-picked sets — §11.1's own requirement, and the thing that makes a map's difficulty distribution reproducible. |
| **The three maps** | Crash, Euphoria, Council Split. Two corrections to §11.1 published on their cards. |
| **Tier locks** | Enforced at issuance, shown at the launcher. |
| **Creator maps** | Table, builder, visibility, share link, playable. |
| **Cohort dashboard** | Written, gated, and honest about a cohort of one. |

## Open items

- Whether players actually score worse on falling charts than on rising ones. Needs volume; Storm and
  Streak (§19) are what generates it.
- Whether *any* pre-trade signal predicts chart difficulty. Council disagreement does not, and it was
  the best candidate the product had. `par_r` predicts it by construction and cannot be shown.
- Whether creator maps should be monetisable by their creators, which §14 of the scope also leaves
  open. Not a Phase 5 question.
