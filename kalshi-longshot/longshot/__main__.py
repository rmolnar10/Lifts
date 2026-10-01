"""Command line: python -m longshot <command> [--config config.toml]"""
from __future__ import annotations

import argparse
import json
import sys
import time

from .calibration import Calibration, build_table, collect_samples
from .client import KalshiClient, load_private_key
from .config import Config, load_config
from .live import cancel_all, equity_cents, kill_switch_on, our_orders, position_exposure, reconcile
from .shadow import ShadowBook
from .strategy import Exposure, SeriesFees, build_quotes


def log(msg: str) -> None:
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def make_client(cfg: Config, env: str | None = None, auth: bool = False) -> KalshiClient:
    env = env or cfg.api.env
    key = None
    # Demo keys don't work on prod (and vice versa), so read-only prod data
    # commands only sign requests when the configured keys are for prod.
    if auth or (cfg.api.key_id and cfg.api.private_key_path and env == cfg.api.env):
        if not (cfg.api.key_id and cfg.api.private_key_path):
            sys.exit("API credentials needed: set KALSHI_KEY_ID and KALSHI_PRIVATE_KEY_PATH")
        key = load_private_key(cfg.api.private_key_path)
    return KalshiClient(env, cfg.api.key_id or None, key)


def load_calibration(cfg: Config) -> Calibration:
    calib = Calibration.load(cfg.model.calibration_file, cfg.model.min_bucket_samples,
                             cfg.model.fallback_longshot_ratio)
    if not calib.buckets:
        log(f"no calibration at {cfg.model.calibration_file}; using fallback ratio "
            f"{cfg.model.fallback_longshot_ratio} (run `calibrate` first)")
    return calib


def print_quotes(quotes) -> None:
    if not quotes:
        print("No quotes: nothing has enough calibrated edge right now.")
        return
    print(f"{'ticker':38} {'mid':>5} {'fairY':>6} {'NO@':>4} {'qty':>4} {'edge':>5} {'reward$':>8}  source")
    for q in quotes:
        print(f"{q.ticker[:38]:38} {q.yes_mid:5.1f} {q.fair_yes:6.2f} {q.no_price:4d} {q.count:4d} "
              f"{q.edge_cents:5.2f} {q.reward_cents / 100:8.2f}  {q.source}")


def cmd_scan(cfg: Config, args) -> None:
    client = make_client(cfg, env="prod")  # real prices; read-only
    quotes = build_quotes(client, cfg, load_calibration(cfg), Exposure(), SeriesFees(client),
                          int(time.time()), log)
    print_quotes(quotes)


def cmd_calibrate(cfg: Config, args) -> None:
    client = make_client(cfg, env="prod")
    samples = collect_samples(client, args.days, args.lead_hours, cfg.universe.max_spread_cents,
                              log=log)
    table = build_table(samples)
    table["params"] = {"days": args.days, "lead_hours": args.lead_hours, "samples": len(samples)}
    with open(cfg.model.calibration_file, "w") as f:
        json.dump(table, f, indent=1)
    print(f"\nwrote {cfg.model.calibration_file} from {len(samples)} samples\n")
    print(f"{'bucket':>8} {'n':>6} {'avg px':>7} {'YES rate':>9} {'95% CI':>15} {'NO edge¢':>9}")
    for row in table["buckets"].get("_all", []):
        lo, hi = row["yes_rate_ci95"]
        print(f"{row['lo']:>3}-{row['hi']:<4} {row['n']:6d} {row['avg_price_cents']:7.2f} "
              f"{row['yes_rate'] * 100:8.2f}% {lo * 100:6.2f}-{hi * 100:5.2f}% {row['no_edge_cents']:9.2f}")


def cmd_shadow(cfg: Config, args) -> None:
    client = make_client(cfg, env="prod")  # paper trade against real prices and trades
    book, fees, calib = ShadowBook(cfg.loop.db_path), SeriesFees(client), load_calibration(cfg)
    while True:
        now = int(time.time())
        fills = book.check_fills(client, now)
        quotes = build_quotes(client, cfg, calib, book.exposure(), fees, now, log)
        book.replace_quotes(quotes, now)
        settled = book.settle(client)
        log(f"{len(quotes)} virtual quotes, {fills} new fills, {settled} markets settled")
        if args.once:
            print_quotes(quotes)
            return
        time.sleep(cfg.loop.interval_seconds)


def cmd_report(cfg: Config, args) -> None:
    print(json.dumps(ShadowBook(cfg.loop.db_path).report(), indent=2))


def cmd_live(cfg: Config, args) -> None:
    if cfg.api.env == "prod" and not args.real_money:
        sys.exit("config says env=prod: re-run with --real-money if you mean it")
    client = make_client(cfg, auth=True)
    fees, calib = SeriesFees(client), load_calibration(cfg)
    log(f"live trading on {client.env}")
    cancel_all(client, log)
    start_equity = equity_cents(client, [])
    log(f"starting equity ${start_equity / 100:.2f}")
    try:
        while True:
            now = int(time.time())
            if kill_switch_on(cfg):
                log("kill switch file present: cancelling and stopping")
                break
            resting = our_orders(client)
            equity = equity_cents(client, resting)
            if start_equity - equity > cfg.risk.max_drawdown_cents:
                log(f"drawdown limit hit (equity ${equity / 100:.2f}): cancelling and stopping")
                break
            exposure = position_exposure(client.positions())
            quotes = build_quotes(client, cfg, calib, exposure, fees, now, log)
            placed, cancelled = reconcile(client, quotes, resting, cfg, now, log)
            log(f"equity ${equity / 100:.2f}; {len(quotes)} quotes; placed {placed}, cancelled {cancelled}")
            if args.once:
                return
            time.sleep(cfg.loop.interval_seconds)
    except KeyboardInterrupt:
        log("interrupted")
    finally:
        if not args.once:
            cancel_all(client, log)


def cmd_cancel_all(cfg: Config, args) -> None:
    log(f"cancelled {cancel_all(make_client(cfg, auth=True), log)} orders")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="longshot", description=__doc__)
    parser.add_argument("--config", default="config.toml")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("scan", help="show the quotes the bot would post right now (read-only)")
    p = sub.add_parser("calibrate", help="measure the long-shot bias on settled markets")
    p.add_argument("--days", type=int, default=90)
    p.add_argument("--lead-hours", type=float, default=24)
    p = sub.add_parser("shadow", help="paper trade against the real order flow")
    p.add_argument("--once", action="store_true")
    sub.add_parser("report", help="P&L of the shadow book")
    p = sub.add_parser("live", help="post real orders (demo unless env=prod and --real-money)")
    p.add_argument("--once", action="store_true")
    p.add_argument("--real-money", action="store_true")
    sub.add_parser("cancel-all", help="cancel every resting order this bot placed")
    args = parser.parse_args(argv)
    cfg = load_config(args.config)
    {"scan": cmd_scan, "calibrate": cmd_calibrate, "shadow": cmd_shadow, "report": cmd_report,
     "live": cmd_live, "cancel-all": cmd_cancel_all}[args.cmd](cfg, args)


if __name__ == "__main__":
    main()
