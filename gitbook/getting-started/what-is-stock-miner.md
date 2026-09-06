# What is Hyperscale?

Hyperscale is a **season**. A season is one deployment of the mine with fixed rules: four reward blocks, each paying fragments of one Robinhood Stock Token, and a fixed amount of **work** needed to find each block. Players point hashrate at the mine by staking $RIG. When the total work reaches a block's difficulty, the block is found and the next one starts. When block 4 is found, the mine closes permanently.

## The loop

1. **Stake $RIG to activate a rig.** Your stake is your rig's weight and comes back at the end.
2. **Your rig works every second** it is active. Work is hashrate multiplied by seconds.
3. **Each block pays a fixed rate** of fragments per unit of work. Your rig earns its own work at that rate. Nobody dilutes you.
4. **Burn $RIG on upgrades** to raise your hashrate: permanent GPU tiers, permanent cooling tiers, and short overclock bursts.
5. **Claim** the fragments of any block that has been found, at any time.
6. **At close**, withdraw your stake and redeem fragments for the Stock Token itself or for USDG at the Chainlink price.

## What "virtual mining" means

Nothing is hashed. Your browser does no work and can be closed. Hashrate is a number the contract computes from your stake and upgrades, and the contract credits work by the chain's clock at a fixed rate per unit of work. It is a staking programme whose payout schedule is driven by progress, not by time, and which lets you buy a bigger share of that progress by burning $RIG.

## What other players change, and what they do not

| Changes with other players | Never changes |
| --- | --- |
| How fast blocks are found (the **ETA**) | Your fragments per second at a given hashrate |
| How long the season lasts | The pay rate of each block |
| How often you need to re-buy overclocks in wall-clock terms | The fraction of the mine an upgrade covers |
| Your share of the total hash (a leaderboard number) | The total pool of each block |

A block's pool is split exactly among the work done in that block. If you did 3% of the work in block 2, you earned 3% of block 2's pool. More hashrate from others makes the block end sooner, so you spend fewer seconds in it, but every second was paid at the same rate.

## Why four blocks and why an index last

| Block | Stock | Share of the pool's value | Share of the work |
| --- | --- | --- | --- |
| 1 | NVDA | 15% | 20% |
| 2 | MU | 20% | 25% |
| 3 | SNDK | 25% | 25% |
| 4 | QQQ | 40% | 30% |

Value escalates so the finale is the richest per unit of work. That rewards staying, and it makes block 4 the moment everyone overclocks. The finale is an index token so the biggest prize is the least volatile.

{% hint style="warning" %}
Every duration you see in the app is an estimate computed from the current total hashrate. The only hard time in a season is the **cap**, shown from the start as the latest possible end. See [The cap](../safety/the-cap.md).
{% endhint %}
