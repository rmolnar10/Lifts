from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field, fields


@dataclass
class ApiConfig:
    env: str = "demo"
    key_id: str = ""
    private_key_path: str = ""


@dataclass
class UniverseConfig:
    min_yes_cents: int = 3
    max_yes_cents: int = 20
    min_hours_to_close: float = 6
    max_days_to_close: float = 30
    min_volume_24h: int = 200
    max_spread_cents: int = 6
    exclude_categories: list[str] = field(default_factory=list)
    max_markets: int = 15
    max_pages: int = 30
    include_incentive_markets: bool = True


@dataclass
class ModelConfig:
    calibration_file: str = "calibration.json"
    # Without enough calibration data for a price bucket the bot skips the
    # market. Set quote_uncalibrated to trade there anyway, valuing YES at
    # market price * fallback_longshot_ratio (1.0 = pure spread capture).
    quote_uncalibrated: bool = False
    fallback_longshot_ratio: float = 1.0
    min_edge_cents: float = 2.0
    min_bucket_samples: int = 100


@dataclass
class SizingConfig:
    contracts_per_quote: int = 10
    max_cost_per_market_cents: int = 1_000
    max_cost_per_event_cents: int = 2_000
    max_total_cost_cents: int = 10_000


@dataclass
class RiskConfig:
    max_drawdown_cents: int = 2_500
    kill_switch_file: str = "STOP"
    order_ttl_seconds: int = 600


@dataclass
class LoopConfig:
    interval_seconds: int = 60
    db_path: str = "longshot.db"


@dataclass
class Config:
    api: ApiConfig = field(default_factory=ApiConfig)
    universe: UniverseConfig = field(default_factory=UniverseConfig)
    model: ModelConfig = field(default_factory=ModelConfig)
    sizing: SizingConfig = field(default_factory=SizingConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    loop: LoopConfig = field(default_factory=LoopConfig)


def _build(cls, data: dict):
    known = {f.name for f in fields(cls)}
    unknown = set(data) - known
    if unknown:
        raise ValueError(f"unknown {cls.__name__} keys: {sorted(unknown)}")
    return cls(**data)


def load_config(path: str | None) -> Config:
    raw: dict = {}
    if path and os.path.exists(path):
        with open(path, "rb") as f:
            raw = tomllib.load(f)
    cfg = Config(**{f.name: _build(f.default_factory().__class__, raw.get(f.name, {}))
                    for f in fields(Config)})
    cfg.api.key_id = os.environ.get("KALSHI_KEY_ID", cfg.api.key_id)
    cfg.api.private_key_path = os.environ.get("KALSHI_PRIVATE_KEY_PATH", cfg.api.private_key_path)
    return cfg
