# Hindsight

**Trade the past. Learn the future.**

A chart-reading trainer built on real historical price action. See
[`hindsight-scope-v0.2.md`](hindsight-scope-v0.2.md) for the product design, and
[`docs/rules.md`](docs/rules.md) for the published rule set.

**Currently at Phase 0.5** of the §14 build sequence.

*Phase 0* built the playable loop: one chart end to end — renders, trade placed by dragging,
candles animate, R-multiple returned. *Phase 0.5* is Layer 0, corpus integrity, which §14 allows
to precede the fun gate only because retrofitting it is close to impossible: a survivorship-free
universe, a published selection rule stratified over regime, causality metadata with a look-ahead
suite, and a bar-permutation generator.

Still no engines, no accounts, no rating, no achievable set.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then paste the service_role key into it
npm run universe                   # enumerate every USDT pair ever listed (~2 min, no price data)
npm run fetch                      # ~1.1 GB of klines into .data/ (resumable)
npm run corpus                     # generate 1000 charts and insert them
npm run dev
```

`npm run corpus -- --dry-run` reports what would be generated without touching the database.

## Layout

| Path | What lives there |
| --- | --- |
| `src/core/` | Pure, I/O-free logic: bar aggregation, ATR, normalisation, the resolver, path packing. Phase 1 will call the resolver ~98 times per chart to enumerate the achievable set, so it stays pure. |
| `src/app/api/` | The §12.1 boundary. Issuance returns lead-in bars only; the reveal is released only after the order is committed. |
| `src/components/` | Chart, drag rails, reveal animation, result. |
| `scripts/` | Offline corpus pipeline. There is no live data pipeline and §13.2 says there should not be. |
| `supabase/migrations/` | Schema, applied to the `hindsight` project. |
| `tests/` | 149 tests. The three that matter most: the intrabar goldens in `resolve.test.ts`, the payload audit in `api-leak.test.ts`, and the future-mutation harness in `lookahead.test.ts`. |

## The four rules that shaped the architecture

Each is cheap now and close to unfixable later, which is why each lands a phase or more before
the code that needs it.

1. **No future data on the client** (§12.1). `issue_round` cannot return the reveal bars — they
   are not in its return type. Audited by a test, not by convention.
2. **Lower-timeframe resolution** (§12.3). Every chart stores the 3600 one-minute bars covering
   its reveal window, and trades resolve by walking them. Intrabar ambiguity does not exist
   rather than being conventioned around.
3. **Version pinning on every stored result** (§1.2). Resolver, normalisation, pipeline and
   selection versions are written to every round and chart.
4. **Causality metadata and a look-ahead suite** (§6 Layer 0, §15). Nothing in Phase 0.5 uses it;
   it exists so Layer 2's detectors cannot be written without it. Both bugs §15 names in the
   public implementations are reproduced as canaries and asserted to be caught.

## Data

Binance monthly klines from `data.binance.vision`. The universe is **every USDT spot pair that
ever traded** — 722 of them, read from the archive's own index, because
`api.binance.com/exchangeInfo` lists only survivors and §13.3 requires failed instruments in the
corpus. 445 pairs pass the published eligibility rule, 36% of them delisted; the corpus draws on
314 of them.

The full rule — universe, sampling, filters and regime stratification — is in
[`docs/rules.md`](docs/rules.md) §7.

Note the licensing caveat in §13.1: the permissive licence on Binance's download tooling covers
the scripts, not the data, which sits under exchange terms restricting commercial
redistribution. Fine for development; get it in writing before scaling.
