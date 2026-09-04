"""Scenario runner: N strategy agents play one season through the reference mine.

    python -m sim.run --params ../specs/params/season-default.json [--players N --seed S
        --rig-price P --pool-usd V --runs R --mix passive=0.3,gpu_maxer=0.15,...]

Outputs season duration, total and median burn as % of stake, reward Gini, ROI per strategy in
RIG terms, exit rate and a dominant-strategy check; with ``--runs`` > 1 it Monte-Carlos over
player mixes (Dirichlet-perturbed) and stakes and reports distributions.

Time is driven by *progress* (`advance_to_progress`), so a season is simulated in the same number
of steps whatever its wall-clock length; duration is read off the shift boundaries afterwards.
"""

from __future__ import annotations

import argparse
import json
import statistics
import time
from dataclasses import asdict, dataclass, field
from fractions import Fraction

import numpy as np

from .agents import STRATEGIES, Agent
from .mine import LP, WAD, ContractParams, Mine, MineIdle, advance_to_progress
from .params import load_params
from .value import Market

DEFAULT_MIX = {
    "passive": 0.30,
    "gpu_maxer": 0.15,
    "cooling_oc": 0.10,
    "finale_oc": 0.15,
    "lp_staker": 0.10,
    "early_exiter": 0.08,
    "latecomer": 0.10,
    "whale": 0.02,
}


@dataclass
class Scenario:
    params_path: str
    players: int = 1000
    seed: int = 0
    rig_price: float = 0.05  # USD per RIG (true price, used for ex-post ROI)
    pool_usd: float = 150_000.0  # total prize pool value at funding
    mix: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_MIX))
    stake_median: float = 3_000.0  # RIG, lognormal
    stake_sigma: float = 1.2
    whale_mult: tuple[float, float] = (10.0, 50.0)
    belief_sigma: float = 0.25  # lognormal spread of players' RIG price beliefs
    hurdle: float = 1.0
    expected_mult: float = 1.4
    mix_concentration: float = 40.0  # Dirichlet α total for Monte-Carlo mix perturbation (0 = fixed)
    open_time: int = 1_000
    difficulty_scale: float = 1.0  # multiply the JSON difficulty (sizing experiments)


def make_agents(sc: Scenario, rng: np.random.Generator, mix: dict[str, float]) -> list[Agent]:
    names = list(mix)
    probs = np.array([mix[n] for n in names], dtype=float)
    probs /= probs.sum()
    strategies = rng.choice(names, size=sc.players, p=probs)
    stakes = np.exp(np.log(sc.stake_median) + sc.stake_sigma * rng.standard_normal(sc.players))
    stakes = np.maximum(stakes, 100.0)
    beliefs = sc.rig_price * np.exp(sc.belief_sigma * rng.standard_normal(sc.players))
    agents: list[Agent] = []
    for i in range(sc.players):
        s = str(strategies[i])
        stake = float(stakes[i])
        if s == "whale":
            stake *= rng.uniform(*sc.whale_mult)
        a = Agent(
            name=f"p{i}",
            strategy=s,
            stake=int(stake * WAD),
            belief_price=float(beliefs[i]),
            expected_mult=sc.expected_mult,
            hurdle=sc.hurdle,
        )
        if s == "lp_staker":
            a.asset = LP
        elif s == "latecomer":
            a.join_shift = int(rng.integers(4, 25))
        elif s == "early_exiter":
            a.exit_shift = int(rng.integers(2, 21))
        agents.append(a)
    return agents


def gini(x: np.ndarray) -> float:
    x = np.sort(np.asarray(x, dtype=float))
    if x.size == 0 or x.sum() <= 0:
        return 0.0
    n = x.size
    return float((2 * np.arange(1, n + 1) - n - 1).dot(x) / (n * x.sum()))


def simulate_season(sc: Scenario, seed: int, mix: dict[str, float] | None = None) -> dict:
    rng = np.random.default_rng(seed)
    data = load_params(sc.params_path)
    diff = None
    if sc.difficulty_scale != 1.0:
        diff = [int(int(s["difficulty"]) * sc.difficulty_scale) for s in data["stocks"]]
    cp = ContractParams.from_json(data, open_time=sc.open_time, difficulty=diff)
    market = Market.from_json(data, sc.rig_price, sc.pool_usd)
    mix = mix or sc.mix
    agents = make_agents(sc, rng, mix)
    mine = Mine(cp)

    t0 = Mine.sec(sc.open_time - 600)
    order = rng.permutation(len(agents))
    for i in order:
        a = agents[i]
        if a.strategy != "latecomer":
            a.activate(mine, t0)
    for i in order:
        a = agents[i]
        if a.rig_id is not None:
            a.pre_open(mine, market, t0)
    pre_open_hash = mine.total_hash

    ticks = [(k, f) for k in range(cp.total_shifts) for f in (Fraction(0), Fraction(1, 2))]
    for shift, frac in ticks:
        try:
            advance_to_progress(mine, shift, frac)
        except MineIdle:
            mine.poke(cp.deadline_x)  # nobody mining: only the fail-safe can end it
        if mine.close_x:
            break
        now_x = mine.now_x
        for i in rng.permutation(len(agents)):
            agents[i].on_tick(mine, market, now_x, shift, frac)
    if not mine.close_x:
        try:
            advance_to_progress(mine, cp.total_shifts, 0)
        except MineIdle:
            mine.poke(cp.deadline_x)
    end_x = mine.now_x
    for a in agents:
        a.finish(mine, end_x)

    outcomes = [a.outcome(mine, market) for a in agents]
    played = [o for o in outcomes if o["played"]]
    weights = np.array([o["weight"] for o in played])
    burned = np.array([o["burned"] for o in played])
    reward = np.array([o["reward_usd"] for o in played])
    roi = np.array([o["roi"] for o in played])
    duration = float(mine.duration_seconds()) if mine.close_x else None
    total_weight = float(weights.sum())
    realized_hash = cp.difficulty_total() / WAD / duration if duration else None

    per_strategy: dict[str, dict] = {}
    for s in STRATEGIES:
        rows = [o for o in played if o["strategy"] == s]
        if not rows:
            continue
        r = np.array([o["roi"] for o in rows])
        per_strategy[s] = {
            "n": len(rows),
            "roi_mean": float(r.mean()),
            "roi_median": float(np.median(r)),
            "roi_p10": float(np.percentile(r, 10)),
            "roi_p90": float(np.percentile(r, 90)),
            "burn_pct_mean": float(np.mean([o["burn_pct"] for o in rows])),
            "gpu_mean": float(np.mean([o["gpu"] for o in rows])),
            "cooling_mean": float(np.mean([o["cooling"] for o in rows])),
            "weight_share": float(sum(o["weight"] for o in rows) / total_weight),
            "reward_share": float(sum(o["reward_usd"] for o in rows) / max(reward.sum(), 1e-9)),
        }
    ranked = sorted(per_strategy.items(), key=lambda kv: kv[1]["roi_median"], reverse=True)
    pool_rig = market.pool_rig()
    return {
        "seed": seed,
        "players": len(agents),
        "mix": mix,
        "duration_s": duration,
        "duration_h": duration / 3600 if duration else None,
        "planned_h": (
            float(data["sizing"]["plannedSeconds"]) / 3600 * sc.difficulty_scale
            if "sizing" in data
            else None
        ),
        "fail_safe": mine.fail_safe,
        "shifts_completed": mine.shift,
        "total_weight_rig": total_weight,
        "pre_open_hash_rig": pre_open_hash / WAD,
        "realized_avg_hash_rig": realized_hash,
        "realized_avg_mult": realized_hash / total_weight if realized_hash else None,
        "pool_usd": sc.pool_usd,
        "pool_rig": pool_rig,
        "pool_ratio": pool_rig / (realized_hash or pre_open_hash / WAD),
        "pool_over_tvl": pool_rig / total_weight,
        "burn_total_rig": float(burned.sum()),
        "burn_pct_total": float(burned.sum() / total_weight),
        "burn_pct_median": float(np.median(burned / weights)),
        "burn_pct_p90": float(np.percentile(burned / weights, 90)),
        "burn_usd": float(burned.sum() * sc.rig_price),
        "fees_rig": float(mine.treasury[0] / WAD),
        "minted": list(mine.minted),
        "supply": [cp.supply(b) for b in range(cp.blocks)],
        "unminted_pct": 1 - sum(mine.minted) / sum(cp.supply(b) for b in range(cp.blocks)),
        "gini_reward_usd": gini(reward),
        "gini_reward_per_weight": gini(reward / weights),
        "gini_weight": gini(weights),
        "exit_rate": float(np.mean([o["exited"] for o in played])),
        "roi_all_mean": float(roi.mean()),
        "roi_all_median": float(np.median(roi)),
        "share_players_negative_roi": float(np.mean(roi < 0)),
        "per_strategy": per_strategy,
        "best_strategy": ranked[0][0] if ranked else None,
        "best_gap": (ranked[0][1]["roi_median"] - ranked[1][1]["roi_median"]) if len(ranked) > 1
        else 0.0,
        "block_end_h": [
            (mine.block_end_x(b) - cp.open_x) / WAD / 3600 if mine.block_found(b) else None
            for b in range(cp.blocks)
        ],
    }


def monte_carlo(sc: Scenario, runs: int) -> dict:
    rng = np.random.default_rng(sc.seed)
    names = list(sc.mix)
    base = np.array([sc.mix[n] for n in names], dtype=float)
    base /= base.sum()
    results = []
    for i in range(runs):
        if runs > 1 and sc.mix_concentration > 0:
            w = rng.dirichlet(base * sc.mix_concentration)
            mix = {n: float(x) for n, x in zip(names, w, strict=True)}
        else:
            mix = dict(sc.mix)
        results.append(simulate_season(sc, sc.seed + i, mix))
    return aggregate(results)


def _pct(xs: list[float], q: float) -> float:
    return float(np.percentile(np.array(xs, dtype=float), q))


def aggregate(results: list[dict]) -> dict:
    durations = [r["duration_h"] for r in results if r["duration_h"] is not None]
    wins: dict[str, int] = {}
    for r in results:
        if r["best_strategy"]:
            wins[r["best_strategy"]] = wins.get(r["best_strategy"], 0) + 1
    per: dict[str, dict] = {}
    for s in STRATEGIES:
        rows = [r["per_strategy"][s] for r in results if s in r["per_strategy"]]
        if rows:
            per[s] = {
                "runs": len(rows),
                "roi_median_mean": statistics.fmean(x["roi_median"] for x in rows),
                "roi_median_min": min(x["roi_median"] for x in rows),
                "roi_median_max": max(x["roi_median"] for x in rows),
                "roi_mean_mean": statistics.fmean(x["roi_mean"] for x in rows),
                "burn_pct_mean": statistics.fmean(x["burn_pct_mean"] for x in rows),
                "gpu_mean": statistics.fmean(x["gpu_mean"] for x in rows),
                "cooling_mean": statistics.fmean(x["cooling_mean"] for x in rows),
                "wins": wins.get(s, 0),
            }
    top = max(wins.items(), key=lambda kv: kv[1]) if wins else (None, 0)
    dominant = top[0] if top[1] >= 0.8 * len(results) and len(results) >= 3 else None
    return {
        "runs": len(results),
        "fail_safe_rate": statistics.fmean(r["fail_safe"] for r in results),
        "duration_h": {
            "p5": _pct(durations, 5),
            "p50": _pct(durations, 50),
            "p95": _pct(durations, 95),
        }
        if durations
        else None,
        "planned_h": results[0]["planned_h"],
        "realized_avg_mult": statistics.fmean(
            r["realized_avg_mult"] for r in results if r["realized_avg_mult"]
        )
        if durations
        else None,
        "pool_ratio_median": statistics.median(r["pool_ratio"] for r in results),
        "pool_over_tvl_median": statistics.median(r["pool_over_tvl"] for r in results),
        "burn_pct_total": {
            "p5": _pct([r["burn_pct_total"] for r in results], 5),
            "p50": _pct([r["burn_pct_total"] for r in results], 50),
            "p95": _pct([r["burn_pct_total"] for r in results], 95),
        },
        "burn_pct_median": {
            "p5": _pct([r["burn_pct_median"] for r in results], 5),
            "p50": _pct([r["burn_pct_median"] for r in results], 50),
            "p95": _pct([r["burn_pct_median"] for r in results], 95),
        },
        "gini_reward_usd": statistics.fmean(r["gini_reward_usd"] for r in results),
        "gini_reward_per_weight": statistics.fmean(r["gini_reward_per_weight"] for r in results),
        "gini_weight": statistics.fmean(r["gini_weight"] for r in results),
        "exit_rate": statistics.fmean(r["exit_rate"] for r in results),
        "unminted_pct": statistics.fmean(r["unminted_pct"] for r in results),
        "roi_all_median": statistics.fmean(r["roi_all_median"] for r in results),
        "share_players_negative_roi": statistics.fmean(
            r["share_players_negative_roi"] for r in results
        ),
        "per_strategy": per,
        "wins": wins,
        "dominant_strategy": dominant,
        "results": results,
    }


def format_report(agg: dict) -> str:
    L = []
    r0 = agg["results"][0]
    L.append(
        f"runs={agg['runs']} players={r0['players']} pool=${r0['pool_usd']:,.0f}"
        f" (={r0['pool_rig']:,.0f} RIG) TVL≈{r0['total_weight_rig']:,.0f} RIG"
        f" pool/TVL={agg['pool_over_tvl_median']:.2f} pool-ratio ρ={agg['pool_ratio_median']:.2f}"
    )
    d = agg["duration_h"]
    if d:
        planned = agg["planned_h"]
        L.append(
            f"duration h: p5={d['p5']:.1f} p50={d['p50']:.1f} p95={d['p95']:.1f}"
            f" (planned {planned:.0f}h → {d['p50'] / planned:.2f}× planned;"
            f" realized avg multiplier {agg['realized_avg_mult']:.2f}x)"
        )
    L.append(
        f"fail-safe rate={agg['fail_safe_rate']:.0%}  unminted pool={agg['unminted_pct']:.2%}"
        f"  exit rate={agg['exit_rate']:.1%}"
    )
    bt, bm = agg["burn_pct_total"], agg["burn_pct_median"]
    L.append(
        f"burn % of stake: total p50={bt['p50']:.1%} [{bt['p5']:.1%}..{bt['p95']:.1%}]"
        f"  per-rig median p50={bm['p50']:.1%} [{bm['p5']:.1%}..{bm['p95']:.1%}]"
    )
    L.append(
        f"gini: reward USD={agg['gini_reward_usd']:.3f} (stake gini {agg['gini_weight']:.3f})"
        f"  reward-per-stake={agg['gini_reward_per_weight']:.3f}"
    )
    L.append(
        f"ROI (RIG terms, net of burn+fees): all-players median={agg['roi_all_median']:+.1%}"
        f"  players with negative ROI={agg['share_players_negative_roi']:.0%}"
    )
    L.append(f"{'strategy':<14}{'ROI med':>9}{'min':>8}{'max':>8}{'ROI mean':>10}{'burn%':>8}"
             f"{'gpu':>6}{'cool':>6}{'wins':>6}")
    for s, v in sorted(agg["per_strategy"].items(), key=lambda kv: -kv[1]["roi_median_mean"]):
        L.append(
            f"{s:<14}{v['roi_median_mean']:>+9.1%}{v['roi_median_min']:>+8.1%}"
            f"{v['roi_median_max']:>+8.1%}{v['roi_mean_mean']:>+10.1%}{v['burn_pct_mean']:>8.1%}"
            f"{v['gpu_mean']:>6.1f}{v['cooling_mean']:>6.1f}{v['wins']:>6}"
        )
    dom = agg["dominant_strategy"]
    L.append(
        f"dominant strategy: {dom if dom else 'none'}"
        f" (best-median winner counts {agg['wins']})"
    )
    return "\n".join(L)


def parse_mix(s: str) -> dict[str, float]:
    mix = {}
    for part in s.split(","):
        k, v = part.split("=")
        if k not in STRATEGIES:
            raise ValueError(f"unknown strategy {k}; choose from {STRATEGIES}")
        mix[k] = float(v)
    return mix


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m sim.run", description=__doc__.split("\n")[0])
    ap.add_argument("--params", required=True)
    ap.add_argument("--players", type=int, default=1000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--rig-price", type=float, default=0.05)
    ap.add_argument("--pool-usd", type=float, default=150_000)
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--mix", type=parse_mix, default=None)
    ap.add_argument("--stake-median", type=float, default=3_000)
    ap.add_argument("--stake-sigma", type=float, default=1.2)
    ap.add_argument("--belief-sigma", type=float, default=0.25)
    ap.add_argument("--hurdle", type=float, default=1.0)
    ap.add_argument("--expected-mult", type=float, default=1.4)
    ap.add_argument("--difficulty-scale", type=float, default=1.0)
    ap.add_argument("--json", action="store_true")
    ns = ap.parse_args(argv)
    sc = Scenario(
        params_path=ns.params,
        players=ns.players,
        seed=ns.seed,
        rig_price=ns.rig_price,
        pool_usd=ns.pool_usd,
        stake_median=ns.stake_median,
        stake_sigma=ns.stake_sigma,
        belief_sigma=ns.belief_sigma,
        hurdle=ns.hurdle,
        expected_mult=ns.expected_mult,
        difficulty_scale=ns.difficulty_scale,
    )
    if ns.mix:
        sc.mix = ns.mix
    t = time.perf_counter()
    agg = monte_carlo(sc, ns.runs)
    elapsed = time.perf_counter() - t
    if ns.json:
        out = {k: v for k, v in agg.items() if k != "results"}
        out["scenario"] = asdict(sc)
        out["results"] = [{k: v for k, v in r.items() if k != "per_strategy"} for r in agg["results"]]
        out["elapsed_s"] = elapsed
        print(json.dumps(out, indent=2, default=str))
    else:
        print(format_report(agg))
        print(f"({elapsed:.1f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
