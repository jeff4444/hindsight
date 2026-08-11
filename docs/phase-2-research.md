# Phase 2 research — what to build, and what the evidence actually says

Research conducted before writing any Layer 2 code, because the algorithm choices are expensive to
undo and several of the obvious ones are wrong. Everything below is sourced. Where a claim in
`hindsight-scope-v0.2.md` turned out to be wrong, it is corrected here and the scope document has
been amended.

Three findings changed the plan outright:

1. **Volume profile is buildable, honestly.** The scope document treats volume-at-price as a
   fabrication. It is — *if you synthesise it*. But TradingView builds its own volume profile from
   one-minute bars, which is exactly the data we already store. We can ship it at genuine parity.
2. **The stability test in §6 measures the wrong quantity.** It asks for overlap of *pivot index
   sets*. Persistence theory says critical **values** are stable and critical **locations** are not.
   The test as written would fail on correct code and pass on incorrect code.
3. **The directional-change "power law" is a diffusion identity, not a market discovery.** The
   scaling law is real, the exponent is 2.02 ± 0.098, and Brownian motion predicts exactly 2. Using
   it to auto-tune is fine; claiming it as a market regularity is not.

---

## 1. The TradingView inventory, ranked by necessity

The question this ranks against is narrow on purpose: **does this help a competent trader choose a
stop and a target on a frozen chart?** Not popularity, not visual impressiveness.

### Essential — a stop cannot be placed without it

| Item | Input | Causal | Notes |
| --- | --- | --- | --- |
| OHLC candles + price axis | OHLCV | yes | built |
| ATR badge | OHLC | yes | built. **Default smoothing is RMA (Wilder), not SMA** — an SMA-smoothed ATR is a materially different number |
| Horizontal level | — | yes | built (the rails) |
| Crosshair with price readout | OHLC | yes | built |
| **Measure tool, denominated in ATR and R** | OHLC | yes | **not built, and it should be** |

The measure tool is the one genuine gap. On a normalised, anonymised chart the player has no
instrument to anchor volatility intuition to — ATR-denominated distance is the only unit that
survives normalisation. Small feature, outsized effect on decision quality.

### Standard — expected on any serious platform

Trendline/ray, moving averages, volume histogram, Bollinger/Keltner/Donchian channels, parallel
channel, Fibonacci retracement, RSI/MACD, log-vs-linear scale toggle, magnet mode, **volume
profile**.

Two notes worth carrying into the tier design. **Donchian is the most stop-relevant channel** —
it *is* an N-bar extreme, which is what a structural stop is. And **magnet mode** (snap the rail to
an actual wick) is cheap and materially improves placement quality.

**Pivot Points cannot ship.** They need a session boundary, and our charts have no calendar by
design (§12.2). Either retain session boundaries as opaque markers or drop the tool. Same problem
kills session VWAP, seasonality and anything date-anchored — anchored VWAP from a swing works fine
and is the more useful variant anyway.

### Situational — and one category that is actively dangerous

Chandelier Exit, Volatility Stop, Chande Kroll Stop, Supertrend, Parabolic SAR are all easy to
build and all causal. They are also **literally stop-placement algorithms**. For a game about
placing stops, exposing them hands the player the answer. They belong in the lowest tier or nowhere.

### Excluded, and why

**The repainting set — ZigZag, Auto Fib, Auto Trendlines, Auto Pitchfork, Auto key levels — must be
excluded from the codebase, not merely from the UI.** ZigZag cannot know a pivot is a pivot until
price has moved away, so the historical chart shows perfect turning points that were unknowable in
real time. TradingView's own repainting guide categorises these as scripts that "plot values
backward in time, creating false historical impressions". We have spent two phases building a
causality seam; one of these would defeat it quietly.

**The time-destroying chart types — Renko, Kagi, Point & Figure, Line Break — and Heikin Ashi
create a scoring-contract problem, not an aesthetic one.** If the display shows synthetic prices and
we resolve stops against real OHLC, the player places levels in one coordinate system and is scored
in another. TradingView hit exactly this and their answer was to moderate such strategies off the
platform: "Renko brick levels, being disconnected from actual market prices at any given moment,
will fill orders using their own prices and therefore will not produce reliable strategy results."
Either exclude them or resolve against displayed prices. The two cannot be mixed.

**Fib circles/spirals/arcs/fans, Gann fans and squares, Elliott tools** — scale- and
aspect-ratio-dependent, meaning the "signal" changes when the window is resized. That is
disqualifying independent of any view on their merit.

### What our data does and does not permit

| Buildable from 1-minute bars | Not buildable at all |
| --- | --- |
| **Volume profile / POC / value area** — at TradingView's own fidelity | Footprint, bid-ask ladder, true delta (needs aggressor side) |
| **TPO / Market Profile** — the original 1980s definition | DOM / order book |
| Honest intrabar path resolution (built) | Open interest, funding, liquidations (also leak identity) |
| Approximate range bars | Advance/decline, correlation (need a second instrument) |
| Up/down volume **proxy** | Anything requiring a calendar |

The correction that matters: **TradingView's own up/down volume split is inferred from lower-timeframe
bar direction** (close ≥ open counts as up). So their "volume delta" is already a proxy. We can build
the identical proxy at identical fidelity — but it must be labelled honestly and never called order
flow.

### The usage evidence is far thinner than the internet suggests

Solid: technical analysis is prevalent. Menkhoff & Taylor (2007, *JEL*) tabulate eight FX surveys —
"some use of technical analysis" runs 89–100%. Hoffmann & Shefrin (2014, *JEBO*), 5,500 Dutch retail
clients: **32% report using technical analysis, 9% exclusively.**

The only real tool-family data that exists is **Taylor & Allen (1992)**, a 1988 survey of 213 London
FX dealers: **64% used moving averages or other trend-following systems, 40% used oscillators.**
That is it — one 30-year-old FX-dealer survey measuring families, not named indicators.

**There is no per-indicator usage data anywhere, and no drawing-tool usage data at all.** Two
statistics circulating in competitor marketing are fabricated: "VWAP is used by 78% of profitable
traders" cites no survey, and a claimed "TradingView 2025 user study" finding 38% better
risk-adjusted returns from using 2–3 indicators **does not exist**. If we ever cite usage data, it
is Taylor & Allen or nothing.

The strongest indirect result, and the one that bears directly on our product:
**Osler (2005, *JIMF*)**, using a major FX dealing bank's complete order book — 9,655 orders, >$55bn:
**14.3% of executed stop-loss buys sat at rates ending [01,10] versus 6.9% at [91,00]**, and
take-profit orders clustered *at* round numbers while stops clustered *just past* them. That is
measured evidence that round numbers drive real stop placement, and it is the best empirical basis
for any level tool we ship.

---

## 2. The geometry algorithms

### 2.1 Swing points — use persistence, not directional change

The scope document specifies ATR-normalised directional change at three nested thresholds. DC is
correct and causal — Guillaume et al. (1997) give it as a one-state-variable, O(1)-per-bar machine
with zero look-ahead. But two corrections:

**The power-law justification is wrong.** The scope says the event count "follows a power law in the
threshold, which gives a principled way to auto-tune per instrument". The law is real —
Glattfelder, Dupuis & Olsen (2011, *Quantitative Finance*) — but their own Table A9 gives a
currency-average exponent of **2.02 ± 0.098** against a **Brownian first-passage prediction of
exactly 2**, and their Gaussian random-walk control reproduces it. It is a diffusion identity. We
can still use N ∝ δ⁻² to invert analytically for a target swing count; we cannot call it a
discovered market regularity.

The genuinely useful empirical result from that paper is different: **overshoot ≈ threshold**
(average exponent 1.04), so the expected total swing leg is ≈ 2δ. That is how to size δ against ATR:
for legs of roughly k·ATR, set δ ≈ k·ATR/2.

**Better citations exist, and they are finance rather than FX microstructure.**
Lunde & Timmermann (2004, *JBES* 22(3)) use precisely this filter for bull/bear dating in a top
econometrics journal. Chang & Osler (1999, *Economic Journal*) scan a volatility-normalised
threshold at **ten nested levels of 1.00–4.50 standard deviations** — direct precedent for our
nested-threshold design, published in 1999.

**But the better primitive is 0-dimensional persistence.** A swing high has persistence *p* iff
price must retrace *p* before exceeding it — which is exactly what a trader means by a significant
high. It gives:

- the same swing set as DC, but **graded** rather than binary at each threshold,
- **O(n log n)** via union-find, causal if swept left to right and emitted on confirmation,
- and a theorem: **a peak of persistence p is destroyed only by a perturbation of sup-norm ≥ p/2.**

That last line converts our quarter-tick stability requirement from a hope into a proof. Recommend
implementing persistence once and expressing the three nested thresholds as three cuts on that one
computation.

**Two failure modes to test.** A time-varying threshold (δ = k·ATR_t) breaks monotonicity, because
the threshold moves while a leg is open — **freeze δ at leg open**. And on hourly OHLC a single bar
can contain both a new extreme and the reversal, with no way to order them; **run the state machine
on the one-minute path** and report at hourly resolution. We already store that path.

### 2.2 Trendlines — the hull claim is verified, the selection rule is folklore

**Verified.** A point lies on the upper hull iff there is a supporting line through it with all
points on or below; a supporting line containing ≥2 points is a hull edge. So for *h* upper-hull
vertices there are **exactly h−1 candidate resistance trendlines and no others** — not a cubic
search, not even quadratic.

**And we already have the online algorithm.** Because bars arrive in strictly increasing x, the
incremental Graham/Andrew upper-hull stack is online at **O(1) amortised per bar**.

**Make it exact.** Prices are tick-quantised and times are bar indices, so scaling both to integers
makes the orientation determinant exact in int64. No epsilon, no tolerance in the turn predicate —
which is important, because a tolerance there reintroduces the free parameter we were avoiding.

**The honest gap: there is no peer-reviewed formulation of hull-edge *selection*.** The best-known
open implementation does not even use a hull — it runs gradient descent on the slope, which
generically selects a line touching exactly one vertex. Recommend **"most recent upper-hull edge,
tiebreak by span"**: zero parameters, O(1) to read off the stack, always defined — and defended on
determinism grounds, not on empirical grounds we cannot cite. **Reject R² outright**: a supporting
line has all residuals of one sign, so R² of a one-sided envelope is not a goodness-of-fit measure
and can go negative.

**RANSAC and Hough are wrong here, and precisely why matters.** RANSAC is randomised (output depends
on seed — fatal for shared game state), its consensus set is symmetric so it fits through-lines not
supporting lines, and its purpose is outlier rejection when a trendline is *defined by its
extremes*. Hough quantises into an accumulator, so the answer is a function of the bin width.

> **Correction, from building it.** This originally proposed a ready-made stability test: "perturb
> closes by ±¼ tick and assert the Hough slope jumps while the hull slope does not." **That does not
> reproduce, and it was written without being run.** Measured across bin widths from 0.02 down to
> 0.0005 on a 160-bar fixture, the argmax bin is *unmoved* by a quarter-tick perturbation — the modal
> bin carries far too many votes for a sub-tick nudge to unseat it.
>
> The defect that does reproduce is worse, and it is what `tests/geometry/stability.test.ts` now
> asserts: the estimator's answer depends on the bin width, which is a free parameter with no
> principled value. **0.04, 0.03, 0.04, 0.03, 0.026** across those five resolutions, on identical
> data. That is what the hull is actually buying.

**One property to document rather than test.** The hull is causal — recomputing it later gives the
same answer — but its output is *not monotone in time*: a new high pops vertices that anchored
yesterday's line. That is not a bug; a new high invalidates the old resistance line by definition.

### 2.3 Channels — the LP is right and has a breakdown point of zero

**Verified** as the Chebyshev formulation in Boyd & Vandenberghe §1.2.2: 3 variables, 2n
constraints, solvable in O(n) expected time by randomised incremental LP. No general solver needed.

**Use vertical width, not perpendicular.** The classic computational-geometry "width of a point set"
is a Euclidean quantity, but a chart's axes are incommensurate — x in bars, y in ticks. Rescale the
price unit and the width-minimising slab *rotates*. The answer would depend on the aspect ratio of
the user's window.

**The trap in "parameter-free".** It is parameter-free and it is determined by **exactly three
bars** — an LP optimum sits at a vertex, and a vertex in R³ is three tight constraints. So:
ε-perturbation of everything is stable, but **one bad print determines the channel**, and with four
or more residuals at exactly ±t — routine on tick-quantised data — the LP has multiple optima and
**the answer depends on the solver's pivoting rule**. Two clients could return different channels for
identical input. Canonical tie-breaking is mandatory, not a nicety.

**Recommend Theil–Sen slope plus a residual quantile for the width** as the shipped default: 29.3%
breakdown, pure order statistics so it is bit-reproducible with no solver, one interpretable
parameter. Keep the L∞ LP as a separate "tightest containing channel" object with documented
tie-breaking and a documented breakdown point of zero.

**Andrews' Pitchfork must not ship**: StockCharts' own definition says "there are no hard rules for
point placement… chartists must use judgment". It is not a function of the data.

### 2.4 Support and resistance — the best-evidenced item on the list

This is the component with real empirical support, and it survives intact.

**Osler (2000, FRBNY *Economic Policy Review*)** is the study to copy. She took the levels six FX
firms actually published to customers, Jan 1996 – Mar 1998 on one-minute quotes, and compared bounce
frequency against *artificial* levels: **56.2% artificial versus 60.8% published. All 16
firm–currency pairs had published > artificial; 13 of 16 significant at 5%.** The placebo design is
the template — it is the same shape as our permutation control.

**Chung & Bellotti (2021, arXiv:2101.07410)**: bounce probability rises **monotonically with the
number of prior touches**, reaching ~0.8 at eight touches, against ~0.5 for shuffled-returns
controls. So **touch count as a strength weight has direct support; volume does not.**

**Round numbers are the single best-evidenced row in the whole table** — Osler's order-book
clustering, plus Harris (1991, *RFS*) showing clustering *increases with volatility*, which is an
independent argument for a volatility-scaled bandwidth. Note that this mechanism operates on the
**linear** price lattice, so round-number levels must be computed un-log-transformed.

> **Measured, in 2a — and the best-evidenced row is the one that cannot be drawn.** Computing on the
> real lattice is right and the §12.2 cost was quantified rather than argued (`npm run leak`):
> **drawing the grid names a single chart 94% of the time** — 890 of 944 signatures across 1,000
> charts identify exactly one, taking the instruments still possible from 314 to one.
>
> The leak is in the *spacing*, not in any level's position. Consecutive levels are `0.25 · 10^m`
> apart in real price, so displayed they are `S = 0.25 · 10^m · factor` apart; §12.2 fixes
> `factor = 100 / firstOpen` by indexing every first candle to 100, and rearranging gives
> `firstOpen = 25 · 10^m / S` — the real opening price, exactly, up to an unknown power of ten, read
> off with a ruler. Drawing one level instead hides the spacing and leaves 23 charts and 21
> instruments indistinguishable, which is better by a factor of twenty and still a fifteen-fold
> narrowing from a single line.
>
> So the module is analysis-only: theme tagging, engine logic and the 2c null all use the levels
> without exposing a position. A boundary test fails if anything under `src/app` imports it.

**A determinism trap worth a code comment:** scipy's `'silverman'` for d=1 is the *normal reference*
rule (1.0592·n^−1/5), not Silverman's robust rule that R's `bw.nrd0` gives (0.9·min(σ, IQR/1.34)),
and scipy's `'scott'` is 1.0 not 1.06. **Three things called "Silverman" or "Scott" differ by up to
18%.** Pin an explicit formula; never call a library's named rule.

### 2.5 Volume profile — the correction

The scope document says volume-at-price from OHLCV is "a plausible-looking invention that encodes
nothing". That is right about *synthesising* it and wrong about what we can do.

**TradingView computes volume profile from lower-timeframe bars**: "to compute a daily profile, the
system loads all 1-minute bars that were traded in that daily session." That is our data. We can
build POC, value area high and low at **the same construction, not an approximation of it** — and
say so honestly.

This moves volume profile from "cannot build" to the single best unlock available for a mid tier:
high perceived value, honest implementation, moderate cost, and POC/VAH/VAL are genuine magnet
levels that plausibly relate to where stops get hit.

---

## 3. Market structure labelling — the claim was true, and worse

The scope document claims the two most-used open implementations "disagree materially on every
single primitive" and that one "computes its liquidity threshold from the range of the entire
dataset including the future — a look-ahead bug shipped in a widely used package."

**Confirmed, reproduced, and understated.**

### The look-ahead bug is real and I reproduced it

`smartmoneyconcepts/smc.py` line 595, inside `liquidity()`:

```python
pip_range = (ohlc["high"].max() - ohlc["low"].min()) * range_percent
```

Global max and min over the **entire dataframe**, used as the clustering tolerance at every bar.
The package has 1,924 GitHub stars and ~100,000 PyPI downloads a month.

Reproduced on the repo's own test fixture, holding a 4,000-bar window fixed and appending future
bars:

| future bars appended | tolerance | pools labelled *inside the fixed window* |
| --- | --- | --- |
| 0 | 0.000964 | **3** |
| +500 | 0.001042 | 5 |
| +2,000 | 0.001105 | 7 |
| +20,424 | 0.001644 | **9** |

Labels appear up to 1,446 bars before the window edge, so this is not an edge artefact. **Three
pools become nine purely from data the player cannot see.** The bug is known — issue #101 reports
profit factor 7.32 → 1.82 when it is removed — and a fix was merged in Dec 2024 and **reverted by
the maintainer in March 2025**. It has been ported verbatim into a TypeScript package.

Three further look-ahead channels in the same file, not in the original claim: `swing_highs_lows()`
uses a centred window (±50 bars by default); the first and last bars are force-labelled as swings
unconditionally; and `bos_choch()` writes its label at an *earlier* swing bar, with a median gap of
~150 bars before it becomes knowable.

### The disagreement is up to 13.6×

Counted on the same 4,000 bars of EURUSD 15m:

| Primitive | Counts across defensible definitions |
| --- | --- |
| Fair value gaps | 845 (bare 3-bar gap) → 832 → 308 → 62 (at 1.0× ATR minimum) |
| Equal highs/lows | 54 vs 3 vs 118, depending on swing length and tolerance |
| Swing points | 44 vs 58 vs 530 vs 761 |
| BOS + CHoCH | 22 vs 30 vs 211 |

And the two implementations do not even cover the same primitives: the Python package has **no
premium/discount function**; the Pine script has **no liquidity/sweep primitive** — the word appears
only in its marketing copy.

### There is no canonical spec, and the most-cited "proof" was withdrawn

Michael Huddleston publishes no written specification — no book, no PDF, no glossary; everything is
video. The circulating community transcription is **circular**: a fair value gap requires
displacement, and displacement is defined as a move that leaves a fair value gap.

Peer-reviewed literature on SMC/ICT: **zero**. The most-cited supporting paper (Agarwal 2023, OSF)
was **withdrawn by its own author in November 2025**, citing "glaring flaws, incredibly novice-level
analysis and a total lack of basic statistical tests… this absolute disaster of a project." A
*sympathetic* 2025 IEEE paper concedes that "traditional SMC structures typically yield win-rates of
27%–32%" on 1,000 **hand-labelled** setups.

The useful framing: **even RSI has no canonical implementation.** TA-Lib and TradingView disagree on
weekly BTCUSDT ATR(7) by 12% (998.11 vs 891.05). If a formula from a 1978 book produces that in
2026, "canonical order block" was never coming.

**So the choice is not between the right definition and ours. It is between an undisclosed
definition and a published one.**

### The template to copy: Lo, Mamaysky & Wang (2000)

*Journal of Finance* 55(4):1705–1765. They state each pattern as inequalities over five consecutive
extrema — e.g. head-and-shoulders: E1 is a maximum; E3 > E1 and E3 > E5; E1 and E5 within **1.5%**
of their average; E2 and E4 within 1.5%. Rectangles use 0.75%. Double tops require **>22 trading
days** separation.

Three things to steal:

1. **The detection seam.** Rolling 38-day windows; the final extremum must land on day t+l−1; returns
   measured from t+l+d. Their words: "the lag d ensures that we are computing our conditional
   returns completely out-of-sample and without any look-ahead bias." That is exactly our
   `existsAt`/`knownAt` split, published in 2000 — and it is what both SMC implementations lack.
2. **Honesty about arbitrary parameters.** They shrink the cross-validated bandwidth to 0.3× because
   analysts judged the CV fit too smooth, and say so: "Admittedly, this is an ad hoc approach." They
   also fixed it *before* running the statistics and never revised it.
3. **The GBM null.** They ran the same detector on simulated geometric Brownian motion calibrated to
   the data. Head-and-shoulders: 1,611 real vs 577 random. But **broadening tops: 725 real vs 1,227
   random — random data produces more.** Nobody in this space has published that comparison since
   2000, and we already have the permutation generator sitting unused since Phase 0.5.

### Where the numbers should come from

**Bulkowski** (*Encyclopedia of Chart Patterns*, 3rd ed. 2021) is the right source for missing
tolerances — peak-to-peak variation under 3%, valley depth ≥10%, ≥3/≥2 trendline touches, the V-bottom
38.2% retrace — and the **wrong source for expected outcomes**. His "average rise" is measured to an
"ultimate high" defined as the highest peak before a 20% decline: **an exit only knowable in
hindsight.** He says so himself — these are "perfect trades… unlikely to be duplicated." Patterns are
identified **by eye** (he states automated recognition "will not be as accurate as your eyes… And
that includes Patternz, my free pattern recognition software"), with no out-of-sample test, no
benchmark, no transaction costs, and no survivorship statement.

**The CMT Body of Knowledge has nothing to offer as a spec.** Full-text search of the official 2025
CMT Program Guide: `swing high`, `swing low`, `pivot`, `reaction high` — **zero hits**. There is no
learning objective defining a swing point or a general trendline. CMT-published material concedes
the subjectivity charge directly.

**Edwards & Magee has the genuinely deterministic rules** the canon does contain: a valid trendline
penetration requires a **close beyond by ~3% of price**; the "three days away" rule for confirming a
bottom (three days whose entire range lies above the candidate low's range, not necessarily
consecutive); and Bassetti's Basing Point procedure with its stated 3% and 6% parameters.

### The evidence on whether any of it works

- **Park & Irwin (2007, *J. Economic Surveys*)**: of 95 modern studies, 56 positive, 20 negative,
  19 mixed — "most empirical studies are subject to various problems… data snooping, ex post
  selection of trading rules, and difficulties in estimation of risk and transaction costs."
- **Candlesticks have real, citable negative evidence.** Marshall, Young & Rose (2006, *JBF*):
  "candlestick technical analysis does not have value." Marshall, Young & Cahan (2008): no value in
  Japan across 30 years — **it fails in its own market of origin.**
- **Bajgrowicz & Scaillet (2012, *JFE*)**: transaction costs of 16–70bp eliminate all detected
  outperformance 1897–1962; **no positive performance detected at all in 1962–2011.**
- **Neely, Weller & Ulrich (2009, *JFQA*)** is the framing to adopt: "The excess returns of the 1970s
  and 1980s were genuine and not just the result of data mining. But these profit opportunities had
  disappeared by the early 1990s." Neither "charting is astrology" nor "patterns work", and
  defensible.

### The themes vocabulary, graded

| Theme | Citable definition? | Verdict for us |
| --- | --- | --- |
| **liquidity-sweep** | **Best in the list** — Osler (2003, 2005) order-book evidence | Ship it |
| **compression-expansion** | Yes — parameterised channel rules, NR7, BandWidth percentile | Ship it |
| **range-reversion** | Yes — trading-range-break rules, Donchian | Ship it |
| **trend-continuation** | Partly — breakout direction is mechanical | Ship it |
| **failed-breakout** | Described but **never numerically**; no academic literature under that name | Ship with our own published thresholds |
| **v-reversal** | One hard number: ≥38.2% retrace of the left side | Ship it |
| **news-spike** | No chart definition; needs an event timestamp | Ship as an **outlier detector**, labelled as such |
| **distribution-top** | **Weakest** — Wyckoff phases are a drawing, no bar counts | Defer |
| **gap-fill** | **Meaningless on 24/7 spot** — and the evidence contradicts the folklore: fill probability within 5 days ~20%, gaps show continuation not reversion | Drop |
| **opening-drive** | Real taxonomy (Steidlmayer/Dalton), but **structurally broken on 24/7 spot** — no open, no initial balance | Drop |

Two of the ten are unbuildable on a 24/7 crypto corpus and one is too vague to specify. **Seven ship.**

---

## 4. How to test it — and the correction to §6

### The stability metric in the scope document is measuring the wrong quantity

§6 says: "Perturb every close by a quarter of a tick, re-run, and measure the overlap of the pivot
**index** sets."

Persistence theory says critical **values** are stable and critical **point locations** are not —
"in sharp contrast to the lack of stability of critical points". In a flat or choppy region, one
tick of jitter moves the argmax arbitrarily far along the time axis while the price barely moves.

**So the test as written would fail on correct code.** It must be overlap in **price space**
(Hausdorff or bottleneck distance on swing prices), or index overlap **with a tolerance window**.

This has a design consequence beyond the test: **lines anchored on pivot prices with approximate
times are provably stable; lines anchored on exact bar indices are not.**

### A boolean detector cannot be stable — so grade the output

Kumabe & Yoshida (2023, FOCS) prove that for a deterministic algorithm with boolean output, **no
Lipschitz-continuous algorithm exists**; bounded sensitivity requires randomisation. Their stated
motivation is verbatim ours — frequent output changes mean reduced trust and lack of replicability.

Randomisation is off the table for a shared-state game. That leaves two moves, and we take both:

1. **Grade the output** — emit persistence scores, not booleans.
2. **Hysteresis** — emit at τ_high, retract at τ_low, with **τ_high − τ_low ≥ 4ε**. Only features
   inside a 4ε band can flip, so a wider gap makes the emitted set *provably invariant* once
   established. Canny's edge-detection two-threshold scheme, with its connectivity rule mapping onto
   "admit a minor pivot only if chained to a high-persistence swing".

Plus **snapping**: quantise output levels to a grid coarser than 2ε. Turns "the level moved 0.3
ticks" into "the level did not move", at a known bounded cost, and it is the only way to get
exact-equality assertions in tests.

### Metamorphic testing is the framework

The discipline for "perturb the input, assert a relation on the output" when there is no oracle —
which is exactly our situation. The relations, ordered by how much distinct code they exercise:

| Relation | Transform | Assertion |
| --- | --- | --- |
| **Invertive** | P ← 2m − P, swap H↔L | **Every support becomes a resistance, every ascending channel a descending one, identical indices, mirrored prices.** Tests half the codebase in one relation and catches the classic copy-paste asymmetry between the high-side and low-side paths |
| Multiplicative | P ← kP | Outputs scale by k. **Only holds if every threshold is relative** — a failure here means a hidden absolute-price threshold, i.e. the detector behaves differently on a $5 and a $500 instrument |
| Inclusive | append k bars | **No repainting**: every feature fully inside the first n−w bars is bit-identical. This is the one the SMC package fails |
| Permutative | shuffle bars | **Anti-relation — output must change.** A detector invariant under time permutation is not detecting geometry |
| Volume-only | jitter volume, freeze prices | Price geometry **exactly** invariant. Catches volume leaking into geometry code |
| Additive | P ← P + c | Prices shift by c, feature set invariant |

Order matters: a +0.01 additive shift exercises nearly the same code path and is nearly worthless; a
reflection or a ×100 rescale exercises entirely different branches.

**Three assertion tiers, never mixed.** Exact equalities (affine equivariance, reflection duality,
prefix stability, byte-identical determinism — note that iterating a `Set` of floats to produce
ordered output is a classic determinism offender). Bounded-change inequalities. And statistical
comparisons against the permutation null.

---

## 5. What this means for Phase 2

Six things changed:

1. **Persistence replaces directional change** as the swing primitive — same semantics, graded
   output, and a stability theorem instead of a hope. DC survives as the citation for what a swing
   *means*.
2. **Volume profile moves from "fabrication" to "ship it"** — buildable at TradingView parity from
   the one-minute bars we already store, and the best mid-tier unlock available.
3. **Theil–Sen becomes the default channel**, with the L∞ LP kept as a separate object — because a
   channel determined by exactly three bars has a breakdown point of zero and solver-dependent ties.
4. **The stability test is rewritten** to measure price-space overlap, because the index-set version
   measures the one quantity that is provably unstable.
5. **The themes list drops to seven** — gap-fill and opening-drive are meaningless on 24/7 spot, and
   distribution-top has no specifiable definition.
6. **The GBM/permutation null becomes a first-class deliverable**, not just a test. Publishing
   detector counts on real versus shuffled data is the single most persuasive artefact available,
   nobody has done it since 2000, and the generator has been sitting in the corpus since Phase 0.5.

### Open items

- The LuxAlgo Pine source was read from a gist, not the TradingView original. Diff before quoting.
- No peer-reviewed formulation of hull-edge *selection* exists; our rule is defended on determinism,
  not on evidence.
- The "Rényi" turning-point method named in the scope document **does not appear to exist** — no
  such swing-detection method could be found under that name. Treat as a mis-remembered reference.

### What building 2a changed in this document

Four things, all corrections to claims made here before they were run. Recorded rather than edited
away, because a research note that silently agrees with whatever got built is not evidence.

1. **Trendlines are computed in linear tick space, not log space.** The rendered axis is linear, so a
   log-space line is a curve on the chart the player sees — about 26 ticks off at the midpoint of a
   100-to-115 lead-in — and tick space is what makes the orientation predicate exact.
2. **The Hough stability test does not reproduce.** See §2.2. The bin-width dependence does.
3. **Round numbers cannot be drawn.** See §2.4. The construction was right and the display is not
   affordable.
4. **The kernel bandwidth and the touch band must share a metric.** Building it surfaced a live bug
   the design did not anticipate: a log-space bandwidth with a linear-space touch band makes a chart
   and its §12.2 mirror disagree about which extremes touch which level. Both are log now. The
   residual — relative bandwidth is preserved only to first order under a multiplicative reflection,
   measured at 0.54% — is a real property of composing a linear volatility measure with a log map,
   and is stated in the tests rather than tuned away.
