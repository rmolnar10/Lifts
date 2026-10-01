"""Measure the long-shot bias on settled Kalshi markets.

For every settled market we look up the YES mid-price some hours before close
and record whether it settled YES. Bucketing those samples by price gives the
real YES rate per price level. If cheap YES contracts settle YES less often
than their price implies, buying NO at those prices has positive expectancy.

The bot uses the *upper* end of a 95% Wilson interval as its fair YES price,
so it only quotes where the bias is large enough to survive sampling noise.
"""
from __future__ import annotations

import json
import math
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from .client import KalshiClient, to_cents

BUCKET_EDGES = [1, 3, 6, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100]
ALL = "_all"


def parse_ts(value: str | None) -> int | None:
    if not value:
        return None
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())


def bucket_for(price_cents: float) -> tuple[int, int] | None:
    for lo, hi in zip(BUCKET_EDGES, BUCKET_EDGES[1:]):
        if lo <= price_cents < hi:
            return lo, hi
    return None


def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return 0.0, 1.0
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


@dataclass
class Sample:
    category: str
    price_cents: float
    settled_yes: bool


def build_table(samples: list[Sample]) -> dict:
    acc: dict[str, dict[tuple[int, int], list[Sample]]] = defaultdict(lambda: defaultdict(list))
    for s in samples:
        b = bucket_for(s.price_cents)
        if b is None:
            continue
        acc[ALL][b].append(s)
        acc[s.category or "unknown"][b].append(s)

    table: dict[str, list[dict]] = {}
    for category, buckets in acc.items():
        rows = []
        for (lo, hi), items in sorted(buckets.items()):
            n = len(items)
            yes = sum(1 for s in items if s.settled_yes)
            lo_ci, hi_ci = wilson(yes, n)
            avg_price = sum(s.price_cents for s in items) / n
            rows.append({
                "lo": lo, "hi": hi, "n": n,
                "avg_price_cents": round(avg_price, 2),
                "yes_rate": round(yes / n, 4),
                "yes_rate_ci95": [round(lo_ci, 4), round(hi_ci, 4)],
                # Expected profit per NO contract bought at the avg YES price, before fees.
                "no_edge_cents": round(avg_price - 100 * yes / n, 2),
            })
        table[category] = rows
    return {"generated_at": int(time.time()), "buckets": table}


class Calibration:
    def __init__(self, table: dict | None, min_samples: int, fallback_ratio: float):
        self.buckets = (table or {}).get("buckets", {})
        self.min_samples = min_samples
        self.fallback_ratio = fallback_ratio

    @classmethod
    def load(cls, path: str, min_samples: int, fallback_ratio: float) -> "Calibration":
        try:
            with open(path) as f:
                return cls(json.load(f), min_samples, fallback_ratio)
        except FileNotFoundError:
            return cls(None, min_samples, fallback_ratio)

    def _row(self, category: str, price: float) -> dict | None:
        b = bucket_for(price)
        if b is None:
            return None
        for key in (category, ALL):
            for row in self.buckets.get(key, []):
                if (row["lo"], row["hi"]) == b and row["n"] >= self.min_samples:
                    return row
        return None

    def fair_yes_cents(self, category: str, price_cents: float) -> tuple[float, str]:
        """Conservative fair YES price in cents and where it came from."""
        row = self._row(category, price_cents)
        if row is None:
            return price_cents * self.fallback_ratio, "fallback"
        # Shift the market price by the measured bias, using the pessimistic end
        # of the confidence interval for the YES rate.
        bias = row["yes_rate_ci95"][1] * 100 - row["avg_price_cents"]
        return max(0.0, price_cents + bias), f"calibrated(n={row['n']})"


def _candle_mid(candle: dict, max_spread: float) -> float | None:
    bid = to_cents(candle.get("yes_bid") or {}, "close")
    ask = to_cents(candle.get("yes_ask") or {}, "close")
    if not bid or not ask or ask <= bid or ask - bid > max_spread:
        return None
    return (bid + ask) / 2


def collect_samples(client: KalshiClient, days: int, lead_hours: float,
                    max_spread: float, max_pages: int = 50, log=print) -> list[Sample]:
    now = int(time.time())
    lead = int(lead_hours * 3600)
    targets = []
    for m in client.markets(max_pages=max_pages, status="settled",
                            min_settled_ts=now - days * 86400, mve_filter="exclude"):
        result = (m.get("result") or "").lower()
        close_ts, open_ts = parse_ts(m.get("close_time")), parse_ts(m.get("open_time"))
        if result not in ("yes", "no") or not close_ts or not open_ts:
            continue
        sample_ts = close_ts - lead
        if sample_ts <= open_ts:
            continue
        targets.append((sample_ts, m["ticker"], m.get("category") or "", result == "yes"))
    log(f"{len(targets)} settled markets to sample")

    targets.sort()
    samples: list[Sample] = []
    i = 0
    while i < len(targets):
        # Batch up to 100 markets whose sample times fall within ~2 days of each other.
        chunk = [targets[i]]
        while (i + len(chunk) < len(targets) and len(chunk) < 100
               and targets[i + len(chunk)][0] - chunk[0][0] < 2 * 86400):
            chunk.append(targets[i + len(chunk)])
        i += len(chunk)
        start, end = chunk[0][0] - 3 * 3600, chunk[-1][0]
        try:
            series = client.batch_candlesticks([t[1] for t in chunk], start, end, 60)
        except Exception as exc:  # keep going; one bad chunk shouldn't sink the run
            log(f"candlesticks failed for {len(chunk)} markets: {exc}")
            continue
        candles_by_ticker = {s.get("market_ticker"): s.get("candlesticks") or [] for s in series}
        for sample_ts, ticker, category, settled_yes in chunk:
            candles = [c for c in candles_by_ticker.get(ticker, [])
                       if c.get("end_period_ts", 0) <= sample_ts]
            if not candles:
                continue
            mid = _candle_mid(candles[-1], max_spread)
            if mid is not None:
                samples.append(Sample(category, mid, settled_yes))
        log(f"  sampled {len(samples)} / {i} markets")
    return samples
