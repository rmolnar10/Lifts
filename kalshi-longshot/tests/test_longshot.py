import base64
import time
from datetime import datetime, timezone

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from longshot.calibration import Calibration, Sample, build_table, wilson
from longshot.client import sign, to_cents
from longshot.config import Config, load_config
from longshot.fees import fee_per_contract_cents, maker_rate, order_fee_cents
from longshot.live import ORDER_PREFIX, position_exposure, reconcile
from longshot.shadow import ShadowBook
from longshot.strategy import (Exposure, Quote, SeriesFees, best_bids, build_quotes,
                               price_no_bid, select_candidates, size_quote)

NOW = 1_800_000_000


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")


def market(ticker="EVT-A", yes_bid=8, yes_ask=10, hours=48, vol=1000, **kw):
    return {"ticker": ticker, "event_ticker": ticker.rsplit("-", 1)[0], "title": ticker,
            "yes_bid": yes_bid, "yes_ask": yes_ask, "close_time": iso(NOW + hours * 3600),
            "volume_24h": vol, "category": "Politics", "tick_size": 1, **kw}


class FakeClient:
    def __init__(self, markets=(), books=None, trades=None, results=None, resting=()):
        self._markets = list(markets)
        self.books = books or {}
        self._trades = trades or {}
        self.results = results or {}
        self.resting = list(resting)
        self.created, self.cancelled = [], []

    def markets(self, max_pages=30, **params):
        return iter(self._markets)

    def orderbook(self, ticker, depth=10):
        return self.books[ticker]

    def incentive_programs(self):
        return []

    def series(self, ticker):
        return {"fee_type": "quadratic_with_maker_fees", "fee_multiplier": 1}

    def trades(self, ticker, min_ts=None, max_ts=None, max_pages=10):
        return iter(self._trades.get(ticker, []))

    def market(self, ticker):
        return {"ticker": ticker, "result": self.results.get(ticker, "")}

    def create_order(self, order):
        self.created.append(order)
        return order

    def cancel_order(self, order_id):
        self.cancelled.append(order_id)


def calibrated(yes_rate_hi=0.05, avg=9.0, n=500):
    table = {"buckets": {"_all": [{"lo": 6, "hi": 10, "n": n, "avg_price_cents": avg,
                                   "yes_rate": yes_rate_hi - 0.01,
                                   "yes_rate_ci95": [0.0, yes_rate_hi], "no_edge_cents": 0}]}}
    return Calibration(table, min_samples=100, fallback_ratio=1.0)


# -- client ------------------------------------------------------------------

def test_signature_covers_path_without_query():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    sig = sign(key, "123", "get", "/trade-api/v2/markets?limit=5")
    key.public_key().verify(
        base64.b64decode(sig), b"123GET/trade-api/v2/markets",
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.DIGEST_LENGTH),
        hashes.SHA256())


def test_to_cents_falls_back_to_dollar_strings():
    assert to_cents({"yes_bid": 7}, "yes_bid") == 7
    assert to_cents({"yes_bid_dollars": "0.0700"}, "yes_bid") == 7
    assert to_cents({}, "yes_bid") is None


def test_best_bids_reads_both_formats():
    assert best_bids({"yes": [[3, 10], [8, 5]], "no": [[85, 1], [90, 2]]}) == (8, 90)
    assert best_bids({"yes_dollars": [["0.0800", "5"]], "no_dollars": [["0.9000", "2"]]}) == (8, 90)
    assert best_bids({"yes": None, "no": None}) == (0, 0)


# -- fees ----------------------------------------------------------------------

def test_fees():
    assert order_fee_cents(50, 1, 0.07) == 2          # 1.75c rounds up
    assert order_fee_cents(90, 100, 0.0175) == 16     # 15.75c rounds up
    assert maker_rate("quadratic") == 0
    assert maker_rate("quadratic_with_maker_fees", 0.5) == pytest.approx(0.00875)
    assert maker_rate("something_new") == 0.07         # unknown -> assume the worst
    assert fee_per_contract_cents(90, 0.0175) == pytest.approx(0.1575)


# -- pricing -------------------------------------------------------------------

def test_no_quote_without_edge():
    # Fair YES equals the market: buying NO at the touch has no edge.
    assert price_no_bid(best_yes_bid=8, best_no_bid=90, fair_yes=9, rate=0.0175, min_edge=2) is None


def test_quote_improves_best_bid_when_edge_allows():
    no_price, edge = price_no_bid(best_yes_bid=8, best_no_bid=88, fair_yes=5, rate=0.0175, min_edge=2)
    assert no_price == 89 and edge >= 2


def test_quote_never_crosses_the_spread():
    # Best YES bid 11 means a NO ask at 89; we must stay a tick below.
    no_price, _ = price_no_bid(best_yes_bid=11, best_no_bid=88, fair_yes=2, rate=0, min_edge=1)
    assert no_price == 88


def test_quote_skipped_when_edge_only_exists_behind_the_book():
    # Edge needs NO <= 91, but the best NO bid is already 93.
    assert price_no_bid(best_yes_bid=5, best_no_bid=93, fair_yes=7, rate=0, min_edge=2) is None


def test_sizing_respects_every_cap():
    cfg = Config()
    exp = Exposure()
    assert size_quote(90, "EVT-A", "EVT", exp, cfg) == 10
    exp.add("EVT-A", "EVT", 500)                    # $5 of $10 market cap used
    assert size_quote(90, "EVT-A", "EVT", exp, cfg) == 5
    exp.add("EVT-B", "EVT", 1500)                   # event cap ($20) now full
    assert size_quote(90, "EVT-C", "EVT", exp, cfg) == 0


def test_candidate_filters():
    cfg = Config()
    ms = [market("A-1"), market("A-2", yes_bid=40, yes_ask=42), market("A-3", hours=2),
          market("A-4", vol=5), market("A-5", yes_bid=3, yes_ask=15)]
    assert [m["ticker"] for m in select_candidates(ms, cfg, {}, NOW)] == ["A-1"]
    # Incentive markets skip the volume and spread filters.
    picked = select_candidates(ms, cfg, {"A-4": 500, "A-5": 100}, NOW)
    assert [m["ticker"] for m in picked] == ["A-4", "A-5", "A-1"]


# -- calibration ----------------------------------------------------------------

def test_wilson_interval_brackets_rate():
    lo, hi = wilson(5, 100)
    assert lo < 0.05 < hi and hi < 0.12


def test_calibration_table_and_conservative_fair_value():
    samples = [Sample("Politics", 8.0, i < 20) for i in range(1000)]   # 2% settle YES at 8c
    table = build_table(samples)
    row = table["buckets"]["_all"][0]
    assert (row["lo"], row["hi"], row["n"]) == (6, 10, 1000)
    assert row["yes_rate"] == 0.02 and row["no_edge_cents"] == 6.0
    calib = Calibration(table, min_samples=100, fallback_ratio=1.0)
    fair, source = calib.fair_yes_cents("Politics", 8.0)
    # Uses the upper CI (~3.1%), not the point estimate (2%).
    assert 2.0 < fair < 4.0 and source.startswith("calibrated")


def test_calibration_falls_back_when_thin():
    calib = Calibration(build_table([Sample("X", 8.0, False)] * 10), 100, fallback_ratio=1.0)
    assert calib.fair_yes_cents("X", 8.0) == (8.0, "fallback")


# -- end to end: quotes, shadow fills, settlement, live reconcile ------------------

def test_build_quotes_end_to_end():
    client = FakeClient(markets=[market("EVT-A")],
                        books={"EVT-A": {"yes": [[8, 100]], "no": [[88, 50]]}})
    quotes = build_quotes(client, Config(), calibrated(), Exposure(), SeriesFees(client), NOW,
                          log=lambda *_: None)
    assert len(quotes) == 1
    q = quotes[0]
    assert q.no_price == 89 and q.count == 10 and q.edge_cents >= 2 and q.maker_rate == 0.0175


def test_build_quotes_needs_calibration():
    client = FakeClient(markets=[market("EVT-A")],
                        books={"EVT-A": {"yes": [[8, 100]], "no": [[88, 50]]}})
    uncalibrated = Calibration(None, 100, fallback_ratio=1.0)
    cfg = Config()
    assert build_quotes(client, cfg, uncalibrated, Exposure(), SeriesFees(client), NOW,
                        log=lambda *_: None) == []
    # Opting in quotes off the fallback (here: pure spread capture around the mid).
    cfg.model.quote_uncalibrated = True
    quotes = build_quotes(client, cfg, uncalibrated, Exposure(), SeriesFees(client), NOW,
                          log=lambda *_: None)
    assert [q.source for q in quotes] == ["fallback"]


def quote(ticker="EVT-A", no_price=89, count=10):
    return Quote(ticker, "EVT", "Politics", ticker, no_price, count, 9.0, 5.0, 3.0, "test", 0, 0.0)


def trade(tid, yes_price, count, ts, taker="yes"):
    return {"trade_id": tid, "yes_price": yes_price, "count": count, "taker_side": taker,
            "created_time": iso(ts)}


def test_shadow_strict_vs_touch_fills_and_pnl(tmp_path):
    book = ShadowBook(str(tmp_path / "s.db"))
    book.replace_quotes([quote(no_price=89, count=10)], NOW)       # implied YES offer at 11
    client = FakeClient(trades={"EVT-A": [
        trade("t1", 12, 4, NOW + 10),            # through our price -> strict 4
        trade("t2", 11, 3, NOW + 20),            # at our price -> touch 3
        trade("t3", 13, 2, NOW + 30, "no"),      # taker sold YES: not our side
        trade("t4", 10, 9, NOW + 40),            # below our offer: wouldn't hit us
        trade("t5", 14, 20, NOW + 50),           # strict, capped at remaining 6
    ]})
    assert book.check_fills(client, NOW + 60) == 2            # new strict fills
    assert book.filled(1, "strict") == 10                     # 4 + 6 (capped)
    assert book.filled(1, "optimistic") == 10                 # 4 + 3 + 3 (capped)
    assert book.check_fills(client, NOW + 60) == 0            # idempotent
    assert book.filled(1, "strict") == 10

    client.results = {"EVT-A": "no"}
    assert book.settle(client) == 1
    r = book.report()["strict"]
    fee = order_fee_cents(89, 4, 0) + order_fee_cents(89, 6, 0)
    assert r["contracts_won"] == 10 and r["settled_pnl_cents"] == 10 * 11 - fee


def test_shadow_loss_when_long_shot_hits(tmp_path):
    book = ShadowBook(str(tmp_path / "s.db"))
    book.replace_quotes([quote(no_price=90, count=5)], NOW)
    client = FakeClient(trades={"EVT-A": [trade("t1", 11, 5, NOW + 5)]}, results={"EVT-A": "yes"})
    book.check_fills(client, NOW + 10)
    book.settle(client)
    assert book.report()["strict"]["settled_pnl_cents"] == -450


def test_shadow_keeps_unchanged_quote_and_replaces_moved_one(tmp_path):
    book = ShadowBook(str(tmp_path / "s.db"))
    book.replace_quotes([quote("EVT-A"), quote("EVT-B")], NOW)
    book.replace_quotes([quote("EVT-A"), quote("EVT-B", no_price=88)], NOW + 60)
    active = {r["ticker"]: r for r in book.active_quotes()}
    assert active["EVT-A"]["placed_ts"] == NOW and active["EVT-B"]["no_price"] == 88


def test_live_reconcile_only_touches_what_changed():
    resting = [
        {"order_id": "keep", "ticker": "EVT-A", "side": "no", "no_price": 89},
        {"order_id": "moved", "ticker": "EVT-B", "side": "no", "no_price": 90},
        {"order_id": "gone", "ticker": "EVT-C", "side": "no", "no_price": 91},
    ]
    client = FakeClient()
    placed, cancelled = reconcile(client, [quote("EVT-A"), quote("EVT-B", no_price=88),
                                           quote("EVT-D")], resting, Config(), NOW, log=lambda *_: None)
    assert sorted(client.cancelled) == ["gone", "moved"] and (placed, cancelled) == (2, 2)
    for order in client.created:
        assert order["post_only"] and order["side"] == "no" and order["action"] == "buy"
        assert order["client_order_id"].startswith(ORDER_PREFIX)
        assert order["expiration_ts"] == NOW + Config().risk.order_ttl_seconds


def test_position_exposure_counts_only_no_positions():
    exp = position_exposure([
        {"ticker": "EVT-A", "position": -10, "market_exposure": 890},
        {"ticker": "EVT-B", "position": 5, "market_exposure": 50},
    ])
    assert exp.total == 890 and exp.by_event["EVT"] == 890


def test_config_rejects_typos(tmp_path):
    path = tmp_path / "c.toml"
    path.write_text("[sizing]\ncontracts_per_qoute = 5\n")
    with pytest.raises(ValueError, match="contracts_per_qoute"):
        load_config(str(path))
    path.write_text("[sizing]\ncontracts_per_quote = 5\n")
    assert load_config(str(path)).sizing.contracts_per_quote == 5
