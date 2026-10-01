"""Kalshi trading fees.

Kalshi's general schedule charges round_up(rate * C * P * (1 - P)) dollars per
order, where C is contracts and P the price in dollars. The taker rate is 0.07.
Series with fee_type 'quadratic_with_maker_fees' also charge resting (maker)
orders at 0.0175; plain 'quadratic' series charge makers nothing. A series'
fee_multiplier scales the rate. Check https://kalshi.com/docs/kalshi-fee-schedule.pdf
before trusting these numbers with money: the schedule changes.
"""
from __future__ import annotations

import math

TAKER_RATE = 0.07
MAKER_RATE = 0.0175


def maker_rate(fee_type: str | None, fee_multiplier: float | None = 1.0) -> float:
    mult = 1.0 if fee_multiplier is None else float(fee_multiplier)
    if fee_type == "quadratic":
        return 0.0
    if fee_type == "quadratic_with_maker_fees":
        return MAKER_RATE * mult
    # Unknown or 'flat' schedules: assume the worse taker rate rather than zero.
    return TAKER_RATE * mult


def fee_per_contract_cents(price_cents: float, rate: float) -> float:
    """Unrounded fee per contract, used for edge maths."""
    p = price_cents / 100
    return rate * p * (1 - p) * 100


def order_fee_cents(price_cents: float, contracts: int, rate: float) -> int:
    """Fee actually charged for one fill, rounded up to the cent."""
    p = price_cents / 100
    return math.ceil(round(rate * contracts * p * (1 - p) * 100, 6))
