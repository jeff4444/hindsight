# Hindsight — Product Scope & Design Document

**Trade the past. Learn the future.**

Version 0.2 · August 2026 · Supersedes v0.1

A chart-reading trainer built on real historical price action, scored against the exact set of
outcomes that was achievable on that path, and judged by a council of rule-based engines drawn
from named, citable schools of trading.

---

## Contents

1. [What Changed in v0.2, and Why](#1-what-changed-in-v02-and-why) — the pushback; read this first
2. [The Pitch](#2-the-pitch) — positioning and the unoccupied square
3. [The Ruleset Ladder](#3-the-ruleset-ladder) — Full Desk → News Blind → No Tools → Naked → Blackout, plus mods
4. [Scoring Model](#4-scoring-model) — R-multiple, the achievable set, two scoring scales, calibration
5. [The Engine Council](#5-the-engine-council) — six named schools, three special-status engines, published selection rules
6. [Analysis Architecture](#6-analysis-architecture) — seven layers, reordered by real dependency
7. [The Honesty Programme](#7-the-honesty-programme) — synthetic controls, published track records, Engine Zero
8. [Chart Rating and Content Health](#8-chart-rating-and-content-health) — charts as rated opponents; the moat
9. [The News Layer](#9-the-news-layer) — the leakage rule, and news as the top rung
10. [Game Modes and Progression](#10-game-modes-and-progression) — one library, many framings
11. [Maps and User-Generated Content](#11-maps-and-user-generated-content) — regimes not assets; the licensing surface
12. [Fairness and Integrity](#12-fairness-and-integrity) — non-negotiables
13. [Data](#13-data) — coverage, licensing, filtering, rendering
14. [Build Sequence](#14-build-sequence) — dependency order and exit conditions
15. [Risks and Open Questions](#15-risks-and-open-questions)
16. [Explicitly Out of Scope](#16-explicitly-out-of-scope)

> **Status of this revision** — v0.1 was a strong product thesis resting on an engine and layer architecture that had not been checked against the trading canon, the academic literature, or the state of the art in automated chart analysis. It has now been checked. Roughly a third of it survives unchanged, a third needed renaming or respecification, and a third was wrong in ways that would have shipped as bugs. Section 1 is the list. Read it before anything else.


## 1. What Changed in v0.2, and Why

This section exists so that nothing in the rest of the document has to be defended twice. Each row is a position in v0.1 that research contradicted, together with the replacement. The evidence behind each is cited in the section that implements it.


### 1.1 Architectural findings


| Finding | v0.1 position | v0.2 position |
| --- | --- | --- |
| The one-shot bracket games the least important decision | A single entry, stop and target per round is the entire skill under test. | Kept as the ranked format because it is the only thing that makes cross-player comparison tractable — but explicitly named as a partial skill, paired with a separate **Manage** ladder, and every result now reports MFE/MAE so the player sees the managed ceiling they left behind. See §4.6 and §9. |
| The counterfactual should be enumerated, not sampled | Sample a large number of plausible orders and resolve them against the future bars. | Every player gets the same path, so the achievable set is finite and exactly computable. A ~98-cell grid over direction × stop distance × target multiple replaces the Monte Carlo. Zero sampling error, perfectly reproducible, and it yields the axis decomposition for free. See §7.2. |
| Layer 2 computes the wrong statistic | Nearest-neighbour search returns a distribution of what happened next. | A terminal-return distribution does not answer this game’s question. The game resolves on **which of stop or target is touched first** — a first-passage problem. Base rates must be conditioned on stop and target distance in ATR or they are miscalibrated against the product’s own resolution rule. See §7.6. |
| Percentile scoring rewards variance-seeking | The player’s R lands somewhere inside the distribution and that percentile is the score. | This is matchpoint scoring, and it inherits matchpoints’ known behavioural consequence: at the margin it pays to buy lottery tickets. Ranked and duels move to an IMP-style compressed scale; the daily keeps percentile because spiky is shareable. See §4.3. |
| A free unlimited skip rebuilds selection bias | Skipping is a scored move that earns points when the chart went nowhere. | Correct and worth keeping — but unbounded, it recreates the question-selection problem from forecasting tournaments, where the optimal play is to answer only the easy questions. Ranked sessions now carry a minimum entry quota. See §4.4. |
| The R-multiple sensitivity example is definitionally wrong | "Same entry, stop 0.6 ATR lower: this becomes +2.4R." | Moving the stop changes R itself — it is the denominator. Under fixed-fractional sizing a wider stop means a smaller position for the same dollar risk. Counterfactuals must be stated either at constant dollar risk with resized position, or at unchanged size in currency terms. Anyone Tharp- or CMT-literate spots this immediately, and they are the audience worth keeping. See §7.5. |
| One chart a day cannot produce a thousand reps, or a player model | Daily challenge is the front door; player modelling reads tilt, latency and session decay. | Tilt signatures and session decay are within-session sequential effects. One observation per day starves them and takes a year to reach significance. The rep-generating modes (Practice, Storm, Streak) are promoted from "later" to core, and the daily is reclassified as a distribution mechanism rather than a retention mechanism. See §9. |
| Half the engine roster had no citable authority | Price Action, Mean Reversion and Breakout as three of six engines. | These are categories, not schools. They cannot be audited, cited or argued with, which defeats the entire premise of a published rule set. Every engine in v0.2 traces to a named practitioner and a specific text. See §6. |
| Volume Profile from OHLCV is a fabrication | Support and resistance zones via clustering plus volume-by-price. | OHLCV contains no volume-at-price. Spreading a bar’s volume across its range is a plausible-looking invention that encodes nothing. Either build a **TPO profile from real lower-timeframe bars** — which is the original 1980s definition and exactly reproducible — or do not ship the feature. See §7.3. |
| Layer 1 mixed two vocabularies and called both canonical | Swing points and trendlines alongside equal-high liquidity clusters and break-of-structure labelling. | The first half is CMT and IFTA curriculum material. The second half is Smart Money Concepts, a post-2016 retail dialect that appears in neither. Including it is a defensible product decision — it is how the target audience talks — but it is a positioning choice, not a neutral fact, and presenting it as "what traders are taught" loses credibility with both camps at once. See §6.4. |
| Three inputs every trader uses were absent | A single window, single timeframe, no volume, no costs. | Multi-timeframe context is near-universally taught; volume is mandatory for a third of any serious engine roster; and a frictionless game trains players toward tight stops and marginal setups that lose money net of spread. All three are now in scope, and two of them become rungs on the difficulty ladder rather than universal defaults. See §3 and §7.1. |
| Nothing rated the content | Rounds are filtered for quality offline and served. | A chart is an opponent. It should carry a rating, a rating deviation and a play count, exactly as a chess puzzle does, and a chart on which strong and weak players score identically should be automatically retired from ranked play. This is the single most defensible asset in the product and it did not exist in v0.1. See §10. |
| There was no answer to the strongest objection | Risks table notes that replay practice does not reproduce slippage or real capital pressure. | The real objection is worse than that and deserves a direct answer rather than a footnote. §8 gives it one, and turns it into a feature. |


### 1.2 What survives unchanged

For the avoidance of doubt, the following v0.1 decisions were tested and held up. They are not relitigated later in this document.

- **R-multiple as the base unit** rather than realised profit and loss. This is Van Tharp’s framework, it normalises across instruments and volatility, and it is what allows a currency scalp and an index swing to sit on one leaderboard.
- **Scoring against a distribution rather than an outcome.** This is duplicate bridge’s insight — the same deal played by everyone, scored on relative skill — and no trading product has implemented it.
- **Restraint as a scored action.** Passing is most of trading and nothing else in the category scores it.
- **A council that disagrees rather than an oracle that predicts.** Correct, honest, and the only defensible way to present technical analysis given what the literature says about it.
- **Disagreement as the difficulty signal.** Free to compute and it produces a difficulty curve with no manual curation.
- **Engine versioning pinned to every stored result.** This must be in the first commit. It is unfixable later.
- **No future data on the client, ever.** The single most important integrity rule in the product.
- **Phase 0 gate: the loop must be fun with no analysis layer at all.**

> **The framing that changed** — v0.1 claimed to teach chart reading. That claim is not supportable and does not need to be made. What Hindsight can defend is narrower and more interesting: it trains **risk-defined decision making under uncertainty**, it measures **calibration** — the one skill in this space with clean experimental evidence of trainability — and it is the only product in the category with a commercial incentive to publish whether any of it works.


## 2. The Pitch

Hindsight is GeoGuessr for trading. A player is dropped onto a real historical price chart with the ticker and the dates hidden, places a trade with a stop and a target, and watches the app fast-forward the candles to reveal what actually happened.

The differentiator is not the guessing loop. Several small apps already do a shallow version of that. The differentiator is what happens after the trade: the player is scored against the **exact set of outcomes that was achievable on that path**, and then a council of rule-based engines — each a faithful implementation of a named school of trading, each with a published rule set and a published track record — replays the chart and shows what a disciplined practitioner of that school would have done.

The core educational claim is deliberately narrow and defensible: markets are noisy, edges are thin, and competent people disagree. Hindsight demonstrates that empirically instead of asserting it.


> **Positioning** — The trading education market sells certainty. Hindsight sells calibration. It is the only product in the space with a commercial incentive to publish the honest track record of the methods it teaches — and, per §8, to publish whether the underlying skill exists at all.


### 2.1 The unoccupied square

Every existing product fails on at least one of four axes. The table below is the competitive map, and the empty cell is the product.


| Product | Risk-defined decision | Future unreachable | Scored vs a field | High rep count |
| --- | --- | --- | --- | --- |
| Chart Guess / ChartGuessr | No — binary buy/sell | Yes | No — accuracy % | Yes |
| Chartz | No — direction or price | Yes | No | Yes |
| Guess the Stock Chart | No — identify the ticker | Yes | No | No — 3/day |
| TradingView Bar Replay | Yes | **No — scrollable** | No | Partial |
| FX Replay, TradeZella | Yes | Yes | No — own journal only | Partial |
| Investopedia, Wall St Survivor | Partial | Yes | No — raw return | No |
| **Hindsight** | **Yes** | **Yes** | **Yes** | **Yes** |

Four sub-gaps are worth naming separately, because each is independently defensible.


1. **Risk-defined decisions, not direction calls.** Every competitor asks up or down. Direction is the least valuable part of a trade and the easiest thing to get right while still losing money. Stop and target placement is the skill, and nobody scores it.
2. **R-multiple, not profit and loss.** This is what lets a currency pair and an equity index share a leaderboard. Portfolio simulators structurally cannot do it.
3. **A distribution, not a binary outcome.** Being right for the wrong reason and wrong for the right reason are both scored correctly when the comparison is against what could have happened from that setup.
4. **Difficulty-rated content.** No trading product has anything resembling a puzzle rating. After a hundred thousand plays the chart library carries calibrated difficulty ratings that a competitor cannot clone by scraping price data. This is the moat.

Two of these — the mode surface and the underlying data — are explicitly **not** defensible. A competitor already shipped blitz, duels, streaks and a per-pattern analytics dashboard, and OHLCV is a commodity. The scoring model and the accumulated difficulty ratings are the assets. Build those first.


## 3. The Ruleset Ladder

GeoGuessr has Moving, No Move, and NMPZ. The tiers are strictly nested — each is a subset of the affordances of the one above, nothing is added back — which is why the ladder reads as legitimate rather than arbitrary. There is an unambiguous information ordering, so "harder" is a fact rather than an opinion. Hindsight needs the same thing, and the reasons are the same.


### 3.1 The governing principle


> **Restrict identity, hindsight and crutches. Never restrict risk arithmetic.** — GeoGuessr can remove panning because panning is search effort, not problem data — the frozen frame still contains everything needed to compute a correct answer. Trading has a category of information that is not a crutch: **volatility scale.** A player who does not know the instrument’s typical range cannot place a stop that is neither noise-adjacent nor absurd. Hiding it does not test skill; it randomises the result and compresses the gap between expert and novice, which is the textbook definition of artificial difficulty.

So the axes to restrict are:

- **Identity** — ticker, asset class, exchange, date, absolute price level. These let a player recall rather than read. Recall is the trading equivalent of driving down the road until you find a signpost: an effort grind, not a perception skill.
- **Hindsight** — anything that lets a player reach the future. Scrollable data, an identifiable chart they can look up, a shape they have memorised.
- **Crutches** — indicators that pre-digest the price action, higher-timeframe views that hand over the structure, news that supplies the answer, and unlimited deliberation time.

And the axis to preserve at every tier including the hardest:

- **Geometry and risk arithmetic** — a normalised price axis, a volatility badge, tick size, and session boundaries where they exist.

Concretely: index every chart to 100 at the first visible candle and display a persistent badge reading **1 ATR = 2.4 units**. Identity information is destroyed and risk information is preserved in the same move. Every tier can then be defined purely by which reading aids it removes.


### 3.2 The tiers

Five nested tiers plus an unrated sandbox. The letter code is the rule list, following the convention that made NMPZ a word people say out loud.


| Code | Name | Grants | Removes versus the tier above |
| --- | --- | --- | --- |
| — | **Sandbox** | Everything, plus scrubbing the reveal, retries, and the ticker shown up front. | Unrated. This is the learning surface, not a tier. |
| **FD** | **Full Desk** | Pre-trade news headlines, 300 candles, three timeframes, indicators, drawing and measuring tools, volume, unlimited time, post-entry trade management. | Ticker, date, retries. |
| **NN** | **News Blind** | Everything in Full Desk except the headlines. | The pre-trade news feed. News moves to the reveal, where it belongs. |
| **NT** | **No Tools** | 300 candles, three timeframes, volume, unlimited time, management. | All indicators and all drawing tools. Levels must be eyeballed. |
| **NTZ** ★ | **Naked** | 80 candles, one timeframe, volume, ATR badge, a 90-second clock, set and forget. | Higher-timeframe context, extra history, unlimited deliberation, and post-entry management. |
| **NTVZ** | **Blackout** | 60 candles, no volume, ATR badge retained, a 20-second clock, one look. | Volume and deliberation time. This is a reflex tier. |


#### Why NTZ is the ranked standard


1. **It kills the grind axis.** Unlimited time plus multi-timeframe zoom is the trading equivalent of driving down the road: the player willing to spend four minutes wins, and willingness to spend four minutes is not a skill worth ranking. A 90-second clock on a fixed frame makes the reading decisive.
2. **It kills the identity metagame.** With volume, multi-timeframe structure and unlimited inspection, a determined player will fingerprint the instrument from volume shape, session gaps and tick granularity, then recall the outcome. NTZ removes most of the fingerprinting surface.
3. **Set-and-forget makes the decision atomic and therefore scorable.** Trade selection and trade management are different skills. Conflating them makes the score uninterpretable — this is the chess time-control argument, and it is why Manage gets its own ladder rather than being folded in.
4. **Ninety seconds makes duels, blitz and streaming work.** A ten-round duel resolves in about fifteen minutes, which is the shape of the GeoGuessr World Championship format.
5. **The spectator sees exactly what the player sees.** This is the whole NMPZ spectator argument. A frozen frame is a shared object between player and audience; a private search process is not. It is why the stream-along feature in §9 works at this tier and nowhere else.
6. **Skill transfers downward, not upward.** An NTZ-trained player is strictly better at Full Desk. The reverse is not true. That is what makes the hardest tier aspirational rather than niche.

Blackout is deliberately not the standard. At 60 candles with no volume and 20 seconds, it starts to compress rather than widen the gap between strong and weak players, which by the test in §3.5 makes it artificial difficulty. Keep it as a prestige format and a showcase for streams.


### 3.3 Mods

A second axis, layerable and not nested, modelled on osu!’s mod system. Following that precedent, the cosmetic recognition matters more than the number: a result earned under a mod should be permanently marked as such.


| Mod | Effect | Multiplier |
| --- | --- | --- |
| **Mirror** | Chart flipped vertically and price inverted. Destroys shape recall without removing any information a reader actually uses. | 1.05× |
| **Fog** | The lead-in candles play forward once in real time with no scrubbing back. Tests memory of structure rather than inspection of it. | 1.10× |
| **Blind Scale** | The price axis is removed entirely. The ATR badge is retained, so risk arithmetic still works. | 1.08× |
| **Silent** | No ticker or date reveal even after the round. Kills the look-it-up loop. | 1.03× |
| **Iron** | One entry, no re-quote, no pass. | 1.05× |
| **Wide** | 250 candles of history instead of 80. A reduction mod. | 0.85× |
| **Assist** | Suggested stop and target rails are shown. A reduction mod, for onboarding. | 0.50× |


> **Mirror should be permanent in ranked, not optional.** — It is the primary defence against shape recall and it costs the player nothing legitimate — an inverted chart is exactly as readable as an upright one to someone reading structure rather than recalling an instrument. Randomise it per chart so nobody can calibrate to it.


### 3.4 Multipliers, and why mostly not

The honest answer on cross-tier multipliers is: do not have any. Chess does not convert a blitz rating into a classical one. Speedrunning does not convert glitchless into any percent. GeoGuessr runs three ranked modes with separate per-mode ratings. Every attempt to assert a conversion generates an argument that consumes the community, which is exactly what has happened in the GeoGuessr duels forums over multipliers.

**For ranked:** separate Glicko-2 ratings per tier, feeding one overall rating that drives matchmaking and division placement. Per-tier ratings surface only above a division threshold and are explicitly labelled as statistical. Do not launch three separate ranked queues — a new game cannot fill them.

**For the XP and cosmetic economy**, where fairness matters less, multipliers are fine. Keep them conservative: 1.00× at Full Desk rising to roughly 1.15× at Naked and 1.30× at Blackout. That is far lower than instinct suggests, and it is calibrated against osu!, whose hardest information-removal mod is worth twelve per cent after fifteen years of leaderboard evidence. Sandbox is 0.00×.

**The better long-term answer is to derive the multiplier rather than assert it.** The product already computes an achievable distribution per chart. Once there is population volume, compute the mean achieved percentile per tier and set each tier’s multiplier as the inverse — then publish the derivation. A measured number cannot be argued with; a chosen one always will be.


### 3.5 The fairness test, made empirical


> **The test** — Does an expert beat a novice by a **larger** margin at this tier, or a smaller one? If removing X compresses the skill gap, X was load-bearing information and removing it is artificial difficulty. If removing X widens the gap, X was a crutch and removing it is legitimate.

This is measurable, not arguable. Run both tiers on the same charts with the same player pool and compare the variance in score explained by player rating. Every tier in §3.2 should be validated this way before it is ranked, and the result should be published. It also gives a principled answer to the inevitable community argument about whether a given restriction is fair.


### 3.6 Write the edge cases down before launch

The Souls no-hit community’s rulesets are the model here: shield blocking counts as a hit, environmental lava damage does not, trap damage does, these four glitches are banned and these three animation cancels are permitted. That level of specificity is what makes a challenge category real rather than decorative.

"No indicators" is not a ruleset. "No indicators, where the price axis is retained but tick labels are removed, where the ATR badge remains, and where the session-boundary shading is considered chart furniture rather than a tool" is a ruleset. Write Hindsight’s at that level before the first ranked season, because the first tournament dispute will be about an edge case and there will be no time to decide then.


## 4. Scoring Model

Scoring design remains the single most important decision in the product. A single round’s outcome is mostly luck, so any system that rewards realised profit teaches the player that reckless trades work whenever they happen to print. Every competitor has this bug. v0.1 fixed it. v0.2 fixes four things v0.1 got wrong on top of it.


### 4.1 R-multiple, defined precisely

The base unit is the R-multiple, in Van Tharp’s sense and no other. **R is the initial risk** — entry minus stop, per unit. **The R-multiple is the outcome divided by that initial risk.** **Expectancy is the mean R-multiple across trades.** Risking one unit to make three and winning is +3R; being stopped out is −1R. A player who sets a poor risk-to-reward ratio scores badly even when the trade wins.

Define every term of art in-app and use the standard definitions. Profit factor is gross profit divided by gross loss, not average winner divided by average loser — the industry is inconsistent on this and the inconsistency is noticed by exactly the users worth keeping.


### 4.2 The achievable set, not a simulation

v0.1 proposed sampling thousands of plausible orders. Because every player receives the identical future path, this is unnecessary: the achievable set is finite and can be enumerated exactly.

Entry is fixed at the decision bar. Enumerate the full cross-product of direction, stop distance in ATR, and target as a multiple of R — roughly ninety-eight cells — and resolve every one against the identical future path using the lower-timeframe resolver from §12.3. The result is the **exact empirical distribution of achievable outcomes**, not an estimate of it. No sampling error, perfectly reproducible, and defensible under scrutiny.


| Dimension | Enumerated values |
| --- | --- |
| Direction | long, short |
| Stop distance | 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0 × ATR(14) |
| Target | 0.5, 1.0, 1.5, 2.0, 3.0, 5.0, 8.0 × R |

This also yields two things v0.1 had to approximate. The **oracle bound** — the maximum R achievable by any stop and target pair on that path — is computable in closed form from the maximum favourable and maximum adverse excursion, and it is the headline number the reveal screen wants. And the **axis decomposition** falls out of the grid’s marginals rather than requiring a separate procedure.


### 4.3 Two scoring scales, borrowed from bridge

Duplicate bridge has two scoring systems and the difference between them is a live design decision here. **Matchpoints** score on how many other pairs you beat on that exact hand, producing a percentage; the known consequence is that every marginal point matters, which encourages aggressive marginal-edge play. **IMPs** run score differences through a compression table, so a very large swing is worth only a few times a small one; the consequence is that big swings are damped and avoiding disasters is rewarded.

v0.1’s percentile scoring is matchpoint scoring. It is the right default for the daily — spiky results are shareable results — but it is the wrong choice for a ladder, because a player chasing the top of a leaderboard is correctly incentivised toward maximum-variance trades. This is not a hypothetical: it is the documented failure mode of forecasting tournaments, where rewarding only top finishers makes deliberately extreme predictions rational even though they lower expected accuracy.


| Format | Scale | Rationale |
| --- | --- | --- |
| Daily challenge | Percentile against the achievable distribution | Spiky, legible, shareable. One round, so variance-seeking is self-limiting. |
| Practice, Storm, Streak | Percentile | Volume smooths it out. |
| **Ranked ladder** | **Compressed, IMP-style** | Rewards not blowing up. Removes the lottery-ticket exploit. |
| **Duels** | **Compressed, with a per-round damage cap** | The escalating multiplier manufactures comebacks and guarantees termination, but uncapped it makes round order decisive rather than round quality. |


### 4.4 Restraint, bounded

Passing remains a first-class scored action, evaluated as 0R against the same achievable distribution. On a chart whose distribution median is negative, passing legitimately beats most entries. No competitor scores restraint and restraint is most of trading.

But it must be bounded, or the product recreates question-selection bias — the pattern where the optimal strategy is to answer only the questions you already know. Three mitigations, drawn from how forecasting tournaments fixed the same problem:

- In a five-chart ranked session, **require at least three entries**.
- In Streak and Survival, **cap passes at one per run**.
- In the daily, allow unlimited passes but print **"traded 2 of 5"** prominently on the share card, so the format self-polices socially rather than mechanically.

### 4.5 Score decomposition

The headline number is one figure; the diagnosis behind it is decomposed into independent axes read off the enumerated grid’s marginals.


| Axis | Read from the grid as |
| --- | --- |
| Direction | What fraction of the grid’s positive-R cells were on the player’s side. |
| Stop placement | Whether the stop sat inside the maximum adverse excursion of the profitable cells, and what share of the achievable set it would have been swept out of. |
| Target placement | Where the target sat in the distribution of maximum favourable excursion — was it reachable, and did it capture a reasonable share of the available move. |
| Entry timing | Cost in R of entering early or late relative to the structural trigger, holding stop and target constant. |
| Restraint | The value of 0R against the same distribution. |
| **Efficiency** *(new)* | Realised R as a fraction of the oracle bound. This is the single number that most resembles what a trading journal would call trade quality. |

This produces feedback no competitor offers. For example: *your direction was in the top quartile, but your stop sat inside the noise band and would have been swept in 61% of the achievable set, and you captured 19% of the oracle.*


### 4.6 What the one-shot bracket does not measure

This needs stating plainly rather than being discovered by a knowledgeable user.

Formal curricula and professional trading floors weight trade management far above trade selection. The CMT programme’s senior level is almost entirely application, position management and risk. A well-known professional training programme devotes a full module to sizing, stop placement and defensive trading, and five days to psychology against three to charts. Van Tharp’s position is that sizing and psychology account for the great majority of performance. Tom Basso’s much-cited demonstration — random entries with disciplined exits and sizing — is an argument that the entry is the least important variable in the system.

Hindsight’s one-shot bracket games the entry and holds everything else constant. That is a real limitation, and the fair response is threefold rather than defensive:


1. **Keep it for ranked.** The fixed bracket is what makes the achievable set enumerable and cross-player comparison meaningful. That is a genuine reason, not a rationalisation.
2. **Ship Manage as a parallel ladder** with its own rating, where candles advance in real time and the player may trail the stop, take partials, move to breakeven or exit early. This is a different skill and it gets a different ladder, exactly as chess separates blitz from classical. It also reframes the Naked restriction as a choice between two games rather than a punishment.
3. **Report MFE and MAE on every single result**, at every tier. It is nearly free, it uses data already computed, it is precisely what every serious trade journal reports, and it shows the player the managed ceiling they left on the table without requiring them to play the other ladder.


### 4.7 Calibration as a first-class axis

Players stake a probability on each trade and are scored with a proper scoring rule, producing a calibration curve over time. This was in v0.1 as a side meter. It is promoted here, because of all the skills in this domain it is the only one with clean experimental evidence of being trainable: in large forecasting tournaments a sub-one-hour probabilistic-reasoning module improved Brier scores by roughly six to twelve per cent, the effect persisted across nine-month tournaments, and it was partly mediated by targeted practice.

That converts the product’s claim from something indefensible — learn to read price action — into something defensible and measurable: get calibrated about uncertain outcomes, and see the curve.


### 4.8 Two rules that quietly destroy rating systems

Both are lifted from a large chess platform’s public post-mortem on why its puzzle ratings inflated, and both feel generous, which is why they get shipped.

- **Never award a minimum gain per round.** A floor on the reward turns the ladder into an attendance record.
- **Never give partial credit.** A trade that was directionally right and structurally wrong is a losing trade.

### 4.9 Ranked requires a sample

No rank is assigned until a minimum number of trades has been played, and the same rule applies to every statistic in the app. Do not display a number until the sample supports it. This is thematically perfect — the game enforces the lesson that small samples mean nothing — and it is also just correct.


## 5. The Engine Council

The analytical core is not a predictive model. It is a panel of deterministic, auditable engines, each a faithful implementation of one named school of trading, each permitted and expected to disagree with the others.


> **Design premise** — A single confident prediction is dishonest, because the real state of any chart is that competent practitioners take opposite sides of it. A panel that disagrees is more truthful and more interesting than any oracle, and it cannot be accused of pretending to see the future.


### 5.1 What was wrong with the v0.1 roster

Three of the six entries — Price Action, Mean Reversion, Breakout — are categories rather than schools. A category cannot be cited, audited, or argued with, which defeats the point of publishing a rule set. Of the remaining three, Volume Profile requires volume-at-price data that OHLCV does not contain, and Wyckoff has no credible published automation and, despite being the most respected name on the list, essentially no rigorous evidence behind it at all.

The replacement roster is chosen on three criteria in order: **the school traces to a named practitioner and a specific text**; **its rules are deterministic enough that two independent implementers would produce the same output**; and **it disagrees with the rest of the roster for structural reasons rather than by accident**.


### 5.2 The scored roster


| Engine | School and canonical source | Det. | Native stop and target | Disposition |
| --- | --- | --- | --- | --- |
| **CHANNEL** | Donchian / Turtle. Richard Dennis & William Eckhardt, 1983; rules published by Curtis Faith, 2003. | 5/5 | Stop 2N from entry, where N is ATR(20). Exit on the opposite 10-bar extreme. | Continuation. **Takes** breakouts. Never abstains. |
| **REVERSION** | Connors & Alvarez, *Short Term Trading Strategies That Work* (2008), with Bollinger for the volatility frame. | 5/5 | No native stop — a documented convention is supplied and labelled as ours. Exit on the 5-bar mean. | Reversion. Statistic-based rather than level-based, so its agreements with the others are near-independent draws. |
| **LIQUIDITY** | ICT / Smart Money Concepts. Michael Huddleston, 2016–2022 mentorship series. | 4/5 | Stop beyond the wick that created the sweep. Target the next liquidity pool, minimum 1:2. | Reversion into continuation. **Fades** breakouts. The roster’s spine — see below. Detection scores 4/5 but **selection only 2.5/5**; see §5.4. |
| **PATTERN** | Bulkowski, *Encyclopedia of Chart Patterns* (3rd ed., 2021), descending from Edwards & Magee (1948). | 4.5/5 | Stop back inside the pattern. Target = pattern height × the published percentage of patterns that historically reached it. | Continuation. Abstains often. **The only school that ships a calibrated conviction number.** |
| **GEOMETRY** | Harmonics. Scott Carney, *The Harmonic Trader* (1998) and *Harmonic Trading* vols 1–3. | 4/5 | Stop beyond the extreme projection of the reversal zone. Targets at 0.382 and 0.618 of the AD leg. | Pure counter-trend reversal. Its levels coincide with nobody else’s, so even when it agrees on direction it disagrees on geometry. |
| **TAPE** | Volume Spread Analysis. Tom Williams, *Master the Markets* (1993). | 4.5/5 | Neither is native. Both supplied by convention and labelled as ours. | Bar-scale volume veto. **Requires volume.** Can contradict a range-scale engine without contradicting its direction. |

*Det.* is a determinism score from 1 to 5: how much ambiguity remains once the rules are written down, assuming a single global swing-point definition. A 5 means two independent implementers produce identical output; a 1 means they produce opposite directions on the same chart.


#### Why this specific set

- **Channel against Liquidity is the spine.** They are structurally guaranteed to disagree on the same event: the twenty-bar high that Channel buys is precisely what Liquidity calls a buy-side liquidity raid and shorts. Both are highly deterministic and price-only. This is the highest-value pair available.
- **Channel against Reversion** is the momentum and reversion axis in its purest form — two fully mechanical systems with citable rules taking opposite sides of any extended move.
- **Tape against everything price-only.** It disagrees via *data* rather than direction: it can veto Pattern’s completed ascending triangle with "no demand on the breakout bar." That is a more interesting kind of disagreement than a long-short split.
- **Geometry against every breakout engine.** Harmonics short into strength at exactly the extensions where breakout engines buy, and nobody else cares about the 0.886 retracement.

### 5.3 Special-status engines

Three engines sit outside the scored council and outside the disagreement count. Each exists to say something true that the scored engines cannot.


| Engine | What it is | Why it exists |
| --- | --- | --- |
| **NULL** — Engine Zero | Random direction, 2 ATR stop, fixed 2R target, applied to every chart in the corpus. | The null hypothesis, published on the same leaderboard as everything else. "You beat four of six engines this month, but not the coin flip" is the single most educational sentence the product can produce, and no competitor will ever print it. |
| **NAIVE** | Japanese candlestick patterns, detection per Nison and Bulkowski’s statistical treatment. | Deliberately the weak baseline — it is what a beginner sees. It ships with the published negative evidence in its own rationale text: a 2006 *Journal of Banking & Finance* study using bootstrap methods against EGARCH nulls found candlestick rules unprofitable on Dow component stocks over 1992–2002. Every council needs a plausible-sounding member who is usually wrong, and this one comes with a citation saying so. |
| **COUNTS** | Elliott Wave, emitting its **top two rule-compliant counts** whenever they disagree on direction. | Elliott is not deterministically implementable — three inviolable rules massively underdetermine the count, and the framework always has an escape hatch at a higher degree. Rather than pretending otherwise, this engine exhibits its own internal disagreement. It is never scored. It is honest about the method’s actual epistemic status and it manufactures disagreement for free. |


### 5.4 Every engine publishes its selection rule

This is the most important addition to the engine contract, and it addresses the criticism that would otherwise be fatal.

On any eighty-candle chart there are typically ten to twenty fair value gaps and five to fifteen order blocks. The ICT canon supplies no rule for which one is "the" one. The same is true of supply and demand zones, of which trading range Wyckoff means, of which of several overlapping harmonic patterns to trade, of which bar an anchored VWAP should be anchored to, and of which window a volume profile should cover. The discretion in these schools has not been eliminated by writing them down; it has been **relocated from pattern recognition to array selection**.


> **The rule** — Where the canon supplies no selection rule, Hindsight imposes one and publishes it in the engine’s own rationale text. For example: *the most recent unmitigated fair value gap created by the displacement leg that produced the most recent change of character, located below the midpoint of the current dealing range.* This turns the product’s biggest vulnerability — "you’re making this up" — into a feature, because it is showing its work in exactly the place where the source material has none.


### 5.5 Engine contract

Every engine receives an identical setup window and must return a complete, structured read. No engine may abstain silently.

- Chart annotations: the lines, zones and labels it would draw, each carrying both the index at which the feature exists and **the index at which it could first have been known**. Rendering is gated on the second. This one rule eliminates most of the look-ahead bug class and it is architectural — retrofitting it is painful.
- A direction, or an explicit no-setup verdict. Both are recorded and scored.
- A proposed entry, stop-loss and take-profit.
- A conviction level, and a statement of where that conviction number comes from.
- A plain-language rationale citing the specific rules that fired, and the selection rule that chose between candidates.
- The engine version, pinned to the stored result.

The player-facing output is a spread of opinion, never a consensus verdict.


### 5.6 Conviction has to be earned, not asserted

Only one school on the roster ships calibrated conviction: Bulkowski publishes per-pattern break-even failure rates, percentage meeting target, and throwback rates, over sample sizes in the thousands. Every other engine’s conviction score would be invented.

The fix is also the most defensible proprietary asset in the project: **replay every engine across the entire corpus and compute its own base rates** — realised win rate, R-multiple distribution and target-hit rate, per engine, per market regime. Then rank the council by measured performance rather than by reputation, and use each engine’s own historical hit rate as its conviction function. Note that Bulkowski’s published numbers derive from daily US equities and will not transfer to four-hour crypto; they must be recomputed on the actual corpus.


### 5.7 Do not ship near-duplicates as separate voices

Spurious agreement is worse than no agreement, because it makes the difficulty metric lie. The following clusters are the same trade in different vocabulary and must be represented by at most one voice each.


| Cluster | Members | The underlying trade |
| --- | --- | --- |
| Buy the N-bar high | Turtle, Donchian, Darvas, Weinstein stage 2, Minervini pivot, O’Neil cup-and-handle pivot, Bollinger method I | Long on a break of an N-bar high with a volatility-scaled stop |
| Swing structure | Dow Theory, ICT break of structure and change of character, Al Brooks always-in, Weinstein stage transitions | Trade the direction of the higher-high, higher-low sequence |
| The failed breakout | Wyckoff spring and upthrust, ICT liquidity sweep, VSA upthrust, Raschke’s Turtle Soup, the classical false breakout | Fade a break of a prior extreme that immediately reverses |
| The zone | ICT order block, Seiden supply and demand, Wyckoff last point of support, volume node edge, classical support and resistance | Limit entry at a prior origin-of-move level |
| Volatility compression | Bollinger squeeze, Minervini contraction pattern, Crabel’s narrow-range bars, triangles and pennants | Small range precedes large range |
| Distance from a moving centre | Bollinger fade, Keltner fade, RSI-2, VWAP bands, value-area edges | A z-score of price against a weighted mean |
| Fibonacci reversal | Harmonic reversal zones, Elliott wave-2 and wave-4 entries, ICT’s optimal trade entry band, the Gann 50% | Counter-trend entry at a fixed retracement ratio |

The lineage in the third and fourth rows is worth surfacing in the product itself. An order block is a supply and demand zone is a Wyckoff last point of support is Schabacker’s area of congestion. A liquidity sweep is a spring is a false breakout. Showing that chain inside the Liquidity engine’s rationale is genuinely educational, and it differentiates Hindsight from every other product in that space, all of which present the vocabulary as if it were discovered in 2016.


### 5.8 Balance the abstention rates

Channel and the momentum engines always have a direction. Pattern, Geometry and the phase engines frequently abstain. A roster of always-opining engines saturates the disagreement metric and produces four-three splits on every chart, which is noise rather than signal. A roster of frequent abstainers produces charts where only one engine speaks. Target a mix where the typical chart yields three to six opinions with a genuine directional split, and treat the distribution of council states across the corpus as a tuning target in its own right.


### 5.9 Phase two engines

These are deliberately deferred, each on a specific unlock.


| Engine | School | Unlocked by |
| --- | --- | --- |
| **BAR** | Al Brooks, *Trading Price Action* (2012). The mechanics are exact — buy stop one tick above the signal bar, initial stop one tick beyond it — and the only ambiguity is in the adjectives. | Codifying and publishing thresholds for "strong trend bar" and "trending versus range." Once published this becomes one of the cleanest engines on the roster, and it is the only one whose native answer can be "this is a trading range, fade both edges." |
| **AUCTION** | Market Profile and auction theory. Steidlmayer’s CBOT release (1985); Dalton, *Mind Over Markets* (1990). Value area, point of control, initial balance, the 80% rule. | Intraday charts with a marked session open. It is the most orthogonal voice available — the only school reasoning about *acceptance* rather than direction — but it cannot run without session boundaries, and applying it to a 24-hour instrument discards its core assumption. |
| **OPEN** | Opening range breakout. Crabel (1990); recent published work by Zarattini and Aziz. | Intraday charts with a session open. This has the strongest recent published evidence of anything on the list, which makes it valuable as a counterweight to the schools with none. |
| **PHASE** | Wyckoff. Richard Wyckoff (1931); modern authorities Pruden, Villahermosa. | Volume, plus a decision to **score only the mechanically well-defined subset** — spring, upthrust, selling climax, sign of strength — and to ship the full nine-tests narrative as unscored commentary. There is no credible published automation of Wyckoff phase labelling; every existing implementation is a fifteen-parameter heuristic matcher with no out-of-sample validation. Shipping it as scored analysis would be the least defensible thing in the product. |


### 5.10 Static or adaptive: decide it now

v0.1 deferred this. It should be closed. **Engines are static.** They are reference implementations of published rule sets, and the entire value proposition is that they are auditable and that their track records are honest. Parameters that adapt per volatility regime turn six honest reference implementations into six strategies that are being implicitly optimised, which drags the project into a research programme with a serious overfitting exposure and destroys the one claim the product can actually make.

Where a rule genuinely requires a scale parameter — Edwards and Magee’s 3% breakout filter was calibrated for 1940s daily equities and is nonsense on a four-hour crypto chart — replace it with an ATR fraction, publish the substitution, and mark it as an adaptation rather than the original rule.


### 5.11 Beat the council

GeoGuessr has no bots to race. Hindsight has six, each with a personality, a public record and a scoring line the player can measure themselves against — plus a coin flip that is beating most of them. Beating a named engine over a meaningful sample is a genuine achievement and a natural progression target. Beating Engine Zero over a meaningful sample is the first one.


### 5.12 Style fingerprinting

Every player trade is scored against every engine’s proposal, which over time reveals which school the player actually trades as distinct from the one they believe they trade. *You describe yourself as a breakout trader, but 68% of your entries match the Reversion engine, and that is the engine you underperform against.* No existing product tells a trader this.


## 6. Analysis Architecture

v0.1 had five layers. v0.2 has seven, reordered by real dependency rather than by conceptual tidiness, with one added at the bottom that was previously buried in the data section and one added as a cross-cutting concern.


| Layer | Name | Was | Status |
| --- | --- | --- | --- |
| **0** | Corpus and path integrity | Scattered through §10 of v0.1 | **New as a layer.** Nothing above it is valid without it. |
| **1** | Achievable set | Layer 3, counterfactual scoring | Respecified: enumeration, not simulation. |
| **2** | Geometry | Layer 1, structure extraction | Renamed and given concrete algorithm choices. |
| **3** | Engine council | Was §4, not treated as a layer | Promoted. It depends on Layer 2 and nothing else. |
| **4** | Debrief | Layer 4, post-trade tutor | Kept, with the R semantics corrected. |
| **5** | Base rates | Layer 2, setup fingerprinting | Demoted to last and gated on the §8 result. Statistic respecified. |
| **6** | Player model | Layer 5 | Kept, but conditional on the rep-generating modes existing. |
| — | Calibration | A meter in §3.4 | **Cross-cutting.** Not a layer; an axis that runs through 1, 4 and 6. |


### Layer 0: Corpus and path integrity

This layer produces nothing the player sees and everything the product depends on. It was implicit in v0.1 and that was a mistake, because three of its requirements are architectural and cannot be retrofitted.

- **Lower-timeframe resolution paths.** Every chart stores its display timeframe and a resolution timeframe at roughly a twenty-to-one ratio. Trades resolve by walking the lower-timeframe path bar by bar, not by guessing at intrabar order. See §12.3.
- **Causality metadata on every derived feature.** Each annotation record carries the index at which the feature exists and the index at which it could first have been known. Rendering and scoring both gate on the second.
- **Survivorship-free sampling.** If charts are sampled from currently listed instruments, every chart is a survivor, charts drift upward, longs are systematically rewarded, and the leaderboard develops a long bias. Delisted instruments must be in the corpus.
- **Permutation controls.** A bar-permutation generator that shuffles the intrabar geometry triple as a unit and shuffles gaps separately, preserving candle realism and multiplicative scale. Used for the honesty programme in §8 and for validating that the geometry layer is not finding structure in noise.
- **Deterministic chart selection.** Charts are sampled by a published rule over the regime tags, not hand-picked for being interesting. Hand-curation changes the difficulty distribution non-randomly and invalidates every population statistic computed on it.

### Layer 1: The achievable set

The enumerated grid from §4.2, plus the oracle bound and the axis marginals. This layer depends on nothing but price data and the resolution path, and on its own it solves the benchmark problem. It is built first.

Two properties make it stronger than v0.1’s sampled version. It is **exact** — there is no sampling error to explain away when a user asks why their percentile moved. And it is **reproducible** — the same chart yields the same distribution forever, which matters enormously when leaderboards are involved.


### Layer 2: Geometry

Deterministic geometry over price. This layer predicts nothing. It draws. It is also the most defensible engineering asset in the project, because there is no good open implementation of "draw the chart the way a competent human would."

v0.1 specified this layer by intent. v0.2 specifies it by algorithm, because the algorithm choices are not interchangeable and several of the obvious ones are wrong.


| Component | Choice | Why not the obvious alternative |
| --- | --- | --- |
| Swing points | **0-dimensional persistence**, cut at three nested thresholds, with directional change as the semantics it implements. | ZigZag repaints its last leg, which is disqualifying for a product whose premise is "what could you have known at bar t." Fixed-window fractals are causal but not scale-invariant. Directional change (Guillaume et al. 1997; used for bull/bear dating in Lunde & Timmermann 2004, and at ten nested volatility-scaled thresholds in Chang & Osler 1999) is causal and scale-invariant — but **persistence is strictly better**: a swing high has persistence *p* iff price must retrace *p* before exceeding it, which is what a trader means, and it comes with a theorem — *a peak of persistence p is destroyed only by a perturbation of sup-norm ≥ p/2*. That converts the quarter-tick stability requirement from a hope into a proof, and grades every swing instead of emitting a boolean at each threshold. **Correction to v0.2 as first drafted:** the DC event count does follow a power law, but the exponent is 2.02 ± 0.098 against a Brownian first-passage prediction of exactly 2 — it is a diffusion identity, not a market regularity, and the inversion N ∝ δ⁻² should be justified as "diffusion scaling makes the calibration analytic", nothing more. |
| Trendlines | **Convex hull for the candidate set, in linear tick space**, with a hard non-crossing constraint. | Any non-crossing line touching two or more points is an edge of the upper or lower hull, so the hull gives an exact candidate set — exactly *h−1* of them — in O(n log n) instead of a cubic search, and O(1) amortised per bar online because bars arrive in increasing x. RANSAC is the wrong tool entirely — it maximises inliers around a line and has no concept of "must not be crossed," so it fits happily through the middle of the cloud. **Correction to v0.2 as first drafted:** this said "then constrained slope optimisation **in log space**", and log space is wrong here for two independent reasons. The rendered price axis is linear — the log toggle is an unbuilt Standard-tier tool — so a line straight in log space is a *curve* on the chart the player is looking at, and not marginally: over a lead-in running 100 to 115 it sits about **26 ticks** below the linear line at the midpoint. And prices are tick-quantised while bar indices are integers, so tick space makes the orientation predicate exact in float64 with eight orders of magnitude of headroom — no epsilon in the turn test, which matters because a tolerance there smuggles back the free parameter the hull existed to remove. Log space keeps the kernel bandwidths, which are widths rather than straight lines. There is also no peer-reviewed formulation of hull-edge *selection*; the shipped rule is "most recent edge, ties by span", defended on determinism rather than evidence, and R² is rejected outright because a supporting line has all residuals of one sign and its R² can go negative. |
| Channels | **Theil–Sen slope with a residual-quantile width** as the default; the L∞ linear programme kept as a separate "tightest containing channel". | The LP is the Chebyshev formulation (Boyd & Vandenberghe §1.2.2) — three variables, 2n constraints, O(n) expected, provably tightest, parameter-free. But parameter-free hides a trap: an LP optimum sits at a vertex, so the channel is determined by **exactly three bars** and its breakdown point is **zero** — one bad print sets it. Worse, with four or more residuals tied at ±t, which is routine on tick-quantised data, the optimum is not unique and **the answer depends on the solver's pivoting rule**; two clients could return different channels for identical input, which is a determinism bug in a shared-state game. Theil–Sen has 29.3% breakdown, is pure order statistics so it is bit-reproducible with no solver, and has one interpretable parameter. Note also that the width must be **vertical, not perpendicular**: perpendicular width is Euclidean, but a chart's axes are incommensurate, so the minimising slab rotates when the price unit changes — the answer would depend on the aspect ratio of the user's window. |
| Support and resistance | **Kernel density on log price with ATR-scaled bandwidth and a prominence threshold**, plus agglomerative clustering of swing extremes for touch counts. | Bandwidth tied to volatility is scale-free across a $60,000 instrument and a $1.08 one. Prominence beats a fixed level count. k-means is methodologically wrong here — it forces every extreme into a cluster and requires a k. |
| Round numbers | Scale-free: step = 10^floor(log10 P), levels at 0.25, 0.5 and 1.0 multiples. | Zero parameters, works identically on any instrument, and price clustering at round numbers is one of the better-documented microstructure effects. |
| Regime | **Two axes only:** Kaufman efficiency ratio for trendiness, realised volatility percentile against the instrument’s trailing year for volatility. | Both are causal, bounded, zero-fit and explainable in one sentence. ADX is double-smoothed and its thresholds have no derivation. The Hurst exponent should not ship at all — it is badly biased below about a thousand observations and estimators disagree with each other on the same series, and a chart window is nowhere near long enough. A two-state hidden Markov model on returns almost always recovers a volatility regime you can get free from the percentile. |
| Volume profile | **Built from the stored one-minute bars.** No synthetic distribution. | Spreading a bar's volume uniformly or triangularly across its range is a fabrication that looks plausible and encodes nothing. **Correction to v0.2 as first drafted:** this was read as ruling the feature out. It does not. TradingView computes its own volume profile from lower-timeframe bars — "to compute a daily profile, the system loads all 1-minute bars that were traded in that daily session" — which is exactly the data the corpus already stores. So POC, value-area high and low are buildable at *the same construction, not an approximation of it*, and can be claimed at parity honestly. The reverse warning holds too: TradingView's up/down volume split is inferred from lower-timeframe bar direction, so anything branded delta or order flow there is already a proxy. Build the same proxy; never call it order flow. |


#### Market structure labelling needs its own published spec

The two most-used open reference implementations of break of structure, change of character, order blocks, fair value gaps and equal highs and lows **disagree materially on every single primitive**. One defines fair value gaps as any three-bar gap with no size filter, producing hundreds per chart; the other requires the middle candle to close beyond the gap edge and its body to exceed twice the running mean, producing five to ten times fewer. One computes its liquidity threshold from the range of the entire dataset including the future — a look-ahead bug shipped in a widely used package. One labels premium and discount as the top and bottom five per cent of the swing range, which matches neither the fifty-per-cent midpoint that most practitioners mean nor the optimal-trade-entry band.

There is no canonical specification to adopt. Hindsight must write one, publish it in-app, and hold to it — otherwise players will argue with the annotations and be right to.

This has since been verified rather than asserted, and it is worse than the paragraph above suggests. The look-ahead is real and reproducible: `smartmoneyconcepts/smc.py` line 595 sets its clustering tolerance from `ohlc["high"].max() - ohlc["low"].min()` over the **entire dataframe**. Holding a 4,000-bar window fixed and appending future bars takes the labelled liquidity pools *inside that fixed window* from **three to nine**, with labels appearing up to 1,446 bars before the window edge. The package has ~100,000 downloads a month; a fix was merged in December 2024 and reverted by the maintainer in March 2025. Three further look-ahead channels sit in the same file, including a centred swing window and labels written at bars a median of ~150 bars before they become knowable.

The disagreement between implementations reaches **13.6×** on fair value gaps counted over the same 4,000 bars (845 / 832 / 308 / 62 across defensible definitions), and the two do not even cover the same primitive set — one has no premium/discount function, the other no liquidity primitive at all. There is no written ICT specification anywhere; the circulating community transcription is circular, defining a fair value gap by displacement and displacement by the fair value gap it leaves. Peer-reviewed literature on the vocabulary: **none**, and the most-cited supporting paper was withdrawn by its own author in November 2025 as "this absolute disaster of a project".

The useful framing is that even RSI has no canonical implementation — TA-Lib and TradingView disagree by 12% on weekly ATR(7). **The choice is therefore not between the right definition and ours; it is between an undisclosed definition and a published one.** Lo, Mamaysky & Wang (2000) is the template: every threshold named and defaulted, and a detection lag stated explicitly so that conditional returns are computed "completely out-of-sample and without any look-ahead bias" — which is precisely the `existsAt`/`knownAt` seam already in the corpus, and precisely what both SMC implementations lack.


> **Annotation stability is a first-class test suite** — A human draws roughly the same trendline on Tuesday as on Monday, and the detector must too. Perturb every close by a quarter of a tick, re-run, and measure the overlap of the pivot sets **in price space** — Hausdorff or bottleneck distance on the swing prices, or index overlap with a tolerance window. **Correction to v0.2 as first drafted:** the original text said "the overlap of the pivot index sets", and that measures the one quantity the theory says is unstable. Persistence gives stability of critical *values* "in sharp contrast to the lack of stability of critical points" — in a flat or choppy region one tick of jitter moves the argmax arbitrarily far along the time axis while the price barely moves. The index-set test would fail on correct code. The design consequence is larger than the test: **lines anchored on pivot prices with approximate times are provably stable; lines anchored on exact bar indices are not.**
>
> A second limit worth writing down before the suite is built: a deterministic detector with **boolean** output cannot have a stability guarantee at all — bounded sensitivity provably requires randomisation, which is off the table for shared game state. The two available moves are to **grade the output** (persistence scores, not booleans) and to use **hysteresis**: emit at τ_high, retract at τ_low, with τ_high − τ_low ≥ 4ε, so that only features inside a 4ε band can flip and the emitted set is provably invariant once established.
>
> Also run the detector on **permuted bars**: a geometry layer that finds structure in shuffled data at the same rate as in real data is telling you nothing, and that is a test v0.1 did not contemplate. Lo, Mamaysky & Wang did exactly this against simulated Brownian motion in 2000 and found head-and-shoulders 1,611 real against 577 random — but broadening tops **725 real against 1,227 random**, i.e. random data producing *more*. Publishing that table beside our own is the single most persuasive artefact available in this category, and nobody has done it since.


### Layer 3: Engine council

As specified in §5. It depends on Layer 2 and nothing else, which is why it can be built in parallel with Layers 4 and 5.


### Layer 4: Debrief

Overlay what each engine saw, then run sensitivity analysis on the player’s own trade. The counterfactual on a decision the player actually made is more instructive than any generic pattern lesson.

**With the arithmetic stated correctly.** Moving the stop changes R, because R is the denominator. Every sensitivity statement must be framed one of two ways and must say which:

- *At constant dollar risk, with the position resized:* "the same read with the stop 0.6 ATR wider and the size reduced accordingly returns +2.4R."
- *At unchanged position size:* "the same read with the stop 0.6 ATR wider returns 1.9 times your original R in currency terms, at 1.6 times the original risk."

The debrief also carries, on every result and at every tier: maximum favourable and adverse excursion, efficiency against the oracle bound, the achievable distribution with the player’s position marked on it, and the top-decile trade’s stop and target drawn on the chart. Chess puzzles have an analysis board. Every competitor in this category shows only whether you were right.


### Layer 5: Base rates

Encode every moment in the corpus as a feature vector and run nearest-neighbour search across the full historical corpus, returning a base rate with a confidence interval — never a call.

**With the statistic corrected.** The academic lineage here is legitimate: kernel-regression pattern detection comparing conditional against unconditional return distributions, on 350 stocks over 1962–1996, found that several technical indicators provide incremental information. But that work answers "where is price in N bars." This game resolves on **which of stop or target is touched first**, which is a first-passage problem and path-dependent. A terminal-return distribution is systematically miscalibrated against the product’s own resolution rule.

The right output is conditioned on the bracket: *at a 1.0 ATR stop and a 2.0 ATR target from here, historically 34% target-first, 58% stop-first, 8% neither within forty bars.* That is both more useful and more honest.


> **This layer is also the one most likely to return a disappointing answer.** — It is a hand-designed feature vector plus a search over a corpus, which is precisely the setup the survey literature on technical analysis identifies as compromised by data snooping and ex-post rule selection. Commit to the mitigations before building: strict temporal splits, out-of-sample-only base rates, confidence intervals rather than point estimates, and never re-tuning the feature vector against scored outcomes. Name the output "base rate." Never "edge," never "prediction." And if the honest answer is that historical analogues carry no information, that answer is itself worth shipping.


### Layer 6: Player model

Longitudinal behavioural analysis across sessions: stop-widening after losses and other tilt signatures, decision latency against accuracy, performance decay across a session, whether fast intuitive reads beat slow deliberate ones for this specific player, and per-setup win rates surfaced as the three weakest setups.

Two constraints v0.1 did not acknowledge. First, **these are within-session sequential effects** and one chart a day cannot measure them — this layer is only viable if the rep-generating modes exist, which is why they moved from "later" to core. Second, **this is tilt measured on fake money**, and the clinical work on day traders found the correlation between emotional reactivity and performance is substantially weaker in paper trading than in live trading. Label the output behavioural *consistency*, not psychology, and withhold every statistic until the sample supports it.


## 7. The Honesty Programme

This section is new, and it is the answer to the strongest argument against the entire product. It is also, if it works, the most defensible thing Hindsight will own.


### 7.1 The objection, stated at full strength

The standard framework for when experience produces genuine expertise requires two conditions: an environment with enough regularity to be predictable, and the opportunity to learn those regularities through prolonged practice with feedback. Hindsight can supply the second condition beautifully. **It cannot manufacture the first.** If the environment’s validity is near zero, then fast confident feedback on noise builds the illusion of validity faster than live trading does — the product would actively make people worse while feeling like it was making them better.

The supporting evidence for the objection is not thin. Random price series have been shown to produce chart formations that experienced chartists read as head-and-shoulders and trends, and recent experimental work finds people confidently forecast structure in pure random walks. The survey literature concludes that the positive results on technical analysis are compromised by data snooping and ex-post rule selection. A study covering every entrant to Brazilian equity futures day trading over three years found that of those who persisted beyond three hundred days, 97% lost money — three hundred days of real practice with real feedback and real capital producing almost no competence, which is exactly what the low-validity hypothesis predicts. And the population most similar to the target user — individual investors who use technical analysis — has been measured underperforming by roughly fifty basis points a month net.

No amount of engineering answers this. What answers it is measurement.


### 7.2 Synthetic controls


> **The feature** — Silently mix synthetic charts into the corpus — geometric Brownian motion and block-bootstrapped real data, indistinguishable at a glance — and measure whether players score above chance on them, and whether their scores on real charts exceed their scores on synthetic ones.

This is cheap to build, invisible to the player, and it directly measures the thing the literature has never established: whether discretionary chart-reading skill exists as a stable, measurable individual trait. Three outcomes, all of them valuable:

- **Players beat synthetic charts as well as real ones.** Chart reading in this format is measuring something other than price structure — probably risk arithmetic and restraint. That is still a real skill and still worth training, but the product’s claims have to change and it is far better to find out internally than to be told.
- **Players score higher on real charts than synthetic ones, and the gap grows with rating.** This is the finding that would make Hindsight the first product in the category with evidence behind it, and it is a publishable result.
- **No player beats chance on either.** The scoring model has a bug, or the format has one. Better to know at phase one than at phase six.

The dataset this generates — hundreds of thousands of risk-defined decisions on matched real and synthetic paths — does not exist anywhere and cannot be scraped.


### 7.3 Published engine track records

Run every engine across the entire corpus and publish the results, broken out by market regime. Some schools will post ugly numbers. Ship those numbers anyway. A sentence such as "this engine is down 0.3R across fourteen thousand setups in ranging conditions" is among the most valuable things a beginner could read, and no educator will ever say it, because they are selling a course. Hindsight can say it, because it is selling a game.

Three specific honesty items belong in the interface itself:

- **The Liquidity engine has no book.** Its concepts can be cited to a person but not to an authority, and the lineage — Wyckoff 1931, Schabacker 1932, Edwards and Magee 1948, Seiden 2007, Huddleston 2016 — should be shown inside the engine’s own rationale. That is educational, it is true, and it differentiates Hindsight from every other product in that space.
- **Candlesticks have published negative evidence.** The Naive engine ships the citation with itself.
- **Wyckoff has essentially no rigorous evidence at all**, despite being the most respected school on the list. Say that too, in the engine that implements it.

### 7.4 Engine Zero on the leaderboard

The null engine from §5.3 is published alongside the named ones, in the same table, with the same regime breakdown. If a school cannot beat a coin flip with a disciplined stop over fourteen thousand setups, the player should be able to see that in one glance, on the same screen where they see the school’s name.


### 7.5 Cost realism

A frictionless game trains players toward tight stops and marginal setups that lose money once spread and slippage are applied — and the strongest negative finding in the technical analysis literature is precisely that low transaction costs alone eliminate the profitability of technical trading rules. Even a crude cost model is far better than none: a per-instrument spread applied at entry and exit, slippage on stop fills, and funding or financing where the instrument has it. Show the gross and net R side by side. The gap between them is a lesson that costs nothing to teach.


### 7.6 The transfer caveat, stated in the product

Replay practice does not reproduce slippage, spreads, position sizing, or the pressure of real capital, and there is no published evidence establishing transfer from simulated to live trading. The reference class genuinely differs. State this plainly in the product rather than in a terms-of-service document, and do not claim the product makes anyone profitable. The claim it can make — that it trains risk-defined decision making and measures calibration — is enough, and it is true.


## 8. Chart Rating and Content Health

A chart is an opponent. Rate it like one. This is the largest single addition in v0.2 and it is the asset a competitor cannot clone.


### 8.1 Charts as rated entities

Treat every chart-and-tier pair as a Glicko-2 entity, exactly as the major chess platforms treat a puzzle: each attempt is a rated game between the player and the chart. Because the outcome is a percentile in the unit interval rather than a binary solve, each attempt carries more information than a chess puzzle attempt does.


| Field | Purpose |
| --- | --- |
| rating, ratingDeviation, volatility | Standard Glicko-2. Rating deviation grows during inactivity, which is exactly right for an audience that plays irregularly. |
| nbPlays | Trust gate. A chart with high deviation and twelve plays is not trustworthy; one with low deviation and five thousand is. |
| quality (user-voted) | **A separate axis from difficulty.** A chart can be hard and terrible. Only human votes reliably separate "genuinely subtle" from "coin flip." One click on the reveal screen. |
| themes[] | **Seven ship**: failed-breakout, trend-continuation, range-reversion, liquidity-sweep, v-reversal, compression-expansion, news-spike (labelled as an outlier detector, since without a news feed that is what it is). **Three do not**: `gap-fill` and `opening-drive` are structurally meaningless on a 24/7 spot corpus — there is no non-trading interval and no session open or initial balance — and the gap-fill folklore is contradicted by the evidence anyway (fill probability within five days ~20%, with gaps showing continuation rather than reversion). `distribution-top` has no specifiable definition: Wyckoff phases are a drawing, with no bar counts, no volume ratios and no falsifiable ordering. |
| parR, distributionShape | The achievable distribution’s median and shape, from Layer 1. |
| regimeTags | Efficiency ratio bucket and volatility percentile, from Layer 2. |
| retiredFlag, ambiguousFill | Excluded from ranked, with the reason recorded. |


### 8.2 Cold start, solved

New charts enter at high rating deviation and are marked **pending**. While pending they are fully playable but can only gain a player rating, never cost it. This means new content can ship every day without risk to players and without polluting the ladder. Once the deviation falls below threshold the chart is locked in and scores normally.


### 8.3 Automatic retirement of coin flips


> **The mechanism** — Once a chart’s deviation is low, compute the correlation between player rating and achieved percentile across the population. **A chart on which strong and weak players score identically is a coin flip and is automatically retired from ranked play.**

This is the operational equivalent of a fighting-game community turning items off: the competitive pool excludes outcomes that are uncontrollable regardless of player performance. In trading terms the retired set will be dominated by gap-driven news events, halts and resumptions, and low-liquidity noise — charts where the visible information genuinely does not determine the answer. No competitor has anything like this, and it is what keeps the ranked pool honest as it grows.


### 8.4 Themes, and the diagnostic that justifies a subscription

Tag every chart with themes and maintain a **per-theme rating** for every player. "You are 1740 overall but 1490 on failed breakouts, and you are the only one of your friends who is worse at them than at everything else" is the single most valuable sentence the product can say to a trader. It converts a game into a diagnostic instrument. It is also the natural paid tier — charge for the diagnostic layer, never for reps.


### 8.5 One ladder, three psychological experiences

Offer Standard, Hard and Extra Hard settings that change how far above the player’s rating charts are served, with larger gains and smaller losses at the harder settings. This gives three genuinely different experiences from one rating system and one content library, with no ladder fragmentation. Default to Standard, because a higher success rate is better for learning.


## 9. The News Layer

Deferred to a later phase, but designed now, because the design constraint is load-bearing and it determines a rung on the ladder in §3.


### 9.1 The leakage rule


> **Non-negotiable** — News is a reveal mechanic and, at the Full Desk tier only, a pre-trade *player* input. It is **never** an input to any engine read. A language model asked what was happening around a given chart already knows how that chart resolved; its parametric memory contains the outcome. Even with retrieval and a hard timestamp cutoff, the model’s own priors leak the future. If news feeds any engine read, the benchmark is contaminated and every accuracy figure in the product becomes fiction.

The clean fix is also the better product. After the trade resolves, surface the point-in-time headlines that landed inside the window. That is the "oh, that is why it dumped" moment, which is the most satisfying beat in the entire loop, and it sits wholly after the decision so it cannot contaminate anything.


### 9.2 News as the top rung of the ladder

The Full Desk and News Blind tiers differ by exactly one thing: whether headlines are shown before the trade. Aggregated across thousands of players on the same charts, this is a controlled experiment with an n in the millions, and it yields a measurable answer to whether knowing the news actually improved outcomes.

The expected result is that it barely helps and sometimes hurts. Demonstrating that empirically is a stronger lesson than any amount of telling. It is also a better justification for the ladder than "harder is more impressive."


### 9.3 Sourcing and timestamp integrity

A properly timestamped point-in-time archive is required, and the distinction that matters is between **publication** time and **ingest** time. The large free open-source event archives timestamp on ingest, not publication, and deduplicate by URL noisily — fine for a post-reveal colour panel, disqualifying for anything scored. Commercial news APIs carrying wire content back to the mid-2010s have real publication timestamps and are the cheapest defensible option; the enterprise point-in-time vendors are the gold standard for timestamp discipline.

Retroactively edited or re-dated content silently reintroduces leakage. Verify timestamp integrity before trusting any source, and treat any headline whose publication time cannot be established as unusable rather than approximately usable.


## 10. Game Modes and Progression

One content library, many framings, at zero additional content cost. The reclassification that matters: **the daily challenge is a distribution mechanism, not a retention mechanism.** Every serious operator in the daily-puzzle space pairs the daily with an infinite mode, and the ones that did not had to be bundled into a portfolio to retain their audience.


### 10.1 Core modes


| Mode | Mechanics | Why |
| --- | --- | --- |
| **Daily** | One chart, identical for every player, at Naked with one rotating mod of the day. One attempt. Resets at midnight UTC, with a 48-hour completion window rather than a hard cut. Shareable result card. | The front door and the entire organic growth strategy. The rotating mod gives thirty meaningfully different dailies from one pipeline and a reason to show up on a specific day. |
| **Practice** | Unlimited, free, filterable by theme, tier, regime and difficulty band. Never metered. | This is where reps happen, where Layer 6 gets its data, and where the "thousand reps" claim becomes true. Also a competitive weapon — see §10.4. |
| **Ranked** | Five-chart sessions at Naked, minimum three entries, compressed scoring, Glicko-2 against rated charts. | The ladder. Gated behind a minimum trade count. |
| **Manage** | Same charts, candles advance in real time, player may trail, scale out, move to breakeven, or exit early. **Separate rating.** | The other half of the skill. Fixes the largest architectural gap in v0.1. Structurally, this is Hindsight’s "Moving" to Naked’s NMPZ. |
| **Storm** | Three-minute clock. +1 per chart where you beat the distribution median. −10 seconds when stopped out. Combo bonuses at 5, 12, 20 and 30 and every 10 thereafter. | A flat penalty against a superlinear bonus is what produces the one-more-run pull. Highest rep-per-minute mode in the product. |
| **Streak** | Untimed. The run ends on the first sub-median result. One skip per run. | Pure loss aversion, zero content cost, and the mode most likely to produce a shareable number. |
| **Duel** | Two players, identical charts, health-bar damage equal to the compressed score difference. Escalating multiplier, **capped per round in ranked**, uncapped in casual. | Guarantees termination without a fixed length, cancels chart difficulty because only the gap matters, and produces a tension curve a spectator can read at a glance. |
| **Racer** | Five to ten players, same charts, ninety seconds, live positions. | The lowest-friction multiplayer format: no matchmaking, no lobby negotiation, no rating. |
| **Calibration** | Instead of a stop and target, the player declares a confidence interval: "80% chance price stays inside this box over the next N bars." Scored with a proper scoring rule. | The only genuinely novel mode in the category, the only one that appeals to the quant-adjacent audience, and the one that trains the one skill with clean evidence of trainability. A co-operative variant where several players negotiate one shared box is a strong stream format. |
| **Beat the Council** | Race a named engine, or Engine Zero, over a fixed set of charts. | Natural progression target with a public record attached. |


### 10.2 Two mechanics worth stealing outright

- **A ban phase in duels.** Before the charts are dealt, each player bans one theme or regime. Cheap to build, creates a real pre-game metagame, and gives commentators something to talk about before a single candle is drawn.
- **A stream-along widget.** An embeddable panel serving the exact chart a streamer just played, so viewers can attempt it live. This is the mechanism by which spectator legibility converts into acquisition, and it only works because the ranked tier gives player and viewer identical information.

### 10.3 Streaks, with all three mitigations

A streak works through loss aversion, which means it works by making people anxious. Ship the whole mitigation stack, not just the first piece: **two streak freezes granted up front** — two outperform one, three are no better than two, and the habit does not solidify until around day seven; **earn-back**, recovering a broken streak by completing charts within a window, which works precisely because it is earned rather than forgiven; and a **gold "perfect streak" state** for players who never used a freeze, which is the counterweight that stops freezes cheapening the achievement.


### 10.4 The share card, and the one monetisation rule

Four properties, all copyable and most clones get them wrong: **spoiler-free** — encode percentile buckets, never the R-multiple or direction, so a posted card cannot leak the setup; **comparable** — everyone played the same chart, so a bare number is instantly meaningful; **plain Unicode, no image, no link**; and **a bid for a reply** rather than a broadcast. Include the tier code and mods, because the code in the card is free marketing for the ladder: HINDSIGHT #412 · NTZ+Mirror · 78th · traded 3 of 5.


> **Never meter the daily, and never meter practice.** — GeoGuessr’s three-rounds-a-day free cap is the single most-cited complaint in a review-bombing that made its Steam release one of the worst-rated games on the platform. Their justification was real — their marginal content cost scales with games played, because they license Street View. **Hindsight’s does not.** Historical OHLC is a fixed cost and the pipeline is owned. Free unlimited practice is a competitive weapon that can be afforded here and structurally cannot be there. Charge for the diagnostic layer instead: per-theme rating dashboards, full post-mortems with the distribution, custom sessions, duel replays. Price against a field running from roughly $13 to $99 a month.


### 10.5 Progression

- Ranked ladder with one overall rating, per-tier ratings surfaced above a division threshold as diagnostics only.
- Per-theme ratings, and a dashboard that names the three weakest.
- An edge report unlocked at a sample threshold.
- A style badge derived from engine fingerprinting — earned, never self-selected.
- Cosmetic recognition for tier and mod achievements, which does more motivational work than the multipliers do.

## 11. Maps and User-Generated Content

Directly modelled on GeoGuessr’s maps feature, which was the mechanic that turned that product from a novelty into a platform. A map is a curated set of charts with its own leaderboard, difficulty profile and description.


### 11.1 Official maps: regimes, not assets

Organised by market regime rather than by instrument, because the same pattern means different things in different conditions and learning that is the point. Every official map is defined by a **published filter over the regime tags and theme tags**, not by hand-picking, so the map’s difficulty distribution is reproducible and its statistics are valid.

- **Crash** — violent downside, volatility expansion, failed bounces.
- **Euphoria** — parabolic advances, shallow pullbacks, blow-off tops.
- **Chop** — efficiency ratio below 0.2. The account killer.
- **Compression** — coiling volatility ahead of expansion.
- **Liquidity Sweeps** — setups built around failed breaks of prior extremes.
- **Council Split** — the charts where the engines disagree most. The hardest map in the game.
- **The Null Set** *(new)* — charts where the achievable distribution’s median is negative and passing is the correct play. A map that trains restraint and nothing else.

### 11.2 Creator maps

Any user can assemble a map from filter-generated or hand-picked charts, name it, describe it and share it by link. This is the feature that makes the product sellable and licensable: an educator, a community operator or a proprietary trading firm can hand their students a curated set that trains one specific skill in a controlled sequence rather than leaving them on random charts, and the cohort’s results roll up into a private leaderboard the operator can see.

- Filter-based generation by regime, volatility percentile, council agreement, theme, chart rating band, timeframe or instrument class.
- Ordered sequences, so a map can function as a structured lesson rather than a shuffle.
- Private, unlisted and public visibility.
- Cohort dashboards for the owner: aggregate scores, weakest axes across the group, per-student progress, per-theme ratings.
- **A tier lock**, so an operator can require that their cohort plays at Naked and the results are comparable.

### 11.3 Why this matters commercially

The consumer game monetises poorly on its own. Maps convert Hindsight into infrastructure that other people build businesses on top of, which is a far better position. Proprietary trading firms currently sell evaluations with weak predictive signal and heavy churn; a curated screening map with a validated scoring model and rated content is worth real money to them, and they already have the traffic. The chart rating system from §8 is what makes that claim credible rather than aspirational.


## 12. Fairness and Integrity

These rules are non-negotiable. Each one, if broken, invalidates the scoring system.


### 12.1 No future data on the client

The client must never receive future price data before the order is submitted. If the reveal candles sit in the initial payload, anyone can open developer tools and win every round, and every leaderboard in the product becomes worthless. This is the specific flaw that makes the dominant free replay tool useless as a training instrument: its future data sits on the client and the user can simply scroll to it.

For rated play: serve the lead-in window server-side, accept the committed order server-side, and only then stream the reveal. If Hindsight ever becomes popular with future candles in the payload, someone will write a userscript within a week.


### 12.2 Normalisation and identity hiding

Four measures together make the identity-lookup exploit uneconomic, which is what makes the entire ladder meaningful rather than decorative: **index every chart to 100** at the first visible candle; **strip all dates, tickers and currency-denominated volume**, auditing every response payload and variable name for leaks; **randomise vertical mirroring** per chart; and **keep the universe large and private**. A y-axis reading $67,000 tells the player it is a specific instrument near a specific top.


### 12.3 Intrabar ambiguity

If a single candle’s high reaches the target and its low reaches the stop, standard OHLC data cannot establish which came first. v0.1 proposed adopting the pessimistic convention. **v0.2 solves it rather than conventions around it**, because Hindsight is a scored competition and ambiguity here is not inaccuracy, it is unfairness.


1. **Resolve every trade on a stored lower-timeframe path**, walking bar by bar in sequence at roughly a twenty-to-one ratio — one-minute bars for anything up to four hours, five to fifteen minutes for daily. This makes the answer deterministic and correct. Crypto exchanges publish one-second and one-minute bars for free, which is a strong argument for launching there.
2. Where a lower-timeframe path genuinely is not available, **fall back to stop-first and flag the fill as ambiguous** — then exclude ambiguous charts from ranked play entirely. That is cleaner than explaining a convention.
3. **Never use a proximity heuristic.** The widely used "if the open is nearer the high, assume open-high-low-close" rule is a plausibility heuristic rather than a conservative one, and on the bars where it matters it hands the benefit of the doubt to the trader.
4. **Gaps fill at the open, not at the stop price.** Publish whether stops are triggered by wick or by close.


### 12.4 Benchmark validity

- Split validation by time period, never randomly. Hold out entire years. Walk forward.
- Assume every accuracy figure produced before proper walk-forward validation is wrong.
- Stratify the corpus by regime and report engine performance per regime. A pattern library learned on a single enormous bull market is a library about that bull market.
- Never tune fingerprinting on the same data used to generate charts.
- **Use purged, embargoed cross-validation** where label horizons overlap the test set, and report the probability of backtest overfitting across the scoring-parameter grid before freezing it. Tuning scoring and difficulty parameters against player data is a multi-configuration search on a small sample — which is exactly the setting where in-sample optimality carries no out-of-sample information. Be honest about how many configurations were tried.

### 12.5 Scope of analysis

Engine output is confined to post-trade analysis of historical charts. It is never run on live data and never on the right edge of a current chart. If the output ever reads as a tradeable signal, people will risk real money on it. This constraint costs nothing in product terms and removes an entire category of liability.


### 12.6 Anti-cheat

- Decision latency monitoring: implausibly fast and implausibly accurate answers indicate lookup.
- Server-side chart issuance with per-player nonces.
- Points only. No entry fees and no cash prizes, which keeps the product clear of skill-gaming regulation.
- **Synthetic charts double as a cheat detector.** A player who scores far better on real charts than synthetic ones by an implausible margin is either exceptional or looking something up, and the two are distinguishable by latency.

## 13. Data

Two things changed here: licensing moved from a footnote to a first-order constraint, and the phase order is now driven by which markets have redistributable lower-timeframe data rather than by which are most interesting.


### 13.1 Coverage plan


| Phase | Market | Why, and what to watch |
| --- | --- | --- |
| **1** | Crypto | Free bulk historical archives, deep coverage, **one-second and one-minute bars that give the intrabar resolver for free**, delisted symbols retained, no exchange licensing regime, and 24/7 trading so there are no session gaps to model. The caveat: the permissive open-source licence on the download tooling covers the scripts, not the data — the data sits under exchange terms that restrict commercial redistribution. It has been permissive in practice; get it in writing before scaling. |
| **2** | Forex | Cheap, deep, tick-level, different volatility character. No exchange licensing regime because it is over the counter, so the risk is contractual with the provider rather than regulatory — which makes it far easier to negotiate. Note that spot forex "volume" is tick count, not traded size, and the Tape engine is therefore measuring something different there than it is on an exchange-traded instrument. Disclose it. |
| **3** | Equities and indices | **Assume a negotiated licence and a three-to-six-month lead time.** The major low-cost historical vendors’ terms explicitly prohibit redistributing, displaying or disseminating market data, and prohibit building an application intended for end users other than the licensee — which is precisely this product. Ask specifically for a display or end-user distribution tier. Point-in-time correctness becomes critical here too: survivorship, splits and dividends, ticker reuse, index reconstitution. |

Indexing charts to 100 with relative time axes materially weakens the characterisation of the product as displaying market data, and it improves the game independently. But the ticker and date are revealed afterwards, which puts it back in scope. This is a question for a lawyer, not for a design document.


### 13.2 No live pipeline

Charts are pre-generated offline in bulk. A one-time job pulls multi-year history across fifteen to twenty major instruments, slices out several thousand windows of setup candles plus future candles **plus the matched lower-timeframe resolution path**, filters out the unusable, runs the full council and the achievable-set enumeration against each, and stores the finished chart. Several thousand charts generated once provides months of content with no ongoing infrastructure.


### 13.3 Chart filtering

- Reject flatlines and near-zero volatility windows.
- Reject delisting cliffs, data gaps and bad prints.
- Reject windows spanning known exchange outages.
- Reject windows where no lower-timeframe path exists, or flag them as ambiguous and exclude from ranked.
- Stratify the retained set across regime tags so the pool is not dominated by whichever conditions were most common — but do the stratification by **published rule**, not by hand.
- **Include delisted and failed instruments.** Sampling from survivors bakes a long bias into every statistic in the product.

### 13.4 Rendering

The candle-by-candle reveal has three specific constraints worth recording, because getting them wrong makes a replay UI feel broken. Append bars incrementally rather than replacing the series, which is O(1) rather than a full redraw. **Pin the price scale before the reveal starts** — if autoscale is on, every appended bar rescales the axis and the chart visibly jitters, which is the single most common failure in replay interfaces. And drag-to-place price lines are not natively supported by the obvious charting library: they need either a custom rendering primitive, which is required anyway for the risk-reward shading and the engine annotations, or an HTML overlay, which is likely the better answer on touch devices where a one-pixel canvas line is unhittable.


## 14. Build Sequence

The dependency order is real and it changed. Layer 0 is now first because three of its requirements are architectural. The achievable set still comes before everything analytical. Base rates still come last, because the honest answer they return determines how much weight the product places on them.


| Phase | Scope | Exit condition |
| --- | --- | --- |
| **0. Playable loop** | One chart end to end: renders, trade placed by dragging, candles animate, R-multiple returned. No engines, no accounts, no rating. | **The loop is fun with no analysis layer at all.** Unchanged from v0.1 and still the most important gate in the document. |
| **0.5. Corpus integrity** | Layer 0. Lower-timeframe resolution paths, causality metadata, survivorship-free sampling, permutation generator, deterministic chart selection. | A trade resolves identically on every run, and a look-ahead test suite passes. Cheap now, extremely expensive later. |
| **1. Benchmark** | Layer 1: the enumerated achievable set, oracle bound, axis decomposition, percentile scoring, MFE and MAE reporting, daily challenge, share card, scored pass with quota. | A meaningful percentile with zero users, and a debrief screen worth screenshotting before any engine exists. |
| **1.5. Ladder and rating** | §3 tiers FD through NTZ, mods, per-tier and overall Glicko-2, chart rating with pending state and auto-retirement, themes, practice mode. | Two tiers validated by the §3.5 test: the expert-novice gap is measurably wider at the more restricted tier. |
| **2. Geometry** | Layer 2 in three milestones — **2a the primitives** (persistence swings, hull trendlines, Theil–Sen channels, KDE levels, round numbers, volume profile from the stored minute bars), **2b the published spec** (every threshold named, defaulted and versioned; a stated detection lag; the shippable themes — **six, not seven: news-spike is deferred to Phase 7 with §9, because with no event data a theme named for a cause asserts exactly what this document refuses to assert elsewhere**), **2c the null** (the same detectors run on permuted bars, counts published beside the real ones). | Annotations a competent trader agrees with; **stable in price space** under a quarter-tick perturbation; and demonstrably no better than chance at finding structure in permuted bars, with that comparison published rather than merely passed. |
| **3. Council** | Channel and Liquidity first — they are the pair guaranteed to disagree — then Reversion, Pattern, Geometry, Tape. Engine contract, published selection rules, versioning, disagreement-as-difficulty. **Engine Zero from day one.** | Two engines that disagree usefully, are auditable, and whose disagreement predicts chart difficulty. |
| **4. Debrief and honesty** | Layer 4 with corrected R semantics, style fingerprinting, published engine track records by regime, **synthetic controls running silently**, cost model. | **A first read on whether players beat synthetic charts.** This is the result that determines what the product is allowed to claim. |
| **5. Modes and maps** | Manage ladder, Storm, Streak, Duel with capped damage, Racer, Calibration mode. Official regime maps, creator maps, cohort dashboards, tier locks. | One external educator running a cohort on it, and a Manage rating that correlates only partly with the Naked rating — which is the evidence that they are different skills. |
| **6. Base rates and player model** | Layer 5 with bracket-conditioned first-passage statistics; Layer 6 longitudinal behaviour, fed by the rep-generating modes. | An honest answer about whether historical analogues carry information, published either way. |
| **7. News** | Point-in-time reveal panel; Full Desk versus News Blind as a controlled comparison. | A measurable answer on whether pre-trade news improves player outcomes. |


> **Sequencing discipline** — Phase 0 must be genuinely enjoyable before anything else is built. If the raw loop is not fun without the analysis layer, the analysis layer will not save it, and the entire engine programme is wasted effort on a product nobody returns to on day three. Phase 0.5 is the only insertion that is allowed to precede fun, and only because retrofitting it is close to impossible.


## 15. Risks and Open Questions


| Risk | Mitigation |
| --- | --- |
| **The environment may have too little validity for the skill to exist.** Fast confident feedback on noise builds the illusion of expertise faster than live trading does. | The synthetic control programme in §7.2 measures this directly rather than assuming an answer. It is the only mitigation that is not wishful thinking, and if the answer is bad it is better to know at phase four than at phase ten. |
| Overfitting the benchmark. Reported accuracy becomes fiction if engines or scoring are tuned on the data used to generate charts. | Time-based splits, held-out years, walk-forward validation, purged and embargoed cross-validation, and a probability-of-backtest-overfitting calculation over the scoring-parameter grid before freezing it. Treat all pre-validation numbers as wrong. |
| Regime dependence. A library learned on one bull market describes that bull market. | Stratify the corpus by regime and report performance per regime rather than in aggregate. Never publish an aggregate engine number without the regime breakdown next to it. |
| Annotation instability making the engines feel arbitrary. | Stability test suite as a first-class Layer 2 requirement: perturbation testing plus permuted-bar testing. |
| **Look-ahead leaking into annotations.** Both major open-source implementations of the structure primitives contain it, one via a whole-dataset range and one via pre-confirmation stamping. | Causality metadata on every annotation, rendering gated on the confirmation index, and a dedicated look-ahead test suite. This is architectural. In a product whose entire premise is "no hindsight," shipping look-ahead would not go unnoticed. |
| **Transaction costs erase the behaviour being trained.** The strongest negative result in the literature is that low costs alone eliminate technical-rule profitability. | Ship a cost model even if crude, and display gross and net R side by side from phase four. |
| Transfer. Replay practice does not reproduce slippage, sizing, or the pressure of real capital, and no published evidence establishes sim-to-live transfer for trading. | State it plainly in the product. Do not claim it makes anyone profitable. Claim what is defensible: risk-defined decision making and measured calibration. |
| **Percentile scoring rewards lottery tickets; free skipping rewards cherry-picking.** | Compressed scoring in ranked, entry quotas, and a simulation check before launch that degenerate wide-stop tight-target brackets do not top the leaderboard. This is verifiable before a line of product code is written. |
| Scope collapse. The engine programme is large enough to consume the project before anything ships. | The phase 0 gate. Six engines is a phase-three deliverable and two of them are enough to prove the mechanic. |
| Engine output being read as a live signal. | Historical charts only, post-trade only, never the right edge. |
| Underspecified schools producing indefensible engines. | Publish each rule set and each selection rule as one interpretation. Invite disagreement; the arguing is engagement. |
| **Equity data licensing blocks the roadmap.** | Crypto and forex first, and treat the equities phase as a six-month legal project running in parallel rather than an engineering task. |
| **A small population fragmented across too many ladders.** | One overall rating fed by all tiers; per-tier ratings visible only above a division threshold. Do not launch parallel ranked queues. |


### 15.1 Open questions

- Whether the Manage ladder should be its own product surface or a mode, and whether its rating should be blended into the overall rating at all.
- Whether timeframe should be disclosed to the player, or inferred as part of the challenge. Note that undisclosed timeframe interacts badly with the ATR badge, which is the one thing §3.1 says must never be hidden.
- How heavily to weight council-split charts in ranked scoring, given that maximum disagreement and maximum coin-flip are hard to distinguish before the chart has a rating.
- Whether creator maps should be monetisable by their creators, and what that does to curation quality.
- Whether to expose the engine rule sets fully, which invites both trust and copying. The lean is toward full exposure: the moat is the chart ratings and the corpus, not the rules.
- What proportion of the ranked corpus should be synthetic. High enough to measure, low enough that a player who discovers the mechanic does not feel cheated.
- Whether Blackout should exist at all, or whether it is the tier that proves §3.5’s test by failing it.

## 16. Explicitly Out of Scope

Recorded to prevent scope creep. None of these are to be built or scaffolded for later in early phases.

- Real-money trading, brokerage connectivity, or live market data of any kind.
- Live signals, alerts, or any output on the right edge of a current chart.
- Personalised investment advice.
- Native mobile applications. Web first — though the drag interaction must be designed for touch from the start, because a one-pixel canvas line is unhittable on a phone.
- Payments, subscriptions, or entry fees in early phases.
- Player-side indicators and drawing tools **below the No Tools tier**. Note this is a change: they are now in scope at Full Desk and News Blind, because the ladder needs a top rung with everything on it.
- Social feed, comments, or messaging.
- **Machine-learned pattern detection.** The honest published work trains on labels from a hard-coded detector, generalises poorly across instruments, and concludes that neural detectors do not beat the hard-coded rules they were trained on. Write deterministic rules.
- **Order flow, footprint and delta engines.** Deterministic given the data, but the data — aggressor-tagged ticks — is not derivable from OHLCV under any approximation. Presenting a proxy-delta heuristic as order flow would be the single most criticisable thing in the product.
- **Adaptive or self-tuning engines.** See §5.10. This is now a closed decision rather than an open question.

---

*End of document*
