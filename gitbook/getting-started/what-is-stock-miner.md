# What is Hyperscaler?

Hyperscaler is one permanent game with **hourly rounds**. Every round has a pot of four Robinhood Stock Tokens, filled by the trading fees on $VRAM while the round runs. Players point throughput at the game by staking $VRAM on a virtual GPU. When the round closes, the pot is split by the share of that hour's work each GPU did.

## The loop

1. **Stake $VRAM to activate a GPU.** Your stake is your GPU's weight and comes back when you decommission it (minus a 3% exit fee).
2. **Your GPU works every second** it is active. Work is throughput multiplied by seconds.
3. **Every hour the pot is split by work.** If you did 3% of the hour's work, you get 3% of that hour's pot, in each of the four stocks. Your share is relative: more throughput from others means a smaller share of the same pot.
4. **Burn $VRAM on upgrades** to raise your throughput: permanent GPU tiers, permanent cooling tiers, and short overclock bursts.
5. **Claim** within fifteen minutes of the close. One click claims every GPU you own. Unclaimed shards roll into the next pot for everyone.
6. **Redeem** shards for the Stock Token itself, or for USDG at the Chainlink price, at any time.

## What "virtual compute" means

Nothing is computed on your device. Your browser does no work and can be closed. Throughput is a number the contract computes from your stake and upgrades, and the contract credits work by the chain's clock. It is a staking programme whose payout is a share of a fee-funded pot, split by work every hour, and which lets you buy a bigger share of that work by burning $VRAM.

## What other players change, and what they do not

| Changes with other players | Never changes |
| --- | --- |
| Your share of each round's pot (their work dilutes yours) | The length of a round (one hour) and the claim window (fifteen minutes) |
| Your position on the leaderboard | The fact that the whole pot is paid out: to claimants now, or to the next round |
| How much $VRAM changes hands, and so how big the pot is | The fraction of the game an upgrade covers |

## The four rewards

| Stock | What it is | Default share of the fees |
| --- | --- | --- |
| NVDA | NVIDIA · GPUs | 15% |
| MU | Micron · memory | 20% |
| SNDK | Sandisk · storage | 25% |
| QQQ | Nasdaq-100 ETF · the index that owns the datacentres | 40% |

The fee stream is split across the four stocks by these shares before it is swapped, so every round's pot has all four in it.

{% hint style="warning" %}
The pot for a round is whatever the fee stream brought in during that hour plus the previous round's unclaimed remainder. It is locked the moment the round closes; the site shows it filling during the hour. A round with no fees pays only the rollover, and the site says so.
{% endhint %}
