"""Pace replay: the same progress-expressed action sequence at three total-hash levels (and three
difficulty scales) yields identical final fragment distributions within the documented dust.

Pace is varied two ways: scaling difficulty (same rigs, 0.25× / 1× / 21× the work), and scaling all
stakes together (¼×, 1×, 4× hash at the same difficulty). Both change duration only.
"""

from __future__ import annotations

from fractions import Fraction

import pytest

from sim.mine import LP, RIG, WAD, ContractParams, Mine, advance_to_progress

RIG_T = 10**18
BASE_DIFF = [172_800_000_000, 216_000_000_000, 216_000_000_000, 259_200_000_000]

# (shift, frac, actor, action) – actor -1 = everybody; fractions are of the shift's difficulty
SCRIPT = [
    (0, 0, "bo", "oc3"),
    (1, Fraction(1, 2), "dee", "join"),
    (2, 0, "bo", "oc3"),
    (3, Fraction(1, 3), "cy", "gpu"),
    (4, 0, "bo", "oc3"),
    (5, Fraction(3, 4), "ann", "oc1"),
    (6, 0, "bo", "oc3"),
    (8, 0, "bo", "oc3"),
    (9, Fraction(1, 5), "cy", "exit"),
    (10, 0, "bo", "oc3"),
    (12, Fraction(1, 7), "ann", "gpu"),
    (13, 0, "bo", "oc3"),
    (16, 0, "bo", "oc3"),
    (18, 0, "bo", "oc3"),
    (20, Fraction(999, 1000), "bo", "oc3"),
    (24, 0, "dee", "oc2"),
    (24, 0, "bo", "oc3"),
    (26, 0, "dee", "oc2"),
    (26, 0, "bo", "oc3"),
    (28, 0, "bo", "oc3"),
    (30, 0, "bo", "oc3"),
    (31, Fraction(9, 10), "ann", "oc1"),
]


def play(default_json, diff_scale: int, stake_scale: Fraction, whole_seconds: bool):
    diff = [int(d * diff_scale) for d in BASE_DIFF]
    cp = ContractParams.from_json(
        default_json, open_time=10_000, difficulty=diff, max_duration=10**9
    )
    m = Mine(cp)
    s = stake_scale
    t0 = Mine.sec(cp.open_time - 100)
    ids = {
        "ann": m.activate(t0, "ann", RIG, int(5_000_000 * RIG_T * s)),
        "bo": m.activate(t0, "bo", LP, int(2_000_000 * RIG_T * s)),
        "cy": m.activate(t0, "cy", RIG, int(2_500_000 * RIG_T * s)),
    }
    m.upgrade_gpu(t0, ids["ann"])
    m.upgrade_gpu(t0, ids["ann"])
    for _ in range(3):
        m.upgrade_gpu(t0, ids["bo"])
        m.upgrade_cooling(t0, ids["bo"])
    for shift, frac, actor, action in SCRIPT:
        advance_to_progress(m, shift, frac, whole_seconds=whole_seconds)
        if m.close_x:
            break
        now = m.now_x
        if action == "join":
            ids[actor] = m.activate(now, actor, RIG, int(1_000_000 * RIG_T * s))
            m.upgrade_gpu(now, ids[actor])
            m.upgrade_cooling(now, ids[actor])
        elif action == "gpu":
            m.upgrade_gpu(now, ids[actor])
        elif action == "exit":
            m.exit(now, ids[actor])
        elif action.startswith("oc"):
            for _ in range(int(action[2:])):
                m.overclock(now, ids[actor])
    advance_to_progress(m, 32, 0, whole_seconds=whole_seconds)
    assert m.close_x and not m.fail_safe
    frags = {name: [m.rig_view(i).earned[b] // WAD for b in range(4)] for name, i in ids.items()}
    return m, frags


@pytest.mark.parametrize(
    "diff_scale,stake_scale", [(1, 1), (21, 1), (1, Fraction(1, 4)), (1, 4), (Fraction(1, 4), 1)]
)
def test_pace_replay_exact_progress(default_json, diff_scale, stake_scale):
    _, ref_frags = play(default_json, 1, Fraction(1), False)
    m, frags = play(default_json, diff_scale, stake_scale, False)
    expected = Fraction(86400 * diff_scale) / stake_scale  # ∝ D / hash
    dur = m.duration_seconds()
    assert 0.3 < dur / expected < 3  # sanity: pace changed by the factor we asked for
    for name in ref_frags:
        for b in range(4):
            # documented dust: boundary floors 1e-18 s early, claims floor to whole fragments
            assert abs(frags[name][b] - ref_frags[name][b]) <= 1, (name, b, frags, ref_frags)
    for b in range(4):
        assert sum(f[b] for f in frags.values()) <= m.p.supply(b)


def test_pace_replay_whole_seconds_deviation_is_bounded(default_json):
    """With whole-second timestamps the same script drifts by ≤ 1 s per action: at 6 h it is a few
    hundred fragments on a 5M pool, at 3 weeks it is under a fragment. Documented in SIM-REPORT."""
    _, ref = play(default_json, 1, Fraction(1), False)
    for scale, tol in ((Fraction(1, 4), 4_000), (1, 1_000), (21, 60)):
        _, got = play(default_json, scale, Fraction(1), True)
        for name in ref:
            for b in range(4):
                assert abs(got[name][b] - ref[name][b]) <= tol, (scale, name, b, got, ref)
