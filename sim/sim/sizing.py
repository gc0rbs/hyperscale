"""Difficulty sizing tool (docs/04 §5.2) with a duration distribution and fail-safe check.

    python -m sim.sizing --params ../specs/params/season-default.json
        [--stake-total 7e6 | --players 1000 --stake-median 3000 --stake-sigma 1.2]
        [--turnout-sigma 0.5] [--mults 1.0:0.45,1.4:0.25,2.0:0.2,3.5:0.1]
        [--planned-seconds 86400] [--samples 4000] [--from-sim RUNS]

The model: total stake weight is lognormal around the expectation (``--turnout-sigma`` is the
log-sd of turnout uncertainty), and the season-average multiplier is a Dirichlet-perturbed mixture
of player classes (``--mults`` as multiplier:share). Total hash = weight × multiplier; the season
lasts ``D_total / hash``. ``--from-sim`` instead measures the realised average multiplier by running
the agent model RUNS times (slower, more faithful).

Recommendation: ``D_total = median(hash) × plannedSeconds``, then the duration percentiles at that
difficulty, the hash floor below which the fail-safe fires, and the docs/04 §5.2 guidance bands.
"""

from __future__ import annotations

import argparse
import json

import numpy as np

from .mine import WAD
from .params import load_params

DEFAULT_MULTS = {1.0: 0.45, 1.4: 0.25, 2.0: 0.20, 3.5: 0.10}


def parse_mults(s: str) -> dict[float, float]:
    out = {}
    for part in s.split(","):
        m, w = part.split(":")
        out[float(m)] = float(w)
    return out


def hash_samples(
    stake_total: float,
    turnout_sigma: float,
    mults: dict[float, float],
    samples: int,
    seed: int = 0,
    mult_concentration: float = 30.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return (total_hash, total_weight, avg_mult) samples in RIG-equivalent units."""
    rng = np.random.default_rng(seed)
    weight = stake_total * np.exp(turnout_sigma * rng.standard_normal(samples) - turnout_sigma**2 / 2)
    ms = np.array(list(mults), dtype=float)
    ws = np.array(list(mults.values()), dtype=float)
    ws /= ws.sum()
    shares = rng.dirichlet(ws * mult_concentration, size=samples)
    avg_mult = shares @ ms
    return weight * avg_mult, weight, avg_mult


def size(
    data: dict,
    stake_total: float,
    *,
    turnout_sigma: float = 0.5,
    mults: dict[float, float] | None = None,
    planned_seconds: int | None = None,
    samples: int = 4000,
    seed: int = 0,
    realized_mults: np.ndarray | None = None,
) -> dict:
    sizing = data.get("sizing", {})
    planned = int(planned_seconds or sizing.get("plannedSeconds", 86400))
    max_duration = int(sizing.get("maxDurationSeconds", max(14 * 86400, 30 * planned)))
    mults = mults or DEFAULT_MULTS
    if realized_mults is not None:
        rng = np.random.default_rng(seed)
        weight = stake_total * np.exp(
            turnout_sigma * rng.standard_normal(samples) - turnout_sigma**2 / 2
        )
        avg_mult = rng.choice(np.asarray(realized_mults, dtype=float), size=samples)
        hashes = weight * avg_mult
    else:
        hashes, weight, avg_mult = hash_samples(stake_total, turnout_sigma, mults, samples, seed)

    current_d = sum(int(s["difficulty"]) for s in data["stocks"])  # whole hash-seconds
    rec_hash = float(np.median(hashes))
    rec_d = int(rec_hash * planned)
    # keep the per-block split, and each block divisible by shiftsPerBlock after ×1e18 (always true)
    shares = sizing.get("diffShareBps") or [s.get("valueShareBps", 2500) for s in data["stocks"]]
    per_block = [rec_d * s // 10_000 for s in shares]
    per_block[-1] += rec_d - sum(per_block)

    def stats(d_total: int) -> dict:
        dur = d_total / hashes
        floor_hash = d_total / max_duration
        return {
            "difficultyTotal": d_total,
            "duration_h": {
                "p5": float(np.percentile(dur, 5)) / 3600,
                "p25": float(np.percentile(dur, 25)) / 3600,
                "p50": float(np.percentile(dur, 50)) / 3600,
                "p75": float(np.percentile(dur, 75)) / 3600,
                "p95": float(np.percentile(dur, 95)) / 3600,
            },
            "p_fail_safe": float(np.mean(dur > max_duration)),
            "p_too_fast": float(np.mean(dur < planned / 4)),  # > 4× planned hash
            "p_long_haul": float(np.mean((dur > 2 * planned) & (dur <= max_duration))),
            "p_design_range": float(np.mean((dur >= planned / 4) & (dur <= 2 * planned))),
            "hash_floor_for_fail_safe": floor_hash,
            "hash_floor_vs_p5": float(np.percentile(hashes, 5)) / floor_hash,
        }

    current = stats(current_d)
    recommended = stats(rec_d)
    flags = []
    if recommended["p_fail_safe"] > 0.01:
        flags.append("FAIL-SAFE RISK: >1% of turnout draws close by maxDuration")
    if recommended["hash_floor_vs_p5"] < 3:
        flags.append("THIN MARGIN: p5 hash is < 3× the fail-safe floor; widen maxDuration or size down")
    if recommended["p_too_fast"] > 0.1:
        flags.append("TOO FAST: >10% of draws finish in < ¼ planned; consider a longer PreOpen")
    return {
        "plannedSeconds": planned,
        "maxDurationSeconds": max_duration,
        "stake_total": stake_total,
        "turnout_sigma": turnout_sigma,
        "hash_rig": {
            "p5": float(np.percentile(hashes, 5)),
            "p50": rec_hash,
            "p95": float(np.percentile(hashes, 95)),
        },
        "avg_mult": {
            "p5": float(np.percentile(avg_mult, 5)),
            "p50": float(np.median(avg_mult)),
            "p95": float(np.percentile(avg_mult, 95)),
        },
        "recommended": {
            "expectedTotalHash": int(rec_hash),
            "difficultyTotal": rec_d,
            "difficultyPerBlock": per_block,
            "maxDurationSeconds": max(14 * 86400, 30 * planned),
            **recommended,
        },
        "current": current,
        "flags": flags,
    }


def format_sizing(out: dict) -> str:
    L = []
    h = out["hash_rig"]
    m = out["avg_mult"]
    L.append(
        f"expected stake {out['stake_total']:,.0f} RIG-eq (turnout σ={out['turnout_sigma']}),"
        f" avg multiplier p50={m['p50']:.2f}x [{m['p5']:.2f}..{m['p95']:.2f}]"
    )
    L.append(f"total hash RIG-eq: p5={h['p5']:,.0f} p50={h['p50']:,.0f} p95={h['p95']:,.0f}")
    for label, s in (("current JSON", out["current"]), ("recommended", out["recommended"])):
        d = s["duration_h"]
        L.append(
            f"{label:<13} D_total={s['difficultyTotal']:.3e} hash·s → duration h:"
            f" p5={d['p5']:.1f} p25={d['p25']:.1f} p50={d['p50']:.1f} p75={d['p75']:.1f}"
            f" p95={d['p95']:.1f}"
        )
        L.append(
            f"{'':<13} P(design range ¼–2× planned)={s['p_design_range']:.0%}"
            f" P(long haul)={s['p_long_haul']:.0%} P(too fast)={s['p_too_fast']:.0%}"
            f" P(fail-safe)={s['p_fail_safe']:.2%}; fail-safe hash floor"
            f" {s['hash_floor_for_fail_safe']:,.0f} (p5 hash is {s['hash_floor_vs_p5']:.1f}× it)"
        )
    r = out["recommended"]
    L.append(
        f"recommend: expectedTotalHash={r['expectedTotalHash']:,} difficultyTotal={r['difficultyTotal']}"
        f" per block {r['difficultyPerBlock']} maxDurationSeconds={r['maxDurationSeconds']}"
    )
    for f in out["flags"]:
        L.append(f"!! {f}")
    return "\n".join(L)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m sim.sizing", description=__doc__.split("\n")[0])
    ap.add_argument("--params", required=True)
    ap.add_argument("--stake-total", type=float, default=None, help="expected RIG-eq staked")
    ap.add_argument("--players", type=int, default=1000)
    ap.add_argument("--stake-median", type=float, default=3000)
    ap.add_argument("--stake-sigma", type=float, default=1.2)
    ap.add_argument("--turnout-sigma", type=float, default=0.5)
    ap.add_argument("--mults", type=parse_mults, default=None)
    ap.add_argument("--planned-seconds", type=int, default=None)
    ap.add_argument("--samples", type=int, default=4000)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--from-sim", type=int, default=0, help="measure multipliers with N agent runs")
    ap.add_argument("--json", action="store_true")
    ns = ap.parse_args(argv)
    data = load_params(ns.params)
    stake_total = ns.stake_total
    if stake_total is None:
        # lognormal mean = median × exp(σ²/2); whales (2%) add roughly ×1.4 in the default mix
        stake_total = ns.players * ns.stake_median * float(np.exp(ns.stake_sigma**2 / 2)) * 1.4
    realized = None
    if ns.from_sim:
        from .run import Scenario, monte_carlo

        sc = Scenario(params_path=ns.params, players=ns.players, seed=ns.seed,
                      stake_median=ns.stake_median, stake_sigma=ns.stake_sigma)
        agg = monte_carlo(sc, ns.from_sim)
        realized = np.array([r["realized_avg_mult"] for r in agg["results"] if r["realized_avg_mult"]])
    out = size(
        data,
        stake_total,
        turnout_sigma=ns.turnout_sigma,
        mults=ns.mults,
        planned_seconds=ns.planned_seconds,
        samples=ns.samples,
        seed=ns.seed,
        realized_mults=realized,
    )
    if ns.json:
        print(json.dumps(out, indent=2))
    else:
        print(format_sizing(out))
    return 0


_ = WAD  # re-exported for callers that size in contract units

if __name__ == "__main__":
    raise SystemExit(main())
