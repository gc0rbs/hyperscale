# Hashrate and rewards

## Hashrate

```
gpuMult(tier) = 1 + 0.20 × tier            tier 0 to 5  →  1.0× to 2.0×
baseHash      = stake × gpuMult(gpuTier)
ocHash        = baseHash × 0.50 × activeOverclocks   0 to 3  →  +0% to +150%
hashrate      = baseHash + ocHash          at most 5.0 × stake
```

A rig staked with 1,000 RIG at GPU tier 3 with two overclocks running has `1,000 × 1.6 = 1,600` base hash and `1,600 × 1.0 = 1,600` overclock hash, so 3,200 hashrate.

## Work and pay

```
work   = hashrate × seconds                            hash-seconds
rate_b = pool_b ÷ difficulty_b                         fragments per hash-second, fixed per block
earned = hashrate × seconds × rate_b                   yours alone
```

Each block's rate is fixed when the season is created and is the same for every rig. The app shows `rate × your hashrate` as **fragments per second**, and that number does not move when someone else joins. What moves is the ETA.

When a block is found, the total work in it equals its difficulty exactly, so the total paid equals the pool exactly (minus rounding dust of at most about one fragment per rig, which is swept at the end).

## Fragments

* One Stock Token = **1,000,000 fragments**.
* Fragments are whole units. The contract keeps extra precision internally and rounds down when you claim.
* Fragments are **non-transferable**. They can only be claimed by the rig's owner and burned by the vault when redeemed.

## Your share

Your share of a block is your work in that block divided by the block's difficulty. The mine page shows your share of the *current* total hash, which is your share of the work being done right now. Both are informational; your pay is computed from your own work, not from a share.

## What does not pay

* **Time.** A rig with zero hashrate earns nothing however long it sits. Nothing accrues by the clock alone.
* **Pre-open.** No work is done before `openTime`.
* **After close.** Rigs stop at the instant of close. Overclocks bought in the final shift simply run until then.
* **During a pause.** Actually, this one does pay: a pause blocks player actions but does not stop the clock, so work keeps accruing at the same rate for everyone. See [Pause and cancellation](../safety/pause-and-cancellation.md).
