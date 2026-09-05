# Exiting and withdrawing

## Withdraw: after close

When the season closes, `withdraw` returns each rig's **full stake**. There is no fee and no deadline; the mine holds nothing but deposits after close and cannot be reopened. The app lists every rig with a Withdraw button on the closed screen.

## Exit: leaving early

A season has no fixed end, so you can always leave. `exit` while the mine is open:

* stops the rig immediately,
* returns the deposit minus the early-exit fee (default **3%**, to the treasury),
* keeps every fragment the rig earned so far claimable,
* forfeits the rig's upgrades. They were burned when bought and stay burned.

A rig that has exited cannot be restarted. Open a new rig if you come back.

## Emergency withdraw

`emergencyWithdraw` exists for one situation: a pause that has outlived its grace period. It returns your full deposit with no fee. If the season was still open, it also cancels the season for everyone. It is not a way to leave a healthy season without the exit fee. See [Pause and cancellation](../safety/pause-and-cancellation.md).

## Summary

| Action | When | Stake returned | Fragments | Upgrades |
| --- | --- | --- | --- | --- |
| Withdraw | after close | 100% | kept | irrelevant, season over |
| Exit | while open | 97% (default) | kept, claimable | lost |
| Emergency withdraw | pause past grace | 100% | kept if already claimed; unclaimed forfeited if the season cancels | lost |
