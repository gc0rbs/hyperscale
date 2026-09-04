"""Differential oracle: replay traces produced by the Solidity fuzz harness and diff the outcomes.

Usage::

    python -m sim.diff contracts/diff/traces.jsonl [--params specs/params/season-default.json]
                       [--max-report 20] [--quiet]

Each line is one fuzz run written by ``contracts/test/differential/DiffTrace.t.sol``::

    {"season": 3, "openTime": ..., "maxDurationSeconds": ..., "lpWeightPerToken": "...",
     "difficulty": [whole hash-seconds x4],
     "actions": [{"i", "t", "action", "args", "ok", "revert"?, "shift"?, result fields...}],
     "final": {"t", "shift", "closeX", "totalHash", "workInShift", "minted", "shiftEndX", "rigs": [...]}}

The reference replays the same actions at the same timestamps and must agree on: every action's
ok/revert name, its result (rig id, burned cost, fragments, returned/fee), the global shift after each
successful action, and the final state: shift, closeX, totalHash, workInShift, shift boundaries,
minted per block, and per rig: pending + claimed fragments per block, inactive flag, tiers, and (for
active rigs) heat, active overclocks and live hash. Exit code 1 on any mismatch.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .mine import LP, RIG, ContractParams, Mine, MineError
from .params import load_params

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PARAMS = ROOT / "specs" / "params" / "season-default.json"


def _play(line: dict, data: dict) -> tuple[Mine, list[dict]]:
    cp = ContractParams.from_json(
        data,
        open_time=int(line["openTime"]),
        lp_weight_per_token=int(line["lpWeightPerToken"]),
        difficulty=[int(d) for d in line["difficulty"]],
        max_duration=int(line["maxDurationSeconds"]),
    )
    mine = Mine(cp)
    out: list[dict] = []
    for a in line["actions"]:
        now_x = Mine.sec(int(a["t"]))
        args = a.get("args", {})
        owner = args.get("owner")
        rig = args.get("rig")
        res: dict = {}
        try:
            name = a["action"]
            if name == "poke":
                mine.poke(now_x)
            elif name == "activate":
                asset = RIG if args["asset"] == "RIG" else LP
                res["rig"] = mine.activate(now_x, owner, asset, int(args["amount"]))
            elif name == "upgradeGpu":
                res["burned"] = mine.upgrade_gpu(now_x, rig, owner)
            elif name == "upgradeCooling":
                res["burned"] = mine.upgrade_cooling(now_x, rig, owner)
            elif name == "overclock":
                res["burned"] = mine.overclock(now_x, rig, owner)
            elif name == "claim":
                res["fragments"] = mine.claim(now_x, rig, int(args["block"]), owner)
            elif name == "claimAll":
                res["fragments"] = mine.claim_all(now_x, rig, owner)
            elif name == "exit":
                returned, fee = mine.exit(now_x, rig, owner)
                res.update(returned=returned, fee=fee)
            elif name == "withdraw":
                res["returned"] = mine.withdraw(now_x, rig, owner)
            else:
                raise ValueError(f"unknown action {name}")
            res["ok"] = True
            res["shift"] = mine.shift
        except MineError as e:
            res["ok"] = False
            res["revert"] = type(e).__name__
        out.append(res)
    # the harness ends every trace with a poke at final.t
    mine.poke(Mine.sec(int(line["final"]["t"])))
    return mine, out


def _diff_actions(expected: list[dict], got: list[dict]) -> list[str]:
    errs = []
    for a, g in zip(expected, got, strict=True):
        i = a["i"]
        if a["ok"] != g["ok"]:
            errs.append(f"#{i} {a['action']}: contract ok={a['ok']} ref ok={g['ok']} ({a.get('revert')}/{g.get('revert')})")
            continue
        if not a["ok"]:
            if a["revert"] != g["revert"]:
                errs.append(f"#{i} {a['action']}: revert {a['revert']} vs ref {g['revert']}")
            continue
        if a["shift"] != g["shift"]:
            errs.append(f"#{i} {a['action']}: shift {a['shift']} vs ref {g['shift']}")
        for k in ("rig", "burned", "fragments", "returned", "fee"):
            if k in a:
                ev, gv = a[k], g.get(k)
                if isinstance(ev, list):
                    ev, gv = [int(x) for x in ev], [int(x) for x in gv]
                else:
                    ev, gv = int(ev), int(gv)
                if ev != gv:
                    errs.append(f"#{i} {a['action']}: {k} {ev} vs ref {gv}")
    return errs


def _diff_final(final: dict, mine: Mine) -> list[str]:
    errs = []

    def chk(name, ev, gv):
        if ev != gv:
            errs.append(f"final {name}: contract {ev} vs ref {gv}")

    chk("shift", int(final["shift"]), mine.shift)
    chk("closeX", int(final["closeX"]), mine.close_x)
    chk("totalHash", int(final["totalHash"]), mine.total_hash)
    chk("workInShift", int(final["workInShift"]), mine.work_in_shift)
    chk("minted", [int(x) for x in final["minted"]], mine.minted)
    ends = [int(x) for x in final["shiftEndX"]]
    chk("shiftEndX", ends, [mine.shift_end_x[k] for k in range(len(ends))])
    chk("rigCount", len(final["rigs"]), len(mine.rigs))
    for i, r in enumerate(final["rigs"]):
        if i >= len(mine.rigs):
            break
        ref = mine.rigs[i]
        pend = [mine.pending(i, b) for b in range(4)]
        chk(f"rig{i}.owner", r["owner"], ref.owner)
        chk(f"rig{i}.inactive", r["inactive"], ref.inactive)
        chk(f"rig{i}.gpuTier", r["gpuTier"], ref.gpu_tier)
        chk(f"rig{i}.coolingTier", r["coolingTier"], ref.cooling_tier)
        chk(f"rig{i}.pending", [int(x) for x in r["pending"]], pend)
        chk(f"rig{i}.claimed", [int(x) for x in r["claimed"]], ref.claimed)
        if not ref.inactive:
            # the harness ends with a claimAll per rig, so stored heat/activeOc are settled to now
            chk(f"rig{i}.heat", r["heat"], ref.heat)
            chk(f"rig{i}.activeOc", r["activeOc"], ref.active_oc)
            chk(f"rig{i}.rigHash", int(r["rigHash"]), mine.rig_hash(i))
    return errs


def run(path: Path, params_path: Path, max_report: int = 20, quiet: bool = False) -> int:
    data = load_params(params_path)
    n = bad = 0
    per_season: dict[int, int] = {}
    reverts: dict[str, int] = {}
    with path.open() as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            line = json.loads(raw)
            n += 1
            per_season[line["season"]] = per_season.get(line["season"], 0) + 1
            for a in line["actions"]:
                if not a["ok"]:
                    reverts[a["revert"]] = reverts.get(a["revert"], 0) + 1
            mine, got = _play(line, data)
            errs = _diff_actions(line["actions"], got) + _diff_final(line["final"], mine)
            if errs:
                bad += 1
                if bad <= max_report:
                    print(f"MISMATCH in trace {n} (season {line['season']}, {len(line['actions'])} actions):")
                    for e in errs[:10]:
                        print("   ", e)
    if not quiet:
        print(f"traces: {n}  mismatches: {bad}")
        print("per season:", dict(sorted(per_season.items())))
        print("reverts seen:", dict(sorted(reverts.items(), key=lambda kv: -kv[1])))
    return 1 if bad else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m sim.diff", description=__doc__.split("\n")[0])
    ap.add_argument("traces", help="JSONL written by DiffTrace.t.sol")
    ap.add_argument("--params", default=str(DEFAULT_PARAMS))
    ap.add_argument("--max-report", type=int, default=20)
    ap.add_argument("--quiet", action="store_true")
    ns = ap.parse_args(argv)
    return run(Path(ns.traces), Path(ns.params), ns.max_report, ns.quiet)


if __name__ == "__main__":
    raise SystemExit(main())
