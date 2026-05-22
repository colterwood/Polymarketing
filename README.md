# Polymarketing

TypeScript scraper + analyzer + alerter for two Polymarket accounts (`magamyman`, `whopperlover` by default). Phase 1 backfills full trading history and produces a statistical report. Phase 2 polls every 30 minutes and SMSes when a new bet's size lands above a configurable percentile threshold.

## Important — network requirement

The Polymarket APIs (`gamma-api.polymarket.com`, `data-api.polymarket.com`) and Twilio (`api.twilio.com`) must be reachable from wherever you run this. The remote container used to build this code blocks those hosts at the network layer (`host_not_allowed`), so you'll need to run the actual scrape from your laptop or a server that has open egress.

## Setup

```bash
npm install
cp .env.example .env
# Fill in TWILIO_* and ALERT_TO_NUMBER if you want SMS in Phase 2.
```

Node 20+ required.

## Phase 1 — backfill and analyze

```bash
npm run backfill   # writes data/polymarket.db
npm run analyze    # writes data/reports/report-<timestamp>.{json,md} + prints to stdout
```

`analyze` prints, for each user:

- Total BUY trades, closed vs open (open = market hasn't resolved AND not sold)
- Mean / stddev / median / skewness / kurtosis of bet size (USDC notional)
- Overall win rate
- Win rate by stddev bucket: `≤μ−2σ`, `(μ−2σ,μ−σ]`, `(μ−σ,μ]`, `(μ,μ+σ]`, `(μ+σ,μ+2σ]`, `>μ+2σ`
- A shape classification (`approx_normal` / `right_skew` / `left_skew` / `heavy_tail`) and the monotonicity of win-rate-vs-size

And a crossover section:

- Count + table of markets where both users were on the **same** outcome
- Count + table of markets where they were on **opposite** outcomes

Re-run `analyze` after later poll cycles to fold newly-resolved markets into the stats.

## Phase 2 — continuous monitoring

```bash
npm run start
```

This runs a cron (`POLL_CRON`, default `*/30 * * * *`) that:

1. Fetches new TRADE activity since the last seen timestamp (with a 60-second overlap window for safety).
2. Inserts new trades, refreshes market resolutions, and rebuilds the `bets` view.
3. For each new BUY, computes its size-percentile against the user's historical bets and looks up the historical win rate at its stddev tier.
4. If percentile ≥ `ALERT_PERCENTILE` (default `0.90`), sends an SMS:

   > `{username} bet $X on "{market}" — Pth percentile size ({tier}), W% hist win rate. https://polymarket.com/event/{slug}`

Each `(transactionHash, asset)` is alerted at most once (tracked in the `alerts_sent` table).

Set `DRY_RUN=true` to log the alert instead of sending it — useful for the first runs before you've picked a threshold.

## Tuning the alert threshold

After Phase 1 completes, look at the `Distribution shape` line in the report:

- `approx_normal` → set `ALERT_PERCENTILE` to e.g. `0.84` (≈ +1σ), `0.975` (≈ +2σ), based on how chatty you want it.
- `right_skew` (long tail of large bets) → use a higher percentile (`0.95` / `0.99`) since the top tier may hold many bets.
- `left_skew` or `heavy_tail` → percentile is still meaningful, but pair it with the per-bucket win rate: only alert on bets that land in tiers with notably above-average historical win rate.

Update `.env` and restart `npm run start`.

## Project layout

```
src/
  config.ts                 env loading + endpoint constants
  logger.ts                 pino setup
  types.ts                  shared types
  api/                      HTTP client + Polymarket endpoint wrappers
  db/                       sqlite schema + storage helpers
  scraper/                  backfill, poll, FIFO bet classifier
  analysis/                 summary stats, crossover, buckets, percentile, report
  notify/                   Twilio sender
  cli/                      backfill / analyze / start entry points
tests/                      vitest unit tests for the pure logic
data/                       sqlite db + reports (gitignored)
```

## Tests

```bash
npm test
npm run typecheck
```

Tests cover the FIFO classifier, the bucketing logic, the crossover detector, and the percentile ranker — all the pure logic that does not require network access.

## How "win/loss" is decided

A BUY is one bet. For each BUY we look at all later SELLs on the same Polymarket asset (FIFO match) and the market's resolution:

- Fully sold → win iff sale price > buy price (weighted avg over the matched sells).
- Held to resolution → win iff `outcomeIndex == winningOutcome`.
- Sold AND held part to resolution → combine realized PnL; win iff total > 0.
- Partial sell, market still open → marked `open` (excluded from win-rate stats).
- No sells, market still open → marked `open`.

Markets are considered resolved when the Gamma API reports `closed: true` with one outcome at price ≥ $0.99.
