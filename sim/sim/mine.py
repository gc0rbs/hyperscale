"""Pure-Python reference implementation of `SeasonMine` accounting.

Mirrors docs/05-TECH-SPEC-CONTRACTS.md §2–§6 with the contract's integer semantics:

* hash: 1e18 = one RIG of stake weight at 1.0x
* time: X-time = seconds × 1e18 (all public methods take ``now_x``)
* work = hash × dX / 1e18                      (floored)
* ratePerWork[b] = S_b × 1e18 / D_b            (S_b in fragment-wei, floored)
* earned += (hash × dX / 1e18) × rate / 1e18   (two floors, like mulDiv after a floored work)
* shift boundary endX = lastX + (remaining × 1e18 / totalHash)   (floored)

Difficulties in `specs/params/*.json` are in whole hash × seconds and are multiplied by 1e18 here
(`ContractParams.from_json`). Pool tokens are 1e18-scaled; S_b = poolTokens × fragPerToken fragment-wei.

This module has no notion of wall-clock pace beyond the timestamps it is given; the `advance_to_progress`
helper converts progress targets (shift, fraction of shift) into exact X-times so the same
progress-expressed action sequence can be replayed at any pace.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from fractions import Fraction

WAD = 10**18
BPS = 10_000

RIG = 0
LP = 1


class MineError(Exception):
    """Base class for every revert the contract would raise."""


class WrongPhase(MineError):
    pass


class NotOwner(MineError):
    pass


class RigInactive(MineError):
    pass


class BelowMinStake(MineError):
    pass


class LpDisabled(MineError):
    pass


class MaxTier(MineError):
    pass


class HeatTooHigh(MineError):
    pass


class MaxOverclocks(MineError):
    pass


class NotFound(MineError):
    pass


class AlreadyClaimed(MineError):
    pass


class PoolExhausted(MineError):
    pass


class TimeWentBackwards(MineError):
    pass


class Phase(Enum):
    PREOPEN = "PreOpen"
    OPEN = "Open"
    CLOSED = "Closed"


def _tokens_to_wei(s: str | float) -> int:
    return int(Decimal(str(s)) * WAD)


@dataclass
class ContractParams:
    """Season parameters in contract units (see module docstring)."""

    open_time: int
    max_duration: int
    blocks: int
    spb: int
    pool_tokens: list[int]  # 1e18-scaled Stock Tokens per block
    difficulty: list[int]  # contract work units (whole hash-seconds × 1e18)
    frag_per_token: int
    min_stake_weight: int  # wei
    activation_fee_bps: int
    early_exit_fee_bps: int
    gpu_mult_bps: list[int]
    gpu_cost_bps: list[int]
    cool_cost_bps: list[int]
    heat_per_oc: list[int]
    cool_per_shift: list[int]
    heat_max: int
    oc_cost_bps: int
    oc_boost_bps: int
    max_active_oc: int
    oc_shift_span: int
    lp_weight_per_token: int  # wei of RIG-equivalent per 1e18 LP; 0 disables LP
    symbols: list[str] = field(default_factory=list)

    @classmethod
    def from_json(
        cls,
        data: dict,
        *,
        open_time: int = 0,
        lp_weight_per_token: int | None = None,
        difficulty: list[int] | None = None,
        max_duration: int | None = None,
    ) -> ContractParams:
        """Build contract-unit params from a season JSON (as loaded by `sim.params.load_params`).

        ``difficulty`` overrides the per-block difficulty in *whole hash-seconds*. ``lp_weight_per_token``
        defaults to `lpBonusBps / 1e4` (1 LP token == 1 RIG-equivalent before bonus) when the JSON
        leaves it at 0, which is what the docs' worked examples assume.
        """
        stocks = data["stocks"]
        blocks = int(data["blocks"])
        spb = int(data["shiftsPerBlock"])
        if difficulty is None:
            difficulty = [int(s["difficulty"]) for s in stocks]
        if len(difficulty) != blocks or len(stocks) != blocks:
            raise ValueError("difficulty/stocks length must equal blocks")
        diff_units = [int(d) * WAD for d in difficulty]
        for d in diff_units:
            if d % spb != 0:
                raise ValueError("difficulty must be divisible by shiftsPerBlock")
        lpw = lp_weight_per_token
        if lpw is None:
            lpw = int(data.get("lpWeightPerToken", "0"))
            if lpw == 0:
                lpw = int(data["lpBonusBps"]) * WAD // BPS
        sizing = data.get("sizing", {})
        if max_duration is None:
            max_duration = int(sizing.get("maxDurationSeconds", 30 * 86400))
        return cls(
            open_time=open_time,
            max_duration=max_duration,
            blocks=blocks,
            spb=spb,
            pool_tokens=[_tokens_to_wei(s["poolTokens"]) for s in stocks],
            difficulty=diff_units,
            frag_per_token=int(data["fragPerToken"]),
            min_stake_weight=_tokens_to_wei(data.get("minStakeWeight", "0")),
            activation_fee_bps=int(data.get("activationFeeBps", 0)),
            early_exit_fee_bps=int(data.get("earlyExitFeeBps", 0)),
            gpu_mult_bps=[int(x) for x in data["gpuMultBps"]],
            gpu_cost_bps=[int(x) for x in data["gpuCostBps"]],
            cool_cost_bps=[int(x) for x in data["coolCostBps"]],
            heat_per_oc=[int(x) for x in data["heatPerOc"]],
            cool_per_shift=[int(x) for x in data["coolPerShift"]],
            heat_max=int(data["heatMax"]),
            oc_cost_bps=int(data["ocCostBps"]),
            oc_boost_bps=int(data["ocBoostBps"]),
            max_active_oc=int(data["maxActiveOc"]),
            oc_shift_span=int(data.get("ocShiftSpan", 1)),
            lp_weight_per_token=lpw,
            symbols=[s.get("symbol", f"B{i}") for i, s in enumerate(stocks)],
        )

    # ── derived ───────────────────────────────────────────────────────────
    @property
    def total_shifts(self) -> int:
        return self.blocks * self.spb

    @property
    def open_x(self) -> int:
        return self.open_time * WAD

    @property
    def deadline_x(self) -> int:
        return (self.open_time + self.max_duration) * WAD

    def shift_difficulty(self, k: int) -> int:
        return self.difficulty[k // self.spb] // self.spb

    def block_of(self, k: int) -> int:
        return k // self.spb

    def pool_fragwei(self, b: int) -> int:
        """S_b: block pool in fragment-wei (1e18-scaled fragments)."""
        return self.pool_tokens[b] * self.frag_per_token

    def supply(self, b: int) -> int:
        """Whole fragments mintable for block b."""
        return self.pool_tokens[b] * self.frag_per_token // WAD

    def difficulty_total(self) -> int:
        return sum(self.difficulty)

    def rate_per_work_float(self, b: int) -> float:
        """Whole fragments per unit of contract work (hash-wei × seconds / 1e18)."""
        return self.pool_fragwei(b) / self.difficulty[b] / WAD


@dataclass
class Rig:
    owner: str
    asset: int
    amount: int
    weight: int
    gpu_tier: int = 0
    cooling_tier: int = 0
    heat: int = 0
    active_oc: int = 0
    oc_expiry_shift: int = 0
    last_shift: int = 0
    last_x: int = 0
    base_hash: int = 0
    oc_hash: int = 0
    earned: list[int] = field(default_factory=lambda: [0, 0, 0, 0])
    claimed_mask: int = 0
    inactive: bool = False
    # sim-only bookkeeping (not contract storage)
    claimed: list[int] = field(default_factory=lambda: [0, 0, 0, 0])
    work: list[int] = field(default_factory=lambda: [0, 0, 0, 0])
    burned: int = 0
    fees: int = 0
    exited: bool = False
    settlements: int = 0


class Mine:
    """One season. All timestamps are X-time (seconds × 1e18); use `sec()` to convert."""

    def __init__(self, p: ContractParams):
        if p.blocks != 4:
            raise ValueError("Rig.earned is uint128[4]; v1 seasons have 4 blocks")
        self.p = p
        self.shift = 0
        self.work_in_shift = 0
        self.last_x = p.open_x
        self.total_hash = 0
        self.oc_expiring: dict[int, int] = {}
        self.shift_end_x: dict[int, int] = {}
        self.close_x = 0
        self.rate_per_work = [p.pool_fragwei(b) * WAD // p.difficulty[b] for b in range(p.blocks)]
        self.minted = [0] * p.blocks
        self.rigs: list[Rig] = []
        self.now_x = 0
        self.fail_safe = False
        # token-flow bookkeeping (invariant 8)
        self.balance = {RIG: 0, LP: 0}  # tokens held by the contract
        self.treasury = {RIG: 0, LP: 0}
        self.burned = 0
        self.total_weight = 0  # Σ weight of active rigs (public via events; agents use it)

    # ── helpers ───────────────────────────────────────────────────────────
    @staticmethod
    def sec(t: float) -> int:
        return int(Fraction(t) * WAD)

    def _touch(self, now_x: int) -> None:
        if now_x < self.now_x:
            raise TimeWentBackwards(f"{now_x} < {self.now_x}")
        self.now_x = now_x

    def phase(self, now_x: int | None = None) -> Phase:
        if self.close_x:
            return Phase.CLOSED
        now_x = self.now_x if now_x is None else now_x
        return Phase.PREOPEN if now_x < self.p.open_x else Phase.OPEN

    def block_end_x(self, b: int) -> int:
        return self.shift_end_x.get((b + 1) * self.p.spb - 1, 0)

    def block_found(self, b: int) -> bool:
        return self.block_end_x(b) != 0

    def _rig(self, rig_id: int, owner: str | None = None) -> Rig:
        r = self.rigs[rig_id]
        if owner is not None and r.owner != owner:
            raise NotOwner(f"rig {rig_id} owned by {r.owner}")
        if r.inactive:
            raise RigInactive(f"rig {rig_id}")
        return r

    # ── 5.1 global settlement ─────────────────────────────────────────────
    def _update_global(self, now_x: int) -> None:
        p = self.p
        if self.close_x or now_x < p.open_x:
            return
        deadline_x = p.deadline_x
        now_x = min(now_x, deadline_x)
        while self.last_x < now_x:
            if self.total_hash == 0:
                self.last_x = now_x
                break
            remaining = p.shift_difficulty(self.shift) - self.work_in_shift
            span = remaining * WAD // self.total_hash
            if self.last_x + span > now_x:
                self.work_in_shift += self.total_hash * (now_x - self.last_x) // WAD
                self.last_x = now_x
                break
            end_x = self.last_x + span
            self.shift_end_x[self.shift] = end_x
            self.work_in_shift = 0
            self.last_x = end_x
            self.total_hash -= self.oc_expiring.get(self.shift, 0)
            self.shift += 1
            if self.shift == p.total_shifts:
                self.close_x = end_x
                break
        if self.close_x == 0 and now_x == deadline_x:
            self.close_x = deadline_x
            self.fail_safe = True

    def poke(self, now_x: int) -> None:
        self._touch(now_x)
        self._update_global(now_x)

    # ── 5.2 rig settlement ────────────────────────────────────────────────
    def _settle_rig(self, r: Rig, now_x: int) -> None:
        p = self.p
        to_x = min(now_x, self.close_x) if self.close_x else now_x
        from_x = r.last_x
        b_lo = p.block_of(r.last_shift)
        b_hi = min(p.block_of(self.shift), p.blocks - 1)
        oc_end = self.shift_end_x.get(r.oc_expiry_shift, 0) if r.oc_hash > 0 else 0
        oc_end_x = oc_end or to_x
        for b in range(b_lo, b_hi + 1):
            start_x = p.open_x if b == 0 else self.shift_end_x[b * p.spb - 1]
            end_x = self.block_end_x(b) or to_x
            lo = max(from_x, start_x)
            hi = min(to_x, end_x)
            if hi > lo:
                work = r.base_hash * (hi - lo) // WAD
                r.earned[b] += work * self.rate_per_work[b] // WAD
                r.work[b] += work
            if r.oc_hash > 0:
                hi2 = min(hi, oc_end_x)
                if hi2 > lo:
                    work = r.oc_hash * (hi2 - lo) // WAD
                    r.earned[b] += work * self.rate_per_work[b] // WAD
                    r.work[b] += work
        if r.oc_hash > 0 and oc_end:
            r.oc_hash = 0
            r.active_oc = 0
        crossed = self.shift - r.last_shift
        dec = crossed * p.cool_per_shift[r.cooling_tier]
        r.heat = 0 if dec >= r.heat else r.heat - dec
        r.last_shift = self.shift
        r.last_x = to_x
        r.settlements += 1

    def settle(self, now_x: int, rig_id: int) -> None:
        """Test helper: what any reverted rig call would have done to accounting (nothing)."""
        self._touch(now_x)
        self._update_global(now_x)
        r = self.rigs[rig_id]
        if not r.inactive:
            self._settle_rig(r, now_x)

    # ── player actions ────────────────────────────────────────────────────
    def _require_open_or_preopen(self) -> None:
        if self.close_x:
            raise WrongPhase(Phase.CLOSED)

    def activate(self, now_x: int, owner: str, asset: int, amount: int) -> int:
        p = self.p
        self._touch(now_x)
        self._update_global(now_x)
        self._require_open_or_preopen()
        if asset == LP:
            if p.lp_weight_per_token == 0:
                raise LpDisabled()
            weight = amount * p.lp_weight_per_token // WAD
        elif asset == RIG:
            weight = amount
        else:
            raise ValueError("asset")
        if weight < p.min_stake_weight:
            raise BelowMinStake()
        fee = weight * p.activation_fee_bps // BPS
        r = Rig(owner=owner, asset=asset, amount=amount, weight=weight)
        r.base_hash = weight
        r.last_x = max(now_x, p.open_x)
        r.last_shift = self.shift
        r.fees += fee
        self.rigs.append(r)
        self.total_hash += weight
        self.total_weight += weight
        self.balance[asset] += amount
        self.treasury[RIG] += fee
        return len(self.rigs) - 1

    def upgrade_gpu(self, now_x: int, rig_id: int, owner: str | None = None) -> int:
        p = self.p
        self._touch(now_x)
        self._update_global(now_x)
        self._require_open_or_preopen()
        r = self._rig(rig_id, owner)
        self._settle_rig(r, now_x)
        if r.gpu_tier >= len(p.gpu_cost_bps):
            raise MaxTier()
        cost = r.weight * p.gpu_cost_bps[r.gpu_tier] // BPS
        new_base = r.weight * p.gpu_mult_bps[r.gpu_tier + 1] // BPS
        self.total_hash += new_base - r.base_hash
        if r.oc_hash > 0:
            new_oc = new_base * p.oc_boost_bps * r.active_oc // BPS
            self.oc_expiring[r.oc_expiry_shift] += new_oc - r.oc_hash
            self.total_hash += new_oc - r.oc_hash
            r.oc_hash = new_oc
        r.base_hash = new_base
        r.gpu_tier += 1
        self._burn(r, cost)
        return cost

    def upgrade_cooling(self, now_x: int, rig_id: int, owner: str | None = None) -> int:
        p = self.p
        self._touch(now_x)
        self._update_global(now_x)
        self._require_open_or_preopen()
        r = self._rig(rig_id, owner)
        self._settle_rig(r, now_x)
        if r.cooling_tier >= len(p.cool_cost_bps):
            raise MaxTier()
        cost = r.weight * p.cool_cost_bps[r.cooling_tier] // BPS
        r.cooling_tier += 1
        self._burn(r, cost)
        return cost

    def overclock(self, now_x: int, rig_id: int, owner: str | None = None) -> int:
        p = self.p
        self._touch(now_x)
        self._update_global(now_x)
        if self.phase(now_x) is not Phase.OPEN:
            raise WrongPhase(self.phase(now_x))
        r = self._rig(rig_id, owner)
        self._settle_rig(r, now_x)
        if r.active_oc >= p.max_active_oc:
            raise MaxOverclocks()
        if r.heat + p.heat_per_oc[r.cooling_tier] > p.heat_max:
            raise HeatTooHigh()
        cost = r.weight * p.oc_cost_bps // BPS
        r.heat += p.heat_per_oc[r.cooling_tier]
        r.active_oc += 1
        new_oc = r.base_hash * p.oc_boost_bps * r.active_oc // BPS
        old_oc = r.oc_hash
        if old_oc:
            self.oc_expiring[r.oc_expiry_shift] -= old_oc
        exp = self.shift + p.oc_shift_span
        self.oc_expiring[exp] = self.oc_expiring.get(exp, 0) + new_oc
        self.total_hash += new_oc - old_oc
        r.oc_hash = new_oc
        r.oc_expiry_shift = exp
        self._burn(r, cost)
        return cost

    def _claimable(self, b: int) -> bool:
        return self.close_x != 0 or self.block_found(b)

    def claim(self, now_x: int, rig_id: int, b: int, owner: str | None = None) -> int:
        p = self.p
        self._touch(now_x)
        self._update_global(now_x)
        r = self.rigs[rig_id]
        if owner is not None and r.owner != owner:
            raise NotOwner()
        if not r.inactive:
            self._settle_rig(r, now_x)
        if not self._claimable(b):
            raise NotFound(b)
        if r.claimed_mask & (1 << b):
            raise AlreadyClaimed(b)
        frag = r.earned[b] // WAD
        if self.minted[b] + frag > p.supply(b):
            raise PoolExhausted(b)
        self.minted[b] += frag
        r.earned[b] = 0
        r.claimed[b] += frag
        r.claimed_mask |= 1 << b
        return frag

    def claim_all(self, now_x: int, rig_id: int, owner: str | None = None) -> list[int]:
        out = [0] * self.p.blocks
        for b in range(self.p.blocks):
            r = self.rigs[rig_id]
            if self._claimable(b) and not (r.claimed_mask & (1 << b)):
                out[b] = self.claim(now_x, rig_id, b, owner)
            else:
                self._touch(now_x)
                self._update_global(now_x)
        return out

    def exit(self, now_x: int, rig_id: int, owner: str | None = None) -> tuple[int, int]:
        p = self.p
        self._touch(now_x)
        self._update_global(now_x)
        if self.phase(now_x) is not Phase.OPEN:
            raise WrongPhase(self.phase(now_x))
        r = self._rig(rig_id, owner)
        self._settle_rig(r, now_x)
        self.total_hash -= r.base_hash + r.oc_hash
        if r.oc_hash:
            self.oc_expiring[r.oc_expiry_shift] -= r.oc_hash
        fee = r.amount * p.early_exit_fee_bps // BPS
        returned = r.amount - fee
        self.balance[r.asset] -= r.amount
        self.treasury[r.asset] += fee
        r.fees += fee if r.asset == RIG else fee * p.lp_weight_per_token // WAD
        self.total_weight -= r.weight
        r.inactive = True
        r.exited = True
        r.base_hash = 0
        r.oc_hash = 0
        r.active_oc = 0
        return returned, fee

    def withdraw(self, now_x: int, rig_id: int, owner: str | None = None) -> int:
        self._touch(now_x)
        self._update_global(now_x)
        if self.phase(now_x) is not Phase.CLOSED:
            raise WrongPhase(self.phase(now_x))
        r = self._rig(rig_id, owner)
        self._settle_rig(r, now_x)
        # Spec §6 does not say so, but invariant 2 needs it: withdrawn rigs leave totalHash.
        self.total_hash -= r.base_hash + r.oc_hash
        self.balance[r.asset] -= r.amount
        self.total_weight -= r.weight
        r.inactive = True
        r.base_hash = 0
        r.oc_hash = 0
        r.active_oc = 0
        return r.amount

    def _burn(self, r: Rig, cost: int) -> None:
        r.burned += cost
        self.burned += cost

    # ── views ─────────────────────────────────────────────────────────────
    def rig_hash(self, rig_id: int) -> int:
        r = self.rigs[rig_id]
        if r.inactive:
            return 0
        oc = r.oc_hash if r.oc_hash and not self.shift_end_x.get(r.oc_expiry_shift, 0) else 0
        return r.base_hash + oc

    def rig_view(self, rig_id: int) -> Rig:
        """Rig state as it would be after settling now, without mutating the mine."""
        src = self.rigs[rig_id]
        r = Rig(**{k: (list(v) if isinstance(v, list) else v) for k, v in vars(src).items()})
        if not r.inactive:
            self._settle_rig(r, self.now_x)
        return r

    def pending(self, rig_id: int, b: int) -> int:
        return self.rig_view(rig_id).earned[b] // WAD

    def progress(self) -> dict:
        p = self.p
        b = min(p.block_of(self.shift), p.blocks) if not self.close_x else p.blocks
        if self.close_x and not self.fail_safe:
            rem_block = 0
            rem_season = 0
        else:
            sd = p.shift_difficulty(self.shift) if self.shift < p.total_shifts else 0
            rem_shift = sd - self.work_in_shift
            in_block = self.shift % p.spb
            rem_block = rem_shift + (p.spb - 1 - in_block) * sd
            rem_season = rem_block + sum(p.difficulty[bb] for bb in range(b + 1, p.blocks))
        return {
            "block": b,
            "shift": self.shift,
            "workInShift": self.work_in_shift,
            "shiftDifficulty": p.shift_difficulty(self.shift) if self.shift < p.total_shifts else 0,
            "workRemainingInBlock": rem_block,
            "workRemainingInSeason": rem_season,
            "closeX": self.close_x,
        }

    def remaining_work_by_block(self) -> list[int]:
        """Work still to be done in each block at the current global state (contract units)."""
        p = self.p
        out = [0] * p.blocks
        if self.close_x:
            return out
        cur = p.block_of(self.shift)
        sd = p.shift_difficulty(self.shift)
        in_block = self.shift % p.spb
        out[cur] = (sd - self.work_in_shift) + (p.spb - 1 - in_block) * sd
        for b in range(cur + 1, p.blocks):
            out[b] = p.difficulty[b]
        return out

    def remaining_work_in_shifts(self, n_shifts: int) -> list[tuple[int, int]]:
        """[(block, work)] for the rest of the current shift plus the next n_shifts−1 shifts."""
        p = self.p
        out: list[tuple[int, int]] = []
        if self.close_x:
            return out
        k = self.shift
        out.append((p.block_of(k), p.shift_difficulty(k) - self.work_in_shift))
        for k2 in range(k + 1, min(k + n_shifts, p.total_shifts)):
            out.append((p.block_of(k2), p.shift_difficulty(k2)))
        return out

    def eta(self) -> dict:
        p = self.p
        if self.close_x or self.total_hash == 0:
            return {"toShiftEnd": 0, "toBlockFound": 0, "toClose": 0, "idle": self.total_hash == 0}
        pr = self.progress()
        h = self.total_hash
        return {
            "toShiftEnd": (p.shift_difficulty(self.shift) - self.work_in_shift) * WAD // h // WAD,
            "toBlockFound": pr["workRemainingInBlock"] * WAD // h // WAD,
            "toClose": pr["workRemainingInSeason"] * WAD // h // WAD,
            "idle": False,
        }

    def duration_seconds(self) -> Fraction | None:
        if not self.close_x:
            return None
        return Fraction(self.close_x - self.p.open_x, WAD)


# ── progress-driven time ──────────────────────────────────────────────────


class MineIdle(MineError):
    """Cannot advance by progress: totalHash == 0, so no work will ever accrue."""


def advance_to_progress(
    mine: Mine, shift: int, frac: Fraction | float = 0, *, whole_seconds: bool = False
) -> int:
    """Move the mine forward until global progress is at (shift, frac × shiftDifficulty).

    Returns the X-time reached. With ``whole_seconds`` the timestamps are rounded up to the next
    whole second (what a real chain would do); otherwise exact X-time is used, which makes replays
    at different paces land on identical progress points. Raises `MineIdle` if the mine has no hash
    and cannot reach the target; returns early if the season closes first.
    """
    p = mine.p
    frac = Fraction(frac)
    if not (0 <= frac <= 1):
        raise ValueError("frac must be in [0, 1]")
    target_work = p.shift_difficulty(min(shift, p.total_shifts - 1)) * frac
    if shift >= p.total_shifts:
        shift, target_work = p.total_shifts - 1, Fraction(p.shift_difficulty(p.total_shifts - 1))
    if mine.close_x:
        return mine.now_x
    if mine.now_x < p.open_x:
        mine.poke(p.open_x)

    def bump(now_x: int) -> int:
        if whole_seconds:
            now_x = -(-now_x // WAD) * WAD
        mine.poke(max(now_x, mine.now_x))
        return mine.now_x

    while not mine.close_x:
        if mine.total_hash == 0:
            raise MineIdle(f"idle at shift {mine.shift}")
        if mine.shift > shift or (mine.shift == shift and mine.work_in_shift >= target_work):
            return mine.now_x
        remaining = p.shift_difficulty(mine.shift) - mine.work_in_shift
        if mine.shift < shift or target_work >= p.shift_difficulty(mine.shift):
            span = remaining * WAD // mine.total_hash
            bump(mine.last_x + span)
        else:
            need = target_work - mine.work_in_shift
            d_x = -(-int(need * WAD) // mine.total_hash) if need > 0 else 0
            d_x = max(d_x, -(-WAD // mine.total_hash))  # always make progress
            bump(mine.last_x + d_x)
    return mine.now_x
