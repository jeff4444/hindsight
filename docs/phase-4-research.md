# Phase 4 research — honesty, before building it

Research conducted before writing any Phase 4 code, on the pattern Phases 2 and 3 established: the
scope document's proposals are checked against sources and against this corpus first, because the
wrong ones are expensive to discover after the code exists.

**Four findings change the plan.**

1. **The synthetic control §7.2 specifies is detectable, and the paper proving it used our exact
   method.** Hasanhodzic, Lo & Viola built a financial Turing test out of *random temporal
   permutations of returns* — which is what `src/core/permute.ts` produces — and found subjects
   distinguish them from real series with p ≤ 0.5% across all eight datasets. The conditions that
   made it work are immediate feedback and practice, which is a description of Hindsight.
2. **GBM, the scope's first-named generator, fails both stylised facts.** Measured on this corpus:
   real hourly returns have volatility-clustering ACF(|r|) of **0.183** at lag 1 and kurtosis
   **13.0**. GBM gives **−0.001** and **2.98**. Permutation preserves the tails perfectly and
   destroys the clustering completely. Only a **block bootstrap** gets both approximately right.
3. **The cost model is not a haircut, it is a gradient — and it lands precisely on the decision the
   current scoring is blind to.** Gross, mean R across the enumerated grid is flat in stop distance
   (−0.026R at 0.5 ATR, +0.002R at 1.5 ATR). Net of 20 bps round trip it is monotone: **−0.215R at
   0.5 ATR against −0.035R at 4 ATR**. The best cell on the chart *changes identity on 22% of
   charts*.
4. **The regime breakdown §7.3 demands cannot be published at n = 1,000.** Across 8 engines × 16
   regime cells, **not one school engine has 30 trades in any cell**. Channel's largest is 22,
   Reversion's is 3, Geometry's is 0.

---

## 1. Synthetic controls

### 1.1 The literature says our generator is detectable

> **Source status: fact.** Hasanhodzic, Lo & Viola, *Is It Real, or Is It Randomized?: A Financial
> Turing Test* ([arXiv 1002.4592](https://arxiv.org/abs/1002.4592), 2010).

Subjects were shown two animated price charts side by side, one a replay of real history and one
built by cumulating **uniformly permuted returns** — in the authors' words, a series that "does not
alter the marginal distribution of the returns, but destroys the time-series structure of the
original series". They pressed a button to pick the real one and were told immediately whether they
were right.

The result: **p-values at most 0.503% for each of the eight datasets, and below 0.001% for six.** The
worked example in the paper is the "Lynx" dataset — 26 subjects, 35 charts each, 506 correct out of
910, or **55.6%**.

Three details matter more than the headline:

- **The effect is small per chart and overwhelming in aggregate.** 55.6% is a 5.6-point edge. No
  individual player would notice it. Over 1,000 rounds it is decisive.
- **Feedback and practice are load-bearing.** The authors single out immediate feedback as "a key
  feature of the experiment", and subjects could practise on a separate dataset first. Hindsight
  gives immediate feedback on every round and unlimited unmetered practice (§14 Tapes). We are
  building the conditions the effect was demonstrated under.
- **It refutes the older result, not the other way round.** The 1978 *Financial Analysts Journal*
  study found analysts could not do this. It used static charts and no feedback.

An earlier draft of this section asserted that subjects were probably using volatility clustering.
**The paper does not say that**, and the claim is removed rather than dressed up — §1.2 measures
what our permutation actually destroys, which is the defensible version of the same idea.

### 1.2 What each generator preserves, measured on this corpus

293 charts, hourly log returns from the stored lead-in. ACF(|r|) is the autocorrelation of absolute
returns — the standard volatility-clustering signature. Kurtosis is of raw returns; a Gaussian is 3.

| series | ACF&#124;r&#124; lag 1 | 2 | 3 | 5 | 10 | kurtosis | ACF(r) lag 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **real** | **0.183** | 0.117 | 0.081 | 0.069 | 0.040 | **13.02** | −0.029 |
| permutation (`permuteBars`) | −0.004 | −0.003 | −0.003 | −0.002 | −0.002 | **12.96** | −0.005 |
| block bootstrap, 4 bars | 0.134 | 0.063 | 0.019 | −0.010 | −0.002 | 10.49 | −0.029 |
| block bootstrap, 8 | 0.148 | 0.076 | 0.043 | 0.022 | −0.011 | 10.70 | −0.034 |
| **block bootstrap, 16** | **0.151** | **0.088** | **0.053** | **0.042** | 0.010 | 11.21 | −0.037 |
| block bootstrap, 32 | 0.151 | 0.085 | 0.057 | 0.046 | 0.009 | 10.82 | −0.032 |
| GBM (minute steps, aggregated) | −0.001 | −0.004 | −0.004 | −0.005 | −0.000 | **2.98** | — |

**Permutation preserves the marginal distribution exactly** — kurtosis 12.96 against 13.02, which is
the whole design of `permuteBars` and it works. It destroys clustering completely.

**GBM fails both.** Kurtosis 2.98 against a real 13.0 means it has no fat tails at all: no gaps, no
shocks, nothing that looks like a liquidation cascade. A trader would not need volatility clustering
to spot it. **§7.2 names GBM first among the generators; on this evidence it should not be used.**

**Block bootstrap at 16 bars is the best available compromise** — 83% of the real lag-1 clustering
and a similar decay shape, at the cost of some kurtosis (11.2 against 13.0), because resampling
blocks dilutes the rarest single-bar extremes. Blocks of 16 and 32 are indistinguishable from each
other on these statistics; 16 is preferred because a longer block reuses more contiguous real price
action, and at 32 bars out of an 80-bar window a "synthetic" chart is mostly one real chart.

### 1.3 The trade-off nobody can escape, stated plainly

There is no generator here that is both a valid null and undetectable:

- **Permutation** is the *cleanest null* — it destroys exactly the serial structure that technical
  analysis claims to read, and nothing else. It is also the most detectable, per §1.1.
- **Block bootstrap** is the *least detectable* but a **weaker null**: it preserves serial structure
  inside each block, so a player who profits on it may be reading real structure that survived the
  resampling. A 16-bar block inside an 80-candle window preserves a fifth of the chart intact.

This is a genuine tension and it should be published rather than resolved by picking one and staying
quiet. **The recommendation is to ship both**, tagged in `source_note`, because they answer different
questions: permutation asks "can they read serial structure at all", block bootstrap asks "can they
read it when the fake looks convincing". Disagreement between the two is itself the finding.

### 1.4 The architectural constraint the scope does not mention

`resolve()` walks the **one-minute path** (`PATH_BARS_PER_DISPLAY_BAR = 60`, `PATH_BARS = 3600`), and
§12.3's fill semantics depend on it. So a synthetic chart is not 80 fake candles — it needs:

| | |
| --- | --- |
| lead-in | up to 300 hourly bars |
| `resolution_path` | **3,600 one-minute bars** for the reveal |
| `detail_path` | one-minute bars for the whole window, display only |
| achievable set | 98 cells enumerated on that path |
| regime tags | ER and volatility buckets, computed like any other chart |

**Generate at one-minute resolution and aggregate up.** Generating hourly bars and interpolating a
minute path would fabricate the intrabar geometry that decides every stop fill, which would make
synthetic charts systematically easier or harder to resolve than real ones — a confound in exactly
the measurement the phase exists for.

This is a real cost: it is a corpus-generation job, not a function. It is also why the `synthetic`
and `source_note` columns already exist (migration 0007) — Phase 0.5 reserved them for this.

### 1.5 What this phase can and cannot answer without players

The synthetic corpus can be **built, tagged and mixed in** with no users. What needs volume is the
comparison. Two things can be measured immediately:

- **The engine council on synthetic charts.** Eight engines already replay over the corpus. If they
  score the same on real and synthetic — and §14.7 says they score nothing on real — that is a
  consistency check on the whole apparatus, and it is free.
- **Detectability by our own detectors.** §13.8 ran the ten theme detectors against permuted bars.
  The same comparison against block-bootstrapped bars measures how much structure the block
  bootstrap leaves behind, which is the number §1.3's tension turns on.

---

## 2. Transaction costs

### 2.1 The literature, and the methodological point that matters more than the number

> **Source status: fact.** Bajgrowicz & Scaillet, *Technical Trading Revisited: False Discoveries,
> Persistence Tests, and Transaction Costs*, Journal of Financial Economics 106(3), 2012
> ([SSRN 1095202](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1095202)).

Revisiting the Sullivan–Timmermann–White universe of technical rules on the Dow, they find that
**"the initial performance fully disappears after the inclusion of transaction costs"**, using
one-way costs of **20 basis points**, which they describe as conservative for the period.

The methodological finding is the more useful one for us, and it is stated as a criticism of the
obvious approach:

> We explain why break-even transaction costs are not a satisfactory indicator, and why it is
> important to consider transaction costs already during the selection process.

That is a direct instruction about where costs belong: **inside the enumeration, not applied to the
result afterwards.** §2.4 works out what that means here, and it is not cheap.

### 2.2 What a trade actually costs on this corpus

The corpus is Binance spot. Standard VIP 0 spot fees are **0.1% maker and 0.1% taker**
([Binance fee schedule](https://binanceviplevelsfee.com/vip-0-spot-fee.html)), so a round trip is
**20 bps** before slippage. Stops are market orders on trigger, so they pay the taker fee *and* slip.

The number that converts this into R is the ATR-to-price ratio, measured over all 1,000 charts:

| | p05 | p25 | median | p75 | p95 |
| --- | --- | --- | --- | --- | --- |
| ATR(14) ÷ entry price | 0.701% | 1.115% | **1.505%** | 2.126% | 4.077% |

Cost in R is `round-trip bps ÷ (stop in ATR × ATR share)`, so it is **inversely proportional to stop
distance**:

| stop | median chart | quietest 5% | wildest 5% |
| --- | --- | --- | --- |
| **0.5 ATR** | **0.266R** | **0.571R** | 0.098R |
| 0.75 ATR | 0.177R | 0.381R | 0.065R |
| 1 ATR | 0.133R | 0.285R | 0.049R |
| 2 ATR | 0.066R | 0.143R | 0.025R |
| 4 ATR | 0.033R | 0.071R | 0.012R |

**On the quietest charts a 0.5 ATR stop pays over half its own risk in fees.** That is not a
rounding error on the scoring, it is a different game.

### 2.3 What it does to the achievable set

250 charts, all 98 cells enumerated twice — gross, and net of 10 bps spread plus 5 bps stop
slippage.

| | gross | net |
| --- | --- | --- |
| oracle (best cell on the chart) | 4.677R | 4.384R (−6.2%) |
| median cell | −0.659R | −0.705R |
| cells finishing above zero | 39.5% | 39.4% |
| **the best cell changes identity** | — | **on 22.0% of charts** |

And the gradient, which is the finding:

| stop | mean R gross | mean R net | drop |
| --- | --- | --- | --- |
| 0.5 ATR | −0.026 | **−0.215** | 0.189 |
| 0.75 ATR | −0.017 | −0.147 | 0.130 |
| 1 ATR | −0.020 | −0.119 | 0.099 |
| 1.5 ATR | **+0.002** | −0.065 | 0.067 |
| 2 ATR | −0.014 | −0.064 | 0.050 |
| 3 ATR | −0.007 | −0.039 | 0.032 |
| 4 ATR | −0.012 | **−0.035** | 0.024 |

**Read the two middle columns against each other.** Gross, stop distance does not matter — every row
is within 0.03R of every other, and the best row is 1.5 ATR by a margin indistinguishable from noise.
Net, stop distance is the single largest determinant of expectancy in the grid, and it is monotone.

§15's stated risk is that *"percentile scoring rewards lottery tickets"*. This is the mechanism,
measured: **gross scoring makes tight stops look free.** They are not free, they are the most
expensive choice on the board, and a player optimising against the gross percentile is being trained
toward the one decision that costs the most money.

### 2.4 Where costs have to go, and what that invalidates

`enumerateAchievable` already takes a `Costs` argument and every stored chart was enumerated with
`NO_COSTS`. Two options, and they are not equivalent:

**(a) Enumerate net.** Costs enter the achievable set, so the percentile a player is scored against
is a net percentile. This is what Bajgrowicz & Scaillet's instruction implies, and §2.3 shows why:
if costs are outside the enumeration, the oracle is the wrong bracket on 22% of charts and the
ranking a player is measured against is a ranking of a game nobody plays.

The price is severe and unavoidable: **every stored percentile, chart rating, retirement verdict and
achievable set becomes incomparable.** §12.4 is explicit that population statistics do not survive a
change of rule. `ACHIEVABLE_VERSION` bumps, all 1,000 charts re-enumerate, and every rating computed
so far is invalidated. Cheap now — there are no players — and progressively less so.

**(b) Display gross and net side by side, score on gross.** §15's own mitigation says "display gross
and net R side by side from phase four", which reads like (b). It costs nothing, invalidates nothing,
and leaves the incentive in §2.3 exactly as it is.

**This is a decision for the project owner, not a technical detail**, because it trades a one-time
invalidation against a permanent distortion in what the product teaches. The recommendation is (a),
taken now while the corpus has no players attached to it, with the gross number still displayed
beside the net one so the cost is visible rather than silently absorbed.

### 2.5 The numbers to freeze

Pre-registered before anything is measured, on the §14 manifest pattern:

| | value | source |
| --- | --- | --- |
| spread / fee | 10 bps a side | Binance spot VIP 0, published |
| stop slippage | 5 bps | **ours** — a market order on a trigger, no published figure |
| basis | round trip on notional | |

The 5 bps is an invention and must be labelled as one. It is the only number here without a source,
and §14's provenance discipline applies: publish it, mark it ours, and let it be argued with.

---

## 3. Engine track records by regime

§7.3: *"Never publish an aggregate engine number without the regime breakdown next to it."* That is
the right rule and **the corpus cannot satisfy it.**

### 3.1 The corpus is not balanced, because trends are rare

1,000 charts across the 16 cells of §11.1's grid (efficiency ratio × volatility):

| | quiet | subdued | active | violent |
| --- | --- | --- | --- | --- |
| chop | 79 | 78 | 78 | 78 |
| noise | 78 | 78 | 78 | 78 |
| directional | 78 | 78 | 78 | 78 |
| **trend** | **4** | **9** | **18** | **32** |

Twelve cells are balanced by the selection rule. The trend row is not, because a high efficiency
ratio is genuinely uncommon — and the corpus cannot manufacture what the market did not do.

### 3.2 Trades per engine per cell, which is the fatal number

| engine | cells with ≥30 trades | cells with ≥10 | largest cell |
| --- | --- | --- | --- |
| Channel | **0** | 11 | 22 |
| Reversion | **0** | 0 | 3 |
| Reversion (Hindsight) | **0** | 1 | 10 |
| Sweep | **0** | 1 | 10 |
| Pattern | **0** | 0 | 8 |
| Geometry | **0** | 0 | 0 |
| Tape | **0** | 1 | 10 |
| Engine Zero | 13 | 14 | 79 |

**Not one school engine reaches 30 trades in any of the 16 cells.** §14.7 already established that
198 trades cannot resolve a 0.1R edge; 22 trades cannot resolve anything at all, and there would be
128 such cells to report — a multiple-comparison problem that dwarfs the eight-engine family the
whole of §14.7 was built to correct for.

### 3.3 What is reportable: the marginals, and only for one engine

Collapsing to the four efficiency-ratio buckets:

| engine | chop | noise | directional | trend |
| --- | --- | --- | --- | --- |
| **Channel** | **60** | **56** | **66** | 16 |
| Reversion (Hindsight) | 27 | 19 | 31 | 11 |
| Sweep | 23 | 25 | 6 | 0 |
| Tape | 16 | 23 | 20 | 2 |
| Pattern | 10 | 4 | 17 | 1 |
| Reversion | 9 | 7 | 6 | 0 |
| Geometry | 0 | 0 | 0 | 0 |

Volatility marginals are similar — Channel 46–51 per bucket, everything else under 26.

**So the honest deliverable is:** the marginal breakdown by efficiency ratio and by volatility,
published with its counts, plus a plain statement that the 16-cell cross is not measurable on this
corpus and an aggregate is therefore all §14.7 is entitled to report. That satisfies the *spirit* of
§7.3 — never let an aggregate stand alone unqualified — while refusing to print 128 cells of noise
in order to satisfy its letter.

---

## 4. What Phase 4 should be, without players

| | |
| --- | --- |
| **4a — costs** | The frozen cost constants, the gross/net split, and the decision in §2.4. The measurement in §2.3 is the deliverable: the grid's cost gradient, published. |
| **4b — the synthetic corpus** | Block-bootstrap and permutation generators at one-minute resolution, tagged, with achievable sets and regime tags, mixed into the corpus. Detectability measured against the §13 detectors rather than against players. |
| **4c — regime records** | The marginal breakdowns of §3.3 with their counts, and the published statement that the cross is not measurable. |

**Deferred until there are players:** the actual real-versus-synthetic comparison (§7.2's three
outcomes), style fingerprinting, and any claim about whether skill exists. Those need volume, and
none of them is blocked by the work above.

## Open items

- **Whether to score net or gross** (§2.4) decides whether the corpus re-enumerates. It needs an
  answer before 4a is written, not after.
- **The 5 bps slippage figure is ours and unsourced.** Worth revisiting against real Binance
  order-book data if that is ever pulled; until then it is published as an invention.
- **Block-bootstrap block length of 16 is chosen from §1.2's table**, which is a measurement on this
  corpus, so under §14's own discipline it counts as a specification and must be registered before
  synthetic charts are generated — not tuned afterwards to make detection rates look better.
- **A synthetic chart has no `symbol`**, and §14.7's cluster bootstrap resamples whole symbols.
  Synthetic charts need a clustering convention before they enter any statistical test.
