# Season parameters

Every parameter below is fixed when a season is created and readable from the mine contract with `params()`. The values are the defaults; a season may set different ones, and the app shows the live values. Seasons cannot change them afterwards.

## Structure

| Parameter | Default | Meaning |
| --- | --- | --- |
| `blocks` | 4 | Reward blocks |
| `shiftsPerBlock` | 8 | Shifts per block, so 32 per season |
| `openTime` | at or after creation | When work starts. No minimum pre-open |
| `maxDurationSeconds` | 21,600 (6 h) | The cap: 2× the planned pace, at least 1 hour |
| Planned pace | 10,800 s (3 h) at 10,000,000 hash | Communication only; sets the difficulty |
| Difficulty shares | 20 / 25 / 25 / 30 % | Work per block as a share of the total |

## Stocks and pools

| Block | Stock | Value share | Address on chain 4663 |
| --- | --- | --- | --- |
| 1 | NVDA (NVIDIA) | 15% | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` |
| 2 | MU (Micron Technology) | 20% | `0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD` |
| 3 | SNDK (Sandisk) | 25% | `0xB90A19fF0Af67f7779afF50A882A9CfF42446400` |
| 4 | QQQ (Invesco QQQ) | 40% | `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68` |

Pool amounts in tokens are sized per season from the value shares at market prices and shown in the app. One token is 1,000,000 fragments (`fragPerToken`).

## Stakes and fees

| Parameter | Default | Meaning |
| --- | --- | --- |
| `minStakeWeight` | 100 RIG | Minimum stake per rig |
| `activationFeeBps` | 100 (1%) | Of stake weight, charged on top, to the treasury |
| `earlyExitFeeBps` | 300 (3%) | Of the deposit, on exit, to the treasury |
| `cashOutFeeBps` | 100 (1%) | Of the USDG value, on cash-out, to the treasury |
| `usdcReserveShareBps` | 5,000 (50%) | USDG reserve as a share of pool value at funding |
| LP staking | off | Present in the contracts, disabled for this version |

## Upgrades

| Parameter | Default |
| --- | --- |
| `gpuMultBps` | 1.0× 1.2× 1.4× 1.6× 1.8× 2.0× |
| `gpuCostBps` | 4% 6% 9% 13% 18% (of stake, per tier) |
| `coolCostBps` | 3% 5% 8% (of stake, per tier) |
| `heatPerOc` | 40 30 22 15 (by cooling tier) |
| `coolPerShift` | 10 18 26 36 (by cooling tier) |
| `heatMax` | 100 |
| `ocCostBps` | 2% of stake per overclock |
| `ocBoostBps` | +50% of base hash per overclock |
| `maxActiveOc` | 3 |
| `ocShiftSpan` | 1 (expires at the end of the next shift) |

## Close and redemption

| Parameter | Default | Meaning |
| --- | --- | --- |
| `redemptionDays` | 30 | Window after close for redeem and cash-out |
| `pauseGraceSeconds` | 1,800 (30 min) | After this, a pause lets players emergency-withdraw |
| Oracle staleness | 26 hours | Maximum age of a Chainlink price for cash-out |
| `transfersEnabled` | false | Fragments are non-transferable |
