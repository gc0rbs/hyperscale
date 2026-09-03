"""Stock Miner simulation package.

* `sim.mine`    – pure-Python reference implementation of SeasonMine accounting (docs/05 §5)
* `sim.replay`  – `python -m sim.replay trace.json`: differential-testing oracle for the contracts
* `sim.agents`  – strategy agents (passive, gpu_maxer, cooling_oc, finale_oc, lp_staker, ...)
* `sim.run`     – `python -m sim.run --params ...`: Monte-Carlo scenario runner
* `sim.sizing`  – `python -m sim.sizing --params ...`: difficulty sizing + duration distribution
* `sim.value`   – valuation helpers and analytic break-even ratios
"""

__version__ = "0.1.0"
