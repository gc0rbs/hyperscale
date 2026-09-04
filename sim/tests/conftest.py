from pathlib import Path

import pytest

from sim.mine import ContractParams
from sim.params import load_params

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = ROOT / "specs" / "params" / "season-default.json"


@pytest.fixture(scope="session")
def default_json() -> dict:
    return load_params(DEFAULT)


@pytest.fixture
def default_cp(default_json) -> ContractParams:
    return ContractParams.from_json(default_json, open_time=1_000_000)
