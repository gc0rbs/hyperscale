"""docs/03-GAME-DESIGN.md §7 worked example, reproduced to the fragment.

The doc rounds to the nearest fragment (Ann 1,794,872); the contract floors (`earned / 1e18`), so
the exact values are Ann 1,794,871, Bo 2,564,102, Cy 641,025 (= floor(5,000,000 × H / 19.5M)).
"""

from fractions import Fraction

from sim.mine import LP, RIG, WAD, ContractParams, Mine, advance_to_progress

RIG_T = 10**18


def build_example(default_json, *, whole_seconds: bool):
    cp = ContractParams.from_json(default_json, open_time=1_000_000)
    m = Mine(cp)
    t0 = Mine.sec(cp.open_time - 3600)
    ann = m.activate(t0, "ann", RIG, 5_000_000 * RIG_T)
    m.upgrade_gpu(t0, ann)
    m.upgrade_gpu(t0, ann)
    bo = m.activate(t0, "bo", LP, 2_000_000 * RIG_T)  # ×1.25 → W = 2.5M
    for _ in range(3):
        m.upgrade_gpu(t0, bo)
    for _ in range(3):
        m.upgrade_cooling(t0, bo)
    cy = m.activate(t0, "cy", RIG, 2_500_000 * RIG_T)
    # Bo keeps 3 overclocks running for all of block 1: buys at the start of shifts 0,2,4,6.
    for k in range(0, 8, 2):
        advance_to_progress(m, k, 0, whole_seconds=whole_seconds)
        for _ in range(3):
            m.overclock(m.now_x, bo)
    advance_to_progress(m, 8, 0, whole_seconds=whole_seconds)  # block 1 found
    return m, (ann, bo, cy)


def test_worked_example_exact(default_json):
    m, (ann, bo, cy) = build_example(default_json, whole_seconds=False)
    assert m.block_found(0)
    assert m.rigs[bo].weight == 2_500_000 * RIG_T
    assert m.rigs[ann].base_hash == 7_000_000 * RIG_T
    assert m.rig_view(bo).heat == 0 or m.rig_view(bo).heat <= 45
    # block 1 duration 1.728e11 / 19.5e6 s, exact up to the documented 1e-18 s dust per shift
    dur = Fraction(m.block_end_x(0) - m.p.open_x, WAD)
    assert abs(dur - Fraction(172_800_000_000, 19_500_000)) < Fraction(8, WAD)
    assert abs(float(dur) - 8861.5) < 0.1
    frags = [m.pending(r, 0) for r in (ann, bo, cy)]
    assert frags == [1_794_871, 2_564_102, 641_025]
    assert sum(frags) <= m.p.supply(0) == 5_000_000
    # claim mints exactly those amounts
    assert m.claim(m.now_x, ann, 0) == 1_794_871
    assert m.claim(m.now_x, bo, 0) == 2_564_102
    assert m.claim(m.now_x, cy, 0) == 641_025
    assert m.minted[0] == 4_999_998
    # burn per doc: Ann 500k; Bo 475k (gpu) + 400k (cool) + 12 × 50k
    assert m.rigs[ann].burned == 500_000 * RIG_T
    assert m.rigs[bo].burned == (475_000 + 400_000 + 600_000) * RIG_T
    assert m.rigs[cy].burned == 0


def test_worked_example_whole_seconds_is_within_one_second_of_dust(default_json):
    """On chain timestamps are whole seconds: Bo's re-buys land ≤ 1 s after each boundary, so he
    loses a sliver and the block runs a sliver longer, which pays Ann and Cy a sliver more."""
    m, (ann, bo, cy) = build_example(default_json, whole_seconds=True)
    frags = [m.pending(r, 0) for r in (ann, bo, cy)]
    assert frags[0] >= 1_794_871 and frags[0] <= 1_794_871 + 3 * 203  # ≤ 3 s × 202.6 frag/s
    assert frags[1] <= 2_564_102 and frags[1] >= 2_564_102 - 4 * 290
    assert frags[2] >= 641_025
    assert sum(frags) <= 5_000_000


def test_fragments_per_second_ui_number(default_json):
    """Ann sees r_1 × H = 202.6 fragments/s regardless of what Bo does."""
    cp = ContractParams.from_json(default_json)
    rate = cp.pool_fragwei(0) * WAD // cp.difficulty[0]
    per_sec = Fraction(7_000_000 * RIG_T * rate, WAD * WAD)
    assert abs(float(per_sec) - 202.6) < 0.1  # doc rounds 202.546
