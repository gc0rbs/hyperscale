# Oracle and cash-out

The mine itself uses no oracle and no randomness. The only external price in the whole system is the one the vault reads when you **cash out** fragments for USDG. In-kind redemption never touches it.

## The feed

Each of the four Stock Tokens has a Chainlink price feed on Robinhood Chain. The feeds are 8-decimal USD prices with a 24-hour heartbeat and a 0.5% deviation trigger, and they include the token's multiplier, so the price is per token, not per underlying share. The feed addresses are listed under [Contracts and addresses](../reference/contracts-and-addresses.md).

## The rules the vault enforces

* A price is accepted only if its last update is at most **26 hours** old (the 24-hour heartbeat plus a margin). Older prices revert the cash-out; nothing is paid at a stale price.
* A non-positive answer is treated as stale.
* The payout is `fragments ÷ 1,000,000 × price`, converted to USDG, minus the cash-out fee (1% default).
* The adapter's stock-to-feed map is immutable.

## What can go wrong

| Situation | Effect |
| --- | --- |
| Market closed for more than 26 hours (a long weekend) | Cash-out pauses until the feed updates. Redeem in kind instead, or wait |
| Price moved less than 0.5% for a day | The feed may not update; the last price is still fresh enough and reflects the market within 0.5% |
| The USDG reserve is spent | Cash-out is unavailable for the rest of the season; in-kind redemption is unaffected. The reserve is sized at 50% of the pool's value and cannot be topped up |
| Feed reports a wrong price | You would be paid the wrong amount. Chainlink's decentralised feeds make this unlikely; the deviation trigger bounds how far a fresh timestamp can hide a move |

## Why cash-out exists at all

Some players prefer stablecoins to holding a Stock Token, and some wallets are not set up for tokenised equities. Cash-out is settlement of a prize in USD at a public price, funded by a reserve set aside before the season opened. It is not the vault "selling" you anything and the vault holds no discretion over the price.
