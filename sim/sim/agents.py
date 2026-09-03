"""Strategy agents for the economic simulation.

Every agent owns one rig and decides with the same rule: buy when the RIG value of the extra
fragments (at *its* price belief and an estimate of total hash) beats the burn by at least
`hurdle`. Strategies differ in which purchases they consider and when:

| strategy      | pre-open                                  | during the season                              |
|---------------|-------------------------------------------|------------------------------------------------|
| passive       | stake                                     | nothing                                        |
| gpu_maxer     | stake, GPU tiers while +EV (up to max)    | nothing                                        |
| cooling_oc    | stake, GPU while +EV, cooling for the best| re-buys overclocks at the start of every other |
|               | full-season overclock programme           | shift while +EV and heat allows                |
| finale_oc     | stake, GPU while +EV                      | in block 4: cooling for the best programme,    |
|               |                                           | overclocks at the start of every other shift   |
| lp_staker     | stake LP (×lpBonus), GPU while +EV        | nothing                                        |
| early_exiter  | stake, GPU tier 1 while +EV               | exits at `exit_shift`                          |
| latecomer     | –                                         | joins at `join_shift`, GPU while +EV           |
| whale         | 10–50× stake, GPU + cooling programme     | continuous overclocks while +EV                |

`hurdle` < 1 models a player who over-values the game (fun, hype); > 1 a cautious one.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .mine import BPS, LP, RIG, WAD, ContractParams, Mine, MineError
from .value import Market, h_estimate, value_of_extra_hash

STRATEGIES = [
    "passive",
    "gpu_maxer",
    "cooling_oc",
    "finale_oc",
    "lp_staker",
    "early_exiter",
    "latecomer",
    "whale",
]


@dataclass
class Agent:
    name: str
    strategy: str
    stake: int  # wei of RIG (or LP tokens, valued 1:1 RIG-equivalent before bonus)
    belief_price: float  # USD per RIG the player believes in
    expected_mult: float = 1.4  # believed average multiplier of the crowd
    hurdle: float = 1.0  # buy when value ≥ hurdle × cost
    max_gpu_tier: int = 5
    join_shift: int | None = None  # latecomer
    exit_shift: int | None = None  # early exiter
    rig_id: int | None = None
    asset: int = RIG
    # outcome bookkeeping
    fragments: list[int] = field(default_factory=lambda: [0, 0, 0, 0])
    last_oc_shift: int = -10

    # ── decision primitives ──────────────────────────────────────────────
    def _oc_value(self, mine: Mine, market: Market, base_hash: int, k: int, h_est: int) -> float:
        """RIG value (belief) of one overclock bought at the start of shift k (covers k..k+span)."""
        cp = mine.p
        delta = base_hash * cp.oc_boost_bps // BPS
        segs = [
            (cp.block_of(j), cp.shift_difficulty(j))
            for j in range(k, min(k + 1 + cp.oc_shift_span, cp.total_shifts))
        ]
        if k == mine.shift:  # partially elapsed current shift
            segs[0] = (cp.block_of(k), cp.shift_difficulty(k) - mine.work_in_shift)
        return value_of_extra_hash(cp, market, delta, segs, h_est, self.belief_price)

    def _oc_programme(
        self, mine: Mine, market: Market, base_hash: int, cooling: int, heat0: int,
        first_shift: int, last_shift: int, h_est: int,
    ) -> tuple[float, int]:
        """Net RIG value (belief) and count of a greedy 'max overclocks at every other shift start'
        programme with `cooling` tier from `first_shift` to `last_shift` inclusive."""
        cp = mine.p
        weight = mine.rigs[self.rig_id].weight if self.rig_id is not None else self.stake
        oc_cost = weight / WAD * cp.oc_cost_bps / BPS
        heat = heat0
        net, count = 0.0, 0
        k = first_shift
        step = 1 + cp.oc_shift_span
        while k <= last_shift:
            one = self._oc_value(mine, market, base_hash, k, h_est)
            n = 0
            while n < cp.max_active_oc and heat + cp.heat_per_oc[cooling] <= cp.heat_max:
                if one < self.hurdle * oc_cost:
                    break
                heat += cp.heat_per_oc[cooling]
                n += 1
            net += n * (one - oc_cost)
            count += n
            for _ in range(step):
                heat = max(0, heat - cp.cool_per_shift[cooling])
            k += step
        return net, count

    def _buy_gpu_while_worth(self, mine: Mine, market: Market, now_x: int) -> None:
        cp = mine.p
        r = mine.rigs[self.rig_id]
        segs = [(b, w) for b, w in enumerate(mine.remaining_work_by_block()) if w]
        while r.gpu_tier < self.max_gpu_tier:
            tier = r.gpu_tier
            delta = r.weight * (cp.gpu_mult_bps[tier + 1] - cp.gpu_mult_bps[tier]) // BPS
            h_est = h_estimate(mine, self.expected_mult) + delta
            cost = r.weight / WAD * cp.gpu_cost_bps[tier] / BPS
            gain = value_of_extra_hash(cp, market, delta, segs, h_est, self.belief_price)
            if gain < self.hurdle * cost:
                break
            mine.upgrade_gpu(now_x, self.rig_id)

    def _choose_cooling(
        self, mine: Mine, market: Market, now_x: int, first_shift: int, last_shift: int
    ) -> None:
        """Buy the cooling tier whose overclock programme has the best net value, if positive."""
        cp = mine.p
        r = mine.rig_view(self.rig_id)
        h_est = h_estimate(mine, self.expected_mult)
        best_tier, best_net = r.cooling_tier, 0.0
        cum_cost = 0.0
        base_net, _ = self._oc_programme(
            mine, market, r.base_hash, r.cooling_tier, r.heat, first_shift, last_shift, h_est
        )
        for tier in range(r.cooling_tier + 1, len(cp.cool_cost_bps) + 1):
            cum_cost += r.weight / WAD * cp.cool_cost_bps[tier - 1] / BPS
            net, _ = self._oc_programme(
                mine, market, r.base_hash, tier, r.heat, first_shift, last_shift, h_est
            )
            improvement = net - base_net - self.hurdle * cum_cost
            if improvement > best_net:
                best_tier, best_net = tier, improvement
        while mine.rigs[self.rig_id].cooling_tier < best_tier:
            mine.upgrade_cooling(now_x, self.rig_id)

    def _rebuy_overclocks(self, mine: Mine, market: Market, now_x: int) -> None:
        cp = mine.p
        r = mine.rig_view(self.rig_id)
        if r.active_oc:
            return
        h_est = h_estimate(mine, self.expected_mult)
        one = self._oc_value(mine, market, r.base_hash, mine.shift, h_est)
        cost = r.weight / WAD * cp.oc_cost_bps / BPS
        if one < self.hurdle * cost:
            return
        heat = r.heat
        n = 0
        while n < cp.max_active_oc and heat + cp.heat_per_oc[r.cooling_tier] <= cp.heat_max:
            try:
                mine.overclock(now_x, self.rig_id)
            except MineError:
                break
            heat += cp.heat_per_oc[r.cooling_tier]
            n += 1
        if n:
            self.last_oc_shift = mine.shift

    # ── lifecycle ─────────────────────────────────────────────────────────
    def activate(self, mine: Mine, now_x: int) -> None:
        self.rig_id = mine.activate(now_x, self.name, self.asset, self.stake)

    def pre_open(self, mine: Mine, market: Market, now_x: int) -> None:
        s = self.strategy
        if s in ("gpu_maxer", "cooling_oc", "finale_oc", "lp_staker", "whale", "early_exiter"):
            self._buy_gpu_while_worth(mine, market, now_x)
        if s in ("cooling_oc", "whale"):
            self._choose_cooling(mine, market, now_x, 0, mine.p.total_shifts - 1)

    def on_tick(self, mine: Mine, market: Market, now_x: int, shift: int, frac) -> None:
        s = self.strategy
        cp = mine.p
        if self.rig_id is None:
            if s == "latecomer" and self.join_shift is not None and shift >= self.join_shift:
                self.activate(mine, now_x)
                self._buy_gpu_while_worth(mine, market, now_x)
            return
        if mine.rigs[self.rig_id].inactive:
            return
        if s == "early_exiter":
            if self.exit_shift is not None and shift >= self.exit_shift:
                mine.exit(now_x, self.rig_id)
            return
        if frac != 0:
            return
        if s in ("cooling_oc", "whale", "latecomer"):
            if s == "latecomer" and mine.rigs[self.rig_id].cooling_tier == 0:
                return
            self._rebuy_overclocks(mine, market, now_x)
        elif s == "finale_oc":
            last_block_start = (cp.blocks - 1) * cp.spb
            if shift == last_block_start:
                self._choose_cooling(mine, market, now_x, shift, cp.total_shifts - 1)
            if shift >= last_block_start:
                self._rebuy_overclocks(mine, market, now_x)

    def finish(self, mine: Mine, now_x: int) -> None:
        if self.rig_id is None:
            return
        mine.claim_all(now_x, self.rig_id)
        if not mine.rigs[self.rig_id].inactive:
            mine.withdraw(now_x, self.rig_id)
        self.fragments = list(mine.rigs[self.rig_id].claimed)

    # ── outcome ───────────────────────────────────────────────────────────
    def outcome(self, mine: Mine, market: Market) -> dict:
        cp: ContractParams = mine.p
        if self.rig_id is None:
            return {"strategy": self.strategy, "weight": 0, "played": False}
        r = mine.rigs[self.rig_id]
        usd = market.fragments_usd(cp, self.fragments)
        reward_rig = usd / market.rig_price_usd
        burned = r.burned / 1e18
        fees = r.fees / 1e18
        weight = r.weight / 1e18
        deposit = r.amount / 1e18  # LP tokens are valued 1:1 RIG-equivalent before the bonus
        net = reward_rig - burned - fees
        return {
            "strategy": self.strategy,
            "played": True,
            "weight": weight,
            "deposit": deposit,
            "asset": "LP" if r.asset == LP else "RIG",
            "gpu": r.gpu_tier,
            "cooling": r.cooling_tier,
            "burned": burned,
            "burn_pct": burned / weight,
            "fees": fees,
            "reward_usd": usd,
            "reward_rig": reward_rig,
            "net_rig": net,
            "roi": net / deposit,  # on capital at risk, so the LP bonus shows
            "exited": r.exited,
            "fragments": list(self.fragments),
        }
