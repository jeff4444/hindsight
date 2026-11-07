# Hindsight

**One trade. Sixty hours. Graded.**

A trading game on real market history. A round is one real Binance spot market, read up to a moment
in its past with the date held back: draw your levels, place one trade on a fresh $500 — long or
short, at the bell or resting on the tape, with a take-profit and a stop — and lock it in. Then the
next sixty hours play, and the result is graded from 0 to 1000 against the best and the worst trade
that stretch of market allowed. Nothing carries from round to round.

The grade is used three ways: **training grounds** (the grade is the score), **duels** (two players,
ten tapes, 1000 points each; the lower grade takes damage on a curve), and **duels against a
school** — an opponent that reads every tape once, offline, under a published playbook, plays its
trade live beside yours, and shows its working when the tape ends.

[`docs/rules.md`](docs/rules.md) is the published rule set: **§23 is the game**. §22 describes the
paper-trading platform it replaced, whose exchange it keeps, and sections 1–21 the chart game before
that; both stay because every result stored under them can still be re-derived from them.

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

`supabase/migrations/` is applied in order. **0034 is the game**: rounds, duels and their seats,
the schools' reads, a measured `big_move` on every chart, the dealing function and the sign-in
claim. 0030–0033 are the trading platform it replaced. Nothing earlier is altered or dropped.

After applying them to a live project, paste
[`supabase/tests/trading_live_check.sql`](supabase/tests/trading_live_check.sql) into the SQL
editor. It is one read-only `SELECT` and reports a row per check — tables, RLS and grants, every
function and who may execute it, the sign-in claim, the markets, today's chart, the scenario copy,
and whether the schools' accounts have been filled yet.

### The schools

A school's reads are made once per tape, offline, with the Claude API (credentials from the
environment: `ANTHROPIC_API_KEY` or an `ant auth login` profile). Reading costs one request per
tape; a tape already read at the school's current version is skipped, so a run can be resumed.

```bash
npm run school -- --school price-action --limit 5 --dry-run       # read and print, store nothing
npm run school -- --school price-action --split held-out          # read the held-out fifth and store it
npm run school -- --school price-action                           # …or the whole library
npm run school -- --school price-action --report                  # its record against sitting out (§23.8)
npm run school -- --school price-action --fixture                 # a stand-in reader; local database only
```

A school duel deals only tapes the school traded, so nothing can be dealt against a school until
its reads exist. Changing a playbook, the prompt or the model means a new `version` in
`src/lib/game/schools.ts`; old reads are kept.

## Running the game locally

Everything runs without the live project. The quickest way is a training round on a synthetic
market, which needs no database at all:

```bash
npm run dev
open http://localhost:3000/demo            # public, nothing stored
```

For the whole server path, point the app at a local Supabase (or any Postgres with PostgREST in
front of it) with the migrations applied:

```bash
supabase init                              # once: the repo keeps no supabase/config.toml
supabase start && supabase db reset        # applies every migration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_SERVICE_ROLE_KEY=<local service key> \
  npx tsx tests/trading/seedLocal.ts 40    # forty realistic charts; refuses any non-local URL
npm run school -- --fixture                # stand-in school reads, so a school duel can be played
npm run dev
```

`seedLocal.ts` cycles BTC, ETH, SOL, DOGE and a delisted PEPE — some stored mirrored, so the
un-mirroring is exercised. A duel deals ten tapes neither player has seen, so play duels with at
least twenty-odd charts seeded. To play the other seat yourself, open the duel's link in a private
window.

## Verifying

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

- **Unit tests** (vitest). The game's are `tests/game.test.ts` — the grade and damage pinned to
  §23's tables, the duel fold, sizing, and the property the grade rests on: no random or nudged
  order lands outside the best and worst a tape allowed — and `tests/game-views.test.ts`, which
  checks a round being read carries no tape, no date and nothing about how its chart is stored, and
  that a school reads its tape blind. The exchange's are `tests/trading-*.test.ts`: exact integer
  fill goldens, parity with the bracket resolver on 500 paths, deterministic and prefix-causal
  replay.
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
| `src/core/game/` | The game, pure: a round's sizing and resolution on the exchange, the best and worst a tape allowed, the grade, damage, and the duel fold. |
| `src/core/trading/` | The exchange, pure: instruments, the order simulator, costs, margin, metrics. Integer ticks, steps and micro-USDT throughout. |
| `src/core/bots/` | The retired schools as traders, kept for their stored accounts. |
| `src/core/` | Everything else pure: bars, ATR, normalisation, the corpus pipeline's logic, the engines (§14), and the retired game's resolver, scoring and rating, kept for the stored results. |
| `src/lib/game/` | The round core shared by the server and the browser (`round-core.ts`), the wire types, the schools and their reads, and the server's handler and queries. |
| `src/lib/trading/` | The trading platform's session core, wire types and formatting; the game reuses its views. |
| `src/app/api/game/` | The boundary: deal and lock in a round; start, join and play a duel. |
| `src/app/(app)/` | Play (`/play`, a round at `/play/[id]`), duels (`/duel/[code]`), Schools, Learn. The platform's pages redirect there. |
| `src/components/game/` | The round screen, its ticket and result card, and the duel screen. They draw on the terminal's chart and order lines in `src/components/trading/`. |
| `scripts/` | Offline: the corpus pipeline, the measurements, and `school.ts`. There is no live data pipeline. |
| `supabase/migrations/` | Schema. RLS on every table, no client policies: only the service role reads anything. |

## The rules that shaped the architecture

1. **The future never reaches the client early.** A round being read carries the history and not
   one minute of the tape; the tape is sent once the round is locked in and can no longer change,
   and an opponent's trade once yours is. Audited by a test.
2. **A round is a replay of its intent.** Its result is the exchange playing one order over the tape,
   and its grade is that against the best and worst the same exchange could produce, so any grade
   can be re-derived from the stored intent, forever.
3. **Fills walk the real minutes.** Every chart stores the 3,600 one-minute bars under its replay,
   and a minute that could have gone either way goes against the trader, flagged.
4. **Version pinning on every stored result.** Every round records `GAME_VERSION`; every school
   read its school's version and the model that answered.

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
