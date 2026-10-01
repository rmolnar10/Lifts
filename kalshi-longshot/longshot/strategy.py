"""Pick long-shot markets and price resting NO bids on them.

Buying NO at n cents is the same as offering YES at 100 - n. We only ever post
maker (post-only) bids, never cross the spread, and only where the calibrated
fair value leaves at least `min_edge_cents` after the maker fee.
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field

from .calibration import Calibration, parse_ts
from .client import KalshiClient, to_cents
from .config import Config
from .fees import fee_per_contract_cents, maker_rate


@dataclass
class Quote:
    ticker: str
    event_ticker: str
    category: str
    title: str
    no_price: int
    count: int
    yes_mid: float
    fair_yes: float
    edge_cents: float
    source: str
    reward_cents: int = 0
    maker_rate: float = 0.0


@dataclass
class Exposure:
    """Worst-case loss already committed (cost of NO contracts held), in cents."""
    by_market: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    by_event: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    total: float = 0.0

    def add(self, ticker: str, event: str, cents: float) -> None:
        self.by_market[ticker] += cents
        self.by_event[event] += cents
        self.total += cents


def best_bids(orderbook: dict) -> tuple[int, int]:
    """Best YES bid and best NO bid in cents (0 when a side is empty)."""
    def best(side: str) -> int:
        levels = orderbook.get(side)
        if levels:
            return int(max(level[0] for level in levels))
        levels = orderbook.get(f"{side}_dollars") or []
        return int(round(max((float(level[0]) for level in levels), default=0) * 100))
    return best("yes"), best("no")


def market_mid(market: dict) -> float | None:
    bid, ask = to_cents(market, "yes_bid"), to_cents(market, "yes_ask")
    if not bid or not ask or ask <= bid:
        return None
    return (bid + ask) / 2


def select_candidates(markets: list[dict], cfg: Config, rewards: dict[str, int],
                      now: int) -> list[dict]:
    u = cfg.universe
    picked = []
    for m in markets:
        mid = market_mid(m)
        close_ts = parse_ts(m.get("close_time"))
        if mid is None or close_ts is None:
            continue
        hours_left = (close_ts - now) / 3600
        spread = to_cents(m, "yes_ask") - to_cents(m, "yes_bid")
        rewarded = u.include_incentive_markets and m["ticker"] in rewards
        if not (u.min_yes_cents <= mid <= u.max_yes_cents):
            continue
        if not (u.min_hours_to_close <= hours_left <= u.max_days_to_close * 24):
            continue
        if spread > u.max_spread_cents and not rewarded:
            continue
        if (m.get("volume_24h") or 0) < u.min_volume_24h and not rewarded:
            continue
        if (m.get("category") or "") in u.exclude_categories:
            continue
        picked.append(m)
    picked.sort(key=lambda m: (rewards.get(m["ticker"], 0), m.get("volume_24h") or 0), reverse=True)
    return picked


def price_no_bid(best_yes_bid: int, best_no_bid: int, fair_yes: float, rate: float,
                 min_edge: float, tick: int = 1) -> tuple[int, float] | None:
    """Return (NO bid price, edge per contract) or None when there's no edge at the touch."""
    fair_no = 100 - fair_yes
    # Highest NO price that still leaves min_edge after the maker fee.
    max_price = math.floor(fair_no - min_edge)
    while max_price >= 1 and fair_no - max_price - fee_per_contract_cents(max_price, rate) < min_edge:
        max_price -= tick
    no_ask = 100 - best_yes_bid if best_yes_bid > 0 else 100
    target = min(best_no_bid + tick, max_price, no_ask - tick, 99)
    # Only quote at or above the current best bid: sitting behind the book
    # mostly gets filled when the price is running against us.
    if target < 1 or target < best_no_bid:
        return None
    edge = fair_no - target - fee_per_contract_cents(target, rate)
    return target, edge


def size_quote(no_price: int, ticker: str, event: str, exposure: Exposure, cfg: Config) -> int:
    s = cfg.sizing
    room = min(s.max_cost_per_market_cents - exposure.by_market.get(ticker, 0),
               s.max_cost_per_event_cents - exposure.by_event.get(event, 0),
               s.max_total_cost_cents - exposure.total)
    return max(0, min(s.contracts_per_quote, int(room // no_price)))


class SeriesFees:
    def __init__(self, client: KalshiClient):
        self.client = client
        self.cache: dict[str, float] = {}

    def maker_rate(self, event_ticker: str) -> float:
        series = event_ticker.split("-")[0]
        if series not in self.cache:
            try:
                s = self.client.series(series)
                self.cache[series] = maker_rate(s.get("fee_type"), s.get("fee_multiplier"))
            except Exception:
                self.cache[series] = maker_rate(None)
        return self.cache[series]


def build_quotes(client: KalshiClient, cfg: Config, calib: Calibration, exposure: Exposure,
                 fees: SeriesFees, now: int, log=print) -> list[Quote]:
    try:
        programs = client.incentive_programs()
        rewards = {p["market_ticker"]: int(p.get("period_reward") or 0) // 100 for p in programs}
    except Exception as exc:
        log(f"incentive programs unavailable: {exc}")
        rewards = {}

    markets = list(client.markets(max_pages=cfg.universe.max_pages, status="open", mve_filter="exclude"))
    candidates = select_candidates(markets, cfg, rewards, now)
    log(f"{len(markets)} open markets, {len(candidates)} pass filters")

    quotes: list[Quote] = []
    for m in candidates[: cfg.universe.max_markets * 3]:
        if len(quotes) >= cfg.universe.max_markets:
            break
        ticker, event = m["ticker"], m.get("event_ticker") or m["ticker"]
        mid = market_mid(m)
        fair_yes, source = calib.fair_yes_cents(m.get("category") or "", mid)
        if source == "fallback" and not cfg.model.quote_uncalibrated:
            continue
        try:
            best_yes, best_no = best_bids(client.orderbook(ticker))
        except Exception as exc:
            log(f"{ticker}: orderbook failed: {exc}")
            continue
        rate = fees.maker_rate(event)
        priced = price_no_bid(best_yes, best_no, fair_yes, rate,
                              cfg.model.min_edge_cents, int(m.get("tick_size") or 1))
        if priced is None:
            continue
        no_price, edge = priced
        count = size_quote(no_price, ticker, event, exposure, cfg)
        if count < 1:
            continue
        exposure.add(ticker, event, count * no_price)
        quotes.append(Quote(ticker, event, m.get("category") or "", m.get("title") or "",
                            no_price, count, mid, round(fair_yes, 2), round(edge, 2), source,
                            rewards.get(ticker, 0), rate))
    return quotes
