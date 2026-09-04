# Pause and cancellation

## Pause

The treasury address can pause a season. The runbook restricts pausing to a suspected accounting bug or a Stock Token or oracle incident that would make claims or redemptions wrong, but nothing enforces that on chain, so assume a pause can happen for any reason.

While paused:

* you cannot activate, upgrade, overclock, claim, exit or redeem,
* the clock keeps running: every rig keeps earning at its current hashrate, so a pause never changes the size or distribution of rewards,
* overclocks keep running and expire at their shift as usual.

The app shows a paused banner with the grace deadline.

## Grace period and emergency withdraw

A pause has a grace period, **30 minutes** by default. After it, any player may call `emergencyWithdraw`:

* it returns the rig's **full deposit**, no fee,
* if the season was still open, the first such call **cancels the season** for everyone.

The guardian can unpause before the grace period ends and the season continues as if nothing happened. It cannot unpause after a cancellation.

## What cancellation means

| Item | Outcome |
| --- | --- |
| Stakes | Every player recovers their full deposit with `emergencyWithdraw` |
| Fragments already claimed | Stay in your wallet, redeemable from the vault |
| Fragments not yet claimed | **Forfeited** |
| Burned $RIG | Stays burned |
| The pool and the USDG reserve | Sweepable to the treasury immediately |

A season that has already closed cannot be cancelled. If a pause after close outlives the grace period, `emergencyWithdraw` still returns deposits and your fragments stay claimable after an unpause.

{% hint style="warning" %}
Because unclaimed fragments are forfeited on cancellation, claim as blocks are found. It costs one transaction per block and removes the only way a pause can cost you earned rewards.
{% endhint %}

## Why the design is like this

The mine needs an emergency stop, because a bug in a contract holding player money is worse than a paused game. But an emergency stop must not become a way to hold stakes hostage, so the grace period puts the exit in the players' hands. And a season whose accounting is in doubt should not keep minting fragments, which is why cancellation forfeits the unclaimed ones instead of trusting the numbers. The trade-off is disclosed here and in the terms.
