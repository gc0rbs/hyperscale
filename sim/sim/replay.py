"""Differential-testing oracle: replay a JSON action trace through the reference mine.

Usage: ``python -m sim.replay trace.json [--params specs/params/season-default.json] [--json]``

Trace format (times in whole seconds unless ``tX`` is given in X-time = seconds × 1e18)::

    {
      "params": "../specs/params/season-default.json",   # optional, overrides --params
      "openTime": 1000,                                   # optional (default 0)
      "difficulty": [172800000000, ...],                  # optional, whole hash-seconds
      "lpWeightPerToken": "1250000000000000000",           # optional wei; default lpBonusBps/1e4
      "actions": [
        {"t": 0,    "action": "activate",     "args": {"owner": "ann", "asset": "RIG", "amount": "5000000000000000000000000"}},
        {"t": 0,    "action": "upgradeGpu",   "args": {"rig": 0}},
        {"t": 0,    "action": "upgradeCooling","args": {"rig": 0}},
        {"t": 1200, "action": "overclock",    "args": {"rig": 0}},
        {"t": 9000, "action": "claim",        "args": {"rig": 0, "block": 0}},
        {"t": 9000, "action": "claimAll",     "args": {"rig": 0}},
        {"t": 9000, "action": "exit",         "args": {"rig": 0}},
        {"t": 99999,"action": "withdraw",     "args": {"rig": 0}},
        {"t": 5000, "action": "poke"}
      ]
    }

Rig ids are 0-based in activation order, matching `SeasonMine` (`rigId = _rigs.length`).
``amount`` is in wei (string or int); ``asset`` is "RIG" or "LP". An action that would revert is
reported with the contract error name and does not change state, mirroring a reverted transaction.
Output: per-rig earned + claimed fragments per block, minted totals, shift boundary X-times, closeX.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .mine import LP, RIG, WAD, ContractParams, Mine, MineError
from .params import load_params

ACTIONS = {
    "activate",
    "upgradeGpu",
    "upgradeCooling",
    "overclock",
    "claim",
    "claimAll",
    "exit",
    "withdraw",
    "poke",
}


def _time_x(a: dict) -> int:
    if "tX" in a:
        return int(a["tX"])
    return Mine.sec(a["t"])


def run_trace(trace: dict, params_path: str | Path | None = None) -> dict:
    ppath = trace.get("params") or params_path
    if ppath is None:
        raise ValueError("trace needs a 'params' path or --params")
    data = load_params(ppath)
    lpw = trace.get("lpWeightPerToken")
    cp = ContractParams.from_json(
        data,
        open_time=int(trace.get("openTime", 0)),
        lp_weight_per_token=int(lpw) if lpw is not None else None,
        difficulty=[int(d) for d in trace["difficulty"]] if "difficulty" in trace else None,
        max_duration=int(trace["maxDurationSeconds"]) if "maxDurationSeconds" in trace else None,
    )
    mine = Mine(cp)
    labels: dict[str, int] = {}
    results = []
    for i, a in enumerate(trace["actions"]):
        name = a["action"]
        if name not in ACTIONS:
            raise ValueError(f"unknown action {name!r} at index {i}")
        args = a.get("args", {})
        now_x = _time_x(a)
        rig_ref = args.get("rig")
        rig_id = labels[rig_ref] if isinstance(rig_ref, str) else rig_ref
        owner = args.get("owner")
        res: dict = {"i": i, "action": name, "t": a.get("t", a.get("tX"))}
        try:
            if name == "poke":
                mine.poke(now_x)
            elif name == "activate":
                asset = {"RIG": RIG, "LP": LP, 0: RIG, 1: LP}[args.get("asset", "RIG")]
                rid = mine.activate(now_x, owner or "anon", asset, int(args["amount"]))
                if "label" in args:
                    labels[args["label"]] = rid
                res["rig"] = rid
            elif name == "upgradeGpu":
                res["burned"] = mine.upgrade_gpu(now_x, rig_id, owner)
            elif name == "upgradeCooling":
                res["burned"] = mine.upgrade_cooling(now_x, rig_id, owner)
            elif name == "overclock":
                res["burned"] = mine.overclock(now_x, rig_id, owner)
            elif name == "claim":
                res["fragments"] = mine.claim(now_x, rig_id, int(args["block"]), owner)
            elif name == "claimAll":
                res["fragments"] = mine.claim_all(now_x, rig_id, owner)
            elif name == "exit":
                returned, fee = mine.exit(now_x, rig_id, owner)
                res.update(returned=returned, fee=fee)
            elif name == "withdraw":
                res["returned"] = mine.withdraw(now_x, rig_id, owner)
            res["ok"] = True
        except MineError as e:
            res["ok"] = False
            res["revert"] = type(e).__name__
        res["shift"] = mine.shift
        results.append(res)
    return summarize(mine, results)


def summarize(mine: Mine, results: list[dict] | None = None) -> dict:
    p = mine.p
    rigs = []
    for i, r in enumerate(mine.rigs):
        v = mine.rig_view(i)
        rigs.append(
            {
                "rig": i,
                "owner": r.owner,
                "asset": "LP" if r.asset == LP else "RIG",
                "weight": str(r.weight),
                "gpuTier": r.gpu_tier,
                "coolingTier": r.cooling_tier,
                "heat": v.heat,
                "activeOc": v.active_oc,
                "inactive": r.inactive,
                "earnedWei": [str(x) for x in v.earned],
                "earnedFragments": [x // WAD for x in v.earned],
                "claimedFragments": list(r.claimed),
                "totalFragments": [x // WAD + c for x, c in zip(v.earned, r.claimed, strict=True)],
                "burned": str(r.burned),
            }
        )
    return {
        "shift": mine.shift,
        "closeX": str(mine.close_x),
        "failSafe": mine.fail_safe,
        "durationSeconds": float(mine.duration_seconds()) if mine.close_x else None,
        "totalHash": str(mine.total_hash),
        "workInShift": str(mine.work_in_shift),
        "shiftEndX": {str(k): str(v) for k, v in sorted(mine.shift_end_x.items())},
        "ratePerWork": [str(x) for x in mine.rate_per_work],
        "mintedFragments": list(mine.minted),
        "supply": [p.supply(b) for b in range(p.blocks)],
        "burned": str(mine.burned),
        "treasuryRig": str(mine.treasury[RIG]),
        "rigs": rigs,
        "actions": results or [],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m sim.replay", description=__doc__.split("\n")[0])
    ap.add_argument("trace", help="JSON action trace")
    ap.add_argument("--params", help="season params JSON (if the trace does not name one)")
    ap.add_argument("--json", action="store_true", help="print the full JSON summary")
    ns = ap.parse_args(argv)
    trace = json.loads(Path(ns.trace).read_text())
    out = run_trace(trace, ns.params)
    if ns.json:
        print(json.dumps(out, indent=2))
        return 0
    syms = load_params(trace.get("params") or ns.params)["stocks"]
    print(f"shift={out['shift']} closeX={out['closeX']} failSafe={out['failSafe']}")
    if out["durationSeconds"] is not None:
        print(f"duration={out['durationSeconds']:.3f}s")
    print("shift boundaries (X-time):")
    for k, v in out["shiftEndX"].items():
        print(f"  shift {k:>2}: {v}")
    print("rigs (fragments per block = earned + claimed):")
    for r in out["rigs"]:
        frag = " ".join(f"{s['symbol']}={f}" for s, f in zip(syms, r["totalFragments"], strict=True))
        print(
            f"  rig {r['rig']} {r['owner']:<8} gpu={r['gpuTier']} cool={r['coolingTier']}"
            f" burned={int(r['burned']) / WAD:,.0f} {frag}"
        )
    print("minted:", out["mintedFragments"], "supply:", out["supply"])
    reverted = [a for a in out["actions"] if not a["ok"]]
    if reverted:
        print(f"{len(reverted)} action(s) reverted:")
        for a in reverted:
            print(f"  #{a['i']} {a['action']} at t={a['t']}: {a['revert']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
