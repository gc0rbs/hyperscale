# Immutable contracts and the one admin power

## No upgrades, no knobs

Every season is a fresh deployment of three contracts from a factory: the mine, the fragments token and the redemption vault. None of them is behind a proxy. There are no setter functions. The parameters you see at creation (stocks, pools, difficulty, fees, cap, grace period) are the parameters for the life of that season. The factory validates them once and never touches the season again.

This is deliberate. A game where the operator can adjust difficulty mid-season is a game where the operator can decide who wins. So difficulty is never adjusted, even when a season is clearly mis-sized. A badly sized season ends at the cap and the operator sizes the next one better.

## Who can do what

| Actor | Can | Cannot |
| --- | --- | --- |
| Player | Activate, upgrade, overclock, claim, exit, withdraw after close, emergency-withdraw after an over-long pause, redeem or cash out fragments | Touch anyone else's rig; claim more than a block's pool |
| Anyone | `poke` (advance the mine's bookkeeping); `sweep` after the redemption window or a cancellation | Alter accounting. `poke` is a pure catch-up; every boundary is computed retroactively and exactly by any transaction |
| Treasury (the guardian) | `pause` while the mine is open, `unpause`; receives fees and sweeps | Pause a closed mine, block claims or withdrawals after close, set parameters, mint, move stakes, cancel a season directly, withdraw the pool |
| Operator | Fund the vault, once | Withdraw the pool or the reserve |
| Factory | Deploy seasons with validated parameters | Touch a deployed season |

## The one real power: pause

Pause blocks every player action: activate, upgrade, overclock, claim, exit, redeem. It does **not** stop the clock: work keeps accruing for every rig at the same rate, so a pause cannot alter anyone's rewards. If a pause lasts longer than the grace period (30 minutes by default), any player may call `emergencyWithdraw`, which returns their full deposit and, if the season was still open, cancels it. That is the limit of what a pause can do to you: it can end a season early. It cannot take your stake. See [Pause and cancellation](pause-and-cancellation.md).

## Verifying a season yourself

The season's parameters are published as a JSON file whose hash is recorded in the deployment. Anyone can recompute the hash and read the parameters from the mine contract with `params()` on the explorer. The [Contracts and addresses](../reference/contracts-and-addresses.md) page lists what to check.
