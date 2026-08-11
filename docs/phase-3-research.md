# Phase 3 research — the council, before building it

Research conducted before writing any engine code, because Phase 2 taught the lesson the hard way:
the scope document's claims about determinism and citations are frequently wrong, and the wrong ones
are expensive to discover after the code exists. Everything below is sourced. Where §5 turned out to
be mistaken it is corrected here and the scope document amended.

**Four findings changed the plan outright.**

1. **Every determinism score in §5.2 is too high, and the shortfall is always in the same place.**
   Not in the stop-and-target formula the document specifies in detail — in **pattern detection**,
   which it barely specifies at all.
2. **No engine on the roster has a native price target.** Turtle exits on a trailing breakout,
   Connors on a moving-average cross, VSA on an opposing signal. §5.5 requires "a proposed entry,
   stop-loss and take-profit" from every engine. Four of six take-profits would be **our invention**;
   the document discloses this for one.
3. **The window is smaller than anyone assumed, including the researcher.** 80 hourly candles on a
   24/7 corpus is **3.3 calendar days**, not the ~13 trading days an equity-session assumption gives.
   Even No Tools' 300 candles is 12.5 days. Bulkowski's patterns need weeks.
4. **The measurement plan has to be pre-registered before the engines run**, and the detectable
   effect is large: **+4.2 percentage points of hit rate** to clear the noise floor at n=1000, rising
   to **+9.5pp** for an engine that abstains 70% of the time.

---

## 1. The roster, engine by engine

### CHANNEL — Donchian / Turtle. Verifiable, and the document mis-states it three ways

**Source status: fact.** Curtis Faith released *The Original Turtle Trading Rules* free
([PDF](https://oxfordstrat.com/coasdfASD32/uploads/2016/01/turtle-rules.pdf)); it is complete enough
to implement. Dennis & Eckhardt, 1983 is correct. *Way of the Turtle* is 2007, not 2003.

The rules, exactly: **N** is the 20-day ATR seeded with a simple average of true range. **System 1**
enters one tick beyond the 20-day extreme, *intraday*; **System 2** at 55 days. **Stop 2N from the
actual fill**, not from the breakout level. **Exit on the opposite 10-day extreme** (System 1) or
20-day (System 2). Units are added every ½N, maximum four per market, with earlier stops raised.

Three corrections:

- **"Never abstains" is false, and it is the most consequential error in the table.** System 1
  explicitly skips a breakout *if the previous one would have won* — counting skipped breakouts too.
  Abstention is core machinery, not an edge case. And with our entry **fixed at the last lead-in
  close**, faithful behaviour is to abstain unless that specific bar breaks the 20-bar extreme. So
  CHANNEL is a **high-abstention** engine, which inverts §5.8's entire balance argument.
- **There is no target.** Turtle exits are trailing breakout exits. Any take-profit we emit is ours.
- **Determinism is ~3.5/5, not 5/5.** Residual ambiguity: ATR seeding (Wilder vs SMA vs EMA);
  intraday breakout-plus-one-tick fills, which are unrepresentable when entry is fixed at a close;
  whether the N-day window includes the current bar; and the winner-filter needs breakout history
  from *before* the window.

**The evidence is worse than the document implies, and worst precisely for us.** Kurth, Eisler, Rej
& Bouchaud ([2026](https://arxiv.org/html/2607.01550v1)) find a structural break at 2008–9: Sharpe
fell **0.84 → 0.12** on 5-day trend, 0.83 → 0.22 at 10-day, **0.79 → 0.27 at 20-day**, 0.70 → 0.40
at 50-day. Fast trend collapsed; slow trend survived. The discriminant is volatility-normalised
**tick size** — small-tick instruments degraded most, and **crypto spot is small-tick**. Meanwhile
Brock, Lakonishok & LeBaron (1992), the canonical support for channel rules, is the canonical
data-snooping casualty: Sullivan, Timmermann & White
([1999](https://onlinelibrary.wiley.com/doi/abs/10.1111/0022-1082.00163)) find no simple rule
survives a Reality Check on the same data.

### REVERSION — Connors & Alvarez. The most interesting engine, for the reason the document misses

Rules: price above its **200-day MA**; buy when **2-period RSI < 5**; exit on a close above the
**5-day MA**. The Cumulative-RSI variant's threshold is cited inconsistently across sources
(35 / 45 / 10) — we should not assert one.

- **"No native stop" is correct, and it is a stated principle rather than an omission.** Rule 5 of
  the book is titled ***"Stops Hurt."*** Connors and Alvarez tested stops from 1% to 50% over
  fifteen years of liquid US equities: *"In every single case, the use of stops lowered the
  performance."* Risk is controlled by position sizing instead.
  → For a product whose entire skill is stop placement, that is not an awkwardness to paper over. It
  is the most interesting sentence in the roster, and it should be shown to the player.
- **The exit is not a target either.** "Close above the 5-day MA" is a per-bar condition; at entry
  there is no price.
- **Not expressible in 80 bars as published.** The 200-period regime filter is Rule 3 and it is
  load-bearing — dip-buying *below* the 200MA is exactly where the system loses, so dropping the
  filter inverts the edge, and rescaling it to 80 does not approximate it.
  → **Solved by something already built.** `lead_in_extra` gives **300 candles on 978 of 1,000
  charts** — added in Phase 1.5 for the No Tools tier. An engine may read all 300 while the player
  sees 80. That is not a leak: it is history *before* the window, never after it.
- **No peer-reviewed test of RSI(2) exists.** Short-term reversal as an anomaly is academic; RSI(2)
  as a recipe is practitioner-only. Post-2010 tests find thresholds of 15–20 outperforming 5–10,
  which is itself parameter drift and therefore decay evidence.
- **The crypto prior runs against it.** Rozario et al.
  ([2020](https://arxiv.org/pdf/2009.12155)) on hourly BTC find the best trend lookbacks are ~10 and
  ~40 *days* — far outside our window — and the intraday literature finds liquid majors show
  short-horizon **momentum**, not reversion.

### LIQUIDITY — ICT. Cannot ship under that name

The stop is nearly specifiable ("beyond the sweep wick"). **The target is fatal.** Defining "the next
liquidity pool" deterministically requires six rules — a swing-pivot definition, an equal-level
clustering tolerance, a minimum touch count, which side of entry counts, a tie-break among
qualifying pools, and precedence between internal and external liquidity. **None is published
anywhere authoritative.**

Worse, the doctrine defines the target as *revisable*: treat the draw on liquidity as a working
hypothesis, choose "the most obvious external pool", update when structure changes. A rule
containing "most obvious" is not a rule — it is a discretionary loop, and the discretion is what the
school considers the skill.

**Determinism is ~1/5 for the target, not 4/5.** And **"minimum 1:2" is not an ICT rule at all** — it
is our invention, and it silently overrides the pool choice whenever the nearest pool is closer than
2R, which means the engine's output is frequently not ICT even by its own lights.

This is the same bargain §13.7 already struck for the themes: *the choice is not between the right
definition and ours, it is between an undisclosed definition and a published one.* Ship it, publish
our pseudocode, and **do not claim fidelity to a source that has no spec.**

### PATTERN — Bulkowski. The arithmetic is the best on the roster; the window is the worst

- **The statistic is real and the document nearly names it right.** It is *"percentage meeting price
  target"*, and Bulkowski is explicit that the naive full-height projection "doesn't work well".
  Representative: symmetrical triangle 58% up / 36% down; Adam & Adam double top 64%; broadening top
  66% up.
  **Correction that matters:** it is a **scaling factor, not a hit probability.** Projecting 58% of
  pattern height produces a target roughly half of patterns reach — a ~50% hit rate *by
  construction*, not 58%.
- **The projection rule is genuinely 5/5 — given a pattern.** Height is the highest peak minus the
  lowest valley inside the pattern; target is the breakout price ± height × the percentage. Edwards
  & Magee's measuring implication is equally crisp. **All determinism risk sits in detection.**
- **The window is decisive.** Bulkowski's identification guidelines are prose with escape hatches
  ("at least three" touches, valley drop "at least 10% but allow exceptions", peaks "usually several
  weeks apart"). His research base is daily and weekly bars, and he warns that his own indicator on
  sub-weekly periods produces "a nasty surprise".

  > **Correction to the research as first gathered.** The finding was reported as "80 hourly candles
  > ≈ 13 trading days", which assumes a 6.5-hour equity session. This corpus is **24/7 crypto**: 80
  > candles is **3.3 calendar days** and 300 is **12.5**. The window problem is roughly four times
  > worse than reported. A double top needing peaks weeks apart cannot exist at either tier.

  Only flags, pennants, small triangles and short double tops can fit — the low-ranked, weakest
  subset — and their published percentages were measured on daily bars over decades.

### GEOMETRY — Harmonics. The only genuinely mechanical one, once we supply what Carney did not

Carney publishes exact ratios: Gartley (B = 0.618 XA, D = 0.786 XA, BC 1.27–1.618), Bat (B < 0.618,
BC ≥ 1.618, D = 0.886 XA), Butterfly (B = 0.786, D = 1.27 XA), Crab (D = 1.618 XA).

- **He does not publish tolerances.** Vendors invent them — a typical scanner exposes an "error
  percent" defaulting to 8 with a 0–20 range, so ±5% turns 0.618 into 0.587–0.649. Two faithful
  implementers reading the same book produce different patterns. **Determinism is 3/5 as written,
  5/5 once we publish a tolerance.**
- **A contradiction on the originator's own site:** Carney's Crab page states B = 0.886 XA, against
  the near-universal secondary statement of 0.382–0.618 (0.886 is normally the *Deep* Crab). Our
  spec has to resolve it explicitly.
- **Evidence is weak.** No peer-reviewed support located; the strongest empirical claim also reports
  occurrence low enough to erode profitability. Skeptical reviews put Gartley at 36–60%.
- XABCD needs five swing points — about 16 bars per leg in 80 candles. Possible with a short pivot
  lookback, at the cost of noisy pivots. Expect frequent abstention.

### TAPE — VSA. Two corrections, and the volume question resolved

Signals read three things per bar: spread, close position within it, and volume *relative to recent
bars*. No demand: up close, narrow spread, volume below **each of** the previous two. Upthrust:
breaks a prior high, closes in the lower third on wide spread and high volume. Spring, stopping
volume, climax, effort-vs-result.

- **Only one rule is numeric** — "volume lower than each of the previous two bars". "Narrow", "wide"
  and "ultra-high" are qualitative, and the numbers in circulation come from vendors and coders, not
  from Williams. **Determinism 4.5/5 is not inherited, it is manufactured** — ours will be exactly as
  good as our own frozen thresholds. VSA is also explicitly *background-conditional* ("bullish after
  demonstrated strength"), so it is path-dependent rather than bar-local.
- **"Neither stop nor target is native" is half wrong.** The **stop is native** — beyond the extreme
  of the signal bar. The target genuinely is not: VSA exits on an opposing signal.
- **"A veto rather than a direction" is our invention.** VSA signals are explicitly directional. What
  *is* defensible: a large native abstain rate, and background-conditionality. Reframe as **a
  directional engine with a high abstain rate that can oppose a range-scale engine** — do not claim
  Williams meant a veto.
- **Rebased volume is fine.** Every VSA volume test is comparative, and dividing by the median
  lead-in volume is a positive monotone scaling: orderings and ratios are preserved, so no signal
  changes. **But** median-scaling equalises location, not dispersion, so a fixed "2× median =
  ultra-high" threshold would fire at different rates across instruments. Use **percentile rank
  within the lead-in window**, and normalise spread the same way.
- No peer-reviewed test of VSA exists. Volume carrying information is supported — Gervais, Kaniel &
  Mingelgrin ([2001](https://onlinelibrary.wiley.com/doi/10.1111/0022-1082.00349)) — but
  cross-sectionally and monthly, not at bar scale. Honest claim: **the premise is supported; the bar
  taxonomy is untested.**

---

## 2. Two structural problems the roster shares

### 2.1 No engine has a native target, and our contract demands one

§5.5 requires "a proposed entry, stop-loss and take-profit". Of the six schools:

| | native stop | native target |
| --- | --- | --- |
| CHANNEL | yes (2N) | **no** — trailing breakout exit |
| REVERSION | **no**, on principle | **no** — MA-cross condition |
| LIQUIDITY | nearly | **undefinable** |
| PATTERN | yes | **yes** — the measure rule |
| GEOMETRY | yes | **yes** — 0.382 / 0.618 of AD |
| TAPE | **yes** (signal-bar extreme) | **no** — opposing signal |

Four of six exits are *conditions evaluated per bar*, not prices. Forcing them into a static
take-profit is not a small liberty — it is replacing the school's exit with ours and keeping its
name.

**The resolution, and it costs little:** every engine emits **both**.

- A **static bracket**, so it is comparable to the player and scorable against the same 98-cell
  achievable set. Where the school has no target, ours is used and **labelled as ours**.
- Its **native conditional exit**, resolved by walking the reveal path — which the resolver already
  does, minute by minute, for §12.3.

Then publish both records. The gap between them *is* the cost of forcing a school into a bracket,
measured rather than assumed, and it is a genuinely novel thing to be able to show.

### 2.2 The abstention model is inverted

§5.8 assumes "Channel and the momentum engines always have a direction. Pattern, Geometry and the
phase engines frequently abstain," and warns that a roster of always-opining engines saturates the
disagreement metric.

The real picture is the opposite at the top: **CHANNEL abstains unless the decision bar breaks the
extreme**, and TAPE abstains on most bars natively. With entry fixed at one specific bar, *every*
engine is mostly silent. The risk is not saturation — it is **an empty council on most charts**, and
disagreement-as-difficulty having nothing to measure.

This had to be sized before six engines were built, so it was — one query over the corpus, using
the two engines whose rules are actually published.

| | fires on | share |
| --- | --- | --- |
| **CHANNEL** — decision bar breaks the 20-bar extreme | 198 | 19.8% |
| **REVERSION** — RSI(2) < 5 | 88 | 8.8% |
| **REVERSION** — RSI(2) < 5 **and** above the 200-period MA (as published) | **22** | **2.2%** |
| at least one has an opinion | 234 | 23.4% |
| **the council is silent** | **766** | **76.6%** |

**Two engines faithfully implemented are silent on three charts in four.** The risk §5.8 names —
"a roster of always-opining engines saturates the disagreement metric and produces four-three splits
on every chart" — is not the risk we have. Ours is the opposite and it is severe.

**Worse, REVERSION as published is not a measurable engine here.** Twenty-two charts is not a
sample: §3's floor says a 70%-abstaining engine at n = 300 needs a +9.5pp edge to be distinguishable
from noise, and n = 22 cannot resolve anything at all. Connors' own 200-period filter — the rule that
makes the system work — is what reduces it to 22, so there is no version of this engine that is both
faithful and measurable on a 1,000-chart corpus.

And the disagreement number, which is the one §14's exit condition rests on:

| | charts | share |
| --- | --- | --- |
| both engines have an opinion — the only charts where disagreement is *possible* | **52** | **5.2%** |
| …they agree | 0 | — |
| …they **disagree** | **52** | 5.2% |

*(REVERSION relaxed to RSI(2) < 5 with no regime filter, to give it any sample at all. With the full
published rules the overlap is near zero.)*

So the good news and the bad news are the same number. When both engines speak they disagree **every
single time** — which is exactly what §14 wanted from "the pair guaranteed to disagree", and it
confirms the pairing was chosen correctly. But it happens on 5% of charts, so *disagreement as a
difficulty signal has a 5% coverage rate*, and a council screen would be empty or single-voiced on
95% of them.

**This is the finding that should shape the phase.** Three responses, and only the third is honest:

1. **Loosen the entries** until the engines speak more often. This is the tempting one and it is
   fatal: the thresholds are the school, and tuning them to fill a screen is the exact data-snooping
   §3 warns about, done in advance and in public.
2. **Serve charts where engines fire.** This biases the corpus, and §12.4 is emphatic that
   population statistics do not survive a change of selection rule — every chart rating and every
   percentile would stop being comparable.
3. **Accept it, and make it the point.** Most charts are not a setup for most schools. A council
   that abstains on three charts in four is not a broken council; it is §2's thesis rendered as a
   number — *"markets are noisy, edges are thin, and competent people disagree"*. The debrief says
   "no school on this roster had a trade here", which is the most useful sentence a trading product
   can say and the one nothing else in the category will say.

The cost of (3) is that **disagreement-as-difficulty has to be demoted** from a headline mechanic to
something computed on the 5% where it exists. §14's exit condition — "two engines that disagree
usefully, are auditable, and whose disagreement predicts chart difficulty" — is still reachable, but
the third clause now needs a coverage caveat attached to it.

---

## 3. How to publish the track records — the part that decides whether any of it is believable

We will run six engines over ~1,000 charts and publish how each did. We already walked into the
naive version of this trap once: twelve comparisons, one "significant" result at 95%, gone under
correction (§13.9).

**The stack, in implementation order.**

1. **Pre-register and hash the engines and their thresholds before touching the corpus.** This is
   the whole ballgame — it is what makes N = 6 rather than N = every threshold we tried. Bailey &
   López de Prado's minimum backtest length is ≈ 2·ln(N) years; tuning on the evaluation set
   silently multiplies N into the hundreds.
2. **Romano–Wolf StepM** as the primary per-engine test. The engines see the same charts, so their
   results are correlated; StepM exploits that dependence and is strictly more powerful than the
   Bonferroni that killed our earlier result.
3. **Hansen's SPA (2005)** for the headline claim "the best engine beats Engine Zero". Preferred over
   White's Reality Check, which loses power badly when weak models are in the pool — and we are
   deliberately including weak ones. Bootstrap over charts, recentre each engine's per-chart R series
   by its own mean, stationary bootstrap.
4. **PBO via CSCV.** Split the corpus into 16 blocks, take all 12,870 half-splits, rank in-sample and
   record the out-of-sample rank of the in-sample winner. PBO is the share where the winner lands
   below median. It answers "does the crown hold", and it is trivially parallel.
5. **Publish rank *distributions*, not ranks.** Over six noisy engines a single ordering is the most
   misleading artefact we could ship.
6. **Deflated Sharpe as annotation.** For N = 6, the expected maximum Sharpe under the null is
   **1.30·√V** — the best of six pure-noise engines beats zero by 1.3 cross-engine standard
   deviations. That number should be printed on the leaderboard.

**Engine Zero is defensible and has precedent.** Biondo et al.
([PLoS ONE 2013](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0068344)) used
random strategies as an explicit benchmark and found them competitive with standard technical rules.
Van Tharp's coin-flip claim is folklore — cite as motivation, never as evidence. Run Engine Zero over
**1,000 seeds of the full sweep** and publish the resulting distribution as the leaderboard's error
bar. Do not assume a 33.3% win rate for a 2R/2-ATR pair: drift and intrabar ordering move it, and
the stop-first tie convention (§12.3.2) must be stated.

**What is actually detectable.** Binary 2R outcome, breakeven 33.3%, n = 1,000 ⇒ SE = 1.49pp.

| | hit rate needed | ≈ per trade |
| --- | --- | --- |
| unadjusted, 80% power | **+4.2pp** (37.5%) | +0.13R |
| with family-wise control over 6 engines | **+5.2pp** (38.5%) | +0.16R |
| an engine abstaining 70% (n = 300) | **+9.5pp** | — |

That is a *large* real edge. Given §13.9 already found the themes carry no detectable directional
information, the honest expectation is that most engines will land indistinguishable from Engine
Zero — **and that is a perfectly good result to publish**, not a failure of the phase.

---

## 4. What Phase 3 should actually be

§14 says "Channel and Liquidity first — they are the pair guaranteed to disagree". That pairing
survives, but the milestone structure does not.

**3a — the contract, the two most specifiable engines, and Engine Zero.**
CHANNEL and REVERSION, because they are the two whose rules are genuinely published. Both emit a
static bracket *and* a native conditional exit. Engine Zero from the first commit. Every threshold
**pre-registered and hashed** before the corpus is touched. Exit condition: two engines that disagree
on a measurable share of charts, and a council that is not silent on most of them.

**3b — the measurement, published.**
StepM, SPA, PBO, rank distributions, the deflated-Sharpe annotation, and Engine Zero's seed
distribution as the error bar. Exit condition: a published leaderboard whose headline is honest about
what n = 1,000 can resolve.

**3c — the rest of the roster, each with its provenance stated correctly.**
GEOMETRY with our published tolerance and the Crab contradiction resolved. PATTERN restricted to the
handful of short formations the window admits, with Bulkowski's percentages labelled as **daily-bar
priors applied out of domain**. TAPE as a directional engine with a high abstain rate, on
percentile-ranked volume. LIQUIDITY renamed, with our own published pseudocode, **in the ICT idiom
rather than claiming to be ICT**.

**Do 3b before 3c.** If two engines whose rules are actually published cannot be distinguished from a
random benchmark, four more engines built on schools with no published rules will not change the
answer — and the pre-registration discipline only means anything if the measurement is fixed before
the roster grows.

---

## Open items

- The abstention rate of a faithful CHANNEL on our corpus is unmeasured and decides whether §5.8's
  balance problem exists at all. One query, before any engine is written.
- Whether an engine reading 300 candles while the player sees 80 is acceptable *product* design, as
  distinct from acceptable causality. It is not a leak; it may still be an unfair comparison, and the
  debrief will have to say which candles the engine used.
- The Cumulative-RSI threshold (35 / 45 / 10) is cited inconsistently and should not be asserted
  until one source is confirmed.
- No peer-reviewed test exists for RSI(2), VSA, harmonics or ICT. Four of six engines rest entirely
  on practitioner material, and the published track records will be the first real test any of them
  has had on this corpus.
