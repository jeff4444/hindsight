# Hindsight

**Trade the past. Learn the future.**

A chart-reading trainer built on real historical price action. See
[`hindsight-scope-v0.2.md`](hindsight-scope-v0.2.md) for the product design, and
[`docs/rules.md`](docs/rules.md) for the published rule set.

**Currently at Phase 0** of the §14 build sequence: the playable loop. One chart end to end —
renders, trade placed by dragging, candles animate, R-multiple returned. No engines, no
accounts, no rating, no achievable set. The gate Phase 0 exists to answer is whether the loop
is fun with no analysis layer at all.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then paste the service_role key into it
npm run fetch                      # ~700 MB of Binance 1m klines into .data/ (resumable)
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
| `tests/` | 58 tests. The intrabar goldens in `resolve.test.ts` and the payload audit in `api-leak.test.ts` are the two that matter most. |

## The three rules that shaped the architecture

Each is cheap now and close to unfixable later, which is why they are in Phase 0 rather than
in the phase that needs them.

1. **No future data on the client** (§12.1). `issue_round` cannot return the reveal bars — they
   are not in its return type. Audited by a test, not by convention.
2. **Lower-timeframe resolution** (§12.3). Every chart stores the 3600 one-minute bars covering
   its reveal window, and trades resolve by walking them. Intrabar ambiguity does not exist
   rather than being conventioned around.
3. **Version pinning on every stored result** (§1.2). Resolver, normalisation and pipeline
   versions are written to every round.

## Data

Binance monthly 1-minute klines from `data.binance.vision`, 20 spot pairs including five that
have since been delisted — §13.3 requires failed instruments in the corpus, because sampling
from survivors bakes a long bias into every statistic in the product.

Note the licensing caveat in §13.1: the permissive licence on Binance's download tooling covers
the scripts, not the data, which sits under exchange terms restricting commercial
redistribution. Fine for development; get it in writing before scaling.
