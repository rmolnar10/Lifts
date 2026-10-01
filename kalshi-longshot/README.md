# kalshi-longshot

A small Kalshi bot that tests one idea: **people overpay for long-shot YES
contracts, so patiently selling them (buying NO) as a maker should earn more
than it loses.**

It is built to find out *whether* that's true before you risk money:

1. `calibrate` measures the long-shot bias on Kalshi's own settled markets.
2. `scan` shows what it would quote right now (read-only, no account needed).
3. `shadow` paper-trades against the real trade tape with a conservative fill
   model and marks results to real settlements.
4. `live` posts real orders, on the **demo** exchange unless you force prod.

Nothing here is a promise of profit. The most likely outcome of step 1 or 3 is
"the edge is too small after fees". That is a useful answer too.

## The strategy

* **Universe:** open markets with a YES mid between 3¢ and 20¢, closing in
  6 hours to 30 days, with some volume and a tight spread. Markets in a Kalshi
  liquidity incentive program skip the volume/spread filters and go first.
* **Fair value:** from the calibration table. The bot uses the *upper* end of a
  95% confidence interval for the real YES rate in that price bucket, so the
  bias has to be statistically solid before it quotes. With no calibration
  data for a bucket it doesn't quote at all (see `quote_uncalibrated`).
* **Quoting:** one post-only buy-NO limit order per market, one tick above the
  best NO bid, never crossing the spread, and only if the edge after the maker
  fee is at least `min_edge_cents`. It never joins behind the best bid: orders
  sitting back there mostly fill when the price is moving against you.
* **Risk:** caps on worst-case loss per market, per event (markets in the same
  event are correlated) and in total; a drawdown stop; a `STOP` file kill
  switch; every order expires after `order_ttl_seconds` so quotes lapse if the
  bot dies; and it only ever touches orders whose `client_order_id` starts with
  `ls-`.

The payoff is lopsided: buying NO at 89¢ wins 11¢ most of the time and loses
89¢ when the long shot hits. One loss erases about eight wins. Size accordingly.

## Setup

```bash
cd kalshi-longshot
python3 -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
cp config.example.toml config.toml
pytest
```

`calibrate`, `scan` and `shadow` use public market data and need no account.

For `live`, create an API key in Kalshi (Account → API keys). Kalshi gives you a
key ID and a private-key `.pem` file. Make a **demo** account first at
<https://demo.kalshi.co>; demo keys only work on demo.

```bash
export KALSHI_KEY_ID=...
export KALSHI_PRIVATE_KEY_PATH=~/kalshi-demo.pem
```

## Workflow

```bash
# 1. Is there a bias at all? Samples settled markets 24h before close.
python -m longshot calibrate --days 120 --lead-hours 24

# 2. What would it quote right now?
python -m longshot scan

# 3. Paper trade for a few weeks (leave it running), then check results.
python -m longshot shadow
python -m longshot report

# 4. Real orders on the demo exchange.
python -m longshot live

# Stop: Ctrl-C, or `touch STOP` from another terminal. Emergency:
python -m longshot cancel-all
```

### Reading the calibration table

```
  bucket      n  avg px  YES rate          95% CI  NO edge¢
   3-6     2140    4.31     2.90%   2.25- 3.73%      1.41
```

`NO edge¢` is the average profit per NO contract bought at the average price,
**before fees and before adverse selection**. If it's under ~2¢ or the CI is
wide, there's nothing to trade in that bucket.

### Reading the shadow report

The shadow book keeps two ledgers:

* **strict**: counts a fill only when someone bought YES at a price *worse* than
  ours, so price priority means we'd certainly have been filled.
* **optimistic**: also counts trades exactly at our price, as if we were first
  in the queue.

Believe `strict`. If only `optimistic` is positive, there's no edge. Give it
enough settled contracts (hundreds, not dozens) before concluding anything:
long-shot P&L is mostly small wins punctuated by big losses, so short samples
look better than reality.

## Known limits

* **Not yet run against the real API.** It was written against Kalshi's
  OpenAPI spec (via their official SDK's models) and tested with unit tests
  and a fake server, because the build environment couldn't reach Kalshi. Run
  `scan` and `live --once` on demo first and expect to fix a field name or two.
* **Fees** follow Kalshi's quadratic schedule (`fees.py`); check the current
  [fee schedule](https://kalshi.com/docs/kalshi-fee-schedule.pdf). Unknown fee
  types are treated as the 7% taker rate, which is conservative.
* **Calibration timing:** it measures prices `--lead-hours` before close, but
  the bot quotes at any time from 6 hours to 30 days out. Run calibrate with a
  few lead times (e.g. 6, 24, 168) and set `max_days_to_close` to match the
  one that holds up.
* **Liquidity rewards** are used to pick markets, but the bot doesn't model
  how much of a reward pool it would earn.
* **Drawdown stop** uses balance + portfolio value + resting order cost.
  If Kalshi doesn't reserve resting order cost out of `balance`, the stop
  reacts up to `max_total_cost_cents` late.
* **Capital is locked** until markets settle; the bot doesn't sell positions
  back before settlement.
* Kalshi is US-only and requires KYC. Profits are taxable.

## Layout

```
longshot/
  client.py       Kalshi REST client + RSA-PSS request signing
  calibration.py  settled-market sampling, Wilson intervals, fair value lookup
  strategy.py     universe filter, pricing, sizing, quote building
  fees.py         Kalshi fee formulas
  shadow.py       paper-trading ledger (SQLite) with strict/optimistic fills
  live.py         order reconciliation, exposure, kill switch helpers
  __main__.py     CLI
tests/            unit tests for all of the above
```
