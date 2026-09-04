"""Load a season parameter file (specs/params/*.json) into a plain dict with validation."""

from __future__ import annotations

import json
from pathlib import Path

REQUIRED = [
    "blocks", "shiftsPerBlock", "fragPerToken", "gpuMultBps", "gpuCostBps", "coolCostBps",
    "heatPerOc", "coolPerShift", "heatMax", "ocCostBps", "ocBoostBps", "maxActiveOc",
]


def load_params(path: str | Path) -> dict:
    data = json.loads(Path(path).read_text())
    missing = [k for k in REQUIRED if k not in data]
    if missing:
        raise ValueError(f"params missing keys: {missing}")
    if data["blocks"] != 4:
        raise ValueError("v1 seasons have exactly 4 blocks")
    if len(data["gpuMultBps"]) != 6 or data["gpuMultBps"][0] != 10000:
        raise ValueError("gpuMultBps must have 6 entries starting at 10000")
    if data["ocBoostBps"] * data["maxActiveOc"] > 30000:
        raise ValueError("ocBoostBps * maxActiveOc must be <= 30000")
    return data
