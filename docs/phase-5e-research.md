# Phase 5e research — Duel and Racer, before building them

The two modes that need other people. §14's own table marks both **blocked on players**, and that is
true of whether they are *worth* anything; it is not true of whether they can be built and checked,
which is what this document settles.

Along the way §4.3's two stated justifications for the duel format both turn out to be wrong — one
unnecessary, the other attributing the fix to the wrong mechanism.

Everything below is measured: engine records over the **1,000 real charts**, and 20,000 simulated
duels per cell against a stated null.

---

## 1. What the scope asks for

| | §10.1 |
| --- | --- |
| **Duel** | *"Two players, identical charts, health-bar damage equal to the compressed score difference. Escalating multiplier, **capped per round in ranked**, uncapped in casual."* |
| **Racer** | *"Five to ten players, same charts, ninety seconds, live positions."* |

§4.3 adds the reasoning: the escalating multiplier *"manufactures comebacks and **guarantees
termination**, but uncapped it **makes round order decisive rather than round quality**."*

Neither the health total nor the multiplier schedule is specified. `duelDamage()` already exists in
`src/core/ranked.ts` with the cap at `IMP_MAX = 15`; nothing else does.

---

## 2. The players available to measure with are too alike to duel

The eight engines are the only opponents in this product with a measured record over the whole
corpus. Scoring each one's bracket on every chart, converting to a percentile against that chart's
achievable set and then to IMPs, the damage one round does — across all 28 engine pairs and all 1,000
charts:

| | |
| --- | --- |
| n | 28,000 |
| p50 | **0.00** |
| p75 | 0.00 |
| p90 | 5.00 |
| p99 | 9.00 |
| mean | 1.05 |
| **rounds doing zero damage** | **79.5%** |
| rounds at or above the cap of 15 | **0.0%** |

**Four rounds in five are a draw**, and the cap never once binds. The reason is §14.4's silence
figure: no school takes a position on 66.9% of charts, a pass is 0R scored against the same
distribution for both players, and the IMP scale is a compressed integer — so two engines that both
stand aside record an identical score.

That makes the engines useless as a duel reference and is itself the finding: **a duel between two
players who mostly agree does not move a health bar.** It is a warning about the mode, not about the
engines.

## 2.1 So the null is two players who know nothing

A bracket picked at random lands uniformly in the achievable distribution by construction — that is
what the distribution *is*. So uniform-versus-uniform is the maximum-entropy reference: what a duel
between two coin flips looks like.

| | engines | random players |
| --- | --- | --- |
| mean damage | 1.05 | **8.06** |
| p50 | 0.00 | 7.00 |
| p90 | 5.00 | 17.00 |
| zero-damage rounds | 79.5% | **4.3%** |
| at or above the cap | 0.0% | **16.2%** |

Every simulation below uses this null. It is the honest choice and it is also the conservative one:
real players are somewhere between these two columns, so a format that behaves on the null will
behave on a player pool that agrees more often.

---

## 3. §4.3's first claim is unnecessary: the duel always terminates

20,000 duels per cell, 200 rounds allowed, three multiplier schedules, three health totals:

| schedule | health | cap | median | p90 | p99 | unfinished |
| --- | --- | --- | --- | --- | --- | --- |
| **flat (none)** | 30 | yes | 6 | 9 | 12 | **0.0%** |
| **flat (none)** | 40 | yes | 8 | 12 | 15 | **0.0%** |
| **flat (none)** | 50 | yes | 11 | 15 | 18 | **0.0%** |
| **flat (none)** | 100 | yes | 23 | 28 | 33 | **0.0%** |
| ×1 per 3 rounds | 40 | yes | 7 | 9 | 11 | 0.0% |
| doubling per 5 | 40 | yes | 8 | 10 | 12 | 0.0% |

**Nothing ever fails to terminate, including with no multiplier at all.** A flat damage rule ends a
duel at a median of 8 rounds on a 40-point bar and a p99 of 15. The escalating multiplier is not
what guarantees termination; damage that is on average 8 points a round against a 40-point bar is.

What escalation actually buys is a *shorter* duel — 8 rounds down to 7 at health 40, 23 down to 15 at
health 100. That is the trade, and the next section prices it.

---

## 4. §4.3's second claim attributes the fix to the wrong mechanism

The claim is that uncapped damage *"makes round order decisive rather than round quality"*, with the
per-round cap as the remedy. That is directly testable: **does the duel's winner match the player who
scored more IMPs in total over the rounds actually played?** A format that rewards quality agrees
with the sum. One that rewards order does not.

| schedule | health | cap | agrees with total IMP |
| --- | --- | --- | --- |
| **flat (none)** | 40 | **no** | **100.0%** |
| **flat (none)** | 40 | yes | **99.4%** |
| ×1 per 3 rounds | 40 | no | 92.7% |
| ×1 per 3 rounds | 40 | yes | 93.7% |
| doubling per 5 | 40 | no | 92.7% |
| doubling per 5 | 40 | yes | 95.4% |
| **flat (none)** | 100 | no | **100.0%** |
| ×1 per 3 rounds | 100 | no | 90.6% |
| ×1 per 3 rounds | 100 | yes | 90.0% |

Two things fall out, and they reverse the scope's reasoning:

- **The escalating multiplier is what makes round order decisive.** Weighting later rounds more
  heavily is exactly a statement that the same results in a different order should produce a
  different winner, and it costs **6 to 10 points** of agreement with total score.
- **The cap is not the remedy for that.** It moves agreement by **0.6 to 2.7 points**, and at health
  100 with escalation it moves it the *wrong way* (90.6% uncapped against 90.0% capped). The cap
  addresses single-round blowouts, which is a real thing — it is simply not the thing §4.3 credits it
  with.

**Uncapped flat damage agrees with the total 100.0% of the time**, because it *is* the total: first
to a 40-point lead, with the lead accumulated one round at a time.

### 4.1 What ships, and what is withdrawn

**Flat damage, health 40, cap kept.** Median 8 rounds, p99 15, 99.4% agreement with round quality.

The cap stays despite doing almost nothing for order-dependence, because it does something else worth
having: 16.2% of rounds against the null are at or above 15 IMPs, and without a cap a single
catastrophic chart can end a duel outright. Costing 0.6 points of agreement to stop one round
deciding a match is a trade worth making, and it is §10.1's rule regardless.

**The escalating multiplier is withdrawn.** It was justified by two claims. Termination does not need
it, and it is the cause of the order-dependence the same paragraph objects to. What remains is
"manufactures comebacks", which is entertainment bought with 6 to 10 points of correctness — and §4.3
opens by rejecting exactly that trade for the ranked ladder.

---

## 5. The format detects skill, which nothing had checked

Flat damage, health 40, capped. A stronger player is modelled by keeping the best of *k* draws.

| matchup | median rounds | p99 | unfinished | stronger player wins |
| --- | --- | --- | --- | --- |
| even (1 vs 1) | 8 | 15 | 0.0% | **49.9%** |
| slight edge (2 vs 1) | 8 | 15 | 0.0% | **93.1%** |
| clear edge (4 vs 1) | 6 | 12 | 0.0% | **99.9%** |
| two strong players (4 vs 4) | **17** | 28 | 0.0% | 50.1% |

Even players split 49.9/50.1 — the format is fair. A slight edge converts to 93.1%, a clear one to
99.9%. And the failure mode is the expected one and is not a failure: **two strong players take twice
as long**, because they differ less. Seventeen charts is a long match and it is the honest price of
two people who are both right most of the time.

---

## 6. Racer cannot be what §10.1 describes, and there is a version that works

*"Five to ten players, same charts, ninety seconds, live positions."* Five simultaneous humans is not
a thing this product can produce, and populating a lobby with bots would be the one move this whole
project exists to avoid — a leaderboard whose opponents are fabricated is worse than no leaderboard.

The version that works is a **ghost race**: a fixed, ordered chart sequence, and opponents who are
*recordings* of people who played the same sequence earlier, labelled as recordings. It needs no
simultaneity, it works with a player base of one and improves as that base grows, and "live
positions" survives intact — a recording's position at each second is known exactly.

This also unifies the two modes. Duel and Racer both need one primitive that nothing in the product
has: **a fixed ordered chart sequence that several players play independently and are scored
against.** A duel is two players on that sequence with a health bar; a race is *n* players on it
against a clock. One table, two scorers.

---

## 7. What 5e should be

| | |
| --- | --- |
| **The sequence** | A `matches` row holding an ordered list of chart ids, plus per-player progress. The one primitive both modes need, and the reason they ship together. |
| **Duel** | Flat damage, health 40, cap at 15. Async by default: an opponent plays the same sequence whenever they arrive, and simultaneity is a special case rather than a requirement. |
| **Racer** | A ghost race over the same sequence, against recordings that are labelled as recordings. |
| **Published** | §21, and the two §4.3 corrections above. |

## Open items

- Whether real players agree more like the engines (79.5% draws) or more like the null (4.3%). The
  answer decides whether duels are tense or tedious, and it needs players.
- Whether a duel rating should feed §12's ladder. It should not until there is evidence the format
  measures the same thing, which is the same argument §17 made for keeping Manage on its own ladder.
