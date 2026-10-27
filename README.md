# Hindsight

**Trade the past like it is live.**

Paper trading on real market history. A trader gets a $100,000 account and a real Binance spot
market, replayed minute by minute at its real prices — play, pause, speed up, step — and trades it
with market, limit and stop orders, take-profits and stop-losses, long or short on up to 2×
margin. Every order fills against the real one-minute bars and pays Binance's fees. The date is
held back until the session ends, so nobody can look up what happens next; then the review shows
what the market was, every trade in dollars, the best that was possible, and what each school of
thought did on the same tape.

Seven trading schools — Turtle breakouts, Connors' mean reversion and our variant of it without
the trend filter, ICT sweeps, Bulkowski's patterns, Carney's harmonics and Williams' volume analysis
— and a coin flip trade their own $100,000 accounts across the whole library, by their published
rules, whatever the results.

[`docs/rules.md`](docs/rules.md) is the published rule set: **§22 is the trading platform**.
Sections 1–21 describe the chart game Hindsight used to be; it is retired, and those sections stay
because every result stored under them can still be re-derived from them.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then paste the service_role key into it
npm run dev
```

The corpus is built once, offline:

```bash
npm run universe                   # enumerate every USDT pair ever listed (~2 min, no price data)
npm run fetch                      # ~1.1 GB of klines into .data/ (resumable)
npm run corpus                     # generate the charts and insert them
```

`npm run corpus -- --dry-run` reports what would be generated without touching the database.

### Migrations

`supabase/migrations/` is applied in order. **0030–0033 are the trading platform**: accounts,
sessions, the order-event log and its projections (0030), the functions that open, step, record
and finalise a session (0031), the leaderboards and statements (0032), and the scenario copy
(0033). Nothing earlier is altered or dropped.

### The schools

```bash
npm run bots -- --fixture          # offline, over synthetic demo markets; no database
npm run bots -- --dry-run          # read the corpus, trade it, print, write nothing
npm run bots -- --write            # …and record every session to the schools' accounts
```

`--bot CODE` runs one school, `--limit N` the first N markets. Writing is idempotent: a market a
school has already traded at the current `BOT_VERSION` is skipped. Changing how a school trades —
sizing, exits — means bumping `BOT_VERSION` and `BOT_SPEC_HASH` in `src/core/bots/spec.ts`, which
starts every school on a fresh account; changing what it sees means bumping `ENGINE_VERSION` and the
threshold hash (§14).

## Running the trading stack locally

Everything runs without the live project. The quickest way is the terminal on a synthetic market,
which needs no database at all:

```bash
npm run dev
open http://localhost:3000/demo            # public; also /lab/terminal?seed=7 in development
```

For the whole server path, point the app at a local Supabase (or any Postgres with PostgREST in
front of it) with the migrations applied:

```bash
supabase init                              # once: the repo keeps no supabase/config.toml
supabase start && supabase db reset        # applies every migration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<local service key> \
  npx tsx tests/trading/seedLocal.ts       # five realistic charts; refuses any non-local URL
npm run dev
```

`seedLocal.ts` inserts BTC, ETH, SOL, DOGE and a delisted PEPE — two of them stored mirrored, so
the un-mirroring is exercised. `npm run bots -- --write` against the same database fills in the
Strategies page.

## Verifying

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

- **Unit tests** (vitest). The trading core's are `tests/trading-*.test.ts` and `tests/bots.test.ts`:
  exact integer fill goldens, parity with the bracket resolver on 500 paths, deterministic and
  prefix-causal replay, the clock, the metrics, and the schools' look-ahead and exits.
- **The leak audit**, `tests/trading-api-leak.test.ts`: no minute past the server clock, no date
  while a session is open, nothing about how a chart is stored, nothing to a stranger (§22.9).
- **The SQL smoke test**, `supabase/tests/trading_smoke.sql`, against a fresh scratch database with
  every migration applied: `psql -v ON_ERROR_STOP=1 -f supabase/tests/trading_smoke.sql`.
- **End to end** with the preinstalled Playwright: `node e2e/terminal-lab.cjs <baseUrl>` drives the
  terminal on a synthetic market; `node e2e/trade-live.cjs <baseUrl>` drives a real session through
  the server, reloads mid-session, and reads the review.

## Layout

| Path | What lives there |
| --- | --- |
| `src/core/trading/` | The exchange, pure: instruments, the order simulator, costs, margin, the replay clock, metrics. Integer ticks, steps and micro-USDT throughout. |
| `src/core/bots/` | The schools as traders: their specs, their exits, and the runner that drives the simulator. |
| `src/core/` | Everything else pure: bars, ATR, normalisation, the corpus pipeline's logic, the engines (§14), and the retired game's resolver, scoring and rating, kept for the stored results. |
| `src/lib/trading/` | The session core shared by the server and the browser (`session-core.ts`), the wire types, formatting, and the server's queries and handler. |
| `src/app/api/trade/` | The boundary: open, act on, and review a session; reset an account; list markets. |
| `src/app/(app)/` | Markets, the terminal (`/trade/[id]`) and its review, Portfolio, Strategies, Leaderboard, Learn. |
| `src/components/trading/` | The terminal: chart, order lines, ticket, account panels, review. |
| `scripts/` | Offline: the corpus pipeline, the measurements, and `bots.ts`. There is no live data pipeline. |
| `supabase/migrations/` | Schema. RLS on every table, no client policies: only the service role reads anything. |

## The rules that shaped the architecture

1. **The future never reaches the client early.** The server keeps the replay clock and sends only
   minutes that have printed; the browser sends intent, never a time. Audited by a test.
2. **The account is a replay of its log.** A session's money is `simulate(market, events)` and
   nothing else, so any result can be re-derived, to the micro-dollar, forever.
3. **Fills walk the real minutes.** Every chart stores the 3,600 one-minute bars under its replay,
   and a minute that could have gone either way goes against the trader, flagged.
4. **Version pinning on every stored result.** Simulator, fees, margin, instrument and bot versions
   are written to every session and account.

## Data

Binance monthly klines from `data.binance.vision`. The universe is **every USDT spot pair that
ever traded** — 722 of them, read from the archive's own index, because
`api.binance.com/exchangeInfo` lists only survivors and the library must include failed
instruments. 445 pairs pass the published eligibility rule, 36% of them delisted.

The full rule — universe, sampling, filters and regime stratification — is in
[`docs/rules.md`](docs/rules.md) §7.

The permissive licence on Binance's download tooling covers the scripts, not the data, which sits
under exchange terms restricting commercial redistribution. Fine for development; get it in writing
before scaling.
