import json
from pathlib import Path

from sim.replay import main, run_trace

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = str(ROOT / "specs" / "params" / "season-default.json")


def trace():
    w = 10**18
    return {
        "params": DEFAULT,
        "openTime": 100,
        "difficulty": [172_800_000_000, 216_000_000_000, 216_000_000_000, 259_200_000_000],  # 24h sizing
        "actions": [
            {"t": 0, "action": "activate", "args": {"owner": "ann", "asset": "RIG", "amount": str(5_000_000 * w), "label": "ann"}},
            {"t": 0, "action": "upgradeGpu", "args": {"rig": "ann"}},
            {"t": 0, "action": "upgradeGpu", "args": {"rig": "ann"}},
            {"t": 0, "action": "activate", "args": {"owner": "bo", "asset": "LP", "amount": str(2_000_000 * w)}},
            {"t": 0, "action": "upgradeGpu", "args": {"rig": 1}},
            {"t": 0, "action": "upgradeGpu", "args": {"rig": 1}},
            {"t": 0, "action": "upgradeGpu", "args": {"rig": 1}},
            {"t": 0, "action": "upgradeCooling", "args": {"rig": 1}},
            {"t": 0, "action": "upgradeCooling", "args": {"rig": 1}},
            {"t": 0, "action": "upgradeCooling", "args": {"rig": 1}},
            {"t": 0, "action": "overclock", "args": {"rig": 1}},  # PreOpen → WrongPhase
            {"t": 0, "action": "activate", "args": {"owner": "cy", "asset": "RIG", "amount": str(2_500_000 * w)}},
            {"t": 100, "action": "overclock", "args": {"rig": 1}},
            {"t": 100, "action": "overclock", "args": {"rig": 1}},
            {"t": 100, "action": "overclock", "args": {"rig": 1}},
            {"t": 100, "action": "overclock", "args": {"rig": 1}},  # 4th → MaxOverclocks
            {"t": 5000, "action": "claim", "args": {"rig": 0, "block": 0}},  # not found yet
            {"t": 20000, "action": "poke"},
            {"t": 20000, "action": "claimAll", "args": {"rig": 0}},
            {"t": 20000, "action": "exit", "args": {"rig": 2}},
            {"t": 400000, "action": "poke"},
            {"t": 400000, "action": "withdraw", "args": {"rig": 0}},
        ],
    }


def test_run_trace_reports_reverts_and_balances():
    out = run_trace(trace())
    acts = out["actions"]
    assert acts[10]["revert"] == "WrongPhase"
    assert acts[15]["revert"] == "MaxOverclocks"
    assert acts[16]["revert"] == "NotFound"
    assert acts[18]["ok"] and acts[18]["fragments"][0] > 1_700_000
    assert out["rigs"][2]["inactive"] and out["rigs"][0]["inactive"]
    assert "0" in out["shiftEndX"] and "7" in out["shiftEndX"]
    assert out["mintedFragments"][0] == out["rigs"][0]["claimedFragments"][0]


def test_cli_prints(tmp_path, capsys):
    f = tmp_path / "trace.json"
    f.write_text(json.dumps(trace()))
    assert main([str(f)]) == 0
    text = capsys.readouterr().out
    assert "shift boundaries" in text and "NVDA=" in text and "reverted" in text
    assert main([str(f), "--json"]) == 0
    json.loads(capsys.readouterr().out)
