"""Place and maintain real resting NO bids (demo by default, prod only when forced).

Every order this bot sends carries a client_order_id starting with ORDER_PREFIX,
so it never touches orders you placed by hand. Each order also carries an
expiration, so if the bot dies its quotes lapse on their own.
"""
from __future__ import annotations

import os
import uuid

from .client import KalshiClient, to_cents
from .config import Config
from .strategy import Exposure, Quote

ORDER_PREFIX = "ls-"


def event_of(ticker: str) -> str:
    return ticker.rsplit("-", 1)[0] if "-" in ticker else ticker


def our_orders(client: KalshiClient) -> list[dict]:
    return [o for o in client.resting_orders()
            if (o.get("client_order_id") or "").startswith(ORDER_PREFIX)]


def position_exposure(positions: list[dict]) -> Exposure:
    """Cost of NO contracts already held (negative position = NO)."""
    exp = Exposure()
    for p in positions:
        if (p.get("position") or 0) < 0:
            cost = to_cents(p, "market_exposure") or 0
            exp.add(p["ticker"], event_of(p["ticker"]), cost)
    return exp


def cancel_all(client: KalshiClient, log=print) -> int:
    orders = our_orders(client)
    for o in orders:
        client.cancel_order(o["order_id"])
        log(f"cancelled {o['ticker']} NO@{to_cents(o, 'no_price')} x{o.get('remaining_count')}")
    return len(orders)


def equity_cents(client: KalshiClient, resting: list[dict]) -> float:
    bal = client.balance()
    resting_cost = sum((to_cents(o, "no_price") or 0) * (o.get("remaining_count") or 0) for o in resting)
    return bal.get("balance", 0) + bal.get("portfolio_value", 0) + resting_cost


def kill_switch_on(cfg: Config) -> bool:
    return bool(cfg.risk.kill_switch_file) and os.path.exists(cfg.risk.kill_switch_file)


def reconcile(client: KalshiClient, quotes: list[Quote], resting: list[dict], cfg: Config,
              now: int, log=print) -> tuple[int, int]:
    """Cancel stale orders and place missing ones. Returns (placed, cancelled)."""
    wanted = {q.ticker: q for q in quotes}
    placed = cancelled = 0
    for o in resting:
        q = wanted.get(o["ticker"])
        if q and o.get("side") == "no" and to_cents(o, "no_price") == q.no_price:
            del wanted[o["ticker"]]  # already resting at the right price
            continue
        client.cancel_order(o["order_id"])
        cancelled += 1
    for q in wanted.values():
        order = {
            "ticker": q.ticker, "action": "buy", "side": "no", "type": "limit",
            "count": q.count, "no_price": q.no_price, "post_only": True,
            "client_order_id": f"{ORDER_PREFIX}{uuid.uuid4().hex[:20]}",
            "expiration_ts": now + cfg.risk.order_ttl_seconds,
        }
        try:
            client.create_order(order)
            placed += 1
            log(f"placed {q.ticker} NO@{q.no_price} x{q.count} (fair YES {q.fair_yes}, edge {q.edge_cents}c)")
        except Exception as exc:
            log(f"order rejected for {q.ticker}: {exc}")
    return placed, cancelled
