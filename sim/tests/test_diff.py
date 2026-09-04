"""The differential oracle agrees with a committed sample of contract traces.

The sample was written by `contracts/test/differential/DiffTrace.t.sol` (24 fuzz runs across the eight
season profiles). Regenerate with `DIFF_OUT=diff/x.jsonl forge test --match-contract DiffTrace` and
copy a slice here whenever the contract or the reference changes behaviour.
"""

from pathlib import Path

from sim.diff import DEFAULT_PARAMS, run

FIXTURE = Path(__file__).parent / "fixtures" / "diff-traces-sample.jsonl"


def test_sample_traces_match():
    assert run(FIXTURE, DEFAULT_PARAMS, quiet=True) == 0
