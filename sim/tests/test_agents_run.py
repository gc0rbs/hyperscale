"""Agents, scenario runner and sizing tool: behaviour and speed checks."""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from sim.agents import STRATEGIES, Agent
from sim.mine import LP, RIG, WAD, ContractParams, Mine, advance_to_progress
from sim.run import Scenario, format_report, main, monte_carlo, simulate_season
from sim.sizing import size
from sim.value import Market, gpu_breakeven_ratio, oc_breakeven_ratio, value_of_extra_hash

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = str(ROOT / "specs" / "params" / "season-default.json")


def scenario(**kw) -> Scenario:
    base = {"params_path": DEFAULT, "players": 200, "seed": 3, "belief_sigma": 0.0}
    base.update(kw)
    return Scenario(**base)


def test_breakeven_formulas_match_value_function(default_json):
    """At exactly the break-even pool ratio the analytic gain equals the cost."""
    cp = ContractParams.from_json(default_json, open_time=1000)
    m = Mine(cp)
    w = 10_000 * WAD
    m.activate(Mine.sec(500), "a", RIG, w)
    total = 10_000_000 * WAD
    market = Market.from_json(default_json, 1.0, 1.0)
    for tier in range(1, 6):
        rho = gpu_breakeven_ratio(cp, tier)
        market.pool_usd = rho * total / WAD  # pool RIG = ρ × total hash
        delta = w * (cp.gpu_mult_bps[tier] - cp.gpu_mult_bps[tier - 1]) // 10_000
        segs = list(enumerate(cp.difficulty))
        gain = value_of_extra_hash(cp, market, delta, segs, total, 1.0)
        cost = w / WAD * cp.gpu_cost_bps[tier - 1] / 10_000
        assert abs(gain - cost) / cost < 1e-9
    # overclock at the start of a block-4 shift for a tier-5 rig
    rho = oc_breakeven_ratio(cp, market, 5, 3)
    market.pool_usd = rho * total / WAD
    base = w * cp.gpu_mult_bps[5] // 10_000
    delta = base * cp.oc_boost_bps // 10_000
    segs = [(3, cp.shift_difficulty(24)), (3, cp.shift_difficulty(25))]
    gain = value_of_extra_hash(cp, market, delta, segs, total, 1.0)
    cost = w / WAD * cp.oc_cost_bps / 10_000
    assert abs(gain - cost) / cost < 1e-9


def test_strategies_behave(default_json):
    """At a rich pool ratio each strategy does what its name says; at a poor one nobody burns."""
    rich = simulate_season(scenario(pool_usd=2_000_000), 1)
    ps = rich["per_strategy"]
    assert set(ps) == set(STRATEGIES)
    assert ps["gpu_maxer"]["gpu_mean"] > 4.5
    assert ps["passive"]["burn_pct_mean"] == 0
    assert ps["cooling_oc"]["cooling_mean"] > 2.5 and ps["cooling_oc"]["burn_pct_mean"] > 0.8
    assert ps["finale_oc"]["burn_pct_mean"] > ps["gpu_maxer"]["burn_pct_mean"]
    assert ps["whale"]["burn_pct_mean"] > 0.8
    assert 0 < rich["exit_rate"] < 0.2
    assert rich["burn_pct_median"] > 0.3
    poor = simulate_season(scenario(pool_usd=5_000), 1)
    assert poor["burn_pct_total"] == 0
    # only the passive yield minus the 1% fee remains, and LP still earns its 25% bonus
    assert poor["per_strategy"]["lp_staker"]["roi_median"] < 0.1
    assert poor["per_strategy"]["lp_staker"]["roi_median"] > poor["per_strategy"]["passive"]["roi_median"]
    assert all(m <= s for m, s in zip(rich["minted"], rich["supply"], strict=True))
    assert rich["unminted_pct"] < 1e-4


def test_lp_and_latecomer_and_exiter(default_json):
    cp = ContractParams.from_json(default_json, open_time=1000, difficulty=[8000, 10000, 10000, 12000])
    m = Mine(cp)
    market = Market.from_json(default_json, 0.05, 150_000)
    lp = Agent("lp", "lp_staker", 1_000 * WAD, 0.05, asset=LP)
    late = Agent("late", "latecomer", 1_000 * WAD, 0.05, join_shift=8)
    ex = Agent("ex", "early_exiter", 1_000 * WAD, 0.05, exit_shift=4)
    t0 = Mine.sec(500)
    lp.activate(m, t0)
    ex.activate(m, t0)
    lp.pre_open(m, market, t0)
    assert m.rigs[lp.rig_id].weight == 1_250 * WAD
    for k in range(10):
        advance_to_progress(m, k, 0)
        for a in (lp, late, ex):
            a.on_tick(m, market, m.now_x, k, 0)
    assert late.rig_id is not None and m.rigs[late.rig_id].last_shift == 8
    assert m.rigs[ex.rig_id].exited
    assert m.total_hash == m.rig_hash(lp.rig_id) + m.rig_hash(late.rig_id)


def test_runner_is_fast_and_reports(capsys):
    t = time.perf_counter()
    res = simulate_season(scenario(players=1000), 7)
    assert time.perf_counter() - t < 5
    assert res["duration_h"] and not res["fail_safe"]
    assert 0 <= res["gini_reward_usd"] <= 1
    agg = monte_carlo(scenario(players=150), 3)
    assert agg["runs"] == 3 and agg["duration_h"]["p50"] > 0
    text = format_report(agg)
    assert "dominant strategy" in text
    assert main(["--params", DEFAULT, "--players", "50", "--runs", "2", "--json"]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["runs"] == 2 and len(out["results"]) == 2


def test_fail_safe_when_turnout_collapses(default_json):
    """A season sized for 10M hash with 40 tiny players ends at the cap (maxDuration) with block 4 partial."""
    res = simulate_season(scenario(players=40, stake_median=100, stake_sigma=0.1,
                                   mix={"passive": 1.0}), 1)
    assert res["fail_safe"] and res["shifts_completed"] < 32
    assert res["unminted_pct"] > 0.5
    assert abs(res["duration_h"] - default_json["sizing"]["maxDurationSeconds"] / 3600) < 1e-6


def test_sizing_recommendation(default_json):
    out = size(default_json, 7_000_000, turnout_sigma=0.3, samples=2000)
    rec = out["recommended"]
    assert rec["difficultyTotal"] == int(out["hash_rig"]["p50"] * out["plannedSeconds"])
    assert sum(rec["difficultyPerBlock"]) == rec["difficultyTotal"]
    assert abs(rec["duration_h"]["p50"] - out["plannedSeconds"] / 3600) < 0.1
    # a 2x cap leaves ~1-2% of turnout draws (sigma 0.3) ending at the cap: expected, not a flag-worthy risk
    assert rec["p_fail_safe"] < 0.05
    tiny = size(default_json, 30_000, turnout_sigma=1.0, samples=2000)
    assert tiny["current"]["p_fail_safe"] > 0.5
    assert any("CAP" in f or "THIN" in f for f in tiny["flags"]) or tiny["recommended"]["p_fail_safe"] > 0
    assert np.isfinite(tiny["current"]["duration_h"]["p95"])
