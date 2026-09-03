"""Hypothesis stateful tests for the nine invariants in docs/05 §5.3 (random actions + time warps).

Difficulty is scaled down so a random sequence crosses many shift boundaries (often the whole
season, sometimes the fail-safe). Every rule is followed by every invariant.
"""

from __future__ import annotations

import copy
from fractions import Fraction
from itertools import pairwise
from pathlib import Path

from hypothesis import settings
from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, invariant, rule

from sim.mine import LP, RIG, WAD, ContractParams, Mine, MineError, advance_to_progress
from sim.params import load_params

DEFAULT = Path(__file__).resolve().parents[2] / "specs" / "params" / "season-default.json"
JSON = load_params(DEFAULT)
OPEN = 1_000
# whole hash-seconds: ~2,000 RIG of hash for ~800 s of season → shifts are ~25 s at that hash
SMALL_DIFF = [d * 8 for d in (400_000, 500_000, 500_000, 600_000)]
OWNERS = ["a", "b", "c"]


def make_mine(max_duration: int = 100_000) -> Mine:
    cp = ContractParams.from_json(
        JSON, open_time=OPEN, difficulty=SMALL_DIFF, max_duration=max_duration
    )
    return Mine(cp)


class MineMachine(RuleBasedStateMachine):
    def __init__(self):
        super().__init__()
        self.m = make_mine()
        self.t = 0  # seconds
        self.deposits = {RIG: 0, LP: 0}
        self.max_hash_seen = 0
        self.frozen_earned: dict[int, list[int]] | None = None

    # ── helpers ───────────────────────────────────────────────────────────
    @property
    def now_x(self) -> int:
        return self.t * WAD

    def _try(self, fn, *args):
        before = copy.deepcopy(self.m)
        try:
            return fn(self.now_x, *args)
        except MineError:
            # a revert leaves state untouched (except the global poke, which the contract also
            # keeps only if the tx succeeds; we re-apply the poke for monotone time)
            self.m = before
            self.m.poke(self.now_x)
            return None

    # ── rules ─────────────────────────────────────────────────────────────
    @rule(dt=st.integers(0, 60))
    def warp_small(self, dt):
        self.t += dt
        self.m.poke(self.now_x)

    @rule(dt=st.sampled_from([0, 1, 7, 30, 100, 400, 2_000, 20_000, 200_000]))
    def warp(self, dt):
        self.t += dt
        self.m.poke(self.now_x)

    @rule(owner=st.sampled_from(OWNERS), lp=st.booleans(), amount=st.integers(100, 3_000))
    def activate(self, owner, lp, amount):
        asset = LP if lp else RIG
        amt = amount * WAD
        rid = self._try(self.m.activate, owner, asset, amt)
        if rid is not None:
            self.deposits[asset] += amt

    @rule(rid=st.integers(0, 40))
    def gpu(self, rid):
        if rid < len(self.m.rigs):
            self._try(self.m.upgrade_gpu, rid)

    @rule(rid=st.integers(0, 40))
    def cooling(self, rid):
        if rid < len(self.m.rigs):
            self._try(self.m.upgrade_cooling, rid)

    @rule(rid=st.integers(0, 40), n=st.integers(1, 3))
    def overclock(self, rid, n):
        if rid < len(self.m.rigs):
            for _ in range(n):
                self._try(self.m.overclock, rid)

    @rule(rid=st.integers(0, 40), b=st.integers(0, 3))
    def claim(self, rid, b):
        if rid < len(self.m.rigs):
            self._try(self.m.claim, rid, b)

    @rule(rid=st.integers(0, 40))
    def claim_all(self, rid):
        if rid < len(self.m.rigs):
            self._try(self.m.claim_all, rid)

    @rule(rid=st.integers(0, 40))
    def exit(self, rid):
        if rid < len(self.m.rigs):
            r = self.m.rigs[rid]
            res = self._try(self.m.exit, rid)
            if res is not None:
                self.deposits[r.asset] -= r.amount

    @rule(rid=st.integers(0, 40))
    def withdraw(self, rid):
        if rid < len(self.m.rigs):
            r = self.m.rigs[rid]
            res = self._try(self.m.withdraw, rid)
            if res is not None:
                self.deposits[r.asset] -= r.amount

    @rule(rid=st.integers(0, 40))
    def settle_only(self, rid):
        if rid < len(self.m.rigs):
            self.m.settle(self.now_x, rid)

    @rule(frac=st.sampled_from([0, 0.25, 0.5, 0.999, 1]))
    def advance_to_next_shift_fraction(self, frac):
        m = self.m
        if m.close_x or m.total_hash == 0:
            return
        target = m.shift if frac > 0 and m.work_in_shift < m.p.shift_difficulty(m.shift) * frac \
            else m.shift + 1
        try:
            advance_to_progress(m, target, frac if target == m.shift else 0, whole_seconds=True)
        except MineError:
            return
        self.t = max(self.t, -(-m.now_x // WAD))
        self.m.poke(self.now_x)

    # ── invariants ────────────────────────────────────────────────────────
    def _views(self):
        return [self.m.rig_view(i) for i in range(len(self.m.rigs))]

    @invariant()
    def inv1_minted_le_pool(self):
        m = self.m
        views = self._views()
        for b in range(m.p.blocks):
            tot = sum(v.earned[b] + v.claimed[b] * WAD for v in views)
            assert tot <= m.p.pool_fragwei(b), f"block {b}: {tot} > pool"
            assert m.minted[b] <= m.p.supply(b)
            assert m.minted[b] == sum(v.claimed[b] for v in views)

    @invariant()
    def inv2_total_hash(self):
        m = self.m
        expect = sum(m.rig_hash(i) for i in range(len(m.rigs)))
        assert m.total_hash == expect, (m.total_hash, expect)
        self.max_hash_seen = max(self.max_hash_seen, m.total_hash)

    @invariant()
    def inv3_oc_expiring(self):
        m = self.m
        pending = sum(v for k, v in m.oc_expiring.items() if k >= m.shift)
        live = sum(
            r.oc_hash
            for r in m.rigs
            if not r.inactive and r.oc_hash and not m.shift_end_x.get(r.oc_expiry_shift, 0)
        )
        assert pending == live, (pending, live)
        assert all(v >= 0 for v in m.oc_expiring.values())

    @invariant()
    def inv5_block_work(self):
        m = self.m
        views = self._views()
        for b in range(m.p.blocks):
            if not m.block_found(b):
                continue
            tot = sum(v.work[b] for v in views)
            # dust: each floored segment loses < 1 unit; each shift boundary < totalHash/1e18
            slack = (m.p.spb + 1) * (self.max_hash_seen // WAD + 1) + 4 * sum(
                v.settlements for v in views
            ) + len(views) * 8
            assert m.p.difficulty[b] - slack <= tot <= m.p.difficulty[b] + slack, (
                b,
                tot,
                m.p.difficulty[b],
            )

    @invariant()
    def inv6_boundaries_monotone(self):
        m = self.m
        ks = sorted(m.shift_end_x)
        assert ks == list(range(len(ks)))
        xs = [m.shift_end_x[k] for k in ks]
        assert all(a <= b for a, b in pairwise(xs))
        assert all(x >= m.p.open_x for x in xs)
        if m.close_x and not m.fail_safe:
            assert m.close_x == xs[-1] and len(xs) == m.p.total_shifts
        if m.fail_safe:
            assert m.close_x == m.p.deadline_x and len(xs) < m.p.total_shifts

    @invariant()
    def inv7_heat_and_oc_bounds(self):
        for v in self._views():
            assert 0 <= v.heat <= self.m.p.heat_max
            assert 0 <= v.active_oc <= self.m.p.max_active_oc
        for r in self.m.rigs:
            assert 0 <= r.heat <= self.m.p.heat_max
            assert 0 <= r.active_oc <= self.m.p.max_active_oc

    @invariant()
    def inv8_balances(self):
        m = self.m
        for asset in (RIG, LP):
            assert m.balance[asset] == self.deposits[asset]
            assert m.balance[asset] == sum(
                r.amount for r in m.rigs if not r.inactive and r.asset == asset
            )

    @invariant()
    def inv9_frozen_after_close(self):
        m = self.m
        if not m.close_x:
            return
        cur = {
            i: [v.earned[b] // WAD + v.claimed[b] for b in range(4)]
            for i, v in enumerate(self._views())
        }
        if self.frozen_earned is None:
            self.frozen_earned = cur
        else:
            for i, e in self.frozen_earned.items():
                assert cur[i] == e, f"rig {i} earned changed after close"
            self.frozen_earned = cur


TestMineInvariants = MineMachine.TestCase
TestMineInvariants.settings = settings(
    max_examples=150, stateful_step_count=60, deadline=None, print_blob=True
)


def test_inv4_settlement_frequency_independence():
    """A rig's earned[b] does not depend on when or how often it settles (up to 1 wei per settle)."""
    from sim.mine import advance_to_progress as adv

    def play(extra_settles: bool):
        m = make_mine()
        t0 = (OPEN - 10) * WAD
        a = m.activate(t0, "a", RIG, 1_000 * WAD)
        b = m.activate(t0, "b", LP, 800 * WAD)
        m.upgrade_gpu(t0, a)
        m.upgrade_cooling(t0, b)
        for k in range(0, 32, 3):
            adv(m, k, 0.3, whole_seconds=True)
            m.overclock(m.now_x, b)
            if k == 15:
                m.upgrade_gpu(m.now_x, b)
            if extra_settles:
                m.settle(m.now_x, a)
                for j in range(1, 6):
                    adv(m, k + 1, Fraction(j, 7), whole_seconds=True)
                    m.settle(m.now_x, a)
                    m.settle(m.now_x, b)
        adv(m, 32, 0, whole_seconds=True)
        return [m.rig_view(i).earned for i in (a, b)], m

    lo, m1 = play(False)
    hi, m2 = play(True)
    assert m1.close_x == m2.close_x
    for e1, e2 in zip(lo, hi, strict=True):
        for x, y in zip(e1, e2, strict=True):
            assert abs(x - y) <= 64  # wei of a fragment; whole fragments identical
            assert x // WAD == y // WAD
