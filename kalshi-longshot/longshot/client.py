"""Minimal Kalshi Trade API v2 client.

Field names and endpoints follow Kalshi's OpenAPI spec (as shipped in the
official kalshi_python_sync SDK). Auth is RSA-PSS over
`timestamp_ms + METHOD + path` (path without the query string).
"""
from __future__ import annotations

import base64
import os
import time
from typing import Any, Iterator

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

HOSTS = {
    "demo": "https://demo-api.kalshi.co",
    "prod": "https://api.elections.kalshi.com",
}
API_PREFIX = "/trade-api/v2"


class KalshiError(RuntimeError):
    def __init__(self, status: int, body: str, path: str):
        super().__init__(f"Kalshi API {status} on {path}: {body[:300]}")
        self.status = status


def load_private_key(path: str):
    with open(os.path.expanduser(path), "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def sign(private_key, timestamp_ms: str, method: str, path: str) -> str:
    message = (timestamp_ms + method.upper() + path.split("?")[0]).encode()
    signature = private_key.sign(
        message,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode()


def to_cents(obj: dict, key: str) -> float | None:
    """Read a price in cents, falling back to the `<key>_dollars` string field."""
    value = obj.get(key)
    if isinstance(value, (int, float)):
        return float(value)
    dollars = obj.get(f"{key}_dollars")
    if dollars not in (None, ""):
        return round(float(dollars) * 100, 4)
    return None


class KalshiClient:
    def __init__(self, env: str = "demo", key_id: str | None = None, private_key=None,
                 min_interval: float = 0.12, session: requests.Session | None = None):
        if env not in HOSTS:
            raise ValueError(f"env must be one of {sorted(HOSTS)}")
        self.env = env
        self.host = HOSTS[env]
        self.key_id = key_id
        self.private_key = private_key
        self.min_interval = min_interval
        self.session = session or requests.Session()
        self._last_call = 0.0

    @property
    def authenticated(self) -> bool:
        return bool(self.key_id and self.private_key)

    # -- transport -----------------------------------------------------------
    def _request(self, method: str, path: str, params: dict | None = None,
                 body: dict | None = None, auth: bool = False) -> Any:
        full_path = API_PREFIX + path
        headers = {"Content-Type": "application/json"}
        if auth or self.authenticated:
            if not self.authenticated:
                raise KalshiError(401, "this endpoint needs API credentials", full_path)
            ts = str(int(time.time() * 1000))
            headers.update({
                "KALSHI-ACCESS-KEY": self.key_id,
                "KALSHI-ACCESS-TIMESTAMP": ts,
                "KALSHI-ACCESS-SIGNATURE": sign(self.private_key, ts, method, full_path),
            })
        params = {k: v for k, v in (params or {}).items() if v is not None}

        for attempt in range(5):
            wait = self.min_interval - (time.monotonic() - self._last_call)
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()
            resp = self.session.request(method, self.host + full_path, params=params,
                                        json=body, headers=headers, timeout=20)
            if resp.status_code == 429 or resp.status_code >= 500:
                time.sleep(2 ** attempt)
                continue
            if resp.status_code >= 400:
                raise KalshiError(resp.status_code, resp.text, full_path)
            return resp.json() if resp.content else {}
        raise KalshiError(resp.status_code, resp.text, full_path)

    def _paginate(self, path: str, key: str, params: dict, max_pages: int = 50,
                  auth: bool = False) -> Iterator[dict]:
        cursor = None
        for _ in range(max_pages):
            data = self._request("GET", path, params={**params, "cursor": cursor}, auth=auth)
            yield from data.get(key) or []
            cursor = data.get("cursor") or data.get("next_cursor")
            if not cursor:
                return

    # -- market data (public) ------------------------------------------------
    def markets(self, max_pages: int = 30, **params) -> Iterator[dict]:
        return self._paginate("/markets", "markets", {"limit": 1000, **params}, max_pages)

    def market(self, ticker: str) -> dict:
        return self._request("GET", f"/markets/{ticker}")["market"]

    def series(self, series_ticker: str) -> dict:
        return self._request("GET", f"/series/{series_ticker}")["series"]

    def orderbook(self, ticker: str, depth: int = 10) -> dict:
        return self._request("GET", f"/markets/{ticker}/orderbook", params={"depth": depth})["orderbook"]

    def trades(self, ticker: str, min_ts: int | None = None, max_ts: int | None = None,
               max_pages: int = 10) -> Iterator[dict]:
        return self._paginate("/markets/trades", "trades",
                              {"ticker": ticker, "min_ts": min_ts, "max_ts": max_ts, "limit": 1000},
                              max_pages)

    def batch_candlesticks(self, tickers: list[str], start_ts: int, end_ts: int,
                           period_interval: int = 60) -> list[dict]:
        data = self._request("GET", "/markets/candlesticks", params={
            "market_tickers": ",".join(tickers[:100]), "start_ts": start_ts,
            "end_ts": end_ts, "period_interval": period_interval,
            "include_latest_before_start": "true",
        })
        return data.get("markets") or []

    def incentive_programs(self, status: str = "active", type_: str = "liquidity") -> list[dict]:
        return list(self._paginate("/incentive_programs", "incentive_programs",
                                   {"status": status, "type": type_, "limit": 1000}, max_pages=10))

    # -- portfolio (authenticated) -------------------------------------------
    def balance(self) -> dict:
        """{'balance': available cents, 'portfolio_value': mark value of positions in cents}"""
        return self._request("GET", "/portfolio/balance", auth=True)

    def positions(self) -> list[dict]:
        return list(self._paginate("/portfolio/positions", "market_positions",
                                   {"limit": 1000, "count_filter": "position"}, auth=True))

    def resting_orders(self) -> list[dict]:
        return list(self._paginate("/portfolio/orders", "orders",
                                   {"status": "resting", "limit": 1000}, auth=True))

    def create_order(self, order: dict) -> dict:
        return self._request("POST", "/portfolio/orders", body=order, auth=True)["order"]

    def cancel_order(self, order_id: str) -> dict:
        return self._request("DELETE", f"/portfolio/orders/{order_id}", auth=True)
