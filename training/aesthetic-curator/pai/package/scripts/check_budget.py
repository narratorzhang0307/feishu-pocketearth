#!/usr/bin/env python3
"""Fail closed if a planned PAI job can exceed its declared CNY cap."""

from __future__ import annotations

import argparse
import json
from decimal import Decimal
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", type=Path, required=True)
    args = parser.parse_args()
    contract = json.loads(args.contract.read_text(encoding="utf-8"))
    price = Decimal(str(contract["pricePerMinuteCny"]))
    minutes = Decimal(str(contract["jobMaxMinutes"]))
    nodes = Decimal(str(contract["nodes"]))
    cap = Decimal(str(contract["absoluteCostCapCny"]))
    estimated = price * minutes * nodes
    declared = Decimal(str(contract["estimatedMaximumCostCny"]))
    inner = Decimal(str(contract["innerTimeoutMinutes"]))
    allowed = (
        price > 0
        and minutes > 0
        and nodes == 1
        and inner < minutes
        and estimated == declared
        and estimated <= cap
    )
    report = {
        "allowed": allowed,
        "pricePerMinuteCny": float(price),
        "jobMaxMinutes": int(minutes),
        "innerTimeoutMinutes": int(inner),
        "nodes": int(nodes),
        "estimatedMaximumCostCny": float(estimated),
        "absoluteCostCapCny": float(cap),
        "breakEvenPricePerMinuteCny": float(cap / (minutes * nodes)),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if allowed else 2


if __name__ == "__main__":
    raise SystemExit(main())
