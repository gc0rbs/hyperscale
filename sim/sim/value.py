"""Valuation helpers shared by agents, the runner and the report.

Everything a player decides reduces to one ratio, the *pool ratio*

    ρ = (pool value in RIG) / (total hash in RIG-equivalent)

because a rig's fragments are `hash / totalHash × pool` and every upgrade costs a fixed fraction of
its own stake. Break-even thresholds below are exact under the "my purchase does not move
totalHash" approximation (true for small rigs; whales overstate their gain slightly).
"""

from __future__ import annotations

from dataclasses import dataclass

from .mine import BPS, ContractParams, Mine


@dataclass
class Market:
    rig_price_usd: float
    pool_usd: float
    value_share: list[float]  # per block, sums to 1

    @classmethod
    def from_json(cls, data: dict, rig_price_usd: float, pool_usd: float) -> Market:
        shares = [s["valueShareBps"] / BPS for s in data["stocks"]]
        return cls(rig_price_usd, pool_usd, shares)

    def block_usd(self, b: int) -> float:
        return self.pool_usd * self.value_share[b]

    def frag_usd(self, cp: ContractParams, b: int) -> float:
        return self.block_usd(b) / cp.supply(b)

    def pool_rig(self) -> float:
        return self.pool_usd / self.rig_price_usd

    def fragments_usd(self, cp: ContractParams, frags: list[int]) -> float:
        return sum(f * self.frag_usd(cp, b) for b, f in enumerate(frags))


def value_of_extra_hash(
    cp: ContractParams,
    market: Market,
    delta_hash: int,
    segments: list[tuple[int, int]],
    h_est: int,
    belief_price: float,
) -> float:
    """RIG value (at the player's price belief) of `delta_hash` extra hash over `segments`
    [(block, remaining work)] assuming total hash stays at `h_est`."""
    if h_est <= 0:
        return 0.0
    usd = 0.0
    for b, work in segments:
        extra_work = delta_hash * work / h_est
        frags = extra_work * cp.rate_per_work_float(b)
        usd += frags * market.frag_usd(cp, b)
    return usd / belief_price


def h_estimate(mine: Mine, expected_mult: float) -> int:
    """A player's estimate of average total hash from now on: the larger of what is on-chain now
    and the operator's published assumption (stake weight × expected average multiplier)."""
    return max(mine.total_hash, int(mine.total_weight * expected_mult))


# ── break-even analysis (used by the report) ─────────────────────────────


def gpu_breakeven_ratio(cp: ContractParams, tier: int, coverage: float = 1.0) -> float:
    """Pool ratio ρ above which buying GPU tier `tier` (1..5) is +EV when it covers `coverage` of
    the remaining season by value. cost = gpuCost[tier-1] × W; gain = ΔmultW / H × pool × coverage."""
    dmult = (cp.gpu_mult_bps[tier] - cp.gpu_mult_bps[tier - 1]) / BPS
    cost = cp.gpu_cost_bps[tier - 1] / BPS
    return cost / (dmult * coverage)


def oc_breakeven_ratio(cp: ContractParams, market: Market, gpu_tier: int, block: int) -> float:
    """Pool ratio above which one overclock bought at the start of a shift in `block` (covering
    two full shifts of that block) pays for itself, for a rig at `gpu_tier`."""
    boost = cp.oc_boost_bps / BPS * cp.gpu_mult_bps[gpu_tier] / BPS
    shifts_covered = 1 + cp.oc_shift_span
    # fraction of *pool value* the two shifts represent
    value_frac = market.value_share[block] * shifts_covered / cp.spb
    # gain = boost × W / H × pool × value_frac ; cost = ocCost × W
    return (cp.oc_cost_bps / BPS) / (boost * value_frac)


def passive_yield(cp: ContractParams, market: Market, total_hash_rig: float, mult: float = 1.0):
    """Gross return on stake for a rig at multiplier `mult`, as a fraction, at pool ratio ρ."""
    rho = market.pool_rig() / total_hash_rig
    return rho * mult
