"""Shadow (paper) trading against real Kalshi market data.

Quotes are never sent. Instead each virtual quote is checked against the real
public trade tape:

* strict fill: a taker bought YES at a price *above* our implied YES offer
  (100 - our NO bid). Price priority means our order would certainly have
  filled first.
* optimistic fill: also counts takers buying YES exactly at our price. Whether
  we'd really have been filled depends on queue position, which we can't
  know, so this is tracked as a separate, optimistic ledger.

Settled markets are then marked to their real result. The `strict` P&L is the
number to believe; if only the optimistic number is positive, there's no edge.
"""
from __future__ import annotations

import sqlite3
import time

from .calibration import parse_ts
from .client import KalshiClient, to_cents
from .fees import order_fee_cents
from .strategy import Exposure, Quote

KINDS = ("strict", "optimistic")

SCHEMA = """
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY, ticker TEXT, event_ticker TEXT, category TEXT,
  no_price INTEGER, count INTEGER, fair_yes REAL, yes_mid REAL, edge_cents REAL,
  maker_rate REAL, placed_ts INTEGER, checked_ts INTEGER, ended_ts INTEGER
);
CREATE TABLE IF NOT EXISTS fills (
  quote_id INTEGER, trade_id TEXT, ticker TEXT, event_ticker TEXT, no_price INTEGER,
  count INTEGER, kind TEXT, ts INTEGER, PRIMARY KEY (quote_id, trade_id, kind)
);
CREATE TABLE IF NOT EXISTS results (ticker TEXT PRIMARY KEY, result TEXT, ts INTEGER);
"""


class ShadowBook:
    def __init__(self, path: str):
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def active_quotes(self) -> list[sqlite3.Row]:
        return self.db.execute("SELECT * FROM quotes WHERE ended_ts IS NULL").fetchall()

    def filled(self, quote_id: int, kind: str) -> int:
        row = self.db.execute("SELECT COALESCE(SUM(count),0) FROM fills WHERE quote_id=? AND kind=?",
                              (quote_id, kind)).fetchone()
        return int(row[0])

    def exposure(self) -> Exposure:
        """Cost of strict fills on markets that haven't settled yet."""
        exp = Exposure()
        for r in self.db.execute(
                "SELECT f.ticker, f.event_ticker, SUM(f.count*f.no_price) c FROM fills f "
                "LEFT JOIN results r ON r.ticker=f.ticker WHERE f.kind='strict' AND r.ticker IS NULL "
                "GROUP BY f.ticker, f.event_ticker"):
            exp.add(r["ticker"], r["event_ticker"], r["c"])
        return exp

    # -- fill detection ------------------------------------------------------
    def check_fills(self, client: KalshiClient, now: int) -> int:
        new = 0
        for q in self.active_quotes():
            since = q["checked_ts"] or q["placed_ts"]
            trades = [t for t in client.trades(q["ticker"], min_ts=since, max_ts=now)
                      if t.get("taker_side") == "yes"]
            trades.sort(key=lambda t: parse_ts(t.get("created_time")) or 0)
            our_yes_offer = 100 - q["no_price"]
            # Two independent ledgers, each capped at the quote size: "strict"
            # counts only trades through our price, "optimistic" also counts
            # trades at our price (as if we were first in the queue).
            remaining = {kind: q["count"] - self.filled(q["id"], kind) for kind in KINDS}
            for t in trades:
                ts = parse_ts(t.get("created_time")) or now
                if ts < q["placed_ts"]:
                    continue
                price, size = to_cents(t, "yes_price"), int(t.get("count") or 0)
                if price is None or size <= 0:
                    continue
                kinds = KINDS if price > our_yes_offer else ("optimistic",) if price == our_yes_offer else ()
                for kind in kinds:
                    n = min(size, remaining[kind])
                    if n <= 0:
                        continue
                    cur = self.db.execute(
                        "INSERT OR IGNORE INTO fills VALUES (?,?,?,?,?,?,?,?)",
                        (q["id"], t["trade_id"], q["ticker"], q["event_ticker"], q["no_price"], n, kind, ts))
                    if cur.rowcount:  # 0 when this trade was already counted last cycle
                        remaining[kind] -= n
                        new += kind == "strict"
            self.db.execute("UPDATE quotes SET checked_ts=? WHERE id=?", (now, q["id"]))
        self.db.commit()
        return new

    # -- quote management ----------------------------------------------------
    def replace_quotes(self, quotes: list[Quote], now: int) -> None:
        wanted = {q.ticker: q for q in quotes}
        for row in self.active_quotes():
            q = wanted.get(row["ticker"])
            fully_filled = self.filled(row["id"], "strict") >= row["count"]
            if q and q.no_price == row["no_price"] and q.count == row["count"] and not fully_filled:
                del wanted[row["ticker"]]  # unchanged: keep the same virtual order alive
            else:
                self.db.execute("UPDATE quotes SET ended_ts=? WHERE id=?", (now, row["id"]))
        for q in wanted.values():
            self.db.execute(
                "INSERT INTO quotes (ticker,event_ticker,category,no_price,count,fair_yes,yes_mid,"
                "edge_cents,maker_rate,placed_ts) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (q.ticker, q.event_ticker, q.category, q.no_price, q.count, q.fair_yes,
                 q.yes_mid, q.edge_cents, q.maker_rate, now))
        self.db.commit()

    # -- settlement & reporting ---------------------------------------------
    def settle(self, client: KalshiClient) -> int:
        settled = 0
        pending = [r[0] for r in self.db.execute(
            "SELECT DISTINCT f.ticker FROM fills f LEFT JOIN results r ON r.ticker=f.ticker "
            "WHERE r.ticker IS NULL")]
        for ticker in pending:
            result = (client.market(ticker).get("result") or "").lower()
            if result in ("yes", "no"):
                self.db.execute("INSERT OR REPLACE INTO results VALUES (?,?,?)",
                                (ticker, result, int(time.time())))
                settled += 1
        self.db.commit()
        return settled

    def report(self) -> dict:
        out = {}
        for label in KINDS:
            rows = self.db.execute(
                "SELECT f.*, r.result, q.maker_rate FROM fills f JOIN quotes q ON q.id=f.quote_id "
                "LEFT JOIN results r ON r.ticker=f.ticker WHERE f.kind=?", (label,)).fetchall()
            pnl = fees = won = lost = 0
            open_cost = 0
            for r in rows:
                fee = order_fee_cents(r["no_price"], r["count"], r["maker_rate"] or 0.0)
                if r["result"] is None:
                    open_cost += r["count"] * r["no_price"]
                    continue
                fees += fee
                if r["result"] == "no":
                    pnl += r["count"] * (100 - r["no_price"]) - fee
                    won += r["count"]
                else:
                    pnl -= r["count"] * r["no_price"] + fee
                    lost += r["count"]
            out[label] = {"settled_pnl_cents": pnl, "fees_cents": fees, "contracts_won": won,
                          "contracts_lost": lost, "open_cost_cents": open_cost, "fills": len(rows)}
        out["quotes_placed"] = self.db.execute("SELECT COUNT(*) FROM quotes").fetchone()[0]
        return out
