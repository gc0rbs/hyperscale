> **Legacy.** This page describes the season contracts used on 2026-09-05. Since 2026-09-08 the mine is continuous with hourly rounds; see [Rounds](rounds.md). This page stays for the redemption tail of those seasons.

# Seasons, blocks and shifts

## Phases

| Phase | Starts | Ends | What you can do |
| --- | --- | --- | --- |
| Funding | deployment | the operator funds the vault | Nothing yet. A season cannot open unfunded |
| Pre-open | funded | `openTime` | Activate rigs, buy GPU and cooling tiers. No work, no overclocks |
| Open, block 1 | `openTime` | block 1 found | Everything. Mines NVDA |
| Open, block 2 | block 1 found | block 2 found | Block 1 claimable. Mines MU |
| Open, block 3 | block 2 found | block 3 found | Blocks 1 to 2 claimable. Mines SNDK |
| Open, block 4 | block 3 found | block 4 found, which is **close** | Blocks 1 to 3 claimable. Mines QQQ |
| Closed, redemption | close | close + 30 days | Withdraw stakes, claim block 4, redeem, cash out |
| Swept | close + 30 days | | Unclaimed assets go to the treasury |

Everything about a season is fixed the moment it is created and visible in the app from then on: the stocks, the pool sizes, the difficulty of each block, the open time and the cap. Nothing is adjusted while it runs.

## Blocks are found by work

Each block needs a fixed amount of **work**, measured in hash-seconds. Every active rig adds its hashrate to the total every second. When the accumulated work reaches the block's difficulty, the block is found on the exact second it happened, even if the transaction that records it comes later. The block's pool is now claimable and the next block starts.

The default sizing plans for a **three-hour** season at ten million total hash. With twice that hashrate the season takes about ninety minutes. With half, six hours, which is where the cap sits.

## Shifts

Each block is divided into **8 shifts** of equal work, so a season is 32 shifts. Shifts are the heartbeat of the game:

* overclocks expire at the end of the next shift after you bought them,
* heat drops by your cooling tier's amount at every shift end.

Because shifts are progress-based, a shift takes longer when the mine is quiet and shorter when it is busy. The app shows the estimated time to the next shift so you know when to come back.

## The ETA

Every time estimate in the app is `remaining work ÷ current total hash`. It is exact if nobody joins, leaves or overclocks, and it moves the moment they do. The app labels every duration as an estimate for that reason.

## The cap

A season also has a hard cap on wall-clock length, default **six hours** from open, twice the planned pace. If block 4 has not been found by then, the season closes anyway. Fragments earned so far are claimable, the block that was running pays out what was mined, and the unmined part of the pool rolls into a later season. Nothing you earn ever depends on the cap. See [The cap](../safety/the-cap.md).

## What happens at close

The instant block 4 is found or the cap is reached:

* staking, upgrades and overclocks stop forever,
* every rig stops earning,
* `withdraw` opens and returns each rig's full stake,
* the 30-day redemption window starts.

Nothing in the season can be reopened or extended.
