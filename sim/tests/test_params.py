from pathlib import Path

import pytest

from sim.params import load_params

DEFAULT = Path(__file__).resolve().parents[2] / "specs" / "params" / "season-default.json"


def test_default_params_load():
    p = load_params(DEFAULT)
    assert p["blocks"] == 4
    assert p["shiftsPerBlock"] == 8
    assert p["fragPerToken"] == 1_000_000


def test_rejects_bad_boost(tmp_path):
    import json

    bad = json.loads(DEFAULT.read_text())
    bad["ocBoostBps"] = 20000
    f = tmp_path / "bad.json"
    f.write_text(json.dumps(bad))
    with pytest.raises(ValueError):
        load_params(f)
